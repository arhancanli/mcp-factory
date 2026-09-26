// src/iana.mjs
//
// IANA protocol registries, read from IANA's own CSV exports. Each registry names its key column
// (what a lookup matches exactly, such as a status code or a media type) and the columns worth
// returning. References like "[RFC9110, Section 15.5.5]" are parsed into RFC numbers and sections
// so an agent can go straight to rfc_section.

const MEDIA_TOP = ["application", "audio", "font", "haptics", "image", "message", "model", "multipart", "text", "video"];

export const REGISTRIES = {
  "http-status-codes": { title: "HTTP Status Codes", page: "http-status-codes", files: ["http-status-codes/http-status-codes-1.csv"], key: ["Value"], name: "Description" },
  "http-fields": { title: "HTTP Field Name Registry", page: "http-fields", files: ["http-fields/field-names.csv"], key: ["Field Name"], name: "Field Name" },
  "http-methods": { title: "HTTP Method Registry", page: "http-methods", files: ["http-methods/methods.csv"], key: ["Method Name"], name: "Method Name" },
  "media-types": { title: "Media Types", page: "media-types", files: MEDIA_TOP.map((t) => `media-types/${t}.csv`), key: ["Template", "Name"], name: "Template" },
  "uri-schemes": { title: "Uniform Resource Identifier (URI) Schemes", page: "uri-schemes", files: ["uri-schemes/uri-schemes-1.csv"], key: ["URI Scheme"], name: "Description" },
  "port-numbers": { title: "Service Name and Transport Protocol Port Number Registry", page: "service-names-port-numbers", files: ["service-names-port-numbers/service-names-port-numbers.csv"], key: ["Port Number", "Service Name"], name: "Description" },
  "tls-cipher-suites": { title: "TLS Cipher Suites", page: "tls-parameters", files: ["tls-parameters/tls-parameters-4.csv"], key: ["Description", "Value"], name: "Description" },
  "link-relations": { title: "Link Relation Types", page: "link-relations", files: ["link-relations/link-relations-1.csv"], key: ["Relation Name"], name: "Relation Name" },
  "dns-rr-types": { title: "DNS Resource Record (RR) TYPEs", page: "dns-parameters", files: ["dns-parameters/dns-parameters-4.csv"], key: ["TYPE", "Value"], name: "Meaning" },
};

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^\ufeff/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((f) => f.trim() !== ""));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

/** "[RFC9110, Section 15.5.5]" and "[RFC 6733]" -> [{rfc: 9110, section: "15.5.5"}, {rfc: 6733}]. */
export function parseReferences(ref) {
  const out = [];
  for (const m of String(ref ?? "").matchAll(/\[RFC\s?(\d{1,5})(?:[^\]]*?[Ss]ection\s+([A-Z]?\d*(?:\.\d+)*))?[^\]]*\]/g)) {
    const r = { rfc: Number(m[1]) };
    if (m[2]) r.section = m[2];
    out.push(r);
  }
  return out;
}

const norm = (s) => String(s ?? "").trim().toLowerCase();

/** Rows whose key columns equal the query, else rows mentioning it in any column. */
export function matchRows(rows, reg, query) {
  const q = norm(query);
  const exact = rows.filter((r) => reg.key.some((k) => norm(r[k]) === q));
  if (exact.length) return { exact: true, rows: exact };
  // Ranges such as "0x00,0x3E-0x3F" or port "6000-6063" hold the queried value.
  const inRange = /^\d+$/.test(q)
    ? rows.filter((r) => reg.key.some((k) => {
        const m = String(r[k]).match(/^(\d+)-(\d+)$/);
        return m && Number(q) >= Number(m[1]) && Number(q) <= Number(m[2]);
      }))
    : [];
  if (inRange.length) return { exact: true, rows: inRange };
  return { exact: false, rows: rows.filter((r) => Object.values(r).some((v) => norm(v).includes(q))) };
}

export const registryUrl = (reg) => `https://www.iana.org/assignments/${reg.page}/`;
