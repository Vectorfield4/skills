---
name: create-github-release
description: "Single-phase release: builds the package from main and publishes the artifact to GitHub Releases. No PR, no waiting; a CI pipeline can own this later."
---

# Create GitHub Release

Called for `type == "release"` tasks. Builds from `main` and publishes the
artifact to GitHub Releases. Idempotent — an existing release for the same tag
is reused, never overwritten.

There is **no PR and no human-approval gate**: the user's release request IS the
approval. If a CI pipeline later owns releases (build + publish on tag), this
skill degrades to "push the tag, CI builds and publishes".

## Steps

### 1. Checkout main and sync
- Ensure a clean worktree (`git status`), then:
  `git checkout main && git pull --ff-only`.
- A release is created for `main` HEAD unless the task names a specific commit.

### 2. Build the package
- Read build commands from the project (`AGENTS.md` / `package.json` scripts).
- Run the build (e.g. `npm run build`). On failure → report and stop.

### 3. Determine version and tag
- Version from `package.json`, or the highest existing tag + 1.
- Tag: `v<version>`. Verify it is not already used: `git tag -l "v<version>"`.

### 4. Create the GitHub Release with the artifact
- Archive the build output: `zip -r /tmp/<project>-<version>.zip <artifact dir>`.
- Create (idempotent):
  - Tag exists → reuse it; do not recreate the release if one already exists —
    report the existing release URL instead.
  - Tag missing → `git push origin v<version>`, then
    `gh release create v<version> /tmp/<project>-<version>.zip --title "v<version>" --notes "Release <project> v<version>"`.
- If CI auto-builds on tags, just push the tag and skip the local artifact step.

### 5. Complete
- Report the release URL.
- Best-effort: store the verified release pattern in memory
  (`pgvec_remember`, tag `release-verified`, TTL 90d).

## Verification

- Build succeeded and the artifact was archived (or handed to CI).
- Release exists (created or reused) and the URL is reported.
- No existing release/tag was overwritten.