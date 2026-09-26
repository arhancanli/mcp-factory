// The calls the golden tests replay and scripts/perf.mjs times. test/record.mjs runs them against
// RxNorm, DailyMed and openFDA and stores the responses, compressed, in test/fixtures.
export const SCENARIOS = [
  { label: "find_drug: atorvastatin (brand and generic manufacturers ranked)", tool: "find_drug", args: { name: "atorvastatin" }, example: true },
  { label: "find_drug: a misspelled name", tool: "find_drug", args: { name: "atorvastatn" } },
  { label: "label_section: warfarin boxed warning", tool: "label_section", args: { drug: "warfarin", topic: "boxed_warning" } },
  { label: "label_section: Lipitor boxed warning (none)", tool: "label_section", args: { drug: "Lipitor", topic: "boxed_warning" } },
  { label: "search_label: Lipitor and grapefruit", tool: "search_label", args: { drug: "Lipitor", term: "grapefruit" } },
  { label: "label_section: metformin contraindications", tool: "label_section", args: { drug: "metformin", topic: "contraindications" } },
  { label: "recalls_shortages: metformin", tool: "recalls_shortages", args: { drug: "metformin" } },
  { label: "find_drug: a name RxNorm does not know", tool: "find_drug", args: { name: "zzqq-fake-drug" }, expectError: true },
];
