---
name: doctor
description: "Checks the global skill mounts and a project for leftovers: local .opencode, a drifted hook copy, engine files that moved into skills. Triggers: doctor, check mounts, health check, проверить монтирование, остатки .opencode."
---

# Doctor

Find what stops the shared skills from loading, in the repo or in a project.

## Run

```bash
node skills/devops/doctor/scripts/doctor.mjs
node skills/devops/doctor/scripts/doctor.mjs <project>
```

Through the global mount, from any directory:

```powershell
node "$env:USERPROFILE\.config\opencode\skills\devops\doctor\scripts\doctor.mjs" <project>
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

## Output

Each line starts with `ok` or `fail`. A `fail` line names the path at fault, and the indented lines after it say what is wrong there. The exit code is `0` when every line is `ok` and `1` otherwise.

## Constraints

- Read only. Repair is the caller's work.
- No LLM steps.
