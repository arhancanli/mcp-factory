// The calls the golden tests replay and scripts/perf.mjs times. test/record.mjs runs them live and
// stores the responses, compressed, in test/fixtures.
export const PHONES = ["+44 20 7946 0958", "020 7946 0958", "+1 202-555-0143", "+971 50 123 4567", "+1 800 555 0199", "12345", "+44 20 794"];
export const EMAILS = ["john@gmail.com", "jane@gmial.com", "x@mailinator.com", "info@stripe.com", "bad..dots@example.com", "nobody@thisdomaindoesnotexist-xyz.com", "a@example.com", "sue@yahooo.com", "al@outlook.con"];
export const ADDRESSES = [
  { country: "US", name: "Jane Doe", street: ["1600 Amphitheatre Pkwy"], city: "Mountain View", region: "California", postal_code: "94043" },
  { country: "GB", street: ["10 Downing Street"], city: "London", postal_code: "SW1A 2AA" },
  { country: "US", street: ["1 Main St"], city: "Springfield", region: "Narnia", postal_code: "1234" },
  { country: "AE", street: ["Burj Khalifa"], region: "Dubai" },
  { country: "DE" },
];

export const SCENARIOS = [
  { label: "check_phones: 7 numbers (UK, US, UAE, toll free, fictional, too short)", tool: "check_phones", args: { numbers: PHONES, country: "GB" }, example: true },
  { label: "check_emails: 9 addresses (typos, disposable, role, null MX, no domain)", tool: "check_emails", args: { emails: EMAILS } },
  { label: "check_addresses: 5 addresses (US, UK, bad state and ZIP, UAE, rules only)", tool: "check_addresses", args: { addresses: ADDRESSES } },
];
