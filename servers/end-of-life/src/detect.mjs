// src/detect.mjs
//
// Finds the runtime, framework, database and OS versions a project pins, in the files that pin
// them: Dockerfile FROM lines, .nvmrc / .node-version / .python-version / .ruby-version,
// .tool-versions (asdf, mise), package.json engines, pyproject.toml requires-python, go.mod,
// composer.json, Gemfile, global.json, runtime.txt and GitHub Actions workflows (setup-* versions,
// matrices and runs-on images). Nothing is executed; files are read as text. For a range
// (">=18", "^3.8"), the lowest version it allows is what gets checked: it is the oldest version the
// project still promises to run on.

/** Container image names (last path part, or a known full name) to endoflife.date products. */
const IMAGE_PRODUCTS = {
  node: "nodejs", python: "python", golang: "go", ruby: "ruby", php: "php", openjdk: "eclipse-temurin", "eclipse-temurin": "eclipse-temurin", amazoncorretto: "amazon-corretto",
  postgres: "postgresql", mysql: "mysql", mariadb: "mariadb", mongo: "mongodb", redis: "redis", nginx: "nginx", httpd: "apache-http-server", alpine: "alpine-linux", ubuntu: "ubuntu", debian: "debian",
  elasticsearch: "elasticsearch", rabbitmq: "rabbitmq", memcached: "memcached", haproxy: "haproxy", traefik: "traefik", kong: "kong-gateway", sonarqube: "sonar", jenkins: "jenkins", tomcat: "tomcat", gradle: "gradle", maven: "maven",
  "dotnet/sdk": "dotnet", "dotnet/aspnet": "dotnet", "dotnet/runtime": "dotnet", "amazonlinux": "amazon-linux", "rockylinux": "rocky-linux", "almalinux": "almalinux", fedora: "fedora", centos: "centos", erlang: "erlang", elixir: "elixir", rust: "rust", bun: "bun", deno: "deno",
};

const TOOL_NAMES = { nodejs: "nodejs", node: "nodejs", python: "python", ruby: "ruby", golang: "go", go: "go", java: "eclipse-temurin", php: "php", erlang: "erlang", elixir: "elixir", rust: "rust", terraform: "terraform", deno: "deno", bun: "bun", kubectl: "kubernetes" };

// Debian and Ubuntu release codenames that appear in image tags.
const CODENAMES = { bookworm: ["debian", "12"], bullseye: ["debian", "11"], buster: ["debian", "10"], stretch: ["debian", "9"], trixie: ["debian", "13"], jammy: ["ubuntu", "22.04"], focal: ["ubuntu", "20.04"], noble: ["ubuntu", "24.04"], bionic: ["ubuntu", "18.04"] };

/** The lowest version a range allows: ">=3.8,<4" -> "3.8", "^18.12" -> "18.12", "~> 3.1" -> "3.1". */
export function lowestVersion(spec) {
  const m = String(spec ?? "").match(/(\d+(?:\.\d+){0,2})/);
  return m ? m[1] : undefined;
}

const finding = (file, line, product, version, source) => (product && version ? { file, line, product, version, source } : undefined);

function fromDockerfile(file, text) {
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const m = raw.match(/^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/i);
    if (!m || m[1].includes("$")) return;
    const ref = m[1].split("@")[0];
    const [image, tag = "latest"] = ref.split(/:(?=[^/]*$)/);
    const parts = image.split("/");
    const short = parts.at(-1).toLowerCase();
    const twoPart = parts.slice(-2).join("/").toLowerCase();
    const product = IMAGE_PRODUCTS[twoPart] ?? IMAGE_PRODUCTS[short];
    const version = tag === "latest" ? undefined : lowestVersion(tag.split("-")[0]);
    const f = finding(file, i + 1, product, version, raw.trim());
    if (f) out.push(f);
    // The OS a tag is built on: "3.11-alpine3.19", "18-bookworm", "20.04" images of ubuntu itself.
    const alpine = tag.match(/alpine(\d+\.\d+)/);
    if (alpine) out.push(finding(file, i + 1, "alpine-linux", alpine[1], raw.trim()));
    for (const [code, [os, ver]] of Object.entries(CODENAMES)) if (new RegExp(`(^|-)${code}($|-)`).test(tag)) out.push(finding(file, i + 1, os, ver, raw.trim()));
  });
  return out;
}

// Node.js LTS codenames, as .nvmrc files write them ("lts/hydrogen"). endoflife.date does not
// carry them. "lts/*" means the newest LTS and is resolved against the live data.
export const NODE_LTS = { argon: "4", boron: "6", carbon: "8", dubnium: "10", erbium: "12", fermium: "14", gallium: "16", hydrogen: "18", iron: "20", jod: "22", krypton: "24" };

function fromVersionFile(file, text, product) {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
  if (!line) return [];
  if (/^lts\//i.test(line)) {
    const code = line.slice(4).toLowerCase();
    return [{ file, line: 1, product, version: NODE_LTS[code], codename: NODE_LTS[code] ? undefined : code, source: line }];
  }
  return [finding(file, 1, product, lowestVersion(line.replace(/^(python|ruby)-/i, "")), line)].filter(Boolean);
}

function fromToolVersions(file, text) {
  return text.split(/\r?\n/).flatMap((raw, i) => {
    const m = raw.trim().match(/^([a-z0-9-]+)\s+(\S+)/i);
    const product = m && TOOL_NAMES[m[1].toLowerCase()];
    return product ? [finding(file, i + 1, product, lowestVersion(m[2]), raw.trim())] : [];
  }).filter(Boolean);
}

function fromPackageJson(file, text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return [];
  }
  const out = [];
  if (j.engines?.node) out.push(finding(file, undefined, "nodejs", lowestVersion(j.engines.node), `engines.node: ${j.engines.node}`));
  if (j.volta?.node) out.push(finding(file, undefined, "nodejs", lowestVersion(j.volta.node), `volta.node: ${j.volta.node}`));
  return out.filter(Boolean);
}

const lineOf = (text, re) => {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => re.test(l));
  return i < 0 ? undefined : { n: i + 1, text: lines[i].trim() };
};

function fromPyproject(file, text) {
  const req = lineOf(text, /^\s*requires-python\s*=/);
  const poetry = lineOf(text, /^\s*python\s*=\s*["']/);
  const hit = req ?? poetry;
  return hit ? [finding(file, hit.n, "python", lowestVersion(hit.text.split("=").slice(1).join("=")), hit.text)].filter(Boolean) : [];
}

function fromGoMod(file, text) {
  const out = [];
  const go = lineOf(text, /^\s*go\s+\d/);
  if (go) out.push(finding(file, go.n, "go", lowestVersion(go.text), go.text));
  const tc = lineOf(text, /^\s*toolchain\s+go\d/);
  if (tc) out.push(finding(file, tc.n, "go", lowestVersion(tc.text), tc.text));
  return out.filter(Boolean);
}

function fromComposer(file, text) {
  try {
    const php = JSON.parse(text).require?.php;
    return php ? [finding(file, undefined, "php", lowestVersion(php), `require.php: ${php}`)].filter(Boolean) : [];
  } catch {
    return [];
  }
}

function fromGemfile(file, text) {
  const r = lineOf(text, /^\s*ruby\s+["']/);
  return r ? [finding(file, r.n, "ruby", lowestVersion(r.text), r.text)].filter(Boolean) : [];
}

function fromGlobalJson(file, text) {
  try {
    const v = JSON.parse(text).sdk?.version;
    const m = v && String(v).match(/^(\d+)\.(\d+)/);
    return m ? [finding(file, undefined, "dotnet", `${m[1]}.${m[2]}`, `sdk.version: ${v}`)].filter(Boolean) : [];
  } catch {
    return [];
  }
}

const SETUP = { "node-version": "nodejs", "python-version": "python", "go-version": "go", "java-version": "eclipse-temurin", "ruby-version": "ruby", "php-version": "php", "dotnet-version": "dotnet" };

function fromWorkflow(file, text) {
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    for (const [key, product] of Object.entries(SETUP)) {
      const m = line.match(new RegExp(`^-?\\s*${key}\\s*:\\s*(.+)$`));
      if (!m) continue;
      const value = m[1].replace(/#.*$/, "").trim();
      if (value.includes("${{")) continue; // matrix reference; the matrix line itself is read below
      const versions = value.startsWith("[") ? value.slice(1, -1).split(",") : [value];
      for (const v of versions) out.push(finding(file, i + 1, product, lowestVersion(v.replace(/["']/g, "")), line));
    }
    const runs = line.match(/^runs-on\s*:\s*["']?(ubuntu|windows|macos)-(\d+(?:\.\d+)?)/);
    if (runs) out.push(finding(file, i + 1, runs[1] === "ubuntu" ? "ubuntu" : runs[1] === "macos" ? "macos" : "windows-server", runs[2], line));
    // Matrix entries such as "node: [18, 20]" or "python: ['3.8', '3.12']".
    const matrix = line.match(/^(node|python|go|ruby|php|java)(?:-version)?\s*:\s*\[(.+)\]$/);
    if (matrix && !Object.keys(SETUP).some((k) => line.startsWith(k))) {
      const product = { node: "nodejs", python: "python", go: "go", ruby: "ruby", php: "php", java: "eclipse-temurin" }[matrix[1]];
      for (const v of matrix[2].split(",")) out.push(finding(file, i + 1, product, lowestVersion(v.replace(/["']/g, "")), line));
    }
  });
  return out.filter(Boolean);
}

const PARSERS = [
  [/(^|\/)(Dockerfile|Containerfile)(\.[\w.-]+)?$|\.dockerfile$/i, fromDockerfile],
  [/(^|\/)\.(nvmrc|node-version)$/, (f, t) => fromVersionFile(f, t, "nodejs")],
  [/(^|\/)\.python-version$|(^|\/)runtime\.txt$/, (f, t) => fromVersionFile(f, t, "python")],
  [/(^|\/)\.ruby-version$/, (f, t) => fromVersionFile(f, t, "ruby")],
  [/(^|\/)\.tool-versions$|(^|\/)\.mise\.toml$/, fromToolVersions],
  [/(^|\/)package\.json$/, fromPackageJson],
  [/(^|\/)pyproject\.toml$/, fromPyproject],
  [/(^|\/)go\.mod$/, fromGoMod],
  [/(^|\/)composer\.json$/, fromComposer],
  [/(^|\/)Gemfile$/, fromGemfile],
  [/(^|\/)global\.json$/, fromGlobalJson],
  [/(^|\/)\.github\/workflows\/[^/]+\.ya?ml$|(^|\/)[^/]+\.ya?ml$/, fromWorkflow],
];

export const SUPPORTED_FILES = "Dockerfile, .nvmrc, .node-version, .python-version, .ruby-version, runtime.txt, .tool-versions, package.json, pyproject.toml, go.mod, composer.json, Gemfile, global.json and GitHub Actions workflows";

/** @returns {{findings: object[], unrecognised: string[]}} */
export function detect(files) {
  const findings = [];
  const unrecognised = [];
  for (const { name, content } of files) {
    const hit = PARSERS.find(([re]) => re.test(name));
    if (!hit) {
      unrecognised.push(name);
      continue;
    }
    findings.push(...hit[1](name, content));
  }
  // One entry per product and version per file line.
  const seen = new Set();
  return { findings: findings.filter((f) => f && !seen.has(`${f.file}|${f.line}|${f.product}|${f.version ?? f.codename}`) && seen.add(`${f.file}|${f.line}|${f.product}|${f.version ?? f.codename}`)), unrecognised };
}
