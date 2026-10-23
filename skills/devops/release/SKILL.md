---
name: release
description: Use when cutting a version of the project - bumping `package.json`, writing the `docs/releases/vX.Y.Z.md` changelog from the commits since the last tag, deleting finished plans, and committing + tagging + pushing so `ssg.yaml` deploys it. Triggers: "Release", "release", "cut a release", "bump version", "bump patch", "bump minor", "bump major", "выпустить версию", "новая версия", "зарелизить", "поднять версию", "релиз".
---

# Release

Versioning lives in `package.json` (`version`), the one source the workflow
reads. Every commit bumps `patch` through a husky pre-commit hook, so the tree
always carries a live number. A release is the deliberate commit that moves the
number further, writes the release note, clears finished plans, tags, and pushes.

Default release is **minor**. `patch` is explicit. `major` only when the user
asks for it, never assume.

The engine lives in this repository (`lib/release/*`), not in the project. The
project supplies the version manifest and the commit log.

## Script

Paths below are relative to this skill directory. In a shell that sits in the
project root, spell out the global mount:

```powershell
node "$env:USERPROFILE\.config\opencode\skills\devops\release\scripts\release.mjs" --json
```

```bash
node <this-skill>/scripts/release.mjs [patch|minor|major] [--plan] [--json] [--root <dir>]
node <this-skill>/scripts/release.mjs [patch|minor|major] --apply [--no-push] [--yes] [--json]
```

| flag | meaning |
|---|---|
| no flag | `--plan`: read only, writes nothing |
| `--apply` | write the manifest and the note, delete finished plans, commit, tag, push |
| `--json` | machine-readable plan or result, use it to branch |
| `--no-push` | stop after the tag |
| `--yes` | required to apply a `major` |
| `--root <dir>` | release a project other than the working directory |

## Two stages

`--plan` returns the whole decision as data, so you never re-derive it by hand:

```json
{
  "ok": true,
  "kind": "minor",
  "from": "1.10.0",
  "to": "1.11.0",
  "tag": "v1.11.0",
  "since": "v1.10.0",
  "commitCount": 7,
  "groups": [{ "key": "fix", "title": "Fixes", "emoji": "🐛", "count": 2 }],
  "plans": ["docs/plans/old-work.md"],
  "files": ["docs/releases/v1.11.0.md"],
  "needsConfirmation": false,
  "changelog": "# v1.11.0 - 2026-01-02\r\n..."
}
```

`ok: false` carries `error` and means stop. The usual cause is a tag that
already exists.

## Procedure

1. Plan with `--json` from the project root.
2. Show the user the version range, the group counts and the plans list.
3. For `major`, get an explicit yes, then pass `--yes`.
4. Apply: `--apply`, or `--apply --no-push` when the push is not wanted yet.
5. Verify: `git tag --points-at HEAD`, the pushed tag, and
   `docs/releases/vX.Y.Z.md`. `ssg.yaml` runs on the `v*` tag push, reads the
   version from `package.json`, and uses the note as the release body.

Never hand-edit the version to skip the flow, and never edit `ssg.yaml` to pass a
version: the workflow reads the file.

## Plans

A plan is a working document, not an archive. It appears while the work runs and
is meant to disappear once every item is checked, so the release deleting it is
normal and needs no extra permission. The plan lists them, so the deletion is
never silent.

`docs/plans/` may be tracked or gitignored. When it is tracked, the deletion
rides in the release commit. When it is ignored, the files still go from disk
and the commit has nothing to record, which is fine: the plan already showed the
list before `--apply`.

Finished means at least one `- [x]` and no open `- [ ]`. `lib/plans.mjs` is the
single predicate, shared with the `rollup` skill. A plan with an open box, or a
file with no checklist, stays.

## Project overrides

`skills.config.json` at the project root is optional and never required:

```json
{
  "release": {
    "releasesDir": "docs/releases",
    "plansDir": "docs/plans",
    "tagPattern": "v[0-9]*.[0-9]*.[0-9]*",
    "manifest": "package.json"
  }
}
```

`commit-convention.json` at the project root is separate, and the `commit-msg`
hook reads the same file:

```json
{
  "types": { "design": "interface" }
}
```

`types` maps an extra prefix to an existing group. `groups` replaces the group
list wholesale. Defaults cover Conventional Commits plus the area prefixes this
repo family uses (`content`, `service`, `agent`, `interface`, and so on).

## Hooks and the template copy

`scripts/version.mjs` and `scripts/commit-msg.mjs` in the project are copies of
`lib/templates/*`: a husky hook runs without this repository mounted, so it
cannot import `#lib/*`. Those copies are the one deliberate duplicate in the
setup. Reinstall them from the templates instead of editing them; `doctor` fails
when either drifts.

## Acceptance criteria

- [ ] `package.json` version is the only version the workflow reads.
- [ ] Every commit bumps `patch`; a release commit is not bumped again.
- [ ] `docs/releases/vX.Y.Z.md` exists and is the GitHub Release body.
- [ ] Commit prefixes group into the changelog; an unknown prefix lands in Other.
- [ ] Finished plans are deleted in the release commit, open ones stay.
- [ ] `lint`, `test`, `build` green.

## Failure modes

- `tag vX.Y.Z already exists`: pick the next number, or delete the stale tag.
- Pre-commit hook did not run: husky is not installed. Run `npm install`, which
  runs `prepare: husky`.
- `scripts/version.mjs` drifted from `lib/templates/version.mjs`: reinstall it
  from the template, do not patch the project copy.
- A leftover `scripts/release.mjs` means the project still uses the pre-lib
  layout. Use this skill's script and delete the copy.
