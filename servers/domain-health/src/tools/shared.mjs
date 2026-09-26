import { z } from "zod";

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
export const domainInput = z.string().max(253).describe("domain, e.g. example.com");

/** The SPF tree without noise: each node's record and its children. */
export function compactTree(node) {
  if (!node) return undefined;
  const out = { domain: node.domain, record: node.record, error: node.error };
  if (node.includes?.length) out.includes = node.includes.map(compactTree);
  if (node.redirect) out.redirect = compactTree(node.redirect);
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}
