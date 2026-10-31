---
name: refactoring
description: "Refactors a project's directory structure for extensibility in five gated phases: restore the tooling, inventory the tree, plan the moves, apply them, verify every gate. Use when a project needs a structural pass, when new slices have nowhere predictable to land, or when the tree no longer matches its layer contract. Triggers: refactoring, refactor structure, directory structure, рефакторинг структуры, рефакторинг каталогов."
---

# Refactoring

Run the phases in order, on one project, at the path given to every command.

## Phase 0: restore

1. Resolve the skills repository physically. Through the mount it is the target of `~/.config/opencode/skills`, never the symlink itself.
2. Run `node <repo>/skills/devops/doctor/scripts/doctor.mjs <project>`.
3. Stop when doctor exits non-zero. Repair every `fail` line with the table below, then run doctor again until it prints `doctor: ok`.

| Finding | Repair |
| --- | --- |
| `.opencode` present | Delete the directory. Skills and agents load from the global mount only. |
| `scripts/version.mjs` missing or drifted | Reinstall it from `lib/templates/version.mjs`. |
| `scripts/commit-msg.mjs` drifted | Reinstall it from `lib/templates/commit-msg.mjs`. |
| `scripts/release.mjs` present | Delete it. |
| `scripts/changelog.mjs` present | Delete it. |
| `scripts/commit-convention.mjs` present | Delete it. |
| hooks missing | Install them through `installGitHooks(root)` from `lib/git-hooks.mjs`, the same call `skills/devops/setup-ci/scripts/install-git-hooks.mjs` makes. |

A dirty base makes every later finding false: an unfixed leftover is reported after the moves and looks like damage the moves caused. Do not start Phase 1 on a failing doctor.

## Phase 1: inventory

1. Run the wrapper for the host shell:

```powershell
scripts/refactoring_named_part1.ps1 <project> --out artifacts/refactor/inventory.json
```

```sh
scripts/refactoring_named_part1.sh <project> --out artifacts/refactor/inventory.json
```

2. Read `contract`, `stats` and `violations` from the report. `contract.source` says which document defines the layers: `AGENTS.md`, `docs/frontend/atomic-design.md` or `default`.
3. Read `stats.files`, `stats.sourceFiles`, `stats.byLayer` and `stats.byLevel` as the baseline the report phase compares against.
4. Read every violation. Kinds are `file-outside-layer`, `import-upward`, `layer-cycle` and `atomic-level-mismatch`.
5. Stop when `ok` is false or `error` is set: the path is not a project directory.
6. Treat `truncated: true` as an incomplete walk. Raise `--max-files` and run again before planning.

The inventory reports facts only. It never proposes a move.

## Phase 2: plan

1. Write `artifacts/refactor/plan.md` in the project.
2. One row per move, in a table with the columns `from | to | reason | risk | order`.
3. Group the rows by layer in layer order from `contract.layers`, top layer first.
4. Order the rows inside a group from leaves to roots: a file with no dependents moves before a file that imports it.
5. Name the reason as the violation the move clears, or `extensibility` with the slice that becomes possible.
6. Name the risk as `low`, `medium` or `high`, plus the dependent count from the inventory edges.
7. Nothing moves in this phase. The plan is the only artifact.

## Phase 3: apply

1. Move one layer per commit with `git mv`, in the order the plan sets. A mixed commit cannot be rolled back one layer at a time.
2. Rewrite the imports the moves break, both `@/` specifiers and relative specifiers.
3. Never rewrite a `#lib/*` specifier. It resolves through the skills repository, not through the project.
4. Keep the behaviour unchanged.
5. Rewrite no file content beyond the import specifiers.
6. Rename no fixture. A fixture name is data, not structure.
7. Commit each layer with a `refactor(<layer>):` message and no other change in the same commit.

## Phase 4: verify

Run every gate below, in this order, after the last commit of the pass. A changed gate result against its baseline rolls the commit back.

1. `npm run lint` in the project.
2. `npm run test` in the project.
3. `npm run verify` in the project.
4. `node <repo>/skills/content/write-article/scripts/audit.mjs` before the pass and after it. The set of `problems` must be equal.
5. `node <repo>/skills/content/write-service/scripts/audit.mjs` before the pass and after it. The set of `problems` must be equal.
6. `node <repo>/skills/content/shop-report/scripts/report.mjs --run <new> --diff <old> --catalog products/catalog.json`. The run must print `catalog: без изменений`.
7. `node <repo>/skills/quality/code-quality/scripts/jev-review.mjs <moved paths> --advisory`. Candidates are advisory, not a blocker.

A gate that was not run is not a pass.

## Phase 5: report

1. Write `artifacts/refactor/report.json` in the project with the before and after `stats`, every violation cleared, every violation left, the gate results and the commits of the pass.
2. Answer with a table of moved paths, the violation each move cleared, and the gate results.
3. Run doctor again on the project and compare it with the Phase 0 result. Both runs must print `doctor: ok`.

## Boundaries

- This skill never touches the skills repository. A refactor of this repository belongs to `skill-refactor`.
- This skill never creates `.opencode` in the project or anywhere else.
- This skill never calls an LLM, so the same tree always produces the same inventory.

## Scripts

- `scripts/refactoring_named_part1.ps1 <project> [--out <file>] [--max-files N]`
- `scripts/refactoring_named_part1.sh <project> [--out <file>] [--max-files N]`

Both wrappers resolve the repository through the real path of the mount and forward every argument to `lib/refactor/utilities/inventory.mjs`. The engine prints one JSON document on stdout and exits 0 with a report, 1 when the path is not a directory, 2 on bad usage.

## Validation

- The inventory runs on a clean tree and reports the same violations twice.
- Every move in the plan is applied by `git mv` in its own layer commit.
- Every gate in Phase 4 ran, and no gate result changed against its baseline.
- Doctor passes before and after the pass.
- `npm test` in this repository.
