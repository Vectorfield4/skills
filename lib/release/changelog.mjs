// Changelog: turn the commits since the last release tag into the release note.
//
// Commits follow Conventional Commits (`type(scope): description`). Known types
// land in their group; everything else, and any non-conforming subject, lands in
// "Other". Merge commits and the release commit itself are dropped.

import { resolveConvention } from "./convention.mjs";

const CONVENTIONAL = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/;

/** `"feat(api)!: drop v1"` -> `{ type, scope, breaking, description }`, else null. */
export function parseCommit(subject) {
  const match = CONVENTIONAL.exec(subject.trim());
  if (!match) return null;
  return {
    type: match[1].toLowerCase(),
    scope: match[2] ?? null,
    breaking: Boolean(match[3]),
    description: match[4].trim(),
  };
}

/** Merge commits and the release commit never appear in a changelog. */
export function isSkippable(subject) {
  const line = subject.trim();
  if (/^merge\b/i.test(line)) return true;
  const parsed = parseCommit(line);
  return parsed?.type === "chore" && parsed.scope === "release";
}

/** Group subjects (strings or `{ subject }`) into the ordered buckets. */
export function groupCommits(commits, convention = resolveConvention()) {
  const buckets = new Map(
    convention.groups.map((group) => [group.key, { ...group, items: [] }]),
  );

  for (const raw of commits) {
    const subject = (typeof raw === "string" ? raw : raw.subject).trim();
    if (!subject || isSkippable(subject)) continue;
    const parsed = parseCommit(subject);
    const group = convention.groupOf(parsed?.type ?? "");
    buckets
      .get(group.key)
      .items.push(parsed ?? { type: "", scope: null, breaking: false, description: subject });
  }

  return [...buckets.values()].filter((group) => group.items.length > 0);
}

function formatItem(item) {
  const scope = item.scope ? `\`${item.scope}\`: ` : "";
  const bang = item.breaking ? "⚠️ " : "";
  return `- ${bang}${scope}${item.description}`;
}

/** The release note body: grouped, emoji-titled, CRLF. */
export function renderChangelog({ version, date, commits, convention }) {
  const groups = groupCommits(commits, convention ?? resolveConvention());
  const lines = [`# v${version} — ${date}`, ""];
  if (groups.length === 0) {
    lines.push("_No changes._", "");
  }
  for (const group of groups) {
    lines.push(`## ${group.emoji} ${group.title}`, "");
    for (const item of group.items) lines.push(formatItem(item));
    lines.push("");
  }
  return `${lines.join("\r\n").replace(/(\r\n)+$/, "")}\r\n`;
}

/** Today as `YYYY-MM-DD` in the machine's local timezone, not UTC. */
export function todayLocal(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
