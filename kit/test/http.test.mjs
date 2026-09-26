// kit/test/http.test.mjs: every network guarantee the fetcher makes, one test each.
import assert from "node:assert/strict";
import test from "node:test";
import { createFetcher, createLimiter, UpstreamError } from "../http.mjs";
import { TtlCache } from "../cache.mjs";

const UA = "kit-test/1";
const respond = (status, body = "", headers = {}) => new Response(body, { status, headers });

function fakeFetch(script) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = script.shift();
    if (!next) throw new Error("no scripted response left");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(url, init) : next;
  };
  return { impl, calls };
}

const make = (impl, extra = {}) => createFetcher({ allowHosts: ["api.example.org"], userAgent: UA, fetchImpl: impl, ...extra });

async function rejectsWith(promise, code) {
  await assert.rejects(promise, (err) => err instanceof UpstreamError && err.code === code);
}

test("refuses hosts off the allowlist, plain http and credentials in the URL, without calling out", async () => {
  const { impl, calls } = fakeFetch([]);
  const f = make(impl);
  await rejectsWith(f.getJson("https://evil.example.com/x"), "host_not_allowed");
  await rejectsWith(f.getJson("http://api.example.org/x"), "host_not_allowed");
  await rejectsWith(f.getJson("https://user:pw@api.example.org/x"), "host_not_allowed");
  await rejectsWith(f.getJson("https://169.254.169.254/latest/meta-data"), "host_not_allowed");
  assert.equal(calls.length, 0);
});

test("follows a redirect inside the allowlist and refuses one that leaves it", async () => {
  const ok = fakeFetch([respond(302, "", { location: "/moved" }), respond(200, '{"a":1}')]);
  assert.deepEqual((await make(ok.impl).getJson("https://api.example.org/start")).data, { a: 1 });
  assert.equal(ok.calls[1].url, "https://api.example.org/moved");

  const bad = fakeFetch([respond(302, "", { location: "https://127.0.0.1/admin" })]);
  await rejectsWith(make(bad.impl).getJson("https://api.example.org/start"), "host_not_allowed");
  assert.equal(bad.calls.length, 1);
});

test("stops after three redirects", async () => {
  const loop = () => respond(301, "", { location: "/again" });
  const { impl } = fakeFetch([loop(), loop(), loop(), loop(), loop()]);
  await rejectsWith(make(impl).getJson("https://api.example.org/start"), "upstream_redirect");
});

test("refuses bodies over the size cap, declared or streamed", async () => {
  const declared = fakeFetch([respond(200, "x", { "content-length": "999999" })]);
  await rejectsWith(make(declared.impl, { maxBytes: 100 }).getJson("https://api.example.org/big"), "upstream_too_large");
  const streamed = fakeFetch([respond(200, "y".repeat(500))]);
  await rejectsWith(make(streamed.impl, { maxBytes: 100 }).getJson("https://api.example.org/big"), "upstream_too_large");
});

test("retries a read on 503, honouring Retry-After, then succeeds", async () => {
  const { impl, calls } = fakeFetch([respond(503, "busy", { "retry-after": "0" }), respond(200, "[1]")]);
  assert.deepEqual((await make(impl).getJson("https://api.example.org/x")).data, [1]);
  assert.equal(calls.length, 2);
});

test("never retries a write", async () => {
  const { impl, calls } = fakeFetch([respond(503, "busy", { "retry-after": "0" }), respond(200, "{}")]);
  const res = await make(impl).request("https://api.example.org/x", { method: "POST", body: "{}" });
  assert.equal(res.status, 503);
  assert.equal(calls.length, 1);
});

test("gives up after the retry budget and reports the status, not the body", async () => {
  const secret = "SECRET-BODY-TEXT";
  const { impl, calls } = fakeFetch([respond(503, secret, { "retry-after": "0" }), respond(503, secret, { "retry-after": "0" }), respond(503, secret, { "retry-after": "0" })]);
  await assert.rejects(make(impl).getJson("https://api.example.org/x?api_key=abc123"), (err) => {
    assert.equal(err.code, "upstream_status");
    assert.equal(err.status, 503);
    assert.ok(!err.message.includes(secret));
    assert.ok(!err.message.includes("abc123"));
    return true;
  });
  assert.equal(calls.length, 3);
});

test("a hung upstream becomes upstream_timeout at the deadline", async () => {
  const hang = (_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  const { impl } = fakeFetch([hang]);
  // AbortSignal.timeout's timer does not hold the event loop open (a server's stdio does); hold it here.
  const hold = setTimeout(() => {}, 5_000);
  try {
    await rejectsWith(make(impl, { timeoutMs: 50, retries: 0 }).getJson("https://api.example.org/slow"), "upstream_timeout");
  } finally {
    clearTimeout(hold);
  }
});

test("a connection failure retries, then reports upstream_unreachable", async () => {
  const { impl, calls } = fakeFetch([new TypeError("fetch failed"), new TypeError("fetch failed")]);
  await rejectsWith(make(impl, { retries: 1 }).getJson("https://api.example.org/x"), "upstream_unreachable");
  assert.equal(calls.length, 2);
});

test("non-JSON bodies become upstream_bad_json; allowed statuses return data undefined", async () => {
  const bad = fakeFetch([respond(200, "<html>")]);
  await rejectsWith(make(bad.impl).getJson("https://api.example.org/x"), "upstream_bad_json");
  const nf = fakeFetch([respond(404, "nope")]);
  assert.deepEqual(await make(nf.impl).getJson("https://api.example.org/x", { allowStatus: [404] }), { status: 404, data: undefined });
});

test("definitive not-found answers are cached; retryable failures are not", async () => {
  const cache = new TtlCache({ ttlMs: 60_000 });
  const { impl, calls } = fakeFetch([respond(404, "gone"), respond(503, "busy")]);
  const f = make(impl, { cache, retries: 0 });
  assert.equal((await f.getJson("https://api.example.org/missing", { allowStatus: [404] })).status, 404);
  assert.equal((await f.getJson("https://api.example.org/missing", { allowStatus: [404] })).status, 404);
  assert.equal(calls.length, 1);
  await rejectsWith(f.getJson("https://api.example.org/busy"), "upstream_status");
});

test("successful reads are cached; failures are not", async () => {
  const cache = new TtlCache({ ttlMs: 60_000 });
  const { impl, calls } = fakeFetch([respond(500, "err"), respond(200, '{"v":1}')]);
  const f = make(impl, { cache, retries: 0 });
  await rejectsWith(f.getJson("https://api.example.org/c"), "upstream_status");
  assert.deepEqual((await f.getJson("https://api.example.org/c")).data, { v: 1 });
  assert.deepEqual((await f.getJson("https://api.example.org/c")).data, { v: 1 });
  assert.equal(calls.length, 2);
});

test("sends the User-Agent on every request", async () => {
  const { impl, calls } = fakeFetch([respond(200, "{}")]);
  await make(impl).getJson("https://api.example.org/x");
  assert.equal(calls[0].init.headers["User-Agent"], UA);
});

test("TtlCache expires entries and evicts the least recently used", () => {
  let now = 0;
  const c = new TtlCache({ ttlMs: 10, maxEntries: 2, now: () => now });
  c.set("a", 1);
  c.set("b", 2);
  c.get("a");
  c.set("c", 3);
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("a"), 1);
  now = 11;
  assert.equal(c.get("a"), undefined);
});

test("identical reads in flight share one upstream call; writes never do", async () => {
  let calls = 0;
  const slow = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return respond(200, '{"n":1}');
  };
  const f = make(slow);
  const results = await Promise.all([f.getJson("https://api.example.org/same"), f.getJson("https://api.example.org/same"), f.getJson("https://api.example.org/same")]);
  assert.equal(calls, 1);
  assert.deepEqual(results.map((r) => r.data), [{ n: 1 }, { n: 1 }, { n: 1 }]);
  await Promise.all([f.request("https://api.example.org/w", { method: "POST", body: "{}" }), f.request("https://api.example.org/w", { method: "POST", body: "{}" })]);
  assert.equal(calls, 3);
  await f.getJson("https://api.example.org/same");
  assert.equal(calls, 4, "once settled, the next read goes out again (or to the cache)");
});

test("rate limits: requests to a limited path are spaced and capped in flight; others are not", async () => {
  let active = 0;
  let peak = 0;
  const starts = [];
  const impl = async (url) => {
    starts.push({ path: new URL(url).pathname, t: Date.now() });
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 30));
    active--;
    return respond(200, "{}");
  };
  const f = make(impl, { limits: [{ host: "api.example.org", path: /^\/slow/, perSecond: 20, concurrency: 1 }] });
  await Promise.all([1, 2, 3, 4].map((i) => f.getJson(`https://api.example.org/slow/${i}`)));
  assert.equal(peak, 1, "at most one in flight");
  const slow = starts.map((s) => s.t);
  for (let i = 1; i < slow.length; i++) assert.ok(slow[i] - slow[i - 1] >= 45, "spaced at least 1/20 s apart");
  peak = 0;
  await Promise.all([1, 2, 3].map((i) => f.getJson(`https://api.example.org/fast/${i}`)));
  assert.equal(peak, 3, "unlimited paths run in parallel");
});

test("createLimiter shares concurrency across rules in one group", async () => {
  const acquire = createLimiter([{ host: "h.org", path: /^\/a/, group: "g", concurrency: 1 }, { host: "h.org", group: "g", concurrency: 1 }]);
  const r1 = await acquire(new URL("https://h.org/a"));
  let second = false;
  const p = acquire(new URL("https://h.org/b")).then((r) => ((second = true), r));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(second, false, "the second rule waits for the first rule's slot");
  r1();
  (await p)();
  assert.equal(second, true);
});

test("a Retry-After beyond the cap is not waited out: the answer comes back at once", async () => {
  const { impl, calls } = fakeFetch([respond(429, "quota", { "retry-after": "3600" }), respond(200, "{}")]);
  const t = Date.now();
  const res = await make(impl).request("https://api.example.org/q");
  assert.equal(res.status, 429);
  assert.equal(calls.length, 1);
  assert.ok(Date.now() - t < 1000);
});

test("a stalled read attempt is abandoned and retried within the deadline", async () => {
  const hang = (_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  const { impl, calls } = fakeFetch([hang, respond(200, '{"ok":true}')]);
  const hold = setTimeout(() => {}, 5_000);
  try {
    const t = Date.now();
    const res = await make(impl, { timeoutMs: 2_000, attemptTimeoutMs: 100 }).getJson("https://api.example.org/x");
    assert.deepEqual(res.data, { ok: true });
    assert.equal(calls.length, 2);
    assert.ok(Date.now() - t < 1_500, "well before the overall deadline");
  } finally {
    clearTimeout(hold);
  }
});
