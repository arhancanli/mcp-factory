// Golden tests: both tools over a real MCP client, replaying Docker Hub's tag API, registry
// manifests and tokens, and endoflife.date as recorded by test/record.mjs, at the recording date.
// No test here touches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect } from "./replay.mjs";
import { ARM, BROKEN, CLEAN, IMAGES } from "./scenarios.mjs";

const brief = (f) => `${f.severity} ${f.line} ${f.rule}`;

test("check_dockerfile: every problem in a three-stage Dockerfile, with its line and fix", async () => {
  const client = await connect();
  const { data } = await call(client, "check_dockerfile", { files: [{ path: "Dockerfile", content: BROKEN }] });
  const [file] = data.files;
  assert.deepEqual(file.findings.map(brief), [
    "error 9 unknown-stage",
    "error 17 install-without-yes",
    "error 18 outside-context",
    "error 21 invalid-port",
    "error 23 exec-form-quotes",
    "warning 2 end-of-life",
    "warning 7 end-of-life",
    "warning 13 end-of-life",
    "warning 13 end-of-life",
    "warning 14 syntax",
    "warning 15 secret-in-image",
    "warning 16 apt-update-alone",
    "warning 20 secret-in-image",
    "warning 22 root-user",
    "info 17 apt-recommends",
    "info 17 apt-lists",
  ]);
  const at = (line, rule) => file.findings.find((f) => f.line === line && f.rule === rule);
  assert.match(at(9, "unknown-stage").message, /--from=dep names no earlier stage \(stages: deps, build\)/);
  assert.equal(at(2, "end-of-life").fix, "use node:24-alpine", "the ARG default is resolved, and the upgrade tag exists");
  assert.deepEqual(
    file.findings.filter((f) => f.line === 13).map((f) => f.fix),
    ["use python:3.14-slim", "move to Debian 13 (or 12, the nearest supported)"],
    "the retired codename is dropped from the upgrade tag",
  );
  assert.deepEqual(file.images.map((i) => [i.line, i.image, i.exists]), [
    [2, "node:18-alpine", true],
    [7, "node:18-alpine", true],
    [13, "python:3.8-slim-buster", true],
  ]);
  assert.match(file.images[0].pin, /^node:18-alpine@sha256:[0-9a-f]{64}$/);
});

test("check_dockerfile: a clean two-stage build has no findings", async () => {
  const client = await connect();
  const { data } = await call(client, "check_dockerfile", { files: [{ path: "Dockerfile", content: CLEAN }] });
  assert.deepEqual([data.files[0].findings, data.files[0].counts], [[], {}]);
  assert.deepEqual(
    data.files[0].images.map((i) => [i.line, i.image]),
    [[2, "node:24-alpine"]],
    "FROM base and COPY --from=build are stages, not images to look up",
  );
});

test("check_dockerfile: a base image that is not built for the target platform", async () => {
  const client = await connect();
  const { data } = await call(client, "check_dockerfile", { files: [{ path: "db/Dockerfile", content: ARM }], platform: "linux/arm64" });
  assert.deepEqual(data.files[0].findings.map((f) => `${f.rule}: ${f.message}`), [
    "missing-platform: mysql:5.7 is not built for linux/arm64 (it is built for linux/amd64).",
    "end-of-life: mysql:5.7 is built on MySQL 5.7, past its end of life (2023-10-31): no more security fixes.",
  ]);
});

test("image_info: seven registries, missing tags with the nearest real ones, end-of-life and pins", async () => {
  const client = await connect();
  const { data } = await call(client, "image_info", { images: IMAGES });
  const by = Object.fromEntries(data.images.map((i) => [i.image, i]));
  assert.deepEqual(by["node:18.99-alpine"].nearest_tags, ["18.20.8-alpine", "18.20-alpine", "18-alpine"]);
  assert.equal(by["python:3.8-slim-buster"].upgrade_image, "python:3.14-slim");
  assert.deepEqual(
    by["python:3.8-slim-buster"].lifecycle.map((l) => `${l.role} ${l.product} ${l.cycle} ${l.status}`),
    ["runtime Python 3.8 end_of_life", "os Debian 10 extended_only"],
  );
  for (const ref of ["ghcr.io/actions/actions-runner:2.328.0", "mcr.microsoft.com/dotnet/aspnet:6.0", "registry.k8s.io/pause:3.10", "quay.io/prometheus/node-exporter:v1.8.2", "public.ecr.aws/docker/library/alpine:3.20"]) {
    assert.equal(by[ref].exists, true, ref);
    assert.match(by[ref].pin, /@sha256:[0-9a-f]{64}$/, ref);
    assert.ok(by[ref].platforms.includes("linux/amd64"), ref);
  }
  assert.deepEqual(by["mcr.microsoft.com/dotnet/aspnet:6.0"].lifecycle.map((l) => [l.product, l.status, l.nearest_supported]), [["Microsoft .NET", "end_of_life", "8"]]);
  assert.match(by["openjdk:17"].deprecated, /only early-access builds/);
  assert.equal(by["ghcr.io/nope/nothing:1"].note, "not found, or private (only public images can be checked)");
});
