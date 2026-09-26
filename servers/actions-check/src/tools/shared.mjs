import { mapLimit } from "../kit/index.mjs";
import { nodeOf, parseUses, refKind, repoRefs, runtimeAt, versionsOf } from "../refs.mjs";
import { majorOf } from "../versions.mjs";

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
export const GITHUB_OWNED = new Set(["actions", "github"]);

/**
 * Everything about one action reference: how it is pinned, the latest release, the newest release
 * of its major, runtimes at the used ref and at the latest, and the SHA to pin to.
 */
export async function resolveAction(ctx, uses) {
  const p = parseUses(uses);
  if (!p) return { uses, skipped: /^\.\//.test(uses) ? "local action" : /^docker:\/\//.test(uses) ? "docker image" : "not owner/repo@ref" };
  const refs = await repoRefs(ctx, p.owner, p.repo);
  const { latest, majors } = versionsOf(refs.tags);
  const at = refKind(refs, p.ref);
  const usedMajor = at.tag ? majorOf(at.tag) : undefined;
  const [runtime, latestRuntime] = await Promise.all([at.sha ? runtimeAt(ctx, p.owner, p.repo, p.path, at.sha) : undefined, latest ? runtimeAt(ctx, p.owner, p.repo, p.path, refs.tags.get(latest)) : undefined]);
  return {
    uses,
    action: p.full,
    owner: p.owner,
    ref: p.ref,
    kind: at.kind,
    sha: at.sha,
    tag: at.tag,
    latest,
    latest_sha: latest ? refs.tags.get(latest) : undefined,
    newest_in_major: usedMajor !== undefined ? majors.get(usedMajor) : undefined,
    runtime,
    latest_runtime: latestRuntime,
    majors_behind: usedMajor !== undefined && latest ? majorOf(latest) - usedMajor : undefined,
    node: nodeOf(runtime),
    latest_node: nodeOf(latestRuntime),
  };
}

export const resolveAll = (ctx, list) => mapLimit([...new Set(list)], 6, (u) => resolveAction(ctx, u).catch((err) => ({ uses: u, error: err.message })));
