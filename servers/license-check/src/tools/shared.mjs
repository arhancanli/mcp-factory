import { ToolError } from "../kit/index.mjs";
import { PROPRIETARY } from "../compat.mjs";
import { osadl, resolveId, spdx } from "../licenses.mjs";

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
export const DISCLAIMER = "Not legal advice: verdicts follow OSADL's license compatibility matrix.";

export async function loadData(ctx) {
  const [s, o] = await Promise.all([spdx(ctx), osadl(ctx)]);
  return { ...s, osadl: o };
}

/** The project's license: an SPDX id, or proprietary. */
export function projectLicense(data, raw) {
  if (PROPRIETARY.test(String(raw).trim())) return { id: "proprietary", proprietary: true };
  const id = resolveId(data, raw);
  if (!id) throw new ToolError("unknown_license", `"${raw}" is not a license SPDX lists. Give an SPDX id (MIT, Apache-2.0, GPL-3.0-only) or "proprietary".`);
  return { id };
}
