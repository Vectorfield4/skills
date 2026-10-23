// Commit prefixes and the changelog group each one lands in.
//
// One list feeds both the `commit-msg` hook and the changelog grouping. The
// defaults cover Conventional Commits plus the area prefixes this repo family
// uses; groups nobody writes simply never render.
//
// A project shapes the list through `commit-convention.json` at its root, the
// same file the `commit-msg` hook reads:
//   { "types": { "design": "interface" } }
// `types` adds a prefix to an existing group; `groups` replaces the list.

import { join } from "node:path";

import { readJsonIfExists } from "../project.mjs";

/** The project's `commit-convention.json`, or an empty config. */
export function readConvention(root) {
  const value = readJsonIfExists(join(root, "commit-convention.json"), {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** Ordered groups; a type not listed anywhere falls into the last one. */
export const DEFAULT_GROUPS = [
  { key: "feature", emoji: "🚀", title: "Features", types: ["feat"] },
  {
    key: "content",
    emoji: "📰",
    title: "Content",
    types: ["content", "copy", "news", "seo"],
  },
  {
    key: "service",
    emoji: "🧩",
    title: "Services & Solutions",
    types: ["service", "services", "solution", "solutions"],
  },
  { key: "agent", emoji: "🤖", title: "Skills & Agents", types: ["skill", "agent", "jev"] },
  {
    key: "interface",
    emoji: "🎨",
    title: "Interface",
    types: ["ui", "app-bar", "home", "pricing", "filters", "i18n", "icons", "diagrams", "assets"],
  },
  { key: "docs", emoji: "📝", title: "Documentation", types: ["docs", "plan"] },
  { key: "fix", emoji: "🐛", title: "Fixes", types: ["fix"] },
  { key: "refactor", emoji: "♻️", title: "Refactoring", types: ["refactor"] },
  {
    key: "chore",
    emoji: "⚙️",
    title: "Maintenance",
    types: ["chore", "style", "test", "perf", "build", "ci", "revert", "init", "publish"],
  },
  { key: "other", emoji: "🧺", title: "Other", types: [] },
];

/**
 * The convention for one project: defaults, optionally extended or replaced.
 * Returns the ordered groups, every accepted prefix, and the group lookup.
 */
export function resolveConvention(config = {}) {
  const groups =
    Array.isArray(config.groups) && config.groups.length > 0 ? config.groups : DEFAULT_GROUPS;
  const merged = groups.map((group) => ({ ...group, types: [...(group.types ?? [])] }));

  for (const [type, key] of Object.entries(config.types ?? {})) {
    const group = merged.find((candidate) => candidate.key === key);
    if (!group) throw new Error(`unknown group "${key}" for commit type "${type}"`);
    if (!group.types.includes(type)) group.types.push(type);
  }

  const allTypes = merged.flatMap((group) => group.types);
  const groupOf = (type) =>
    merged.find((group) => group.types.includes(type)) ?? merged[merged.length - 1];

  return { groups: merged, allTypes, groupOf };
}
