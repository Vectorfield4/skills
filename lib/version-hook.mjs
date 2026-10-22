import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE_PATH = fileURLToPath(new URL("./templates/version.mjs", import.meta.url));
const TEMPLATE = readFileSync(TEMPLATE_PATH, "utf8");

/** The `scripts/version.mjs` content installed into a project. */
export const VERSION_HOOK_TEMPLATE = TEMPLATE;

/**
 * Install the version hook into a project root:
 *   - scripts/version.mjs (the template)
 *   - .husky/pre-commit running lint + the patch bump
 */
export function installVersionHook(root) {
  const scriptsDir = join(root, "scripts");
  const huskyDir = join(root, ".husky");
  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(huskyDir, { recursive: true });
  writeFileSync(join(scriptsDir, "version.mjs"), TEMPLATE, "utf8");
  writeFileSync(join(huskyDir, "pre-commit"), "npm run lint && node scripts/version.mjs hook\n", "utf8");
}
