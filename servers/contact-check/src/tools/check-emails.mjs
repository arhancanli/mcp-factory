import { z } from "zod";
import { compact, defineTool, mapLimit } from "../kit/index.mjs";
import { checkEmail } from "../email.mjs";

export const checkEmails = defineTool({
  name: "check_emails",
  title: "Validate email addresses",
  description: "Checks up to 100 email addresses without sending mail: syntax, whether the domain exists and accepts mail (MX), disposable providers, role accounts (info@, support@), and likely typos of big providers (gmial.com). Gives the reason when invalid.",
  input: { emails: z.array(z.string().max(320)).min(1).max(100) },
  output: { valid: z.number(), results: z.array(z.looseObject({ input: z.string(), valid: z.boolean() })) },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ emails }, ctx) => {
    const results = (await mapLimit(emails, 8, (e) => checkEmail(ctx, e))).map(compact);
    return { valid: results.filter((r) => r.valid).length, results };
  },
});
