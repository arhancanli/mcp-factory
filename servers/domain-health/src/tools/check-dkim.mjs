import { z } from "zod";
import { defineTool, mapLimit } from "../kit/index.mjs";
import { normName } from "../dns.mjs";
import { COMMON_SELECTORS, dkimSelector } from "../mail.mjs";
import { domainInput, READ_ONLY } from "./shared.mjs";

export const checkDkim = defineTool({
  name: "check_dkim",
  title: "Check DKIM keys",
  description: "Looks up DKIM keys at the given selectors (or 30 common provider selectors): key type, size in bits, testing and revoked flags, problems. Selectors cannot be listed from DNS; the selector is in a sent message's DKIM-Signature (s=).",
  input: { domain: domainInput, selectors: z.array(z.string().max(63)).max(20).optional() },
  output: { domain: z.string(), found: z.array(z.looseObject({ selector: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ domain: raw, selectors }, ctx) => {
    const domain = normName(raw);
    const list = selectors?.length ? selectors.map((s) => s.trim().toLowerCase()) : COMMON_SELECTORS;
    const rows = await mapLimit(list, 10, (s) => dkimSelector(ctx, domain, s));
    const found = rows.filter((r) => r.found).map(({ found: _, ...r }) => r);
    const missing = rows.filter((r) => !r.found).map((r) => r.selector);
    return { domain, found, ...(selectors?.length ? { not_found: missing.length ? missing : undefined } : { checked: list.length }) };
  },
});
