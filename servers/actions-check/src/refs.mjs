// src/refs.mjs
//
// An action's versions straight from git: the smart-HTTP ref advertisement (what `git ls-remote`
// reads) lists every tag with its commit, without GitHub's API rate limit. Annotated tags are
// peeled to the commit they point at, which is the SHA to pin. The runtime of an action at a ref
// comes from its action.yml (runs.using: node20, docker, composite...).
import { ToolError } from "./kit/index.mjs";
import { compareVersions, isPrerelease, majorOf } from "./versions.mjs";

const SEMVER_TAG = /^v?\d+(\.\d+){0,2}$/;

/** owner/repo[/path]@ref -> parts; undefined for local (./) and docker:// actions. */
export function parseUses(raw) {
  const s = String(raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (s.startsWith("./") || s.startsWith("docker://")) return undefined;
  const m = s.match(/^([\w.-]+)\/([\w.-]+)((?:\/[^@\s]+)?)@([^\s#]+)$/);
  return m ? { owner: m[1], repo: m[2], path: m[3].replace(/^\//, "") || undefined, ref: m[4], full: `${m[1]}/${m[2]}${m[3]}` } : undefined;
}

/**
 * Tags of a repository: Map tag -> commit SHA (peeled), plus the default branch. Kept for 30
 * minutes, answers of "no such repository" too (GitHub says 401 for those, which HTTP caches skip).
 */
export async function repoRefs(ctx, owner, repo) {
  const key = `${owner}/${repo}`.toLowerCase();
  ctx.refs ??= new Map();
  const hit = ctx.refs.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) {
    if (hit.error) throw hit.error;
    return hit.value;
  }
  try {
    const value = await loadRefs(ctx, owner, repo);
    ctx.refs.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    if (error instanceof ToolError && error.code === "no_such_action") ctx.refs.set(key, { at: Date.now(), error });
    throw error;
  }
}

async function loadRefs(ctx, owner, repo) {
  const res = await ctx.fetcher.request(`https://github.com/${owner}/${repo}.git/info/refs?service=git-upload-pack`, { accept: "*/*" });
  if (res.status === 404 || res.status === 401) throw new ToolError("no_such_action", `github.com/${owner}/${repo} does not exist or is private.`);
  if (!res.ok) throw new ToolError("upstream_status", `github.com answered ${res.status} for ${owner}/${repo}.`);
  const tags = new Map();
  const branches = new Map();
  let head;
  for (const m of res.text.matchAll(/([0-9a-f]{40}) (refs\/(?:tags|heads)\/[^\s\u0000]+|HEAD)/g)) {
    const [, sha, ref] = m;
    if (ref === "HEAD") head = sha;
    else if (ref.startsWith("refs/heads/")) branches.set(ref.slice(11), sha);
    else if (ref.endsWith("^{}")) tags.set(ref.slice(10, -3), sha); // the peeled commit wins
    else if (!tags.has(ref.slice(10))) tags.set(ref.slice(10), sha);
  }
  const defaultBranch = res.text.match(/symref=HEAD:refs\/heads\/([^\s\u0000]+)/)?.[1];
  return { tags, branches, head, defaultBranch };
}

/** The newest release tag, and the newest tag of each major version. */
export function versionsOf(tags) {
  const releases = [...tags.keys()].filter((t) => SEMVER_TAG.test(t) && !isPrerelease(t)).sort(compareVersions);
  const full = releases.filter((t) => /^v?\d+\.\d+/.test(t));
  const latest = (full.length ? full : releases).at(-1);
  const majors = new Map();
  for (const t of full.length ? full : releases) majors.set(majorOf(t), t);
  return { latest, majors };
}

/** How a ref pins the action: a full SHA, a tag (exact or a moving major), or a branch. */
export function refKind(refs, ref) {
  if (/^[0-9a-f]{40}$/.test(ref)) {
    const tagsAt = [...refs.tags].filter(([, sha]) => sha === ref).map(([t]) => t).sort(compareVersions);
    return { kind: "sha", sha: ref, tag: tagsAt.filter((t) => /\d+\.\d+/.test(t)).at(-1) ?? tagsAt.at(-1) };
  }
  if (refs.tags.has(ref)) {
    const sha = refs.tags.get(ref);
    // A moving major tag (v3) names the exact release it points at (v3.2.2) for the pin comment.
    const exact = /^v?\d+$/.test(ref) ? [...refs.tags].filter(([t, x]) => x === sha && /^v?\d+\.\d+/.test(t)).map(([t]) => t).sort(compareVersions).at(-1) : undefined;
    return { kind: /^v?\d+$/.test(ref) ? "major" : "tag", sha, tag: exact ?? ref };
  }
  if (refs.branches.has(ref)) return { kind: "branch", sha: refs.branches.get(ref) };
  return { kind: "missing" };
}

/** runs.using of an action at a commit ("node20", "docker", "composite"), or undefined. */
export async function runtimeAt(ctx, owner, repo, path, sha) {
  for (const file of ["action.yml", "action.yaml"]) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${path ? `${path}/` : ""}${file}`;
    const r = await ctx.fetcher.request(url, { accept: "text/plain" });
    if (!r.ok) continue;
    return r.text.match(/^\s*using:\s*['"]?([\w-]+)/m)?.[1]?.toLowerCase();
  }
  return undefined;
}

/** Node major of a runtime ("node16" -> 16), or undefined for docker and composite. */
export const nodeOf = (using) => Number(using?.match(/^node(\d+)$/)?.[1]) || undefined;
