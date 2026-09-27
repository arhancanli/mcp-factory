import { z } from "zod";
import { clip, compact, defineTool, ToolError } from "../kit/index.mjs";
import { schemaFor } from "../catalog.mjs";
import { compiled } from "../load.mjs";
import { nearest } from "../explain.mjs";
import { allowedValues, anyChildNodes, childNodes, deprecation, describe, expand, objectShape, refChain, rootNodes, typesOf } from "../navigate.mjs";
import { READ_ONLY } from "./shared.mjs";

/** "jobs.*.steps[].uses", 'services["my.app"].ports', "/compilerOptions/module" as segments. */
export function parseSetting(text) {
  const t = String(text ?? "").trim();
  if (!t || t === "." || t === "/") return [];
  if (t.startsWith("/")) return t.slice(1).split("/").map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  const segs = [];
  const re = /\[(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\d+|\*|))\]|([^.[\]]+)/g;
  let m;
  while ((m = re.exec(t))) {
    if (m[4] !== undefined) segs.push(m[4].trim());
    else if (m[1] !== undefined) segs.push(JSON.parse(`"${m[1]}"`));
    else if (m[2] !== undefined) segs.push(m[2]);
    else segs.push(m[3] === "" || m[3] === "*" ? "[]" : m[3]);
  }
  return segs;
}

export function showSetting(segs) {
  if (!segs.length) return "(top level)";
  let out = "";
  for (const s of segs) {
    if (s === "[]" || /^\d+$/.test(s)) out += `[${s === "[]" ? "" : s}]`;
    else if (s === "*" || /^[A-Za-z_$][\w$-]*$/.test(s)) out += out ? `.${s}` : s;
    else out += `[${JSON.stringify(s)}]`;
  }
  return out;
}

const sentence = (d, max) => {
  const plain = String(d)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const m = plain.match(/^.+?[.!?](?=\s|$)/);
  return clip(m ? m[0] : plain, max);
};

function step(tree, nodes, seg) {
  if (seg === "*") return anyChildNodes(tree, nodes);
  if (seg === "[]") return childNodes(tree, nodes, "0");
  return childNodes(tree, nodes, seg);
}

function settingInfo(tree, nodes, segs) {
  const shape = objectShape(nodes);
  const keys = [...shape.known.keys()];
  const first = (k) => nodes.map(({ s }) => s[k]).find((v) => v !== undefined);
  const required = [...new Set(nodes.flatMap(({ s }) => (Array.isArray(s.required) ? s.required : [])))];
  const allowed = allowedValues(nodes);
  const settings = keys.length <= 40 ? keys.map((k) => compact({ name: k, about: describe(expand(tree, shape.known.get(k))) && sentence(describe(expand(tree, shape.known.get(k))), 110) })) : keys.slice(0, 250);
  return compact({
    setting: showSetting(segs),
    description: describe(nodes) && clip(describe(nodes).replace(/\s+\n/g, "\n"), 700),
    type: typesOf(nodes),
    allowed: allowed.length > 80 ? [...allowed.slice(0, 80), `...${allowed.length - 80} more`] : allowed,
    default: first("default"),
    examples: Array.isArray(first("examples")) ? first("examples").slice(0, 3) : undefined,
    pattern: first("pattern"),
    deprecated: nodes.length ? deprecation(refChain(tree, nodes[0])) && sentence(deprecation(refChain(tree, nodes[0])), 200) : undefined,
    required,
    settings,
    setting_count: keys.length > 40 ? keys.length : undefined,
    other_keys: shape.patterns.length || shape.openDeclared ? "allowed" : shape.closed ? "not allowed" : undefined,
  });
}

function search(tree, query, limit = 15) {
  const words = String(query)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
  if (!words.length) throw new ToolError("bad_search", "search needs at least one word of two or more letters.");
  const hits = [];
  const seen = new Set();
  let queue = [{ nodes: rootNodes(tree), segs: [] }];
  for (let depth = 0; depth < 7 && queue.length; depth++) {
    const next = [];
    for (const { nodes, segs } of queue) {
      for (const n of nodes) {
        for (const [k, v] of Object.entries(n.s.properties ?? {})) {
          if (!v || typeof v !== "object" || seen.has(v)) continue;
          seen.add(v);
          const child = expand(tree, { s: v, doc: n.doc });
          const desc = describe(child) ?? "";
          const name = k.toLowerCase();
          const text = `${name} ${desc.toLowerCase()}`;
          if (words.every((w) => text.includes(w))) hits.push({ segs: [...segs, k], score: words.filter((w) => name.includes(w)).length * 3 + words.length, desc });
          next.push({ nodes: child, segs: [...segs, k] });
        }
        const wild = anyChildNodes(tree, [n]).filter((x) => !seen.has(x.s));
        for (const x of wild) seen.add(x.s);
        if (wild.length) next.push({ nodes: wild, segs: [...segs, Array.isArray(n.s.items) || n.s.items ? "[]" : "*"] });
      }
    }
    queue = next.slice(0, 4000);
  }
  hits.sort((a, b) => b.score - a.score || a.segs.length - b.segs.length);
  return hits.slice(0, limit).map((h) => compact({ setting: showSetting(h.segs), about: h.desc && sentence(h.desc, 140) }));
}

export const configHelp = defineTool({
  name: "config_help",
  title: "What does this config setting do?",
  description: "What a setting in a config file means and accepts, from its official schema: description, type, allowed values, default, deprecation and its sub-settings. setting is a dotted path (compilerOptions.module, jobs.*.runs-on, services.*.healthcheck); omit it for the top level. search finds settings by words instead (search: 'healthcheck interval').",
  input: {
    schema: z.string().min(1).max(300).describe("schema name, file name (tsconfig.json, .github/workflows/ci.yml) or schema URL"),
    setting: z.string().max(300).optional(),
    search: z.string().max(100).optional(),
  },
  output: { schema: z.string(), schema_url: z.string() },
  annotations: READ_ONLY,
  handler: async ({ schema, setting, search: query }, ctx) => {
    const entry = await schemaFor(ctx, schema);
    const tree = await compiled(ctx, entry.url);
    const head = { schema: entry.name, schema_url: entry.url };
    if (query) return { ...head, matches: search(tree, query) };
    const segs = parseSetting(setting);
    let nodes = rootNodes(tree);
    for (let i = 0; i < segs.length; i++) {
      const next = step(tree, nodes, segs[i]);
      if (!next.length) {
        const guess = nearest(segs[i], [...objectShape(nodes).known.keys()]);
        throw new ToolError("unknown_setting", `${showSetting(segs.slice(0, i + 1))} is not in the ${entry.name} schema.${guess ? ` Did you mean ${showSetting([...segs.slice(0, i), guess])}?` : ` Use search to find it, or ask for ${showSetting(segs.slice(0, i))} to list what is there.`}`);
      }
      nodes = next;
    }
    return { ...head, ...settingInfo(tree, nodes, segs) };
  },
});
