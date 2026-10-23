import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseVersion, bumpVersion } from "../lib/semver.mjs";
import { isFinishedPlan, findFinishedPlans } from "../lib/plans.mjs";
import { projectRoot, readConfig } from "../lib/project.mjs";
import { resolveConvention } from "../lib/release/convention.mjs";
import {
  groupCommits,
  isSkippable,
  parseCommit,
  renderChangelog,
  todayLocal,
} from "../lib/release/changelog.mjs";
import { applyRelease, planRelease } from "../lib/release/release.mjs";

describe("semver", () => {
  it("bumps patch, minor and major", () => {
    expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });

  it("rejects a non-semver version", () => {
    expect(() => parseVersion("v1.2")).toThrow(/not a semver/);
    expect(() => bumpVersion("1.2.3", "huge")).toThrow(/unknown bump/);
  });
});

describe("commit parsing", () => {
  it("reads type, scope and the breaking flag", () => {
    expect(parseCommit("feat(api)!: drop v1")).toEqual({
      type: "feat",
      scope: "api",
      breaking: true,
      description: "drop v1",
    });
  });

  it("returns null for a free-form subject", () => {
    expect(parseCommit("Update readme")).toBeNull();
  });

  it("skips merges and the release commit", () => {
    expect(isSkippable("Merge branch 'main'")).toBe(true);
    expect(isSkippable("chore(release): v1.2.0")).toBe(true);
    expect(isSkippable("fix(ui): header")).toBe(false);
  });
});

describe("grouping", () => {
  it("buckets known types and sends the rest to Other", () => {
    const groups = groupCommits(["feat: a", "fix: b", "free form c"]);
    expect(groups.map((group) => group.key)).toEqual(["feature", "fix", "other"]);
    expect(groups.at(-1).items[0].description).toBe("free form c");
  });

  it("accepts an extra type from the project config", () => {
    const convention = resolveConvention({ types: { design: "interface" } });
    expect(convention.allTypes).toContain("design");
    const groups = groupCommits(["design: tokens"], convention);
    expect(groups[0].key).toBe("interface");
  });

  it("rejects a type pointing at an unknown group", () => {
    expect(() => resolveConvention({ types: { design: "nope" } })).toThrow(/unknown group/);
  });

  it("renders a CRLF note with a heading and no changes", () => {
    const note = renderChangelog({ version: "1.1.0", date: "2026-01-02", commits: [] });
    expect(note).toContain("# v1.1.0 — 2026-01-02");
    expect(note).toContain("_No changes._");
    expect(note.endsWith("\r\n")).toBe(true);
    expect(note).not.toContain("\n\n");
  });

  it("formats a local date", () => {
    expect(todayLocal(new Date(2026, 0, 2))).toBe("2026-01-02");
  });
});

describe("finished plans", () => {
  it("needs one checked item and no open one", () => {
    expect(isFinishedPlan("- [x] done\n")).toBe(true);
    expect(isFinishedPlan("- [x] done\n- [ ] open\n")).toBe(false);
    expect(isFinishedPlan("no checklist\n")).toBe(false);
  });

  it("lists finished plans relative to the root", () => {
    const root = mkdtempSync(join(tmpdir(), "plans-"));
    mkdirSync(join(root, "docs/plans"), { recursive: true });
    writeFileSync(join(root, "docs/plans/done.md"), "- [x] a\n");
    writeFileSync(join(root, "docs/plans/open.md"), "- [x] a\n- [ ] b\n");
    expect(findFinishedPlans(root)).toEqual(["docs/plans/done.md"]);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("project root", () => {
  it("walks up to the nearest package.json", () => {
    const root = mkdtempSync(join(tmpdir(), "root-"));
    mkdirSync(join(root, "a/b"), { recursive: true });
    writeFileSync(join(root, "package.json"), "{}");
    expect(projectRoot(join(root, "a/b"))).toBe(projectRoot(root));
    expect(readConfig(root)).toEqual({});
    rmSync(root, { recursive: true, force: true });
  });
});

describe("release plan and apply", () => {
  let root;

  const git = (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "release-"));
    Object.assign(process.env, {
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    });
    writeFileSync(join(root, "package.json"), '{\n  "name": "t",\n  "version": "1.0.0"\n}\n');
    mkdirSync(join(root, "docs/plans"), { recursive: true });
    writeFileSync(join(root, "docs/plans/done.md"), "# Plan\n\n- [x] shipped\n");
    git(["init"]);
    git(["add", "-A"]);
    git(["commit", "-m", "feat: first"]);
    git(["tag", "v1.0.0"]);
    git(["commit", "--allow-empty", "-m", "fix(ui): second"]);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("plans without touching the tree", () => {
    const plan = planRelease("minor", { root });
    expect(plan.ok).toBe(true);
    expect(plan.to).toBe("1.1.0");
    expect(plan.tag).toBe("v1.1.0");
    expect(plan.changelog).toContain("second");
    expect(plan.plans).toEqual(["docs/plans/done.md"]);
    expect(readFileSync(join(root, "package.json"), "utf8")).toContain('"version": "1.0.0"');
    expect(existsSync(join(root, "docs/releases"))).toBe(false);
  });

  it("refuses a tag that already exists", () => {
    git(["tag", "v1.1.0"]);
    const plan = planRelease("minor", { root });
    expect(plan.ok).toBe(false);
    expect(plan.error).toMatch(/already exists/);
  });

  it("applies the plan without pushing", () => {
    const plan = planRelease("minor", { root });
    const result = applyRelease(plan, { push: false });

    expect(result.ok).toBe(true);
    expect(readFileSync(join(root, "package.json"), "utf8")).toContain('"version": "1.1.0"');
    expect(readFileSync(join(root, "docs/releases/v1.1.0.md"), "utf8")).toContain("## 🐛 Fixes");
    expect(existsSync(join(root, "docs/plans/done.md"))).toBe(false);
    expect(git(["tag", "--points-at", "HEAD"]).trim()).toBe("v1.1.0");
    expect(git(["log", "-1", "--pretty=%s"]).trim()).toBe("chore(release): v1.1.0");
  });

  it("reads project commit types from commit-convention.json", () => {
    writeFileSync(
      join(root, "commit-convention.json"),
      JSON.stringify({ types: { design: "interface" } }),
    );
    git(["add", "-A"]);
    git(["commit", "-m", "design: tokens"]);

    const plan = planRelease("minor", { root });
    expect(plan.groups.map((group) => group.key)).toContain("interface");
    expect(plan.changelog).toContain("tokens");
  });

  it("flags a major release for confirmation and an unknown bump as a failure", () => {
    expect(planRelease("major", { root }).needsConfirmation).toBe(true);
    expect(planRelease("huge", { root })).toMatchObject({ ok: false });
  });
});
