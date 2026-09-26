// The rules without the network: email syntax, typo distance, region matching.
import assert from "node:assert/strict";
import test from "node:test";
import { findRegion } from "../src/address.mjs";
import { distance, syntaxProblems, typoOf } from "../src/email.mjs";

test("email syntax: what mail servers accept", () => {
  assert.deepEqual(syntaxProblems("first.last+tag@example.co.uk"), []);
  assert.deepEqual(syntaxProblems("no-at-sign"), ["needs one @ with text on both sides"]);
  assert.ok(syntaxProblems(".lead@example.com").length);
  assert.ok(syntaxProblems("has space@example.com").length);
  assert.ok(syntaxProblems("a@nodot").length);
  assert.ok(syntaxProblems(`${"a".repeat(65)}@example.com`).some((p) => /64/.test(p)));
  assert.deepEqual(syntaxProblems("x@bücher.de"), [], "international domains");
});

test("typos: swaps count once; wrong top-level domains; real providers are not typos", () => {
  assert.equal(distance("gmial.com", "gmail.com"), 1);
  assert.equal(distance("gmail.com", "gmail.com"), 0);
  assert.equal(typoOf("gmial.com"), "gmail.com");
  assert.equal(typoOf("gmail.con"), "gmail.com");
  assert.equal(typoOf("gmail.com"), undefined);
  assert.equal(typoOf("mycompany.com"), undefined);
});

test("regions: by code, name, local name or ISO code", () => {
  const rules = { country: "AE", regions: [{ key: "دبي", name: "Dubai", local: "دبي", iso: "DU" }] };
  for (const v of ["dubai", "دبي", "DU", "AE-DU"]) assert.equal(findRegion(rules, v)?.name, "Dubai", v);
  assert.equal(findRegion(rules, "Sharjah"), undefined);
});
