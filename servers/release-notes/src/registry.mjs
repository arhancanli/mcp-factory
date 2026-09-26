// src/registry.mjs
//
// A package's versions (with publish dates) and its source repository, from deps.dev (npm, PyPI,
// crates.io, Go, Maven, NuGet). For npm, the registry's latest manifest also gives the directory of
// a package inside a monorepo, where its own CHANGELOG usually lives.
import { ToolError } from "./kit/index.mjs";
import { compareVersions } from "./versions.mjs";

export const ECOSYSTEMS = { npm: "npm", pypi: "pypi", pip: "pypi", python: "pypi", cargo: "cargo", "crates.io": "cargo", crates: "cargo", rust: "cargo", go: "go", golang: "go", maven: "maven", java: "maven", nuget: "nuget", ".net": "nuget" };
const enc = encodeURIComponent;

/** owner/repo (and a subdirectory) from any GitHub URL form; undefined for other hosts. */
export function githubRepo(url) {
  const m = String(url ?? "")
    .replace(/^git\+/, "")
    .replace(/^github:/, "https://github.com/")
    .match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/[^/]+\/(.+?))?\/?(?:[#?].*)?$/i);
  return m ? { owner: m[1], repo: m[2], directory: m[3] } : undefined;
}

/** @returns {Promise<{ecosystem: string, name: string, versions: {version: string, date?: string}[], latest?: string, repo?: {owner, repo, directory?}, repoUrl?: string}>} */
export async function resolvePackage(ctx, ecosystemRaw, nameRaw) {
  const ecosystem = ECOSYSTEMS[String(ecosystemRaw).toLowerCase()];
  if (!ecosystem) throw new ToolError("bad_ecosystem", `Unknown ecosystem "${ecosystemRaw}". Use npm, pypi, cargo, go, maven or nuget.`);
  const name = ecosystem === "pypi" ? nameRaw.trim().toLowerCase().replace(/[-_.]+/g, "-") : nameRaw.trim();
  const { status, data } = await ctx.fetcher.getJson(`https://api.deps.dev/v3/systems/${ecosystem}/packages/${enc(name)}`, { allowStatus: [404] });
  if (status === 404 || !data?.versions?.length) throw new ToolError("unknown_package", `${ecosystem} has no package named ${nameRaw}.`);
  const versions = data.versions
    .map((v) => ({ version: v.versionKey.version, date: v.publishedAt?.slice(0, 10), isDefault: v.isDefault }))
    .sort((a, b) => compareVersions(a.version, b.version));
  const latest = (versions.find((v) => v.isDefault) ?? versions.at(-1)).version;
  const [info, npmLatest] = await Promise.all([
    ctx.fetcher.getJson(`https://api.deps.dev/v3/systems/${ecosystem}/packages/${enc(name)}/versions/${enc(latest)}`, { allowStatus: [404] }),
    ecosystem === "npm" ? ctx.fetcher.getJson(`https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`, { allowStatus: [404] }) : Promise.resolve({}),
  ]);
  const links = [...(info.data?.links ?? []).filter((l) => l.label === "SOURCE_REPO").map((l) => l.url), ...(info.data?.relatedProjects ?? []).filter((p) => p.relationType === "SOURCE_REPO").map((p) => `https://${p.projectKey.id}`)];
  // Go module paths are their repository for github.com modules.
  if (ecosystem === "go" && name.startsWith("github.com/")) links.unshift(`https://${name.split("/").slice(0, 3).join("/")}`);
  const npmRepo = npmLatest.data?.repository;
  const npmUrl = typeof npmRepo === "string" ? npmRepo : npmRepo?.url;
  const repo = githubRepo(npmUrl) ?? links.map(githubRepo).find(Boolean);
  if (repo && !repo.directory && npmRepo?.directory) repo.directory = npmRepo.directory.replace(/^\.?\//, "").replace(/\/$/, "");
  return { ecosystem, name, versions: versions.map(({ version, date }) => ({ version, date })), latest, repo, repoUrl: repo ? `https://github.com/${repo.owner}/${repo.repo}` : (links[0] ?? npmUrl) };
}
