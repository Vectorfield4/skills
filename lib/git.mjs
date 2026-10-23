// Git helpers for skill scripts.
//
// Every call takes the project root explicitly: a skill runs inside someone
// else's repository, so the working directory is never implicit and never the
// skill's own location.

import { execFileSync } from "node:child_process";

/** Run git in `cwd`. `stdio: "inherit"` lets commit and push speak for themselves. */
export function git(args, { cwd, stdio = "pipe" } = {}) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio });
}

/** The greatest reachable tag matching the release pattern, or null. */
export function lastTag({ cwd, pattern }) {
  try {
    const out = git(["describe", "--tags", "--abbrev=0", "--match", pattern], { cwd });
    return out.trim() || null;
  } catch {
    return null;
  }
}

/** Non-merge commit subjects in `<since>..HEAD`, or all of HEAD without a tag. */
export function commitSubjects({ cwd, since }) {
  try {
    const out = git(["log", since ? `${since}..HEAD` : "HEAD", "--no-merges", "--pretty=format:%s"], {
      cwd,
    });
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** True when the tag already points at a commit. */
export function tagExists({ cwd, tag }) {
  try {
    git(["rev-parse", "--verify", `refs/tags/${tag}`], { cwd });
    return true;
  } catch {
    return false;
  }
}

/** True when the staged `package.json` already changes the `version` field. */
export function versionStaged({ cwd, manifest = "package.json" }) {
  try {
    return /^[+-]\s*"version":/m.test(git(["diff", "--cached", "--", manifest], { cwd }));
  } catch {
    return false;
  }
}
