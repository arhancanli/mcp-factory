import { z } from "zod";
import { defineTool } from "../kit/index.mjs";
import { checkManifests } from "../check.mjs";
import { READ_ONLY } from "./shared.mjs";

export const checkManifestsTool = defineTool({
  name: "check_manifests",
  title: "Check Kubernetes manifests",
  description: "Checks Kubernetes manifests (YAML/JSON, multi-document) against a Kubernetes version (default: newest): removed or deprecated APIs with replacements, unknown or wrong fields, what the API server refuses, Pod Security (baseline; restricted on request), risks. Custom resources via their CRD. Findings have file, line, fix. Render Helm/Kustomize first.",
  input: {
    files: z
      .array(z.object({ path: z.string().min(1).max(400), content: z.string().max(2_000_000) }))
      .min(1)
      .max(50),
    kubernetes_version: z.string().max(20).optional().describe("e.g. 1.30; default the newest release"),
    pod_security: z.enum(["baseline", "restricted", "none"]).optional().describe("the level the namespace enforces; its violations become errors"),
  },
  output: {
    kubernetes_version: z.string(),
    objects: z.number(),
    counts: z.record(z.string(), z.number()),
    findings: z.array(z.looseObject({ severity: z.string(), rule: z.string(), message: z.string() })),
  },
  annotations: READ_ONLY,
  handler: async (args, ctx) => checkManifests(ctx, args),
});
