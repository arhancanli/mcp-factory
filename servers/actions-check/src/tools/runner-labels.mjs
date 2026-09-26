import { z } from "zod";
import { compact, defineTool, ToolError } from "../kit/index.mjs";
import { labelStatus, runnerLabels } from "../runners.mjs";
import { READ_ONLY } from "./shared.mjs";

export const runnerLabelsTool = defineTool({
  name: "runner_labels",
  title: "GitHub-hosted runner labels",
  description: "Status of GitHub-hosted runner labels (ubuntu-22.04, macos-14, windows-2019...) from GitHub's runner-images list: available, beta, deprecated, or retired (no longer provided). Without labels, every label GitHub lists now.",
  input: { labels: z.array(z.string().max(60)).max(30).optional() },
  output: { results: z.array(z.looseObject({ label: z.string(), status: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ labels }, ctx) => {
    const list = await runnerLabels(ctx);
    if (!list) throw new ToolError("upstream_status", "GitHub's runner-images list could not be read.");
    const rows = labels?.length ? labels.map((l) => ({ label: l, status: labelStatus(list, l) })) : [...list].map(([label, status]) => ({ label, status }));
    return { ...compact({ note: rows.some((r) => r.status === "retired") ? "Retired labels are not in GitHub's list any more: jobs that ask for them wait and fail." : undefined }), results: rows };
  },
});
