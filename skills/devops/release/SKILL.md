---
name: release
description: Use when cutting a version of the project — bumping `package.json`, writing the `docs/releases/vX.Y.Z.md` changelog from the commits since the last tag, deleting finished plans, and committing + tagging + pushing so `ssg.yaml` deploys it. Triggers: "Release", "release", "cut a release", "bump version", "bump patch", "bump minor", "bump major", "выпустить версию", "новая версия", "зарелизить", "поднять версию", "релиз".
---

# Release

Versioning lives in `package.json` (`version`) — the one source the workflow
reads. Every commit bumps `patch` through a husky pre-commit hook, so the tree
always carries a live number. A release is the deliberate commit that moves the
number further, writes the changelog, clears finished plans, and tags the result.

Default release is **minor**. `patch` is explicit. `major` only when the user asks
for it — never assume.

## Scripts

Run from the repo root.

```
node scripts/version.mjs get
node scripts/version.mjs bump [patch|minor|major]
node scripts/version.mjs set <x.y.z>
node scripts/changelog.mjs <version> [--since <tag>] [--date YYYY-MM-DD]
node scripts/release.mjs [patch|minor|major] [--dry-run] [--no-push] [--yes]
```

- **`release.mjs`** — bump, write `docs/releases/vX.Y.Z.md`, delete finished
  plans, `git add -A`, commit `chore(release): vX.Y.Z`, `git tag vX.Y.Z`, push the
  branch and the tag. `--dry-run` prints the changelog and the plan list without
  writing; `--no-push` stops after the tag.
- **`changelog.mjs`** — the release note: commits since the last `vX.Y.Z` tag,
  grouped into English sections (🚀 Features, 📰 Content, 🧩 Services & Solutions,
  🤖 Skills & Agents, 🎨 Interface, 📝 Documentation, 🐛 Fixes, ♻️ Refactoring,
  ⚙️ Maintenance, 🧺 Other) from the prefixes in `scripts/commit-convention.mjs`.
- **`version.mjs`** — the number itself and the `hook` subcommand behind husky.

## Procedure

1. Pick the bump. No argument means `minor`. `patch` for a hotfix release,
   `major` only on the user's explicit word.
2. Preview: `node scripts/release.mjs <kind> --dry-run`. Read the changelog and
   the finished-plan list it prints.
3. For `major`, confirm with the user, then pass `--yes`.
4. Run it: `node scripts/release.mjs <kind>`. It commits, tags and pushes.
5. Confirm: `git tag --points-at HEAD` and the pushed tag; `ssg.yaml` runs on the
   `v*` tag push, reads the version from `package.json`, and uses
   `docs/releases/vX.Y.Z.md` as the release body.

Never hand-edit the version to skip the flow, and never edit `ssg.yaml` to pass a
version — the workflow reads the file.

## Finished plans

A plan is finished when it still has checked items and no open `- [ ]` — the same
condition as the `rollup` skill. `release.mjs` deletes those files in the release
commit. Before deleting, show the list from the `--dry-run` and confirm with the
user; a plan with an open box stays.

## Changes to the convention

A new commit prefix is one edit in `scripts/commit-convention.mjs` — it feeds both
the `commit-msg` validator and the changelog grouping. The husky hooks
(`.husky/pre-commit`, `.husky/commit-msg`) call `scripts/version.mjs` and
`scripts/commit-msg.mjs`.

## Acceptance criteria

- [ ] `package.json` version is the only version the workflow reads.
- [ ] Every commit bumps `patch`; a release commit is not bumped again.
- [ ] `docs/releases/vX.Y.Z.md` exists and is the GitHub Release body.
- [ ] Commit prefixes pass `commit-msg`; the changelog groups them.
- [ ] Finished plans are deleted in the release commit.
- [ ] `lint`, `test`, `verify` green.

## Failure modes

- Pre-commit hook did not run: husky is not installed — `npm install` (runs
  `prepare: husky`).
- `commit-msg` rejected a prefix: unknown prefix — add it to
  `scripts/commit-convention.mjs`, or use an accepted one.
- `release.mjs` complains about a missing changelog body: the version in
  `package.json` has no `docs/releases/vX.Y.Z.md`; run the release flow, do not
  bump by hand.
- Two releases on one day: the tag already exists — pick the next number or
  delete the stale tag.
