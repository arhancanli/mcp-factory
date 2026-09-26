// src/changelog.mjs
//
// A package's release notes by version: its CHANGELOG file (found in the package's directory of a
// monorepo first, then at the repository root, under the names projects use), or else its GitHub
// releases. The file is split at headings that carry a version: Markdown (## 5.0.0), bracketed
// (## [5.0.0] - 2024-09-10), underlined (5.0.0 / 2024-09-10 then =====) and reStructuredText.
import { mapLimit } from "./kit/index.mjs";
import { compareVersions } from "./versions.mjs";

const FILE_NAMES = ["CHANGELOG.md", "HISTORY.md", "History.md", "CHANGES.md", "CHANGELOG.rst", "HISTORY.rst", "CHANGES.rst", "NEWS.md", "RELEASES.md", "CHANGELOG", "CHANGES", "docs/changelog.md", "docs/CHANGELOG.md", "doc/changelog.rst", "docs/changelog.rst", "docs/history.rst", "docs/source/changelog.rst"];
const VERSION = /(?:^|[\s[(v@/])(\d+\.\d+(?:\.\d+)?(?:[-.]?(?:alpha|beta|rc|a|b|dev|post|pre)[.-]?\d*)?(?:-[0-9A-Za-z.]+)?)(?=$|[\s\]),:;/]|\s*[-–(])/i;
const DATE = /\b(\d{4}-\d{2}-\d{2})\b/;

/**
 * Entries of a changelog file, newest first as written: [{version, date?, text}].
 * A heading is a Markdown heading, an underlined line, or (reST) a line followed by a row of = - ~ ^.
 */
export function parseChangelog(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const entries = [];
  let current = null;
  const start = (version, date, headLine) => {
    if (current) entries.push(current);
    current = { version, date, lines: [], head: headLine };
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";
    const underlined = line.trim() && /^\s*([=\-~^*+#])\1{2,}\s*$/.test(next) && line.trim().length <= 120;
    const md = line.match(/^#{1,4}\s+(.*)$/);
    const headText = md ? md[1] : underlined ? line : null;
    const v = headText && !/unreleased/i.test(headText) ? headText.match(VERSION) : null;
    if (v) {
      start(v[1], headText.match(DATE)?.[1], headText);
      if (underlined) i++;
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) entries.push(current);
  return entries.map((e) => ({ version: e.version, date: e.date, text: e.lines.join("\n").trim() }));
}

/** The first changelog file found for a repository (a monorepo package's own first). */
async function findFile(ctx, repo) {
  const bases = [repo.directory ? `${repo.directory}/` : null, ""].filter((x) => x !== null);
  const paths = bases.flatMap((b) => FILE_NAMES.map((n) => `${b}${n}`));
  // In small batches, stopping at the first batch that has a hit (most repositories need one).
  for (let i = 0; i < paths.length; i += 6) {
    const batch = paths.slice(i, i + 6);
    const found = await mapLimit(batch, 6, async (p) => {
      const url = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/HEAD/${p}`;
      const r = await ctx.fetcher.request(url, { accept: "text/plain" });
      return r.ok ? { path: p, url, text: r.text } : null;
    });
    const hit = found.find((f) => f && parseChangelog(f.text).length >= 2);
    if (hit) return hit;
  }
  return null;
}

/** GitHub releases (up to 300), as entries; a monorepo's tags ("name@1.2.3") are narrowed to the package. */
async function releases(ctx, repo, packageName) {
  const headers = ctx.githubToken ? { Authorization: `Bearer ${ctx.githubToken}` } : undefined;
  const all = [];
  for (let page = 1; page <= 3; page++) {
    const { status, data } = await ctx.fetcher.getJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=100&page=${page}`, { headers, allowStatus: [403, 404, 429] });
    if (status !== 200 || !Array.isArray(data)) return { entries: all, limited: status === 403 || status === 429 };
    all.push(...data);
    if (data.length < 100) break;
  }
  const scoped = all.filter((r) => r.tag_name?.includes("@"));
  const mine = scoped.length ? all.filter((r) => r.tag_name.startsWith(`${packageName}@`) || r.tag_name.includes(`/${packageName}@`)) : all;
  const entries = (mine.length ? mine : all)
    .filter((r) => !r.draft)
    .map((r) => ({ version: (`${r.tag_name} ${r.name ?? ""}`.match(VERSION) ?? [])[1], date: r.published_at?.slice(0, 10), text: String(r.body ?? "").trim(), url: r.html_url }))
    .filter((e) => e.version);
  return { entries };
}

/**
 * Release notes for a package: {source: {kind, url}, entries} with entries by version (newest
 * first). The CHANGELOG file is read first; when it has no entry the caller wants (wanted, a
 * test on a version: a file that covers only the newest major, as Babel's does), GitHub releases
 * are read too and fill in the versions the file lacks.
 */
export async function notesFor(ctx, pkg, wanted = () => true) {
  const base = await fileOrReleases(ctx, pkg);
  if (!base.source || base.source.kind === "GitHub releases" || base.entries.some((e) => wanted(e.version))) return base;
  const key = `releases:${pkg.repo.owner}/${pkg.repo.repo}/${pkg.name}`;
  if (!ctx.notes.has(key)) ctx.notes.set(key, await releases(ctx, pkg.repo, pkg.name));
  const r = ctx.notes.get(key);
  const have = new Set(base.entries.map((e) => e.version));
  const extra = r.entries.filter((e) => !have.has(e.version) && wanted(e.version));
  if (!extra.length) return { ...base, note: r.limited ? "GitHub's API limit for anonymous requests was reached; set GITHUB_TOKEN for more." : base.note };
  const entries = [...base.entries, ...extra].sort((a, b) => compareVersions(b.version, a.version));
  return { source: { kind: `${base.source.kind} and GitHub releases`, url: `https://github.com/${pkg.repo.owner}/${pkg.repo.repo}/releases` }, entries };
}

async function fileOrReleases(ctx, pkg) {
  if (!pkg.repo) return { source: null, entries: [], note: `No GitHub repository is linked from ${pkg.name}'s metadata${pkg.repoUrl ? ` (${pkg.repoUrl})` : ""}; only GitHub-hosted notes are read.` };
  const key = `${pkg.repo.owner}/${pkg.repo.repo}/${pkg.repo.directory ?? ""}/${pkg.name}`;
  ctx.notes ??= new Map();
  if (ctx.notes.has(key)) return ctx.notes.get(key);
  const file = await findFile(ctx, pkg.repo);
  let out;
  if (file) out = { source: { kind: file.path, url: `https://github.com/${pkg.repo.owner}/${pkg.repo.repo}/blob/HEAD/${file.path}` }, entries: parseChangelog(file.text) };
  else {
    const r = await releases(ctx, pkg.repo, pkg.name);
    out = { source: r.entries.length ? { kind: "GitHub releases", url: `https://github.com/${pkg.repo.owner}/${pkg.repo.repo}/releases` } : null, entries: r.entries, note: r.limited ? "GitHub's API limit for anonymous requests was reached; set GITHUB_TOKEN for more." : undefined };
  }
  // Headings often carry no ISO date ("18.0.0 (March 29, 2022)"): the registry's publish date fills in.
  const published = new Map((pkg.versions ?? []).map((v) => [v.version, v.date]));
  for (const e of out.entries) e.date ??= published.get(e.version.replace(/^v/i, ""));
  out.entries.sort((a, b) => compareVersions(b.version, a.version));
  ctx.notes.set(key, out);
  return out;
}

/**
 * Notes text as items: a bullet and its wrapped continuation lines become one line; links, images
 * and commit or pull-request references are removed; section labels ("breaking:", "### Removed",
 * "**Deprecations**") are kept, as they give the lines below them their kind.
 */
export function noteLines(text) {
  const items = [];
  for (const raw of String(text).split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      items.push("");
      continue;
    }
    const isBullet = /^\s*(?:[-*+\u2022]|\d+\.)\s+/.test(line);
    const isHeading = /^\s*#{1,6}\s/.test(line) || /^\s*\*\*[^*]+\*\*:?\s*$/.test(line) || /^\s*[\w -]{2,30}:\s*$/.test(line);
    const prev = items.at(-1);
    // A wrapped line continues the item above it (Markdown and reST wrap long bullets).
    if (!isBullet && !isHeading && prev && !/^\s*#/.test(prev) && /^\s{2,}\S|^[a-z(`]/.test(line)) items[items.length - 1] = `${prev} ${line.trim()}`;
    else items.push(line);
  }
  return items
    .map((l) =>
      l
        .replace(/^\s*(?:[-*+\u2022]|\d+\.)\s+/, "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/\s+by @[\w-]+ in https?:\/\/\S+/g, "")
        .replace(/\s*\((?:[0-9a-f]{7,40}|#\d+|[\w-]+\/[\w-]+#\d+)(?:,\s*(?:[0-9a-f]{7,40}|#\d+))*\)/gi, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((l) => l && !/^([=\-~^]+|\*\*Full Changelog\*\*.*|Full Changelog:.*|What's Changed|New Contributors.*)$/i.test(l));
}

// Kinds of change worth pulling out of the notes before an upgrade.
const KINDS = [
  // Explicit markers only: "incompatible object" in a bug fix is not an incompatible change.
  ["breaking", /\bBREAKING\b|\b[Bb]reaking changes?\b|[Bb]ackwards?[- ]incompatib|\bincompatible changes?\b|\u26a0|:warning:/],
  ["removed", /^(?:remove[sd]?|drop(?:ped|s)?)\b|\b(?:has been|was|were|is now|are now) removed\b|\bno longer (?:supported|available|exported|works?)\b/i],
  ["deprecated", /\bdeprecat/i],
  ["security", /\bsecurity\b|\bCVE-\d{4}-\d+|\bGHSA-|\bvulnerab/i],
  ["requirements", /\b(?:node(?:\.js)?|c?python|pypy|php|ruby|go|rust|java|typescript|npm)\b[^.]{0,40}\b(?:v?\d+(?:\.\d+)*)\b[^.]{0,40}\b(?:require|minimum|support|drop|at least|or later|or newer|\+)|\b(?:require|minimum|support(?:s|ed)?|drop(?:ped)?)\b[^.]{0,40}\b(?:node(?:\.js)?|c?python|pypy|php|ruby|go|rust|java|typescript)\s*v?\d/i],
];

// Section labels and the kind they give the lines under them; other labels ("Features", "deps:")
// end the section.
const LABELS = [
  ["breaking", /^(?:#+\s*)?(?:\*\*)?(?:breaking(?: changes?)?|backwards? incompatible changes?|incompatible changes?)(?:\*\*)?:?$/i],
  ["removed", /^(?:#+\s*)?(?:\*\*)?(?:removed?|removals?|dropped)(?:\*\*)?:?$/i],
  ["deprecated", /^(?:#+\s*)?(?:\*\*)?deprecat(?:ed|ions?|e)(?:\*\*)?:?$/i],
  ["security", /^(?:#+\s*)?(?:\*\*)?security(?: fixes)?(?:\*\*)?:?$/i],
];
export const isLabel = (l) => /^#{1,6}\s|^\*\*[^*]+\*\*:?$|^[\w -]{2,30}:$/.test(l);

/** The lines of some notes that fall under each kind: by their own words, or by the section they sit in. */
export function classify(lines) {
  const out = {};
  let section = null;
  for (const line of lines) {
    if (isLabel(line)) {
      section = LABELS.find(([, re]) => re.test(line.trim()))?.[0] ?? null;
      continue;
    }
    // "deps: debug@3.1.0" is a sibling item of its own kind, not part of the section above it.
    if (/^[a-z][\w -]{1,20}:\s+\S/i.test(line)) section = null;
    const kinds = new Set(KINDS.filter(([, re]) => re.test(line)).map(([k]) => k));
    if (section) kinds.add(section);
    const short = line.length > 220 ? `${line.slice(0, 217)}...` : line;
    for (const k of kinds) if (!(out[k] ??= []).includes(short)) out[k].push(short);
  }
  return out;
}
