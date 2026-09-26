// scripts/credit.mjs
//
// Lines that would credit someone other than the owner: assistant co-author trailers, "generated
// with" lines, assistant emails and links. Used by gate/repo.test.mjs and .githooks/commit-msg.
// Built from pieces so this file does not trip its own check.
export const j = (...parts) => parts.join("");
export const CREDIT_PATTERNS = [
  new RegExp(j("co-", "authored-", "by"), "i"),
  new RegExp(j("generated ", "(with|by) ", "\\[?", "(claude|chatgpt|copilot|gpt|an? ai)"), "i"),
  new RegExp(j("noreply@", "anthropic", "\\.com"), "i"),
  new RegExp(j("claude", "\\.ai/", "code"), "i"),
  new RegExp(j("written ", "by ", "(claude|chatgpt|copilot|an? ai)"), "i"),
  new RegExp(String.fromCodePoint(0x1f916)),
];
export const creditViolations = (text) => CREDIT_PATTERNS.filter((re) => re.test(text)).map(String);
