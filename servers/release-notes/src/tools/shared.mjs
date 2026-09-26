import { z } from "zod";

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
export const pkgInput = { ecosystem: z.string().max(20).describe("npm, pypi, cargo, go, maven, nuget"), package: z.string().max(214) };

/** The exact version string the registry uses for a loosely written one ("v5", "5.0"), or undefined. */
export function pickVersion(versions, raw) {
  const v = String(raw ?? "").trim().replace(/^v/i, "");
  if (!v) return undefined;
  const exact = versions.find((x) => x.version === v);
  if (exact) return exact.version;
  // "5" or "5.0": the newest release with that prefix; "4.x" likewise.
  const prefix = v.replace(/\.x$/i, "");
  const matches = versions.filter((x) => x.version === prefix || x.version.startsWith(`${prefix}.`));
  return matches.at(-1)?.version;
}

/** "no version 7.20.0" with the versions either side, so the caller can pick one. */
export function versionError(name, versions, raw, compare) {
  const v = String(raw).replace(/^v/i, "");
  const below = versions.filter((x) => compare(x.version, v) < 0).at(-1)?.version;
  const above = versions.find((x) => compare(x.version, v) > 0)?.version;
  return `${name} has no version ${raw}${below || above ? `; the nearest are ${[below, above].filter(Boolean).join(" and ")}` : ""}. Latest: ${versions.at(-1)?.version}.`;
}
