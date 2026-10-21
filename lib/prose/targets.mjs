// Resolving linked targets (services, solutions, cases) to the short marketing
// text the relevance gate reads. Shared by the article-link and service-relevant
// paths, which differ only in where the slugs come from.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { firstField } from "./ts.mjs";

// The entity files belong to the content project, not to this repository, so
// resolve them from the directory the skill was invoked in.
const ROOT = process.cwd();
const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");

const ENTITY_DIRS = {
  service: "src/entities/service",
  solution: "src/entities/solution",
  case: "src/entities/case",
};

/** Short marketing text of a linked entity for the relevance gate; null if absent. */
export function entityText(type, slug, lang) {
  const dir = ENTITY_DIRS[type];
  if (!dir) return null;
  const src = read(path.join(ROOT, dir, "i18n", lang, `${slug}.ts`));
  if (!src) return null;
  return (
    firstField(src, "tagline") ??
    firstField(src, "description") ??
    firstField(src, "title") ??
    firstField(src, "navTitle")
  );
}
