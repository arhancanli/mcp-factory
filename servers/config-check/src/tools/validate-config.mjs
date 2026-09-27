import { z } from "zod";
import { defineTool, mapLimit, ToolError, UpstreamError } from "../kit/index.mjs";
import { checkFile } from "../validate.mjs";
import { READ_ONLY } from "./shared.mjs";

export const validateConfig = defineTool({
  name: "validate_config",
  title: "Check config files against their schemas",
  description: "Checks config files against their official JSON Schema from SchemaStore (1,400+ kinds, chosen by file name: tsconfig.json, package.json, docker-compose.yml, .github/workflows/*.yml, pyproject.toml...). JSON, JSONC, YAML, TOML. Each error has its line, path, the allowed values and the key probably meant; also warns on likely misspelt and deprecated settings.",
  input: {
    files: z
      .array(z.object({ path: z.string().min(1).max(400).describe("the file's path or name; picks the schema and format"), content: z.string().max(500_000) }))
      .min(1)
      .max(20),
    schema: z.string().max(300).optional().describe("use this schema for every file: a name, file name or URL"),
  },
  output: {
    valid: z.number(),
    invalid: z.number(),
    files: z.array(z.looseObject({ path: z.string(), errors: z.array(z.looseObject({ message: z.string() })) })),
  },
  annotations: READ_ONLY,
  handler: async ({ files, schema }, ctx) => {
    const results = await mapLimit(files, 4, async (f) => {
      try {
        return await checkFile(ctx, f, schema);
      } catch (err) {
        // One unreachable schema should not hide the other files' results.
        if (files.length === 1 || !(err instanceof ToolError || err instanceof UpstreamError)) throw err;
        return { path: f.path, errors: [], error: err.message };
      }
    });
    return { valid: results.filter((r) => r.valid === true).length, invalid: results.filter((r) => r.valid === false).length, files: results };
  },
});
