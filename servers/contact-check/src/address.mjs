// src/address.mjs
//
// Postal addresses against each country's rules from Google's address metadata (libaddressinput,
// the data behind Chrome and Android address forms; Apache 2.0): which fields are required, the
// postcode pattern, the regions (states, provinces) and their codes, and how the country writes an
// address on an envelope.
import { ToolError } from "./kit/index.mjs";

const DATA = "https://www.gstatic.com/chrome/autofill/libaddressinput/chromium-i18n/ssl-address/data";
const DISPLAY = new Intl.DisplayNames(["en"], { type: "region" });
const FIELD_NAMES = { N: "name", O: "organization", A: "street", D: "district", C: "city", S: "region", Z: "postal_code", X: "sorting_code" };

export async function countryRules(ctx, country) {
  const cc = String(country ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) throw new ToolError("bad_country", `"${country}" is not a two-letter country code (US, GB, DE, AE...).`);
  const { status, data } = await ctx.fetcher.getJson(`${DATA}/${cc}`, { allowStatus: [404] });
  if (status === 404 || !data || !data.key) throw new ToolError("unknown_country", `No address rules for ${cc}.`);
  const split = (s) => (s ? String(s).split("~") : []);
  // Latin names (sub_lnames) where the local ones are in another script (the UAE's are Arabic).
  const latin = split(data.sub_lnames);
  const regions = split(data.sub_keys).map((key, i) => ({ key, name: latin[i] ?? split(data.sub_names)[i] ?? key, local: latin[i] ? (split(data.sub_names)[i] ?? key) : undefined, iso: split(data.sub_isoids)[i] }));
  return {
    country: cc,
    name: DISPLAY.of(cc) ?? data.name,
    postalName: data.name,
    format: data.fmt ?? "%N%n%O%n%A%n%C",
    require: [...(data.require ?? "AC")].map((c) => FIELD_NAMES[c]).filter(Boolean),
    upper: [...(data.upper ?? "C")].map((c) => FIELD_NAMES[c]).filter(Boolean),
    zip: data.zip ? new RegExp(`^(?:${data.zip})$`, "i") : undefined,
    zipExample: data.zipex?.split(",")[0],
    zipName: data.zip_name_type ?? "postal",
    regionName: data.state_name_type ?? "province",
    regions,
  };
}

/** The region an input names: by code, name or ISO code, case-insensitively. */
export function findRegion(rules, raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return undefined;
  return rules.regions.find((r) => [r.key, r.name, r.local, r.iso, r.iso && `${rules.country}-${r.iso}`].some((x) => x && x.toLowerCase() === v));
}

/** Checks one address and writes it the country's way. */
export function checkAddress(rules, a) {
  const problems = [];
  const values = { name: a.name, organization: a.organization, street: (a.street ?? []).filter(Boolean).join("\n"), city: a.city, region: a.region, postal_code: a.postal_code?.trim() };
  for (const f of rules.require) if (!values[f]?.trim()) problems.push(`${f === "region" ? rules.regionName : f === "postal_code" ? `${rules.zipName} code` : f} is required in ${rules.name}`);
  let region;
  if (a.region && rules.regions.length) {
    region = findRegion(rules, a.region);
    if (!region) problems.push(`"${a.region}" is not a ${rules.regionName} of ${rules.name}`);
  }
  if (values.postal_code && rules.zip && !rules.zip.test(values.postal_code)) problems.push(`${values.postal_code} is not a valid ${rules.zipName} code for ${rules.name}${rules.zipExample ? ` (like ${rules.zipExample})` : ""}`);
  const shown = { ...values, region: region ? region.key : values.region, country: rules.name };
  for (const f of rules.upper) if (shown[f]) shown[f] = shown[f].toUpperCase();
  const label = rules.format
    .replace(/%([NOADCSZX])/g, (_, c) => shown[FIELD_NAMES[c]] ?? "")
    .split("%n")
    .map((l) => l.replace(/\s+/g, " ").replace(/^[\s,]+|[\s,]+$/g, ""))
    .filter(Boolean);
  // International mail ends with the country, in capitals.
  label.push(rules.postalName.toUpperCase());
  return { valid: problems.length === 0, problems, region: region ? `${region.name}${region.key !== region.name ? ` (${region.key})` : ""}` : undefined, label: label.join("\n") };
}
