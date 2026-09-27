// Unit rules: image references, ARG substitution, each Dockerfile rule firing and not firing, and
// the base-image findings. No network.
import assert from "node:assert/strict";
import test from "node:test";
import { imageFindings } from "../src/check.mjs";
import { buildsOn } from "../src/images.mjs";
import { displayName, parseImage } from "../src/registry.mjs";
import { lint, parseDockerfile, substitute } from "../src/rules.mjs";

const rules = (text) => lint(parseDockerfile(text)).map((f) => `${f.line} ${f.rule}`);

test("image references as Docker reads them", () => {
  assert.deepEqual(parseImage("node"), { ref: "node", registry: "docker.io", repository: "library/node", tag: "latest", digest: undefined, implicitTag: true });
  assert.deepEqual(parseImage("bitnami/redis:7.2"), { ref: "bitnami/redis:7.2", registry: "docker.io", repository: "bitnami/redis", tag: "7.2", digest: undefined, implicitTag: false });
  const g = parseImage("ghcr.io/org/app:1.2@sha256:abc");
  assert.deepEqual([g.registry, g.repository, g.tag, g.digest], ["ghcr.io", "org/app", "1.2", "sha256:abc"]);
  assert.deepEqual([parseImage("localhost:5000/app").registry, parseImage("localhost:5000/app").tag], ["localhost:5000", "latest"]);
  assert.equal(parseImage("index.docker.io/library/nginx:1.27").registry, "docker.io");
  assert.equal(displayName(parseImage("node:20")), "node:20");
  assert.equal(displayName(parseImage("quay.io/a/b:1")), "quay.io/a/b:1");
});

test("what an image is built on: the runtime from its name, the OS from its tag", () => {
  const on = (ref) => buildsOn(parseImage(ref)).map((b) => `${b.role} ${b.product} ${b.version}`);
  assert.deepEqual(on("node:20-alpine3.19"), ["runtime nodejs 20", "os alpine-linux 3.19"]);
  assert.deepEqual(on("python:3.12-slim-bookworm"), ["runtime python 3.12", "os debian 12"]);
  assert.deepEqual(on("debian:bullseye-slim"), ["runtime debian 11"]);
  assert.deepEqual(on("mcr.microsoft.com/dotnet/aspnet:8.0"), ["runtime dotnet 8.0"]);
  assert.deepEqual(on("node:lts-alpine"), [], "a moving name has no version to check");
});

test("ARG defaults fill FROM lines; a variable without a default leaves the image unchecked", () => {
  assert.equal(substitute("node:${V}-alpine", { V: "20" }), "node:20-alpine");
  assert.equal(substitute("node:$V", { V: "20" }), "node:20");
  assert.equal(substitute("node:${V:-18}", {}), "node:18");
  assert.equal(substitute("node:${V}", {}), undefined);
});

test("build-breaking rules fire, and stay quiet on the correct form", () => {
  assert.deepEqual(rules("FROM a:1\nRUN apt-get update && apt-get install curl\nUSER x\n"), ["2 install-without-yes", "2 apt-recommends", "2 apt-lists"]);
  assert.deepEqual(rules("FROM a:1\nRUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*\nUSER x\n"), []);
  assert.deepEqual(rules("FROM a:1\nRUN dnf install git && yum -y install make\nUSER x\n"), ["2 install-without-yes"]);
  assert.deepEqual(rules("FROM a:1\nRUN apt-get install -qq curl --no-install-recommends && rm -rf /var/lib/apt/lists/*\nUSER x\n"), [], "-qq implies yes");
  assert.deepEqual(rules("FROM a:1 AS base\nFROM a:1\nCOPY --from=bse /x /y\nCOPY --from=base /x /y\nCOPY --from=nginx:1.27 /etc/nginx /etc/nginx\nCOPY --from=0 /x /y\nUSER x\n"), ["3 unknown-stage"]);
  assert.deepEqual(rules("FROM a:1\nCOPY --from=later /x /y\nFROM a:1 AS later\nUSER x\n"), ["2 unknown-stage"]);
  assert.deepEqual(rules("FROM a:1\nCMD ['node', 'x']\nUSER x\n"), ["2 exec-form-quotes"]);
  assert.deepEqual(rules("FROM a:1\nEXPOSE 80 443/tcp 8000-8010 $PORT\nEXPOSE 70000\nUSER x\n"), ["3 invalid-port"]);
  assert.deepEqual(rules("FROM a:1 AS x\nFROM a:1 AS x\nUSER x\n"), ["2 duplicate-stage"]);
});

test("security and cache rules, including the cases that must not fire", () => {
  assert.deepEqual(rules("FROM a:1\nENV API_KEY=abc\nENV KEY_PATH=/k\nARG NPM_TOKEN\nENV TOKEN=$FROM_BUILD\nUSER x\n"), ["2 secret-in-image", "4 secret-in-image"]);
  assert.deepEqual(rules("FROM a:1\nUSER app\nRUN x\nUSER root\n"), ["4 root-user"]);
  assert.deepEqual(rules("FROM a:1\nRUN x\n"), ["1 no-user"]);
  assert.deepEqual(rules("FROM a:1\nRUN apt-get install -y sudo curl --no-install-recommends && rm -rf /var/lib/apt/lists/*\nRUN sudo make install\nUSER x\n"), ["3 sudo"], "a package called sudo is not sudo");
  assert.deepEqual(rules("FROM a:1\nCOPY . .\nRUN npm ci\nUSER x\n"), ["3 cache-order"]);
  assert.deepEqual(rules("FROM a:1\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\nUSER x\n"), []);
  assert.deepEqual(rules("FROM a:1\nADD app.py /app/\nADD https://example.com/x.tgz /x\nADD --checksum=sha256:00 https://example.com/y /y\nADD rootfs.tar.gz /\nUSER x\n"), ["2 add-local", "3 add-url"]);
  assert.deepEqual(rules("FROM a:1\nRUN curl -s x | sh\nUSER x\n"), ["2 pipefail"]);
  assert.deepEqual(rules('FROM a:1\nSHELL ["/bin/bash", "-o", "pipefail", "-c"]\nRUN curl -s x | sh\nUSER x\n'), []);
  assert.deepEqual(rules("FROM a:1\nENV OLD value\nENTRYPOINT node x\nCMD a\nCMD b\nUSER x\n"), ["2 env-legacy", "3 shell-form", "4 shell-form", "5 shell-form", "1 multiple-cmd"]);
  assert.deepEqual(rules("FROM a:1\nRUN apt-get update\nRUN apt-get install -y --no-install-recommends x && rm -rf /var/lib/apt/lists/*\nUSER x\n"), ["2 apt-update-alone"]);
});

test("base-image findings: missing tags, platforms, end of life and stale tags", () => {
  const now = Date.parse("2026-09-27");
  assert.deepEqual(imageFindings(1, "node:18.99", { image: "node:18.99", exists: false, nearest_tags: ["18.20.8"] }).map((f) => [f.rule, f.fix]), [["image-not-found", "existing tags: 18.20.8"]]);
  assert.deepEqual(imageFindings(1, "node", { image: "node:latest", exists: true, pin: "node:latest@sha256:1" }).map((f) => f.rule), ["unpinned-image"]);
  assert.deepEqual(imageFindings(1, "a:1", { image: "a:1", exists: true, platforms: ["linux/amd64"], missing_platform: "linux/arm64" }).map((f) => f.rule), ["missing-platform"]);
  assert.deepEqual(imageFindings(1, "a:1", { image: "a:1", exists: true, updated: "2025-01-01" }, now).map((f) => f.rule), ["stale-image"]);
  assert.deepEqual(imageFindings(1, "a:1", { image: "a:1", exists: true, updated: "2026-09-01" }, now), []);
  const eol = { image: "a:1", exists: true, updated: "2024-01-01", lifecycle: [{ role: "runtime", product: "X", cycle: "1", status: "end_of_life", eol: "2025-01-01", upgrade_to: "3" }] };
  assert.deepEqual(imageFindings(1, "a:1", eol, now).map((f) => f.rule), ["end-of-life"], "an end-of-life finding says it; no second stale finding");
  const soon = { image: "a:1", exists: true, lifecycle: [{ role: "runtime", product: "X", cycle: "1", status: "supported", eol: "2026-11-01", days_left: 35, upgrade_to: "2" }] };
  assert.deepEqual(imageFindings(1, "a:1", soon, now).map((f) => f.rule), ["end-of-life-soon"]);
  assert.deepEqual(imageFindings(1, "private.example/a:1", { image: "private.example/a:1", unchecked: "not read" }).map((f) => f.rule), ["image-unchecked"]);
});
