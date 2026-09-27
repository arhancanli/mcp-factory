// src/registry.mjs
//
// What a registry says about an image reference: whether the tag exists, its digest (to pin), the
// platforms it is built for, and (Docker Hub) when it was last rebuilt. Docker Hub is read through
// its tag API, which does not spend the anonymous pull allowance; other public registries through
// the OCI distribution API with an anonymous token: GHCR, Quay, GCR, MCR, ECR Public, and
// registry.k8s.io through the regional Artifact Registry it redirects to (the multi-region host
// refuses anonymous reads; the regional ones allow them). Private registries are named as
// such and not contacted.
import { createHash } from "node:crypto";
import { UpstreamError } from "./kit/index.mjs";

const HUB = "https://hub.docker.com/v2";
const ACCEPT = ["application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json", "application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json"].join(", ");
const INDEX_TYPES = /image\.index|manifest\.list/;

// Public registries this server reads, and where their API lives.
const OCI = {
  "ghcr.io": { base: "https://ghcr.io/v2" },
  "quay.io": { base: "https://quay.io/v2" },
  "gcr.io": { base: "https://gcr.io/v2" },
  "us.gcr.io": { base: "https://us.gcr.io/v2" },
  "eu.gcr.io": { base: "https://eu.gcr.io/v2" },
  "asia.gcr.io": { base: "https://asia.gcr.io/v2" },
  "mcr.microsoft.com": { base: "https://mcr.microsoft.com/v2" },
  "public.ecr.aws": { base: "https://public.ecr.aws/v2" },
  "registry.k8s.io": { base: "https://us-west1-docker.pkg.dev/v2", prefix: "k8s-artifacts-prod/images/" },
  "docker.io": { base: "https://registry-1.docker.io/v2" },
};

/**
 * An image reference split as Docker reads it: [registry/][namespace/]name[:tag][@digest].
 * Docker Hub names without a namespace are in "library".
 */
export function parseImage(ref) {
  let rest = String(ref).trim();
  let digest;
  const at = rest.indexOf("@");
  if (at >= 0) {
    digest = rest.slice(at + 1);
    rest = rest.slice(0, at);
  }
  let tag;
  const colon = rest.lastIndexOf(":");
  if (colon > rest.lastIndexOf("/")) {
    tag = rest.slice(colon + 1);
    rest = rest.slice(0, colon);
  }
  const parts = rest.split("/");
  let registry = "docker.io";
  if (parts.length > 1 && (parts[0].includes(".") || parts[0].includes(":") || parts[0] === "localhost")) registry = parts.shift().toLowerCase();
  if (registry === "index.docker.io" || registry === "registry-1.docker.io" || registry === "registry.hub.docker.com") registry = "docker.io";
  let repository = parts.join("/");
  if (registry === "docker.io" && parts.length === 1) repository = `library/${repository}`;
  return { ref: String(ref).trim(), registry, repository, tag: tag ?? (digest ? undefined : "latest"), digest, implicitTag: !tag && !digest };
}

/** The name a person would write: "node:20-alpine", "ghcr.io/org/app:1.2". */
export function displayName(p) {
  const repo = p.registry === "docker.io" ? p.repository.replace(/^library\//, "") : `${p.registry}/${p.repository}`;
  return `${repo}${p.tag ? `:${p.tag}` : ""}${p.digest ? `@${p.digest}` : ""}`;
}

const platformOf = (m) => (m?.platform && m.platform.os && m.platform.os !== "unknown" ? `${m.platform.os}/${m.platform.architecture}${m.platform.variant ? `/${m.platform.variant}` : ""}` : undefined);

async function hubTag(ctx, p) {
  const [ns, ...name] = p.repository.split("/");
  const repo = `${HUB}/repositories/${encodeURIComponent(ns)}/${encodeURIComponent(name.join("/"))}`;
  const { status, data } = await ctx.fetcher.getJson(`${repo}/tags/${encodeURIComponent(p.tag)}`, { allowStatus: [404] });
  if (status === 404) {
    const r = await ctx.fetcher.getJson(repo, { allowStatus: [404] });
    return { exists: false, repositoryExists: r.status !== 404 };
  }
  const platforms = [...new Set((data.images ?? []).map((i) => (i.os && i.os !== "unknown" ? `${i.os}/${i.architecture}${i.variant ? `/${i.variant}` : ""}` : undefined)).filter(Boolean))];
  return { exists: true, digest: data.digest, platforms, updated: data.last_updated?.slice(0, 10), size: data.full_size };
}

/** Existing tags close to a missing one, newest first: for "18.99-alpine", the 18.x alpine tags. */
export async function hubSuggestions(ctx, p) {
  const [ns, ...name] = p.repository.split("/");
  const version = p.tag.match(/^v?(\d+)/)?.[1];
  const variant = p.tag.replace(/^v?[\d.]+/, "");
  const filter = version ?? p.tag.split("-")[0];
  const url = `${HUB}/repositories/${encodeURIComponent(ns)}/${encodeURIComponent(name.join("/"))}/tags?page_size=100&ordering=last_updated&name=${encodeURIComponent(filter)}`;
  const { status, data } = await ctx.fetcher.getJson(url, { allowStatus: [404] });
  if (status === 404) return [];
  // The name filter matches anywhere ("17" finds "28-ea-17-slim"): keep tags of the same version.
  const names = (data.results ?? []).map((r) => r.name).filter((n) => (version ? new RegExp(`^v?${version}([.-]|$)`).test(n) : true));
  const sameVariant = names.filter((n) => (variant ? n.endsWith(variant) : !n.includes("-")));
  return (sameVariant.length ? sameVariant : names).slice(0, 5);
}

function bearerChallenge(header) {
  const m = String(header ?? "").match(/^Bearer\s+(.*)$/i);
  if (!m) return undefined;
  const params = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
  return params.realm ? params : undefined;
}

async function ociManifest(ctx, p) {
  const reg = OCI[p.registry];
  const repo = `${reg.prefix ?? ""}${p.repository}`;
  // A refused token (missing or private repository) is an answer too: kept for 10 minutes, since
  // the HTTP cache keeps only successes and not-founds.
  ctx.denied ??= new Map();
  const deniedAt = ctx.denied.get(`${p.registry}/${repo}`);
  if (deniedAt && Date.now() - deniedAt < 600_000) return { exists: false, private: true };
  const url = `${reg.base}/${repo}/manifests/${encodeURIComponent(p.digest ?? p.tag)}`;
  let res = await ctx.fetcher.request(url, { accept: ACCEPT });
  if (res.status === 401) {
    const ch = bearerChallenge(res.headers.get("www-authenticate"));
    if (!ch) throw new UpstreamError("registry_auth", `${p.registry} asked for credentials; only public images can be checked.`);
    // Tokens live for minutes and reads are cached for hours: a token is asked for at most once a
    // minute per repository, never reused after that.
    const tokenUrl = `${ch.realm}?${new URLSearchParams({ ...(ch.service ? { service: ch.service } : {}), scope: `repository:${repo}:pull`, t: String(Math.floor(Date.now() / 60_000)) })}`;
    const t = await ctx.fetcher.request(tokenUrl);
    // Registries answer a token request for a missing or private repository with 401/403 DENIED.
    if (!t.ok) {
      ctx.denied.set(`${p.registry}/${repo}`, Date.now());
      if (ctx.denied.size > 500) ctx.denied.delete(ctx.denied.keys().next().value);
      return { exists: false, private: true };
    }
    const token = JSON.parse(t.text).token ?? JSON.parse(t.text).access_token;
    res = await ctx.fetcher.request(url, { accept: ACCEPT, headers: { Authorization: `Bearer ${token}` } });
  }
  if (res.status === 404 || res.status === 403) return { exists: false, private: res.status === 403 };
  if (res.status === 401) return { exists: false, private: true };
  if (!res.ok) throw new UpstreamError("upstream_status", `${p.registry} answered with status ${res.status}.`, { status: res.status });
  let body;
  try {
    body = JSON.parse(res.text);
  } catch {
    body = {};
  }
  const type = res.headers.get("content-type") ?? body.mediaType ?? "";
  const platforms = INDEX_TYPES.test(type) || Array.isArray(body.manifests) ? [...new Set((body.manifests ?? []).map(platformOf).filter(Boolean))] : undefined;
  // ECR Public sends no Docker-Content-Digest; the digest is the SHA-256 of the manifest's bytes.
  const digest = res.headers.get("docker-content-digest") ?? `sha256:${createHash("sha256").update(res.text, "utf8").digest("hex")}`;
  return { exists: true, digest, platforms };
}

/** Registry facts for one parsed reference. */
export async function lookupImage(ctx, p) {
  if (p.registry === "docker.io" && p.tag && !p.digest) return { ...(await hubTag(ctx, p)), source: "Docker Hub" };
  if (!OCI[p.registry]) return { unchecked: `${p.registry} is not a public registry this server reads; the image was not checked` };
  return { ...(await ociManifest(ctx, p)), source: p.registry };
}
