import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const START = "<!-- CAM_DIRECTOR_RULES_START -->";
const END = "<!-- CAM_DIRECTOR_RULES_END -->";
const ERROR = "The production guidance is unavailable. No images were generated.";

/** Read only the reviewed operational section, never private agent memory,
 * history, local secrets, or support conversations. No process-lifetime cache:
 * the next new production receives the latest checked-in corrections. */
export function parseDirectorMemory(document: string) {
  if (document.length > 80_000) throw new Error(ERROR);
  const first = document.indexOf(START), last = document.indexOf(END);
  if (first < 0 || last <= first || document.indexOf(START, first + START.length) !== -1 || document.indexOf(END, last + END.length) !== -1) throw new Error(ERROR);
  const rules = document.slice(first + START.length, last).trim();
  if (!rules || rules.length > 12_000) throw new Error(ERROR);
  return { rules, sha256: createHash("sha256").update(rules).digest("hex") };
}

export async function loadDirectorMemory(root = process.cwd()) {
  const document = await readFile(path.join(root, "MEMORY.md"), "utf8").catch(() => { throw new Error(ERROR); });
  return parseDirectorMemory(document);
}
