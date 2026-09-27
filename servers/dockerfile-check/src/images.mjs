// src/images.mjs
//
// Everything known about one image reference: the registry's answer (src/registry.mjs) and the
// support status of what the image is built on, from endoflife.date: the runtime or server the image
// is named for (node:18 -> Node.js 18) and the OS its tag names (alpine3.17, bookworm). When the
// runtime is past its end of life, the upgrade names a tag of the same variant that exists.
import { describe, productReleases } from "./eol.mjs";
import { displayName, hubSuggestions, lookupImage, parseImage } from "./registry.mjs";

/** Image names (last path part, or the last two) to endoflife.date products. */
const IMAGE_PRODUCTS = {
  node: "nodejs", python: "python", golang: "go", ruby: "ruby", php: "php", "eclipse-temurin": "eclipse-temurin", amazoncorretto: "amazon-corretto",
  postgres: "postgresql", mysql: "mysql", mariadb: "mariadb", mongo: "mongodb", redis: "redis", nginx: "nginx", httpd: "apache-http-server", alpine: "alpine-linux", ubuntu: "ubuntu", debian: "debian",
  elasticsearch: "elasticsearch", rabbitmq: "rabbitmq", memcached: "memcached", haproxy: "haproxy", traefik: "traefik", tomcat: "tomcat", gradle: "gradle", maven: "maven",
  "dotnet/sdk": "dotnet", "dotnet/aspnet": "dotnet", "dotnet/runtime": "dotnet", "dotnet/runtime-deps": "dotnet", amazonlinux: "amazon-linux", rockylinux: "rocky-linux", almalinux: "almalinux", fedora: "fedora", centos: "centos", erlang: "erlang", elixir: "elixir", rust: "rust", bun: "bun", "denoland/deno": "deno", kong: "kong-gateway", sonarqube: "sonar", jenkins: "jenkins",
};
// Debian and Ubuntu codenames as tags write them.
const CODENAMES = { trixie: ["debian", "13"], bookworm: ["debian", "12"], bullseye: ["debian", "11"], buster: ["debian", "10"], stretch: ["debian", "9"], noble: ["ubuntu", "24.04"], jammy: ["ubuntu", "22.04"], focal: ["ubuntu", "20.04"], bionic: ["ubuntu", "18.04"] };

// Official images that are no longer what their name suggests.
const DEPRECATED = {
  "library/openjdk": "the openjdk image now publishes only early-access builds; use eclipse-temurin, amazoncorretto or another OpenJDK distribution",
  "library/java": "the java image was deprecated in 2017; use eclipse-temurin",
  "library/centos": "CentOS Linux has reached its end of life and the image is no longer updated; use rockylinux, almalinux or quay.io/centos/centos:stream9",
};

/** What the reference is built on: {product, version} for the runtime and for the OS, as the name and tag say. */
export function buildsOn(p) {
  const parts = p.repository.split("/");
  const short = parts.at(-1).toLowerCase();
  const two = parts.slice(-2).join("/").toLowerCase();
  const tag = p.tag ?? "";
  const out = [];
  const product = IMAGE_PRODUCTS[two] ?? IMAGE_PRODUCTS[short];
  const own = product && (CODENAMES[tag.split("-")[0]]?.[0] === product ? CODENAMES[tag.split("-")[0]][1] : tag.match(/^v?(\d+(?:\.\d+){0,2})/)?.[1]);
  if (product && own) out.push({ role: "runtime", product, version: own });
  const alpine = tag.match(/alpine(\d+\.\d+)/);
  if (alpine && product !== "alpine-linux") out.push({ role: "os", product: "alpine-linux", version: alpine[1] });
  for (const [code, [os, ver]] of Object.entries(CODENAMES)) if (os !== product && new RegExp(`(^|-)${code}($|-)`).test(tag)) out.push({ role: "os", product: os, version: ver });
  return out;
}

async function lifecycle(ctx, b, now) {
  try {
    const product = await productReleases(ctx, b.product);
    const d = describe(product, product.releases, b.version, now);
    return { role: b.role, product: product.label ?? b.product, cycle: d.cycle, status: d.status, eol: d.eol, days_left: d.days_left, upgrade_to: d.upgrade_to?.cycle, nearest_supported: d.nearest_supported?.cycle };
  } catch {
    return undefined;
  }
}

/**
 * Tags of the same variant for another runtime cycle, best first: "18-alpine3.17" -> "22-alpine"
 * (the OS left to float); "3.8-slim-buster" -> "3.14-slim-buster", then "3.14-slim" (a Debian
 * codename that is itself retired has no new tags).
 */
function retags(tag, cycle) {
  const rest = tag.replace(/^v?\d+(?:\.\d+){0,2}/, "").replace(/alpine\d+\.\d+/, "alpine");
  const noCodename = rest.replace(new RegExp(`-(${Object.keys(CODENAMES).join("|")})(?=-|$)`), "");
  return [...new Set([`${cycle}${rest}`, `${cycle}${noCodename}`])];
}

/** The facts for one reference, as image_info and check_dockerfile report them. */
export async function imageFacts(ctx, ref, { now = Date.now(), platform } = {}) {
  const p = parseImage(ref);
  const facts = { image: displayName(p), registry: p.registry };
  if (p.repository !== p.repository.toLowerCase()) return { ...facts, exists: false, error: "repository names must be lowercase" };
  const [reg, ...life] = await Promise.all([lookupImage(ctx, p).catch((err) => ({ failed: err.message })), ...buildsOn(p).map((b) => lifecycle(ctx, b, now))]);
  if (reg.unchecked) return { ...facts, unchecked: reg.unchecked };
  if (reg.failed) return { ...facts, unchecked: `the registry could not be read: ${reg.failed}` };
  facts.exists = reg.exists;
  if (DEPRECATED[p.repository]) facts.deprecated = DEPRECATED[p.repository];
  if (!reg.exists) {
    if (reg.private) facts.note = "not found, or private (only public images can be checked)";
    else if (p.registry === "docker.io" && reg.repositoryExists === false) facts.note = `no repository ${p.repository.replace(/^library\//, "")} on Docker Hub`;
    else if (p.registry === "docker.io") facts.nearest_tags = await hubSuggestions(ctx, p).catch(() => []);
    return facts;
  }
  if (reg.digest) {
    facts.digest = reg.digest;
    if (!p.digest) facts.pin = `${displayName({ ...p, digest: undefined })}@${reg.digest}`;
  }
  if (reg.platforms?.length) facts.platforms = reg.platforms;
  if (platform && reg.platforms?.length && !reg.platforms.some((x) => x === platform || x.startsWith(`${platform}/`))) facts.missing_platform = platform;
  if (reg.updated) facts.updated = reg.updated;
  const known = life.filter(Boolean);
  if (known.length) facts.lifecycle = known;
  const runtime = known.find((l) => l.role === "runtime");
  if (runtime && p.registry === "docker.io" && p.tag && ["end_of_life", "extended_only"].includes(runtime.status) && runtime.upgrade_to) {
    for (const tag of retags(p.tag, runtime.upgrade_to)) {
      const exists = await lookupImage(ctx, { ...p, tag, digest: undefined }).catch(() => ({}));
      if (exists.exists) {
        facts.upgrade_image = displayName({ ...p, tag, digest: undefined });
        break;
      }
    }
  }
  return facts;
}
