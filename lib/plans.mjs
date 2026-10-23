// Finished plans: a plan that still has checked items and no open `- [ ]`.
//
// A plan is a working document. Once every box is checked it has served its
// purpose, and a release deletes it. An open box (or no checklist at all) keeps
// the file. `rollup` and `release` share this one predicate.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** True when the text has at least one checked item and no open one. */
export function isFinishedPlan(text) {
  const done = (text.match(/- \[x\]/g) ?? []).length;
  const open = (text.match(/- \[ \]/g) ?? []).length;
  return done > 0 && open === 0;
}

/** Parsed text of a plan, or null. */
function readPlan(root, dir, file) {
  try {
    return readFileSync(join(root, dir, file), "utf8");
  } catch {
    return null;
  }
}

/** Relative paths of finished plans under `dir`, forward-slashed. */
export function findFinishedPlans(root, dir = "docs/plans") {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute)
    .filter((file) => file.endsWith(".md"))
    .filter((file) => {
      const text = readPlan(root, dir, file);
      return text !== null && isFinishedPlan(text);
    })
    .map((file) => `${dir.split(/[\\/]/).join("/")}/${file}`)
    .sort();
}
