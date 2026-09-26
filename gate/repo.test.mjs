// gate/repo.test.mjs
//
// Repository-wide rules. Credit: Arhan Canli is the only author, so no file and no commit message
// may carry an assistant co-author line, an assistant "generated with" line or an assistant email,
// and every commit must be authored under the owner's identity. Style: no em dashes anywhere.
// Patterns are built from pieces so this file does not trip its own checks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { CONFIG, ROOT } from "../scripts/lib.mjs";
import { creditViolations, j } from "../scripts/credit.mjs";

const EM_DASH = String.fromCharCode(0x2014);
const OWNER_EMAILS = new Set(["315329124+arhancanli@users.noreply.github.com", "arhancanli8@gmail.com"]);

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
const repoFiles = () =>
  git("ls-files", "-co", "--exclude-standard", "-z")
    .split("\0")
    .filter(Boolean)
    .filter((f) => !/(^|\/)(package-lock|npm-shrinkwrap)\.json$/.test(f))
    .filter((f) => {
      try {
        return statSync(path.join(ROOT, f)).isFile();
      } catch {
        return false;
      }
    });

test("the credit patterns catch what they are meant to and nothing ordinary", () => {
  const bad = [j("Co-", "Authored-", "By: Someone <x@y>"), j("Generated ", "with [Claude", " Code]"), j("noreply@", "anthropic.com"), j("https://claude", ".ai/code"), String.fromCodePoint(0x1f916)];
  for (const s of bad) assert.ok(creditViolations(s).length > 0, `missed: ${s}`);
  const fine = ["Install in Claude Desktop", "claude mcp add weather", "Works with Cursor and VS Code", "generated from the template"];
  for (const s of fine) assert.deepEqual(creditViolations(s), [], `false alarm: ${s}`);
});

test("no file in the repository credits anyone but the owner", () => {
  const offenders = [];
  for (const f of repoFiles()) {
    const v = creditViolations(readFileSync(path.join(ROOT, f), "utf8"));
    if (v.length) offenders.push(`${f}: ${v.join(", ")}`);
  }
  assert.deepEqual(offenders, []);
});

test("no authored file contains an em dash", () => {
  // Recorded upstream responses (test/fixtures) stay byte for byte as the source sent them.
  const offenders = repoFiles().filter((f) => !f.includes("/test/fixtures/") && readFileSync(path.join(ROOT, f), "utf8").includes(EM_DASH));
  assert.deepEqual(offenders, []);
});

test("every commit is authored and committed by the owner, with a clean message", () => {
  let log = "";
  try {
    log = git("log", "--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%B%x1e");
  } catch {
    return; // no commits yet
  }
  const bad = [];
  for (const rec of log.split("\x1e").map((r) => r.trim()).filter(Boolean)) {
    const [sha, an, ae, cn, body] = rec.split("\x1f");
    if (an !== CONFIG.author.name || !OWNER_EMAILS.has(ae)) bad.push(`${sha.slice(0, 8)} author ${an} <${ae}>`);
    if (cn !== CONFIG.author.name && cn !== "GitHub") bad.push(`${sha.slice(0, 8)} committer ${cn}`);
    const v = creditViolations(body);
    if (v.length) bad.push(`${sha.slice(0, 8)} message: ${v.join(", ")}`);
  }
  assert.deepEqual(bad, []);
});

test("generated README blocks keep dollar signs and other replacement patterns literally", async () => {
  const { replaceBlock } = await import("../scripts/lib.mjs");
  const body = "between $40 and $49, $1 $& $' $` $$";
  assert.equal(replaceBlock("a\n<!-- x:start -->\nold\n<!-- x:end -->\nb", "x", body), `a\n<!-- x:start -->\n${body}\n<!-- x:end -->\nb`);
});
