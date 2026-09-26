// Status, cycle matching and file detection on synthetic data.
import assert from "node:assert/strict";
import test from "node:test";
import { describe, matchCycle, nearestSupported, statusOf, upgradeTarget } from "../src/eol.mjs";
import { detect, lowestVersion } from "../src/detect.mjs";
import { splitItem } from "../src/tools/check-versions.mjs";

const NOW = Date.parse("2026-09-26T00:00:00Z");
const rel = (name, o) => ({ name, releaseDate: "2020-01-01", latest: { name: `${name}.9` }, ...o });

test("status comes from the dates, not the snapshot flags", () => {
  assert.equal(statusOf(rel("1", { eoasFrom: "2027-01-01", eolFrom: "2028-01-01", isEol: true }), NOW), "supported");
  assert.equal(statusOf(rel("1", { eoasFrom: "2025-01-01", eolFrom: "2028-01-01" }), NOW), "security_only");
  assert.equal(statusOf(rel("1", { eolFrom: "2025-01-01", eoesFrom: "2030-01-01" }), NOW), "extended_only");
  assert.equal(statusOf(rel("1", { eolFrom: "2025-01-01" }), NOW), "end_of_life");
  assert.equal(statusOf(rel("1", { releaseDate: "2027-01-01" }), NOW), "upcoming");
  assert.equal(statusOf(rel("1", { isEol: true }), NOW), "end_of_life", "flags only when there is no date");
});

test("cycle matching: the longest cycle prefixing the version at a dot boundary", () => {
  const releases = [rel("3"), rel("3.1"), rel("3.10"), rel("20.04")];
  assert.equal(matchCycle(releases, "3.10.4").name, "3.10");
  assert.equal(matchCycle(releases, "3.1.2").name, "3.1", "3.1 does not match 3.10");
  assert.equal(matchCycle(releases, "v3.9").name, "3");
  assert.equal(matchCycle(releases, "20.04").name, "20.04");
  assert.equal(matchCycle(releases, "4"), undefined);
  assert.equal(matchCycle([rel("3"), rel("3.1")], "3.10.4").name, "3", "3.1 is not a prefix of 3.10 at a dot boundary");
});

test("upgrade targets: newest LTS when the product has LTS; nearest supported is the smallest jump", () => {
  const releases = [
    rel("24", { releaseDate: "2025-05-01", isLts: true, eolFrom: "2028-04-30" }),
    rel("25", { releaseDate: "2025-10-01", eolFrom: "2026-06-01" }),
    rel("22", { releaseDate: "2024-04-01", isLts: true, eoasFrom: "2025-10-21", eolFrom: "2027-04-30" }),
    rel("18", { releaseDate: "2022-04-01", isLts: true, eolFrom: "2025-04-30" }),
  ];
  assert.deepEqual(upgradeTarget(releases, NOW), { cycle: "24", latest: "24.9", lts: true });
  assert.equal(nearestSupported(releases, releases[3], NOW).cycle, "22");
  const d = describe({ name: "nodejs", label: "Node.js", link: "x" }, releases, "18.19.0", NOW);
  assert.equal(d.status, "end_of_life");
  assert.equal(d.days_left, undefined);
  assert.equal(d.behind_latest_patch, true);
});

test("item parsing and ranges", () => {
  assert.deepEqual(splitItem("node@18"), { product: "node", version: "18" });
  assert.deepEqual(splitItem("postgres:13"), { product: "postgres", version: "13" });
  assert.deepEqual(splitItem("Django v4.2"), { product: "Django", version: "4.2" });
  assert.deepEqual(splitItem("python3.8"), { product: "python", version: "3.8" });
  assert.equal(splitItem("just words"), undefined);
  assert.equal(lowestVersion(">=3.8,<4"), "3.8");
  assert.equal(lowestVersion("^18.12.0"), "18.12.0");
});

test("detection: images with registries and digests, variables skipped, matrices, asdf, go toolchain", () => {
  const { findings } = detect([
    { name: "Dockerfile", content: "FROM docker.io/library/postgres:15.4@sha256:abc\nFROM ${IMG}\nFROM --platform=linux/amd64 golang:1.21-bookworm" },
    { name: ".tool-versions", content: "nodejs 20.11.0\npython 3.12.1\nunknowntool 1.0" },
    { name: "go.mod", content: "module m\n\ngo 1.22\n\ntoolchain go1.22.3\n" },
    { name: ".github/workflows/t.yml", content: "python-version: ['3.9', '3.12']\n" },
  ]);
  const got = findings.map((f) => `${f.product} ${f.version}`);
  for (const want of ["postgresql 15.4", "go 1.21", "debian 12", "nodejs 20.11.0", "python 3.12.1", "go 1.22", "go 1.22.3", "python 3.9", "python 3.12"]) assert.ok(got.includes(want), `missing ${want}: ${got.join(", ")}`);
  assert.ok(!got.some((g) => g.includes("unknowntool")));
});
