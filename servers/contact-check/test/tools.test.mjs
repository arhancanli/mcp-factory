// Golden tests: the three tools over a real MCP client, replaying DNS answers, the disposable list
// and Google's address data as recorded by test/record.mjs. Phone checks are offline.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect } from "./replay.mjs";
import { ADDRESSES, EMAILS, PHONES } from "./scenarios.mjs";

test("check_phones: valid or why not, type, E.164 and national forms; fiction-range numbers noted", async () => {
  const client = await connect();
  const { data } = await call(client, "check_phones", { numbers: PHONES, country: "GB" });
  const [uk, ukNational, fiction, uae, tollFree, short, shortIntl] = data.results;
  assert.deepEqual([uk.e164, uk.type, uk.national], ["+442079460958", "fixed_line", "020 7946 0958"]);
  assert.equal(ukNational.e164, "+442079460958", "national form read with the default country");
  assert.match(fiction.note, /reserved for fiction/);
  assert.deepEqual([uae.country, uae.type], ["AE", "mobile"]);
  assert.equal(tollFree.type, "toll_free");
  assert.deepEqual([short.valid, short.reason], [false, "too short for its country"]);
  assert.equal(shortIntl.valid, false);
  assert.equal(data.valid, 5);
});

test("check_emails: syntax, mail servers, null MX, disposable, role accounts and typos", async () => {
  const client = await connect();
  const { data } = await call(client, "check_emails", { emails: EMAILS });
  const by = Object.fromEntries(data.results.map((r) => [r.input, r]));
  assert.equal(by["john@gmail.com"].valid, true);
  assert.deepEqual([by["jane@gmial.com"].did_you_mean, by["jane@gmial.com"].disposable], ["jane@gmail.com", true], "a swapped pair of letters is one edit");
  assert.equal(by["x@mailinator.com"].disposable, true);
  assert.equal(by["info@stripe.com"].role_account, true);
  assert.match(by["bad..dots@example.com"].reason, /two in a row/);
  assert.match(by["nobody@thisdomaindoesnotexist-xyz.com"].reason, /does not exist in DNS/);
  assert.match(by["a@example.com"].reason, /null MX/);
  assert.equal(by["al@outlook.con"].did_you_mean, "al@outlook.com");
  assert.equal(by["sue@yahooo.com"].did_you_mean, "sue@yahoo.com");
});

test("check_addresses: required fields, postcode pattern, regions by name, the country's own format", async () => {
  const client = await connect();
  const { data } = await call(client, "check_addresses", { addresses: ADDRESSES });
  const [us, uk, bad, uae, de] = data.results;
  assert.equal(us.label, "Jane Doe\n1600 Amphitheatre Pkwy\nMOUNTAIN VIEW, CA 94043\nUNITED STATES");
  assert.equal(uk.label, "10 Downing Street\nLONDON\nSW1A 2AA\nUNITED KINGDOM", "the UK writes the postcode on its own line");
  assert.deepEqual(bad.problems, ['"Narnia" is not a state of United States', "1234 is not a valid zip code for United States (like 95014)"]);
  assert.equal(uae.region, "Dubai (إمارة دبيّ)", "matched by its Latin name");
  assert.equal(uae.valid, true);
  assert.deepEqual(de.required, ["street", "city", "postal_code"]);
});
