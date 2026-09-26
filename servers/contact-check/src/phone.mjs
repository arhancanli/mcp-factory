// src/phone.mjs
//
// Phone numbers with Google's libphonenumber metadata (libphonenumber-js, "max" set, which knows
// number types): valid for its country or not and why, the type (mobile, fixed line, toll free...),
// and E.164, international and national forms. Offline.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parsePhoneNumberFromString, validatePhoneNumberLength } = require("libphonenumber-js/max");

const TYPES = { MOBILE: "mobile", FIXED_LINE: "fixed_line", FIXED_LINE_OR_MOBILE: "fixed_line_or_mobile", TOLL_FREE: "toll_free", PREMIUM_RATE: "premium_rate", SHARED_COST: "shared_cost", VOIP: "voip", PERSONAL_NUMBER: "personal", PAGER: "pager", UAN: "uan", VOICEMAIL: "voicemail" };
const WHY = { INVALID_COUNTRY: "no country: write it with + and the country code, or pass the country", TOO_SHORT: "too short for its country", TOO_LONG: "too long for its country", NOT_A_NUMBER: "not a phone number", INVALID_LENGTH: "a length no number in its country has" };

export function checkPhone(raw, country) {
  const input = String(raw ?? "").trim();
  const cc = country?.toUpperCase();
  let p;
  try {
    p = parsePhoneNumberFromString(input, cc);
  } catch {
    p = undefined;
  }
  if (!p) return { input, valid: false, reason: WHY[safeLength(input, cc)] ?? "not a phone number" };
  if (!p.isValid()) {
    const len = safeLength(input, cc);
    return { input, valid: false, reason: WHY[len] ?? `not a valid ${p.country ?? `+${p.countryCallingCode}`} number (the digits do not match any range in use there)`, e164: p.isPossible() ? p.number : undefined, country: p.country };
  }
  const national = String(p.nationalNumber);
  // NANP 555-0100..0199 is set aside for fiction; libphonenumber counts it valid.
  const fictional = p.countryCallingCode === "1" && /^\d{3}5550(1\d\d)$/.test(national) ? "a number reserved for fiction (555-0100 to 555-0199)" : undefined;
  return {
    input,
    valid: true,
    e164: p.number,
    international: p.formatInternational(),
    national: p.formatNational(),
    country: p.country,
    calling_code: `+${p.countryCallingCode}`,
    type: TYPES[p.getType()] ?? "unknown",
    ext: p.ext,
    note: fictional,
  };
}

function safeLength(input, cc) {
  try {
    return validatePhoneNumberLength(input, cc);
  } catch {
    return "NOT_A_NUMBER";
  }
}
