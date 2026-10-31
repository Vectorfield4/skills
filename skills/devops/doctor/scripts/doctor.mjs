/**
 * Doctor: verify the global skill mounts and the project copies they own.
 *
 * Usage:
 *   node skills/devops/doctor/scripts/doctor.mjs                     check the mounts only
 *   node skills/devops/doctor/scripts/doctor.mjs <project>           also check the project
 *   node skills/devops/doctor/scripts/doctor.mjs --sync [<project>]  then commit, rebase,
 *                                                                   verify and push the repo
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root: this script sits in skills/devops/doctor/scripts/. */
const ROOT = resolve(dirname(realpathSync(fileURLToPath(import.meta.url))), "..", "..", "..", "..");
const CONFIG_DIR = process.env.OPENCODE_CONFIG_DIR ?? join(homedir(), ".config", "opencode");

/** Skills the setup is incomplete without. */
const KNOWN_SKILLS = [
  "content/write-article",
  "content/write-service",
  "content/write-solution",
  "creative/generate-image-cover",
  "devops/doctor",
  "devops/licensing",
  "devops/release",
  "devops/rollup",
  "quality/code-quality",
  "quality/refactoring",
];

const failures = [];

/**
 * Files that a project installs verbatim from this repo. A project copy must stay
 * byte-identical apart from line endings, because a husky hook cannot import
 * `#lib/*` and must carry its own copy of the code. An optional entry is checked
 * when present and ignored when the project never installed it.
 */
const TEMPLATED = [
  { installed: "scripts/version.mjs", template: "lib/templates/version.mjs", required: true },
  { installed: "scripts/commit-msg.mjs", template: "lib/templates/commit-msg.mjs", required: false },
];

/**
 * Engine files that used to be copied into every project and now live in a skill
 * or in `lib/`. A project copy drifts, so any copy fails the check.
 */
const MOVED_INTO_SKILLS = [
  "scripts/release.mjs",
  "scripts/changelog.mjs",
  "scripts/commit-convention.mjs",
];

/**
 * Working-tree debris at the repo root: scratch scripts and capture files. `--sync`
 * deletes them and adds the pattern to `.gitignore` instead of committing them.
 */
const DEBRIS = [
  { pattern: /^tmp-.+\.mjs$/, ignore: "tmp-*.mjs" },
  { pattern: /^debug\.txt$/, ignore: "debug.txt" },
  { pattern: /^bulk\.json$/, ignore: "bulk.json" },
];

/** States that make a commit or a rebase unsafe until someone finishes or aborts them. */
const OPERATIONS = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"];

/** The commit `--sync` writes when the working tree holds changes. Conventional, so a commit-msg hook accepts it. */
const SYNC_SUBJECT = "chore: sync working tree";

/** Text with line endings normalized, so a CRLF checkout compares equal to the template. */
function normalized(text) {
  return text.replace(/\r\n/g, "\n");
}

function check(ok, message) {
  console.log(`${ok ? "ok  " : "fail"} ${message}`);
  if (!ok) failures.push(message);
}

/** Compare the mount target with the expected directory in this repo. */
function mountStatus(name) {
  const link = join(CONFIG_DIR, name);
  if (!existsSync(link)) return { ok: false, reason: "missing" };
  if (!lstatSync(link).isSymbolicLink()) return { ok: false, reason: "not a symlink" };
  const target = realpathSync(link);
  const expected = realpathSync(join(ROOT, name));
  return { ok: target === expected, reason: target === expected ? "resolves" : `points to ${target}` };
}

/** Git-tracked `.opencode` entries in a project, empty when the project is not a repo. */
function trackedOpencode(project) {
  if (!existsSync(join(project, ".git"))) return [];
  try {
    const out = execFileSync("git", ["ls-files", ".opencode"], {
      cwd: project,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() ? out.trim().split("\n") : [];
  } catch {
    return [];
  }
}

/** A project may not keep any `.opencode`, tracked or ignored. False stops the remaining project checks. */
function checkProject(project) {
  if (!existsSync(project) || !statSync(project).isDirectory()) {
    check(false, `${project}: not a directory`);
    return false;
  }

  const local = join(project, ".opencode");
  const present = existsSync(local);
  check(!present, `${project}: no .opencode directory`);
  if (!present) return true;

  if (!statSync(local).isDirectory()) {
    console.log("     it is a file, not a directory");
    return true;
  }

  const entries = readdirSync(local);
  const tracked = trackedOpencode(project);
  console.log(`     ${basename(local)}: ${entries.length === 0 ? "empty" : `${entries.length} entries`}`);
  console.log(
    tracked.length === 0
      ? "     untracked or gitignored, delete it anyway"
      : `     ${tracked.length} tracked by git, delete it and commit the removal`,
  );
  console.log("     skills and agents load from the global mount only");
  return true;
}

/** Compare an installed copy with the template it was generated from. */
function checkTemplates(project) {
  for (const { installed, template, required } of TEMPLATED) {
    const projectFile = join(project, installed);
    const templateFile = join(ROOT, template);
    if (!existsSync(templateFile)) {
      check(false, `${template}: template is missing`);
      continue;
    }
    if (!existsSync(projectFile)) {
      if (required) check(false, `${project}: ${installed} missing, install it from ${template}`);
      continue;
    }
    const same =
      normalized(readFileSync(projectFile, "utf8")) ===
      normalized(readFileSync(templateFile, "utf8"));
    check(same, `${project}: ${installed} ${same ? "matches" : "drifted from"} ${template}`);
  }
}

/** Engine copies that belong to a skill now, not to the project. */
function checkLeftovers(project) {
  for (const file of MOVED_INTO_SKILLS) {
    const present = existsSync(join(project, file));
    check(!present, `${project}: no leftover ${file} (engine code lives in lib/)`);
  }
}

/** A command that reports failure through its status instead of throwing. */
function run(command, args, cwd, { raw = false } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  return {
    status: result.status ?? 1,
    out: raw ? (result.stdout ?? "") : (result.stdout ?? "").trim(),
    err: (result.stderr ?? "").trim(),
  };
}

/** The last few non-empty lines of failed command output, so the reason reaches the report. */
function explain(text, lines = 3) {
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-lines)) {
    console.log(`     ${line}`);
  }
}

/** Absolute git directory, or null outside a repo. */
function gitDirectory(repo) {
  const result = run("git", ["rev-parse", "--absolute-git-dir"], repo);
  return result.status === 0 ? result.out : null;
}

/** Delete scratch files at the repo root instead of letting them into a commit. */
function cleanDebris(repo) {
  const removed = new Map();
  const tracked = [];
  for (const entry of DEBRIS) {
    for (const name of readdirSync(repo)) {
      const path = join(repo, name);
      if (!entry.pattern.test(name) || !statSync(path).isFile()) continue;
      if (run("git", ["ls-files", "--error-unmatch", "--", name], repo).status === 0) {
        tracked.push(name);
        continue;
      }
      rmSync(path, { force: true });
      removed.set(entry.ignore, name);
    }
  }
  check(
    tracked.length === 0,
    tracked.length === 0
      ? "sync: no tracked debris at the repo root"
      : `sync: ${tracked.join(", ")} tracked by git, remove it and commit the removal`,
  );
  check(
    true,
    removed.size === 0
      ? "sync: no debris at the repo root"
      : `sync: removed debris ${[...removed.values()].join(", ")}`,
  );
  return [...removed.keys()];
}

/** Keep the debris from coming back: only the patterns whose files were actually there. */
function ignoreDebris(repo, patterns) {
  if (patterns.length === 0) {
    check(true, "sync: .gitignore left alone, no debris to guard against");
    return;
  }
  const file = join(repo, ".gitignore");
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  const known = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const missing = patterns.filter((pattern) => !known.has(pattern));
  if (missing.length === 0) {
    check(true, "sync: .gitignore already ignores the debris patterns");
    return;
  }
  const separator = current && !current.endsWith("\n") ? "\n" : "";
  writeFileSync(file, `${current}${separator}${missing.join("\n")}\n`);
  check(true, `sync: .gitignore now ignores ${missing.join(", ")}`);
}

/** A submodule pinned to a commit no remote carries breaks a fresh clone even though this clone looks fine. */
function checkSubmodules(repo) {
  const listing = run("git", ["submodule", "status", "--recursive"], repo, { raw: true });
  if (listing.status !== 0) {
    check(false, "sync: git submodule status failed");
    explain(listing.err);
    return;
  }
  const lines = listing.out.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    check(true, "sync: no submodules to restore");
    return;
  }
  for (const line of lines) {
    const match = /^([ +\-U]?)([0-9a-f]{40,64})\s+(\S+)/.exec(line);
    if (!match) continue;
    const [, state, sha, path] = match;
    const short = sha.slice(0, 7);
    if (state === "-") {
      check(false, `sync: submodule ${path} not initialized, run git submodule update --init --recursive`);
      continue;
    }
    const sub = join(repo, path);
    const fetch = run("git", ["fetch", "--quiet", "origin"], sub);
    if (fetch.status !== 0) {
      check(false, `sync: submodule ${path} could not fetch origin`);
      explain(fetch.err);
      continue;
    }
    const refs = run("git", ["for-each-ref", "--contains", sha, "--format=%(refname)", "refs/remotes", "refs/tags"], sub);
    if (refs.status !== 0) {
      check(false, `sync: submodule ${path} pinned at ${short}, commit is not in this clone`);
      continue;
    }
    // `origin/HEAD` is an alias of a branch already listed, so it never names the carrier.
    const carrying = refs.out
      .split(/\r?\n/)
      .map((ref) => ref.trim())
      .filter((ref) => ref !== "" && !ref.endsWith("/HEAD"));
    if (carrying.length > 0) {
      check(true, `sync: submodule ${path} pinned at ${short}, carried by ${carrying[0]}`);
      continue;
    }
    const tip = run("git", ["rev-parse", "--short", "origin/HEAD"], sub);
    const hint = tip.status === 0 ? `; origin/HEAD is ${tip.out}` : "";
    check(false, `sync: submodule ${path} pinned at ${short}, no remote ref carries it${hint}; update the pin`);
  }
}

/** Stage the whole tree and commit it as one subject. */
function commitWork(repo) {
  const add = run("git", ["add", "-A"], repo);
  if (add.status !== 0) {
    check(false, "sync: git add -A failed");
    explain(add.err);
    return;
  }
  const staged = run("git", ["diff", "--cached", "--name-only", "-z"], repo);
  const files = staged.out ? staged.out.split("\0").filter(Boolean) : [];
  if (files.length === 0) {
    check(true, "sync: nothing to commit, working tree clean");
    return;
  }
  const commit = run("git", ["commit", "-m", SYNC_SUBJECT], repo);
  if (commit.status !== 0) {
    check(false, `sync: commit failed, ${files.length} file(s) still staged`);
    explain(`${commit.err}\n${commit.out}`);
    return;
  }
  check(true, `sync: committed ${files.length} file(s) as "${SYNC_SUBJECT}"`);
}

/** Rebase the branch onto its upstream. A conflict is aborted, never left half-applied. */
function rebaseOnto(repo, branch, remote) {
  const fetch = run("git", ["fetch", "--prune", remote], repo);
  if (fetch.status !== 0) {
    check(false, `sync: git fetch --prune ${remote} failed`);
    explain(fetch.err);
    return false;
  }
  check(true, `sync: fetched ${remote}`);

  const upstream = `${remote}/${branch}`;
  const behind = Number(run("git", ["rev-list", "--count", `HEAD..${upstream}`], repo).out || 0);
  const ahead = Number(run("git", ["rev-list", "--count", `${upstream}..HEAD`], repo).out || 0);
  if (behind === 0) {
    check(true, `sync: ${branch} already contains ${upstream}${ahead ? `, ${ahead} commit(s) ahead` : ""}`);
    return true;
  }

  const rebase = run("git", ["rebase", upstream], repo);
  if (rebase.status !== 0) {
    const directory = gitDirectory(repo);
    const interrupted = directory
      ? ["rebase-merge", "rebase-apply"].filter((name) => existsSync(join(directory, name)))
      : [];
    if (interrupted.length > 0) run("git", ["rebase", "--abort"], repo);
    check(
      false,
      `sync: rebasing ${branch} onto ${upstream} conflicted${interrupted.length > 0 ? ", aborted and left as it was" : ""}`,
    );
    explain(`${rebase.err}\n${rebase.out}`);
    console.log("     resolve by hand, commit the result, then rerun --sync");
    return false;
  }
  check(true, `sync: rebased ${ahead} local commit(s) onto ${upstream} (${behind} incoming)`);
  return true;
}

/** Prove the repo still runs before anything is pushed. */
function verify(repo) {
  const manifest = join(repo, "package.json");
  if (!existsSync(manifest)) {
    check(true, "sync: no package.json, nothing to run");
    return true;
  }
  let scripts;
  try {
    const manifestText = readFileSync(manifest, "utf8").replace(/^\uFEFF/, "");
    scripts = JSON.parse(manifestText).scripts ?? {};
  } catch {
    check(false, `${manifest}: not valid JSON, cannot verify`);
    return false;
  }
  if (!scripts.test) {
    check(true, "sync: package.json has no test script, nothing to run");
    return true;
  }
  if (!existsSync(join(repo, "node_modules"))) {
    check(false, "sync: node_modules missing, install dependencies before syncing");
    return false;
  }
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const started = Date.now();
  const test = spawnSync(npm, ["test"], {
    cwd: repo,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 15 * 60 * 1000,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (test.status !== 0) {
    check(false, `sync: npm test failed after ${seconds}s`);
    explain(`${test.stdout ?? ""}\n${test.stderr ?? ""}`);
    return false;
  }
  check(true, `sync: npm test passed in ${seconds}s`);
  return true;
}

/** Push only a repo that just passed every check. */
function push(repo, branch) {
  if (failures.length > 0) {
    console.log(`     push skipped: ${failures.length} problem(s) above; fix them and rerun --sync`);
    return;
  }
  const result = run("git", ["push"], repo);
  if (result.status !== 0) {
    check(false, `sync: git push ${branch} failed`);
    explain(result.err);
    return;
  }
  check(true, `sync: pushed ${branch}`);
}

/** Commit the tree, rebase onto the upstream, run the tests, push. The only writer in doctor. */
function syncRepo(target) {
  console.log("");
  const toplevel = run("git", ["rev-parse", "--show-toplevel"], target);
  if (toplevel.status !== 0) {
    check(false, `${target}: not a git repository, nothing to sync`);
    return;
  }
  const repo = toplevel.out;
  check(true, `sync: ${repo}`);

  const directory = gitDirectory(repo);
  const interrupted = directory
    ? OPERATIONS.filter((name) => existsSync(join(directory, name)))
    : [];
  if (interrupted.length > 0) {
    check(false, `sync: ${interrupted.join(", ")} in progress, finish or abort it first`);
    return;
  }

  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], repo).out;
  if (!branch || branch === "HEAD") {
    check(false, "sync: detached HEAD, check out a branch first");
    return;
  }
  const remote = "origin";
  if (run("git", ["remote", "get-url", remote], repo).status !== 0) {
    check(false, `sync: no ${remote} remote to rebase onto`);
    return;
  }
  check(true, `sync: on ${branch}, upstream ${remote}/${branch}`);

  const debris = cleanDebris(repo);
  ignoreDebris(repo, debris);
  commitWork(repo);
  checkSubmodules(repo);
  const rebased = rebaseOnto(repo, branch, remote);
  if (rebased) verify(repo);
  push(repo, branch);
}

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg.startsWith("--") && arg !== "--sync");
if (unknown.length > 0) {
  console.log(`fail ${unknown.join(", ")}: unknown flag`);
  console.log("     usage: doctor.mjs [--sync] [project]");
  process.exit(1);
}
const sync = args.includes("--sync");
const project = args.find((arg) => !arg.startsWith("--"));
const target = project ? resolve(project) : process.cwd();

check(existsSync(join(ROOT, "skills")), `${ROOT}: skills directory exists`);
check(existsSync(join(ROOT, "agent")), `${ROOT}: agent directory exists`);

for (const name of ["skills", "agent"]) {
  const status = mountStatus(name);
  check(status.ok, `${CONFIG_DIR}\\${name} ${status.reason}`);
}

for (const skill of KNOWN_SKILLS) {
  check(existsSync(join(CONFIG_DIR, "skills", skill, "SKILL.md")), `skill ${skill} resolves through the mount`);
}

/** The skills repo is not a consumer project: the template and leftover checks do not describe it. */
const insideRepo = target === ROOT || target.startsWith(`${ROOT}${sep}`);

if (project && !insideRepo) {
  if (checkProject(target)) {
    checkTemplates(target);
    checkLeftovers(target);
  }
}

if (sync) syncRepo(target);

console.log(failures.length === 0 ? "doctor: ok" : `doctor: ${failures.length} problem(s)`);
process.exit(failures.length === 0 ? 0 : 1);
