import { z } from "zod";
import { defineTool, mapLimit } from "../kit/index.mjs";
import { checkDockerfile } from "../check.mjs";
import { READ_ONLY } from "./shared.mjs";

export const checkDockerfileTool = defineTool({
  name: "check_dockerfile",
  title: "Check Dockerfiles",
  description: "Checks Dockerfiles: syntax, what breaks the build (apt-get install without -y, copies outside the context, unknown stages), root users, secrets in ENV/ARG, cache order, and each base image against its registry (tag exists, digest to pin, platforms, last rebuild) and end-of-life dates. Findings have line and fix.",
  input: {
    files: z
      .array(z.object({ path: z.string().min(1).max(400), content: z.string().max(500_000) }))
      .min(1)
      .max(20),
    platform: z.string().max(40).optional().describe("the platform you build for, e.g. linux/arm64"),
  },
  output: { files: z.array(z.looseObject({ path: z.string(), findings: z.array(z.looseObject({ severity: z.string(), rule: z.string(), message: z.string() })) })) },
  annotations: READ_ONLY,
  handler: async ({ files, platform }, ctx) => ({ files: await mapLimit(files, 4, (f) => checkDockerfile(ctx, f, { platform, now: ctx.now() })) }),
});
