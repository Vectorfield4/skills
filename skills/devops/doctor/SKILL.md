---
name: doctor
description: "Checks the global skill mounts and a project for leftovers: local .opencode, a drifted hook copy, engine files that moved into skills. With --sync it commits the working tree, rebases onto origin, runs the tests and pushes. Triggers: doctor, check mounts, health check, РїСЂРѕРІРµСЂРёС‚СЊ РјРѕРЅС‚РёСЂРѕРІР°РЅРёРµ, РѕСЃС‚Р°С‚РєРё .opencode."
---

# Doctor

Find what stops the shared skills from loading, in the repo or in a project.

## Run

```bash
node skills/devops/doctor/scripts/doctor.mjs
node skills/devops/doctor/scripts/doctor.mjs <project>
node skills/devops/doctor/scripts/doctor.mjs --sync [<project>]
```

Through the global mount, from any directory:

```powershell
node "~/.config/opencode\skills\devops\doctor\scripts\doctor.mjs" <project>
```

## Checks

### Mounts

- `skills/` and `agent/` exist in this repo.
- `~/.config/opencode/skills` and `~/.config/opencode/agent` are links into this repo. `OPENCODE_CONFIG_DIR` overrides the config directory.
- Every known skill ships a `SKILL.md` through the mount.

### Project

- No `.opencode` at the project root, whether git tracks it, ignores it, or the directory is empty.
- `scripts/version.mjs` matches `lib/templates/version.mjs` apart from line endings. Husky runs without this repo mounted, so the project keeps its own copy. The check fails when the two diverge.
- No `scripts/release.mjs`, `scripts/changelog.mjs`, `scripts/commit-convention.mjs`. That engine code lives in `lib/`, and a project copy drifts from it.

## Sync

`--sync` is the step after the checks: a repo only counts as healthy when it is committed, current and running.

1. Scratch files at the repo root (`tmp-*.mjs`, `debug.txt`, `bulk.json`) are deleted, not committed, and their patterns join `.gitignore`.
2. `git add -A`, then one commit `chore: sync working tree`. A clean tree means no commit.
3. Every submodule must be initialized and pinned to a commit an upstream ref carries, otherwise a fresh clone cannot restore it.
4. `git fetch --prune origin`, then `git rebase origin/<branch>` when the remote moved ahead. A conflicted rebase is aborted, so the branch is left exactly as it was.
5. The `test` script from `package.json` runs when the script and `node_modules` are both present.
6. `git push`, only after the checks, the rebase and the tests all passed.

Sync works on one branch, never force-pushes and never resolves a conflict for you. It targets the project argument when one is given, and the current directory otherwise. Directories named in the debris list are not touched; only files at the repo root are.

## Output

Each line starts with `ok` or `fail`. A `fail` line names the path at fault, and the indented lines after it say what is wrong there. The exit code is `0` when every line is `ok` and `1` otherwise.

## Constraints

- Read only, except under `--sync`. That mode writes exactly one new commit, appends debris patterns to `.gitignore` when missing, and pushes.
- `--sync` never force-pushes, never amends and never resolves a rebase conflict. It aborts instead.
- No LLM steps.
