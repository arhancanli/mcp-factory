import { z } from "zod";
import { compact, defineTool } from "../kit/index.mjs";
import { checkPhone } from "../phone.mjs";

export const checkPhones = defineTool({
  name: "check_phones",
  title: "Validate phone numbers",
  description: "Validates up to 100 phone numbers with Google's libphonenumber data: valid for their country or why not, type (mobile, fixed line, toll free, VoIP...), and E.164, international and national forms. country (ISO code) for numbers written without +.",
  input: { numbers: z.array(z.string().max(60)).min(1).max(100), country: z.string().length(2).optional().describe("default country, e.g. GB") },
  output: { valid: z.number(), results: z.array(z.looseObject({ input: z.string(), valid: z.boolean() })) },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ numbers, country }) => {
    const results = numbers.map((n) => compact(checkPhone(n, country)));
    return { valid: results.filter((r) => r.valid).length, results };
  },
});
