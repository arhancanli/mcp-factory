import { z } from "zod";
import { compact, defineTool } from "../kit/index.mjs";
import { parseUses, repoRefs, versionsOf } from "../refs.mjs";
import { READ_ONLY, resolveAction } from "./shared.mjs";
import { compareVersions } from "../versions.mjs";

export const actionVersions = defineTool({
  name: "action_versions",
  title: "Versions of an action",
  description: "For up to 20 actions (owner/repo, or owner/repo@ref): latest release with its commit SHA and runtime, the newest release of each major version, and for a ref, the commit it points to and its runtime, with the line to pin (action@sha # tag).",
  input: { actions: z.array(z.string().max(200)).min(1).max(20) },
  output: { results: z.array(z.looseObject({ action: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ actions }, ctx) => {
    const results = await Promise.all(
      actions.map(async (raw) => {
        const withRef = raw.includes("@") ? raw : `${raw}@HEAD-probe`;
        const p = parseUses(withRef);
        if (!p) return { action: raw, error: "Write it as owner/repo or owner/repo@ref." };
        try {
          const refs = await repoRefs(ctx, p.owner, p.repo);
          const { majors } = versionsOf(refs.tags);
          const a = await resolveAction(ctx, raw.includes("@") ? raw : `${p.full}@${versionsOf(refs.tags).latest ?? refs.defaultBranch}`);
          return compact({
            action: p.full,
            latest: a.latest,
            latest_sha: a.latest_sha,
            latest_runtime: a.latest_runtime,
            pin: a.latest_sha ? `${p.full}@${a.latest_sha} # ${a.latest}` : undefined,
            majors: [...majors].sort((x, y) => y[0] - x[0]).slice(0, 6).map(([m, t]) => `v${m}: ${t}`),
            ref: raw.includes("@") ? compact({ ref: p.ref, kind: a.kind, sha: a.sha, tag: a.tag !== p.ref ? a.tag : undefined, runtime: a.runtime, pin: a.sha ? `${p.full}@${a.sha}${a.tag ? ` # ${a.tag}` : ""}` : undefined }) : undefined,
            note: a.kind === "missing" ? `${p.ref} is not a tag, branch or commit of ${p.full}.` : !a.latest ? "No release tags; pin a commit." : raw.includes("@") && a.tag && compareVersions(a.tag, a.latest) < 0 ? `A newer release exists: ${a.latest}.` : undefined,
          });
        } catch (err) {
          return { action: raw, error: err.message };
        }
      }),
    );
    return { results };
  },
});
