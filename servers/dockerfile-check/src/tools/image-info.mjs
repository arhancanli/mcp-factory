import { z } from "zod";
import { defineTool, mapLimit } from "../kit/index.mjs";
import { imageFacts } from "../images.mjs";
import { READ_ONLY } from "./shared.mjs";

export const imageInfo = defineTool({
  name: "image_info",
  title: "Does this image tag exist, and is it supported?",
  description: "For container image references (node:20-alpine, ghcr.io/org/app:1.2): whether the tag exists (nearest real tags if not), its digest and a pinned reference, platforms, last rebuild (Docker Hub), and end-of-life status of its runtime and OS with an upgrade tag. Docker Hub, GHCR, Quay, GCR, MCR, ECR Public, registry.k8s.io.",
  input: {
    images: z.array(z.string().min(1).max(300)).min(1).max(50),
    platform: z.string().max(40).optional().describe("report whether each image is built for this platform, e.g. linux/arm64"),
  },
  output: { images: z.array(z.looseObject({ image: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ images, platform }, ctx) => ({
    images: await mapLimit(images, 6, async (ref) => {
      const { registry, lifecycle, ...facts } = await imageFacts(ctx, ref, { platform, now: ctx.now() });
      return { ...facts, ...(lifecycle ? { lifecycle: lifecycle.map(({ role, ...l }) => ({ ...l, role })) } : {}) };
    }),
  }),
});
