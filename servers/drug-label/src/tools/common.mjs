import { compact } from "../kit/index.mjs";
import { labelUrl } from "../spl.mjs";

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

/** How a label is cited in every answer: which label, which version, from when, where to read it. */
export const citeLabel = (label) => compact({ setid: label.setId, title: label.title, labeler: label.labeler, version: label.version, effective: label.effective, type: label.type, url: labelUrl(label.setId) });

export const choiceNote = (choice) =>
  choice.chosen_by === "setid"
    ? undefined
    : compact({
        resolved: choice.resolved && compact({ rxcui: choice.resolved.rxcui, name: choice.resolved.name, corrected_from: choice.resolved.corrected_from }),
        other_labels: choice.other_labels,
        alternatives: choice.alternatives?.map((a) => compact({ setid: a.setid, title: a.title, product: a.brand, manufacturer: a.manufacturer, application: a.application })),
      });
