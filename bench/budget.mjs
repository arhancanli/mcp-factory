// Standard text/tool requests only. A reservation covers the published full context,
// highest cache-write rate, bounded output and 20% margin, then refunds verified usage.
import { readFileSync } from "node:fs";
import { hash } from "../kit/release.mjs";

export const BUDGET_RUNNER_SHA256 = hash(readFileSync(new URL(import.meta.url)));
export const PRICE_PROFILE = Object.freeze({
  provider: "anthropic", model: "claude-opus-4-8", currency: "USD",
  checked_at: "2026-10-14", valid_until: "2026-10-21T00:00:00Z",
  source: "https://platform.claude.com/docs/en/models/opus-4-8/overview",
  context_token_ceiling: 1_048_576, max_output_tokens: 4000,
  input_usd_per_million: 5, output_usd_per_million: 25,
  cache_write_ceiling_usd_per_million: 10, cache_read_usd_per_million: 0.5,
  margin_numerator: 6, margin_denominator: 5,
});

export class BudgetError extends Error {}
export class BudgetExhaustedError extends BudgetError {}
export class BudgetAccountingError extends BudgetError {}

export function parseUsd(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,4})(?:\.\d{1,6})?$/.test(value)) {
    throw new BudgetError("Budget must be a decimal USD amount with at most six decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  const micros = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
  if (micros < 1 || micros > 10_000 * 1_000_000) throw new BudgetError("Use a positive budget up to USD 10000.");
  return micros;
}

const margin = (micros) => Math.ceil(micros * PRICE_PROFILE.margin_numerator / PRICE_PROFILE.margin_denominator);
export const REQUEST_RESERVATION_MICRO_USD = margin(
  PRICE_PROFILE.context_token_ceiling * PRICE_PROFILE.cache_write_ceiling_usd_per_million
  + PRICE_PROFILE.max_output_tokens * PRICE_PROFILE.output_usd_per_million,
);
const tokens = (value, optional = false) => {
  if (optional && value == null) return 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new BudgetAccountingError("Response usage is missing or invalid; retain the full request reservation.");
  return value;
};

export function usageCeilingMicroUsd(response) {
  if (response?.model !== PRICE_PROFILE.model || !response.usage) {
    throw new BudgetAccountingError("Response model/usage differs from the priced request; retain its reservation.");
  }
  const usage = response.usage;
  const input = tokens(usage.input_tokens);
  const output = tokens(usage.output_tokens);
  const write = tokens(usage.cache_creation_input_tokens, true);
  const read = tokens(usage.cache_read_input_tokens, true);
  if (input + read + write > PRICE_PROFILE.context_token_ceiling || output > PRICE_PROFILE.max_output_tokens) {
    throw new BudgetAccountingError("Response exceeds the published request limits; retain its reservation.");
  }
  if ((usage.inference_geo != null && usage.inference_geo !== "global") ||
      (usage.service_tier != null && usage.service_tier !== "standard") ||
      Object.values(usage.server_tool_use ?? {}).some((value) => tokens(value) !== 0)) {
    throw new BudgetAccountingError("Response contains an unpriced service; retain its reservation.");
  }
  // Charge every cache write at the highest published (one-hour) rate. This is an
  // accounting ceiling, not an invoice estimate. Round fractional micro-dollars up.
  return margin(input * 5 + output * 25 + write * 10 + Math.ceil(read / 2));
}

export class RequestBudget {
  constructor({ usd, provider, model, record = () => {}, now = Date.now() }) {
    if (provider !== PRICE_PROFILE.provider || model !== PRICE_PROFILE.model) {
      throw new BudgetError("This priced budget profile supports anthropic/claude-opus-4-8 only.");
    }
    if (now < Date.parse(`${PRICE_PROFILE.checked_at}T00:00:00Z`) || now >= Date.parse(PRICE_PROFILE.valid_until)) {
      throw new BudgetError("Refresh the published price profile before using a paid budget.");
    }
    this.limit = parseUsd(usd);
    this.spent = 0;
    this.held = 0;
    this.requests = 0;
    this.pending = new Map();
    this.record = record;
    if (this.limit < REQUEST_RESERVATION_MICRO_USD) {
      throw new BudgetExhaustedError(`A request requires USD ${REQUEST_RESERVATION_MICRO_USD / 1_000_000} of available allowance.`);
    }
  }
  reserve(metadata) {
    const amount = REQUEST_RESERVATION_MICRO_USD;
    if (this.limit - this.spent - this.held < amount) {
      throw new BudgetExhaustedError("The remaining allowance cannot cover another complete request; stop before calling the API.");
    }
    const id = this.requests + 1;
    // Persist before issuing the request. If this write fails, no API call follows.
    this.record({ event: "request_reserved", request: id, micro_usd: amount, ...metadata });
    this.requests = id;
    this.held += amount;
    this.pending.set(id, amount);
    return id;
  }
  settle(id, response) {
    const reservation = this.pending.get(id);
    if (reservation === undefined) throw new BudgetAccountingError("No pending request reservation.");
    const amount = usageCeilingMicroUsd(response);
    if (amount > reservation) throw new BudgetAccountingError("Usage exceeds its reservation; stop the run.");
    this.record({ event: "request_settled", request: id, micro_usd: amount, model: response.model,
      message_id: response.id ?? null, stop_reason: response.stop_reason ?? null, usage: response.usage });
    this.spent += amount;
    this.held -= reservation;
    this.pending.delete(id);
    return amount;
  }
  snapshot() {
    return { schema: "canlilabs.request-budget.v1", profile: PRICE_PROFILE,
      limit_micro_usd: this.limit, verified_usage_ceiling_micro_usd: this.spent,
      unresolved_reservations_micro_usd: this.held, remaining_micro_usd: this.limit - this.spent - this.held,
      request_reservation_micro_usd: REQUEST_RESERVATION_MICRO_USD, requests: this.requests };
  }
}

export function assertBudgetUnchanged() {
  if (hash(readFileSync(new URL(import.meta.url))) !== BUDGET_RUNNER_SHA256) throw new BudgetError("Budget runner changed during execution.");
}

export function budgetClientOptions() {
  if (process.env.ANTHROPIC_CUSTOM_HEADERS) throw new BudgetError("Budgeted requests require no SDK environment header overrides.");
  return { baseURL: "https://api.anthropic.com", maxRetries: 0, timeout: 120_000, logLevel: "off" };
}
