import { z } from "zod";
import { clip, compact, defineTool } from "../kit/index.mjs";
import { chooseLabel } from "../drugs.mjs";
import { headingOf, sectionsWithin, TOPIC_NAMES, topicSections } from "../spl.mjs";
import { choiceNote, citeLabel, READ_ONLY } from "./common.mjs";

export const MAX_CHARS = 12_000;

export const labelSection = defineTool({
  name: "label_section",
  title: "Read an FDA label section",
  description: "Returns one topic of the official FDA label as the label's own text under its headings, citing the label's set id, version and date. Says so when the label has no such section.",
  input: {
    drug: z.string().min(2).max(200).optional().describe("Drug name, NDC or label setid"),
    setid: z.string().min(36).max(36).optional().describe("A specific DailyMed label"),
    topic: z.enum(TOPIC_NAMES),
  },
  output: { label: z.looseObject({ setid: z.string() }), topic: z.string(), found: z.boolean(), sections: z.array(z.looseObject({ heading: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ drug, setid, topic }, ctx) => {
    const choice = await chooseLabel(ctx, { drug, setid });
    const { label } = choice;
    const sections = sectionsWithin(label, topicSections(label, topic)).map((n) => ({ heading: headingOf(label, n), text: n.blocks.join("\n") }));
    let used = 0;
    const kept = [];
    for (const s of sections) {
      if (used >= MAX_CHARS) break;
      const text = clip(s.text, MAX_CHARS - used);
      used += text.length;
      kept.push({ heading: s.heading, text });
    }
    // sections stays in the result even when empty: "this label has none" is an answer.
    return {
      label: citeLabel(label),
      topic,
      found: sections.length > 0,
      sections: kept,
      ...compact({
        omitted_sections: sections.length > kept.length ? sections.length - kept.length : undefined,
        note: sections.length ? undefined : `This label has no ${topic.replace(/_/g, " ")} section.`,
        choice: choiceNote(choice),
      }),
    };
  },
});
