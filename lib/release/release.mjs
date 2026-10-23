// Release: two stages over one project.
//
// `planRelease` is read only. It reads the version, the commits since the last
// tag and the plan files, and returns everything the release would do: the next
// number, the changelog body, the plans it would delete, and the paths it would
// write. An agent reads that JSON, decides, and only then calls `applyRelease`.
//
// `applyRelease` writes the manifest and the release note, deletes the finished
// plans, commits, tags, and pushes. Nothing here prints: the CLI owns the output.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { commitSubjects, git, lastTag, tagExists } from "../git.mjs";
import { findFinishedPlans } from "../plans.mjs";
import { projectRoot, readConfig } from "../project.mjs";
import { bumpVersion } from "../semver.mjs";
import { groupCommits, renderChangelog, todayLocal } from "./changelog.mjs";
import { resolveConvention, readConvention } from "./convention.mjs";
import { readVersion, writeVersion } from "./manifest.mjs";

export const KINDS = ["patch", "minor", "major"];

/**
 * Per project paths for a release. Defaults match the layout every project here
 * uses; `skills.config.json` overrides them without touching the skill.
 */
export function releaseProfile(root, config = readConfig(root)) {
  const release = config.release ?? {};
  return {
    manifest: release.manifest ?? "package.json",
    releasesDir: release.releasesDir ?? "docs/releases",
    plansDir: release.plansDir ?? "docs/plans",
    tagPattern: release.tagPattern ?? "v[0-9]*.[0-9]*.[0-9]*",
  };
}

/** Read-only plan. Returns `ok: false` with `error` when the release cannot run. */
export function planRelease(kind = "minor", { root = projectRoot(), config = readConfig(root) } = {}) {
  if (!KINDS.includes(kind)) {
    return { ok: false, root, error: `unknown bump "${kind}" (expected ${KINDS.join(", ")})` };
  }

  const profile = releaseProfile(root, config);
  const convention = resolveConvention(readConvention(root));
  const from = readVersion(root, profile.manifest);
  const to = bumpVersion(from, kind);
  const tag = `v${to}`;
  const since = lastTag({ cwd: root, pattern: profile.tagPattern });
  const commits = commitSubjects({ cwd: root, since });
  const date = todayLocal();
  const groups = groupCommits(commits, convention);
  const plans = findFinishedPlans(root, profile.plansDir);

  if (tagExists({ cwd: root, tag })) {
    return { ok: false, root, error: `tag ${tag} already exists`, from, to, tag };
  }

  return {
    ok: true,
    root,
    kind,
    from,
    to,
    tag,
    date,
    since,
    commitCount: commits.length,
    groups: groups.map((group) => ({
      key: group.key,
      title: group.title,
      emoji: group.emoji,
      count: group.items.length,
    })),
    changelog: renderChangelog({ version: to, date, commits, convention }),
    plans,
    files: [`${profile.releasesDir}/${tag}.md`],
    needsConfirmation: kind === "major",
    paths: {
      manifest: profile.manifest,
      releasesDir: profile.releasesDir,
      plansDir: profile.plansDir,
    },
  };
}

/** Execute a plan. `push: false` stops after the tag. */
export function applyRelease(plan, { push = true } = {}) {
  if (!plan?.ok) throw new Error(`refusing to apply a failed plan: ${plan?.error ?? "no plan"}`);

  const { root, to, tag, changelog, plans, paths } = plan;
  writeVersion(root, to, paths.manifest);

  const releasesDir = join(root, paths.releasesDir);
  mkdirSync(releasesDir, { recursive: true });
  writeFileSync(join(releasesDir, `${tag}.md`), changelog, "utf8");

  for (const file of plans) rmSync(join(root, file), { force: true });

  git(["add", "-A"], { cwd: root, stdio: "inherit" });
  git(["commit", "-m", `chore(release): ${tag}`], { cwd: root, stdio: "inherit" });
  git(["tag", tag], { cwd: root, stdio: "inherit" });

  if (push) {
    git(["push"], { cwd: root, stdio: "inherit" });
    git(["push", "origin", tag], { cwd: root, stdio: "inherit" });
  }

  return { ok: true, tag, to, plans: plans.length, pushed: push };
}
