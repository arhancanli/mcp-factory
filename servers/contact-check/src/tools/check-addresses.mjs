import { z } from "zod";
import { compact, defineTool, mapLimit, ToolError } from "../kit/index.mjs";
import { checkAddress, countryRules } from "../address.mjs";

const address = z.object({
  country: z.string().length(2).describe("ISO code"),
  name: z.string().max(200).optional(),
  organization: z.string().max(200).optional(),
  street: z.array(z.string().max(200)).max(4).optional(),
  city: z.string().max(100).optional(),
  region: z.string().max(100).optional().describe("state or province, code or name"),
  postal_code: z.string().max(20).optional(),
});

export const checkAddresses = defineTool({
  name: "check_addresses",
  title: "Validate postal addresses",
  description: "Checks up to 50 postal addresses against each country's rules (Google's address data): required fields, postcode pattern, state or province, and writes each as the country formats it. Without street and city, returns the country's rules and regions.",
  input: { addresses: z.array(address).min(1).max(50) },
  output: { results: z.array(z.looseObject({ country: z.string() })) },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ addresses }, ctx) => {
    const results = await mapLimit(addresses, 6, async (a) => {
      let rules;
      try {
        rules = await countryRules(ctx, a.country);
      } catch (err) {
        if (err instanceof ToolError) return { country: a.country, valid: false, problems: [err.message] };
        throw err;
      }
      if (!a.street?.length && !a.city && !a.postal_code) {
        return compact({ country: rules.country, name: rules.name, required: rules.require, postal_code_example: rules.zipExample, regions: rules.regions.length ? `${rules.regions.length} ${rules.regionName}s: ${rules.regions.slice(0, 12).map((r) => (r.key !== r.name ? `${r.key} ${r.name}` : r.name)).join(", ")}${rules.regions.length > 12 ? ", ..." : ""}` : undefined });
      }
      const r = checkAddress(rules, a);
      return compact({ country: rules.country, valid: r.valid, problems: r.problems.length ? r.problems : undefined, region: r.region, label: r.label });
    });
    return { results };
  },
});
