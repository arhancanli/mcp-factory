// src/licenses.mjs
//
// License data, loaded once and kept for a day:
//   SPDX License List  identifiers, names, OSI approval, FSF libre status, deprecated ids
//   OSADL checklists   the compatibility matrix with a reason for every pair, copyleft
//                      classification and source-disclosure duty (CC BY 4.0, "A project by the Open
//                      Source Automation Development Lab (OSADL) eG")
// OSADL's matrix answers one question: may software under the subordinate license (what you
// include) be distributed as part of a work under the leading license (your project)? Yes, No, or
// "Check dependency" (it depends on how the parts are combined, for example linking).
import { ToolError } from "./kit/index.mjs";

const SPDX = "https://raw.githubusercontent.com/spdx/license-list-data/main/json/licenses.json";
const EXCEPTIONS = "https://raw.githubusercontent.com/spdx/license-list-data/main/json/exceptions.json";
const OSADL = "https://www.osadl.org/fileadmin/checklists";
const DAY = 86_400_000;

async function once(ctx, key, load) {
  ctx.data ??= new Map();
  const hit = ctx.data.get(key);
  if (hit && Date.now() - hit.at < DAY) return hit.value;
  const pending = hit?.pending ?? load();
  ctx.data.set(key, { ...(hit ?? {}), pending });
  try {
    const value = await pending;
    ctx.data.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    ctx.data.delete(key);
    throw err;
  }
}

const fold = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9.+]+/g, "");

// How people write licenses, to SPDX ids. The SPDX names themselves are matched too.
const ALIASES = {
  "mit": "MIT", "mitlicense": "MIT", "expat": "MIT", "apache": "Apache-2.0", "apache2": "Apache-2.0", "apache20": "Apache-2.0", "apachelicense2.0": "Apache-2.0", "apachelicense20": "Apache-2.0", "apache-2": "Apache-2.0",
  "gpl": "GPL-3.0-or-later", "gpl2": "GPL-2.0-only", "gplv2": "GPL-2.0-only", "gpl2+": "GPL-2.0-or-later", "gplv2+": "GPL-2.0-or-later", "gpl3": "GPL-3.0-only", "gplv3": "GPL-3.0-only", "gpl3+": "GPL-3.0-or-later", "gplv3+": "GPL-3.0-or-later",
  "lgpl": "LGPL-3.0-or-later", "lgpl2.1": "LGPL-2.1-only", "lgplv2.1": "LGPL-2.1-only", "lgpl3": "LGPL-3.0-only", "lgplv3": "LGPL-3.0-only", "agpl": "AGPL-3.0-or-later", "agpl3": "AGPL-3.0-only", "agplv3": "AGPL-3.0-only",
  "bsd": "BSD-3-Clause", "bsd3": "BSD-3-Clause", "bsd3clause": "BSD-3-Clause", "newbsd": "BSD-3-Clause", "revisedbsd": "BSD-3-Clause", "modifiedbsd": "BSD-3-Clause", "bsd2": "BSD-2-Clause", "bsd2clause": "BSD-2-Clause", "simplifiedbsd": "BSD-2-Clause", "freebsd": "BSD-2-Clause",
  "mpl": "MPL-2.0", "mpl2": "MPL-2.0", "mpl2.0": "MPL-2.0", "epl": "EPL-2.0", "epl2": "EPL-2.0", "cddl": "CDDL-1.0", "isc": "ISC", "zlib": "Zlib", "unlicense": "Unlicense", "wtfpl": "WTFPL", "cc0": "CC0-1.0", "cc01.0": "CC0-1.0", "publicdomain": "CC0-1.0",
  "ccby4": "CC-BY-4.0", "ccby4.0": "CC-BY-4.0", "ccbysa4": "CC-BY-SA-4.0", "psf": "PSF-2.0", "python": "Python-2.0", "sspl": "SSPL-1.0", "bsl": "BUSL-1.1", "busl": "BUSL-1.1", "businesssourcelicense": "BUSL-1.1", "elastic": "Elastic-2.0", "elasticlicense2.0": "Elastic-2.0",
};
// Deprecated SPDX ids and their current forms ("GPL-2.0" meant GPL-2.0-only).
const DEPRECATED = { "GPL-1.0": "GPL-1.0-only", "GPL-1.0+": "GPL-1.0-or-later", "GPL-2.0": "GPL-2.0-only", "GPL-2.0+": "GPL-2.0-or-later", "GPL-3.0": "GPL-3.0-only", "GPL-3.0+": "GPL-3.0-or-later", "LGPL-2.0": "LGPL-2.0-only", "LGPL-2.0+": "LGPL-2.0-or-later", "LGPL-2.1": "LGPL-2.1-only", "LGPL-2.1+": "LGPL-2.1-or-later", "LGPL-3.0": "LGPL-3.0-only", "LGPL-3.0+": "LGPL-3.0-or-later", "AGPL-1.0": "AGPL-1.0-only", "AGPL-3.0": "AGPL-3.0-only", "GFDL-1.3": "GFDL-1.3-only" };

export async function spdx(ctx) {
  return once(ctx, "spdx", async () => {
    const [{ data: lic }, { data: exc }] = await Promise.all([ctx.fetcher.getJson(SPDX), ctx.fetcher.getJson(EXCEPTIONS)]);
    const byId = new Map(lic.licenses.map((l) => [l.licenseId, l]));
    const byFold = new Map();
    for (const l of lic.licenses) {
      byFold.set(fold(l.licenseId), l.licenseId);
      if (!byFold.has(fold(l.name))) byFold.set(fold(l.name), l.licenseId);
    }
    for (const [k, v] of Object.entries(ALIASES)) if (byId.has(v)) byFold.set(fold(k), v);
    const exceptions = new Map(exc.exceptions.map((e) => [e.licenseExceptionId.toLowerCase(), e]));
    return { byId, byFold, exceptions, version: lic.licenseListVersion };
  });
}

export async function osadl(ctx) {
  return once(ctx, "osadl", async () => {
    const [{ data: m }, { data: c }, { data: d }] = await Promise.all([ctx.fetcher.getJson(`${OSADL}/matrixseqexpl.json`), ctx.fetcher.getJson(`${OSADL}/copyleft.json`), ctx.fetcher.getJson(`${OSADL}/sourcedisclosure.json`)]);
    const pairs = new Map();
    for (const lead of m.licenses ?? []) for (const sub of lead.compatibilities ?? []) pairs.set(`${lead.name}|${sub.name}`, { verdict: sub.compatibility, why: sub.explanation });
    const table = (x, key) => x[key] ?? Object.fromEntries(Object.entries(x).filter(([, v]) => typeof v === "string"));
    return { pairs, known: new Set((m.licenses ?? []).map((l) => l.name)), copyleft: table(c, "copyleft"), disclosure: table(d, "sourcedisclosure"), timestamp: m.timestamp };
  });
}

/** An SPDX id for a license however it is written; undefined when it is not recognised. */
export function resolveId(data, raw) {
  const text = String(raw ?? "").trim();
  if (data.byId.has(text)) return DEPRECATED[text] && data.byId.has(DEPRECATED[text]) ? DEPRECATED[text] : text;
  if (DEPRECATED[text]) return DEPRECATED[text];
  const f = fold(text.replace(/^the\s+/i, "").replace(/\s+licen[cs]e$/i, ""));
  const hit = data.byFold.get(f) ?? data.byFold.get(fold(text));
  if (hit) return DEPRECATED[hit] ?? hit;
  // "GPL-2.0+" style: an old-style or-later suffix.
  if (/\+$/.test(text)) {
    const base = resolveId(data, text.slice(0, -1));
    const later = base?.replace(/-only$/, "-or-later");
    if (later && data.byId.has(later)) return later;
  }
  return undefined;
}

/**
 * An SPDX license expression as a tree: {license, exception?} | {and: [...]} | {or: [...]}.
 * AND binds tighter than OR; WITH attaches an exception; ids are resolved leniently.
 */
export function parseExpression(data, raw) {
  const tokens = String(raw).replace(/[()]/g, " $& ").trim().split(/\s+/).filter(Boolean);
  let i = 0;
  const unknown = [];
  const peek = () => tokens[i];
  const atom = () => {
    if (peek() === "(") {
      i++;
      const e = orExpr();
      if (tokens[i] === ")") i++;
      return e;
    }
    // A license name can run over several words ("Apache License 2.0") until an operator.
    const words = [];
    while (i < tokens.length && !/^(AND|OR|WITH|\(|\))$/i.test(tokens[i])) words.push(tokens[i++]);
    const text = words.join(" ");
    const id = resolveId(data, text);
    if (!id) unknown.push(text);
    const node = { license: id ?? text, known: Boolean(id) };
    if (/^WITH$/i.test(peek() ?? "")) {
      i++;
      const ex = tokens[i++] ?? "";
      node.exception = data.exceptions.get(ex.toLowerCase())?.licenseExceptionId ?? ex;
    }
    return node;
  };
  const andExpr = () => {
    const parts = [atom()];
    while (/^AND$/i.test(peek() ?? "")) {
      i++;
      parts.push(atom());
    }
    return parts.length === 1 ? parts[0] : { and: parts };
  };
  const orExpr = () => {
    const parts = [andExpr()];
    while (/^OR$/i.test(peek() ?? "")) {
      i++;
      parts.push(andExpr());
    }
    return parts.length === 1 ? parts[0] : { or: parts };
  };
  if (!tokens.length) throw new ToolError("bad_license", "Give a license: an SPDX id (MIT), a name (Apache License 2.0) or an expression (MIT OR Apache-2.0).");
  return { tree: orExpr(), unknown };
}

export const expressionText = (t) => (t.license ? `${t.license}${t.exception ? ` WITH ${t.exception}` : ""}` : `(${(t.and ?? t.or).map(expressionText).join(t.and ? " AND " : " OR ")})`);
