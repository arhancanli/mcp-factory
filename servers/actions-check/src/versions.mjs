// src/versions.mjs
//
// Ordering versions across ecosystems (npm, PyPI, Go, Maven, crates.io, NuGet): numbers
// numerically, pre-releases (alpha, beta, rc, dev, snapshot...) before the release they lead to,
// post-releases after it. A leading "v" and build metadata are ignored.

const PRE = /^(?:dev|snapshot|a|alpha|b|beta|c|pre|preview|rc|cr|m|milestone|ea)$/i;
const POST = /^(?:post|p|patch|sp|r|rev)$/i;

function parts(v) {
  return String(v)
    .trim()
    .replace(/^v(?=\d)/i, "")
    .replace(/\+.*$/, "") // build metadata never orders versions
    .toLowerCase()
    .match(/\d+|[a-z]+/g) ?? [];
}

// Rank of a word part relative to "the release itself" (0): pre-releases below, post-releases above.
const wordRank = (w) => (PRE.test(w) ? -1 : POST.test(w) ? 1 : ["final", "ga", "release"].includes(w) ? 0 : -1);

export function compareVersions(a, b) {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i];
    const q = y[i];
    if (p === q) continue;
    if (p === undefined) return /^\d/.test(q) ? (Number(q) === 0 ? 0 : -1) : -wordRank(q) || -1;
    if (q === undefined) return /^\d/.test(p) ? (Number(p) === 0 ? 0 : 1) : wordRank(p) || 1;
    const pn = /^\d/.test(p);
    const qn = /^\d/.test(q);
    if (pn && qn) {
      const d = Number(p) - Number(q);
      if (d) return Math.sign(d);
      continue;
    }
    if (pn !== qn) return pn ? 1 : -1; // "1.0.1" > "1.0.rc1": a number outranks a word at the same place
    const d = wordRank(p) - wordRank(q);
    if (d) return Math.sign(d);
    return p < q ? -1 : 1;
  }
  return 0;
}

/** A version string's major number, or undefined. */
export const majorOf = (v) => Number(String(v).replace(/^v/i, "").match(/^\d+/)?.[0]);

/** Whether a version is a pre-release (alpha, beta, rc...). */
export const isPrerelease = (v) => /\d[.-]?(dev|snapshot|a|alpha|b|beta|c|pre|preview|rc|cr|m|milestone|ea)\.?\d*$|-(?!post)[a-z]/i.test(String(v));
