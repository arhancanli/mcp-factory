// src/data.mjs
//
// Where each answer comes from, and how it is kept.
//   per-RFC metadata   www.rfc-editor.org/rfc/rfcN.json (about 1 KB): status, relations, abstract
//   RFC text           www.rfc-editor.org/rfc/rfcN.txt, parsed into sections
//   RFC index          www.rfc-editor.org/rfc-index.xml (13.7 MB, 2.3 MB compressed): search,
//                      BCP/STD/FYI series and draft names
//   errata             www.rfc-editor.org/api/v1/errata.json (11.7 MB): every report
//   IANA registries    www.iana.org/assignments/.../*.csv
// Large documents are parsed once and kept as parsed data (not raw text) for hours; concurrent
// first callers share one download.
import { UpstreamError } from "./kit/index.mjs";
import { parseErrata } from "./errata.mjs";
import { parseCsv } from "./iana.mjs";
import { parseRfcIndex, rfcNumber } from "./rfcindex.mjs";
import { parseRfcText } from "./rfctext.mjs";

export const HOSTS = ["www.rfc-editor.org", "www.iana.org"];
const HOUR = 3_600_000;

/** A keyed cache of promises with a lifetime and a size bound; a failed load is not kept. */
export function memo({ ttlMs, max = 64, now = () => Date.now() }) {
  const map = new Map();
  return (key, load) => {
    const hit = map.get(key);
    if (hit && hit.expires > now()) return hit.value;
    const value = load().catch((err) => {
      map.delete(key);
      throw err;
    });
    map.delete(key);
    map.set(key, { value, expires: now() + ttlMs });
    while (map.size > max) map.delete(map.keys().next().value);
    return value;
  };
}

/**
 * @param {{small: object, big: object}} fetchers small: cached kit fetcher for per-RFC metadata;
 *   big: an uncached one for large documents, which are kept here as parsed data instead of text.
 */
export function createStore({ small, big: bigFetcher }) {
  const big = memo({ ttlMs: 12 * HOUR, max: 4 });
  const texts = memo({ ttlMs: 24 * HOUR, max: 12 });
  const registries = memo({ ttlMs: 24 * HOUR, max: 32 });
  const text = async (url, accept) => {
    const res = await bigFetcher.request(url, { accept });
    if (!res.ok) throw new UpstreamError("upstream_status", `${new URL(url).hostname} answered with status ${res.status}.`, { status: res.status });
    return res.text;
  };
  return {
    /** Per-RFC metadata, or null when the number was never issued or does not exist. */
    async meta(n) {
      const { status, data } = await small.getJson(`https://www.rfc-editor.org/rfc/rfc${n}.json`, { allowStatus: [404] });
      return status === 404 ? null : data;
    },
    index: () => big("index", async () => parseRfcIndex(await text("https://www.rfc-editor.org/rfc-index.xml", "application/xml"))),
    errata: () => big("errata", async () => parseErrata(JSON.parse(await text("https://www.rfc-editor.org/api/v1/errata.json", "application/json")))),
    rfcText: (n) =>
      texts(n, async () => {
        const res = await bigFetcher.request(`https://www.rfc-editor.org/rfc/rfc${n}.txt`, { accept: "text/plain" });
        if (res.status === 404) return null;
        if (!res.ok) throw new UpstreamError("upstream_status", `www.rfc-editor.org answered with status ${res.status}.`, { status: res.status });
        return parseRfcText(res.text);
      }),
    /** A registry file's rows, parsed once (the port-number file alone is 1.1 MB). */
    registryRows: (path) =>
      registries(path, async () => {
        const res = await small.request(`https://www.iana.org/assignments/${path}`, { accept: "text/csv" });
        if (!res.ok) throw new UpstreamError("upstream_status", `www.iana.org answered with status ${res.status}.`, { status: res.status });
        return parseCsv(res.text);
      }),
  };
}

export const idNumbers = (list) => (list ?? []).map((id) => rfcNumber(id)).filter((n) => n !== undefined);

/**
 * Follows obsoleted-by links through per-RFC metadata to the documents that replace an RFC today
 * (the ends of every chain), in number order. Each level of the chain is fetched in parallel.
 */
export async function replacements(store, start) {
  const seen = new Set([start.n]);
  const leaves = new Set();
  let frontier = start.obsoletedBy.filter((m) => !seen.has(m));
  while (frontier.length) {
    frontier.forEach((m) => seen.add(m));
    const metas = await Promise.all(frontier.map((m) => store.meta(m)));
    const next = [];
    metas.forEach((meta, i) => {
      const by = idNumbers(meta?.obsoleted_by);
      if (!by.length) leaves.add(frontier[i]);
      else next.push(...by.filter((x) => !seen.has(x)));
    });
    frontier = [...new Set(next)];
  }
  return [...leaves].sort((a, b) => a - b);
}
