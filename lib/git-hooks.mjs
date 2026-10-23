// Install the git hooks and the files they need into a project.
//
// The hooks are the one place a project carries code from this repository: a
// husky hook runs before any skill is loaded, and it cannot import `#lib/*`
// because `#lib` resolves through this repository's package.json. So the files
// are copied verbatim from `lib/templates/`, and `doctor` compares the installed
// copy with the template on every run.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Files copied verbatim: project path -> template path. */
export const TEMPLATES = {
  "scripts/version.mjs": "version.mjs",
  "scripts/commit-msg.mjs": "commit-msg.mjs",
};

function template(name) {
  return readFileSync(fileURLToPath(new URL(`./templates/${name}`, import.meta.url)), "utf8");
}

/**
 * The line ending the project already uses, so installing does not rewrite every
 * line of a CRLF working tree. Defaults to LF.
 */
function eolFor(root) {
  for (const candidate of ["scripts/version.mjs", ".husky/pre-commit", "package.json"]) {
    try {
      const text = readFileSync(join(root, candidate), "utf8");
      if (text.includes("\r\n")) return "\r\n";
      if (text.includes("\n")) return "\n";
    } catch {
      // The next candidate may exist.
    }
  }
  return "\n";
}

/**
 * Install into a project root:
 *   - scripts/version.mjs and scripts/commit-msg.mjs from the templates
 *   - .husky/pre-commit and .husky/commit-msg, only when the project has none
 *   - commit-convention.json, only when the project has none
 *
 * The hook files are never overwritten: a project may already run more in
 * pre-commit than lint plus the patch bump. The script copies are overwritten,
 * because reinstalling them is how a drift is repaired.
 */
export function installGitHooks(root) {
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, ".husky"), { recursive: true });

  const eol = eolFor(root);
  const withEol = (content) => content.replace(/\r\n/g, "\n").replace(/\n/g, eol);

  for (const [installed, name] of Object.entries(TEMPLATES)) {
    writeFileSync(join(root, installed), withEol(template(name)), "utf8");
  }

  const writeIfMissing = (relative, content) => {
    const file = join(root, relative);
    if (existsSync(file)) return false;
    writeFileSync(file, withEol(content), "utf8");
    return true;
  };

  writeIfMissing(".husky/pre-commit", "npm run lint && node scripts/version.mjs hook\n");
  writeIfMissing(".husky/commit-msg", 'node scripts/commit-msg.mjs "$1"\n');
  writeIfMissing("commit-convention.json", `${JSON.stringify({ types: {} }, null, 2)}\n`);
}
