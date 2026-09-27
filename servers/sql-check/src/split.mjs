// src/split.mjs
//
// SQL text to statements, each with the offset it starts at (for line and column numbers). A
// semicolon ends a statement only outside quotes ('...', "...", `...`, E'...' with backslashes,
// PostgreSQL's $tag$...$tag$), comments (--, and /* */ which PostgreSQL nests) and bodies that
// contain their own semicolons: SQLite's CREATE TRIGGER ... BEGIN ... END, and PostgreSQL's BEGIN
// ATOMIC ... END.

/** @returns {Array<{text: string, start: number}>} */
export function splitStatements(sql) {
  const s = String(sql);
  const out = [];
  let start = 0;
  let i = 0;
  let depth = 0; // BEGIN ... END nesting inside a trigger or BEGIN ATOMIC body
  let body = false;
  const push = (end) => {
    const raw = s.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text && !/^(--[^\n]*\n?|\/\*[\s\S]*?\*\/|\s)*$/.test(text)) out.push({ text, start: start + lead });
    start = end + 1;
  };
  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];
    if (c === "-" && next === "-") {
      const nl = s.indexOf("\n", i);
      i = nl < 0 ? s.length : nl + 1;
      continue;
    }
    if (c === "/" && next === "*") {
      let d = 1;
      i += 2;
      while (i < s.length && d > 0) {
        if (s[i] === "/" && s[i + 1] === "*") {
          d++;
          i += 2;
        } else if (s[i] === "*" && s[i + 1] === "/") {
          d--;
          i += 2;
        } else i++;
      }
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const backslash = c === "'" && /[eE]$/.test(s.slice(Math.max(0, i - 1), i)) && !/\w/.test(s[i - 2] ?? "");
      i++;
      while (i < s.length) {
        if (backslash && s[i] === "\\") {
          i += 2;
          continue;
        }
        if (s[i] === c) {
          if (s[i + 1] === c) {
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      i++;
      continue;
    }
    if (c === "$") {
      const tag = s.slice(i).match(/^\$([A-Za-z_][\w]*)?\$/);
      if (tag && !/[\w$]/.test(s[i - 1] ?? "")) {
        const end = s.indexOf(tag[0], i + tag[0].length);
        i = end < 0 ? s.length : end + tag[0].length;
        continue;
      }
    }
    if (/[A-Za-z]/.test(c) && !/[\w$]/.test(s[i - 1] ?? "")) {
      const word = s.slice(i).match(/^[A-Za-z_]+/)[0].toUpperCase();
      const stmt = s.slice(start, i).trim().toUpperCase();
      if (word === "BEGIN" && (body || /^CREATE\s+(TEMP\s+|TEMPORARY\s+)?TRIGGER\b/.test(stmt) || /^\s*ATOMIC\b/i.test(s.slice(i + 5)))) {
        body = true;
        depth++;
      } else if (word === "CASE" && body) depth++;
      else if (word === "END" && body && depth > 0) {
        depth--;
        if (depth === 0) body = false;
      }
      i += word.length;
      continue;
    }
    if (c === ";" && depth === 0) push(i);
    i++;
  }
  push(s.length);
  return out;
}

/** Line and column (1-based) of an offset in a text. */
export function lineColumn(text, offset) {
  const before = String(text).slice(0, Math.max(0, offset));
  const line = before.split("\n").length;
  return { line, column: offset - before.lastIndexOf("\n") };
}
