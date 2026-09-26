import { z } from "zod";
import { clip, compact, defineTool, mapLimit } from "../kit/index.mjs";
import { judge } from "../compat.mjs";
import { parseExpression } from "../licenses.mjs";
import { DISCLAIMER, loadData, projectLicense, READ_ONLY } from "./shared.mjs";

const ECOSYSTEMS = { npm: "npm", pypi: "pypi", pip: "pypi", python: "pypi", cargo: "cargo", "crates.io": "cargo", rust: "cargo", go: "go", golang: "go", maven: "maven", java: "maven", nuget: "nuget" };
const ORDER = ["no", "unknown", "check", "yes"];
const enc = encodeURIComponent;

export const packageLicenses = defineTool({
  name: "package_licenses",
  title: "Licenses of packages",
  description: "Looks up the licenses of up to 50 packages (npm, PyPI, crates.io, Go, Maven, NuGet; a version, or the latest) and, with project, whether each fits your license (yes, no, check). Copyleft ones are flagged. Worst first.",
  input: {
    packages: z.array(z.object({ ecosystem: z.string().max(20), name: z.string().max(214), version: z.string().max(100).optional() })).min(1).max(50),
    project: z.string().max(80).optional().describe("your project's license"),
  },
  output: { results: z.array(z.looseObject({ package: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ packages, project: raw }, ctx) => {
    const data = await loadData(ctx);
    const project = raw ? projectLicense(data, raw) : undefined;
    const results = await mapLimit(packages, 8, async (p) => {
      const eco = ECOSYSTEMS[p.ecosystem.toLowerCase()] ?? p.ecosystem.toLowerCase();
      const name = eco === "pypi" ? p.name.toLowerCase().replace(/[-_.]+/g, "-") : p.name;
      let version = p.version;
      if (!version) {
        const { status, data: pkg } = await ctx.fetcher.getJson(`https://api.deps.dev/v3/systems/${eco}/packages/${enc(name)}`, { allowStatus: [404] });
        if (status === 404) return { package: `${p.ecosystem}:${p.name}`, verdict: "unknown", note: "No such package." };
        version = (pkg.versions.find((v) => v.isDefault) ?? pkg.versions.at(-1)).versionKey.version;
      }
      const { status, data: v } = await ctx.fetcher.getJson(`https://api.deps.dev/v3/systems/${eco}/packages/${enc(name)}/versions/${enc(version)}`, { allowStatus: [404] });
      const label = `${p.ecosystem}:${p.name}@${version}`;
      if (status === 404) return { package: label, verdict: "unknown", note: "No such package version." };
      const expr = (v.licenses ?? []).filter((l) => l && l !== "non-standard").join(" AND ");
      if (!expr) return { package: label, license: "none declared", verdict: project ? "unknown" : undefined, note: "The package declares no license; without one, no rights are granted." };
      const { tree } = parseExpression(data, expr);
      const copyleftOf = (t) => (t.license ? data.osadl.copyleft[t.license] : (t.and ?? t.or).map(copyleftOf).find((c) => c && c !== "No"));
      const j = project ? judge(data, project, tree) : undefined;
      return compact({ package: label, license: expr, copyleft: copyleftOf(tree) !== "No" ? copyleftOf(tree) : undefined, verdict: j?.verdict, via: j?.via, reason: j?.reason && j.verdict !== "yes" ? clip(j.reason, 300) : undefined });
    });
    if (project) results.sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict));
    return { ...compact({ project: project?.id, counts: project ? Object.fromEntries(ORDER.map((x) => [x, results.filter((r) => r.verdict === x).length]).filter(([, n]) => n)) : undefined, note: project ? DISCLAIMER : undefined }), results };
  },
});
