// src/runners.mjs
//
// GitHub-hosted runner labels, from GitHub's own runner-images README: the labels it lists are
// available (some marked deprecated); a ubuntu-, windows- or macos- label it does not list is no
// longer provided, so jobs that ask for it wait and fail.
const README = "https://raw.githubusercontent.com/actions/runner-images/main/README.md";

export async function runnerLabels(ctx) {
  const r = await ctx.fetcher.request(README, { accept: "text/plain" });
  if (!r.ok) return null;
  const labels = new Map();
  for (const line of r.text.split("\n")) {
    if (!line.startsWith("|") || !line.includes("`")) continue;
    const deprecated = /badge\/deprecated|\bdeprecated\b/i.test(line.split("|")[1] ?? "");
    const beta = /badge\/beta|\bbeta\b/i.test(line.split("|")[1] ?? "");
    for (const m of line.matchAll(/`([a-z0-9.-]+)`/gi)) labels.set(m[1].toLowerCase(), deprecated ? "deprecated" : beta ? "beta" : "available");
  }
  return labels;
}

/** A label's status: available, beta, deprecated, retired (a hosted-looking label GitHub no longer lists), or self-hosted. */
export function labelStatus(labels, label) {
  const l = String(label).toLowerCase();
  if (labels?.has(l)) return labels.get(l);
  if (/^(ubuntu|windows|macos)-/.test(l)) return labels ? "retired" : "unknown";
  return "self-hosted";
}
