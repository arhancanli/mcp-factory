import { z } from "zod";
import { compact, defineTool, ToolError } from "../kit/index.mjs";
import { normName } from "../dns.mjs";
import { ipVersion } from "../ip.mjs";
import { checkSpf, LOOKUP_LIMIT, treeIssues } from "../spf.mjs";
import { compactTree, domainInput, READ_ONLY } from "./shared.mjs";

export const checkSpfTool = defineTool({
  name: "check_spf",
  title: "Evaluate SPF",
  description: "Evaluates a domain's SPF in full: the include tree, DNS lookups against the limit of 10, void lookups, syntax, and with ip the result a receiver would reach (pass, fail, softfail, neutral, permerror) and the mechanism that decided it.",
  input: { domain: domainInput, ip: z.string().max(45).optional().describe("sending IP to evaluate"), sender: z.string().max(254).optional() },
  output: { domain: z.string(), lookups: z.number() },
  annotations: READ_ONLY,
  handler: async ({ domain: raw, ip, sender }, ctx) => {
    const domain = normName(raw);
    if (ip && !ipVersion(ip)) throw new ToolError("bad_ip", `"${ip}" is not an IPv4 or IPv6 address.`);
    const r = await checkSpf(ctx, domain, { ip, sender });
    const issues = [...new Set([...r.problems, ...treeIssues(r.tree).filter((x) => !r.problems.some((p) => x.endsWith(p)))])];
    return compact({
      domain,
      record: r.tree.record,
      result: r.result,
      decided_by: r.matched,
      lookups: r.lookups,
      lookup_limit: LOOKUP_LIMIT,
      void_lookups: r.void_lookups || undefined,
      all: r.tree.all ?? r.tree.redirect?.all,
      problems: issues.length ? issues : undefined,
      tree: r.tree.includes?.length || r.tree.redirect ? compactTree(r.tree) : undefined,
    });
  },
});
