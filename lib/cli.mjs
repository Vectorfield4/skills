// Entry-point detection that survives symlinks.
//
// ESM resolves symlinks in `import.meta.url` (the real path) while `process.argv[1]`
// keeps the path the user typed — and skills are mounted as symlinked category dirs, so
// `.opencode/skills/<category>/...` is exactly such a typed path. Comparing URLs directly
// makes the CLI silently do nothing. Compare realpaths instead.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function isEntryPoint(moduleUrl, argv = process.argv) {
  if (!argv[1]) return false;
  try {
    return realpathSync(argv[1]) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
