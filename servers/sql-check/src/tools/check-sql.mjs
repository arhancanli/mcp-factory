import { z } from "zod";
import { defineTool } from "../kit/index.mjs";
import { checkSql } from "../check.mjs";

export const checkSqlTool = defineTool({
  name: "check_sql",
  title: "Run SQL on real PostgreSQL or SQLite",
  description: "Runs SQL on real PostgreSQL 18 or SQLite 3.49 in memory, after your schema (DDL, migrations, sample INSERTs). Each statement gets the engine's verdict: error with line, column and hint, constraint violations, or the rows it returns (up to max_rows). All inside a rolled-back transaction. dialect both compares the two.",
  input: {
    sql: z.string().min(1).max(200_000).describe("the statements to check"),
    schema: z.string().max(1_000_000).optional().describe("CREATE TABLE statements, migrations and sample rows, run first"),
    dialect: z.enum(["postgres", "sqlite", "both"]).optional().describe("default postgres"),
    max_rows: z.number().int().min(1).max(100).optional(),
  },
  output: { results: z.array(z.looseObject({ dialect: z.string(), statements: z.array(z.looseObject({ line: z.number(), status: z.string() })) })) },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (args, ctx) => checkSql(ctx, args),
});
