// The template's example tool. Replace it with the server's real tools; keep the shape:
// bounded inputs, an output schema, all four annotations, and a description under 400 characters
// that says what the tool returns and when to use it.
import { z } from "zod";
import { defineTool, ToolError } from "../kit/index.mjs";

export const exampleLookup = defineTool({
  name: "example_lookup",
  title: "Example lookup",
  description: "Looks up one item by id and returns its name. Replace this tool.",
  input: { id: z.string().min(1).max(64).describe("Item id") },
  output: { id: z.string(), name: z.string() },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ id }, { fetcher }) => {
    const { status, data } = await fetcher.getJson(`https://{{host}}/items/${encodeURIComponent(id)}`, { allowStatus: [404] });
    if (status === 404) throw new ToolError("not_found", `No item with id ${id}.`);
    return { id, name: String(data.name) };
  },
});
