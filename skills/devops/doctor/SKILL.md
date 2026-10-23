---
name: doctor
description: "Verifies the global skills and agent mounts and fails when a project carries its own .opencode directory. Triggers: doctor, check mounts, health check, проверить монтирование, остатки .opencode."
---

# Doctor

Check that skills load from the global mount and that a project keeps no local `.opencode`.

## Steps

1. Run the script from the skills repo root:

   ```bash
   node skills/devops/doctor/scripts/doctor.mjs
   node skills/devops/doctor/scripts/doctor.mjs <project>
   ```

   Or from any directory through the global mount:

   ```powershell
   node "$env:USERPROFILE\.config\opencode\skills\devops\doctor\scripts\doctor.mjs" <project>
   ```

2. Read the `fail` lines. Each one names the path to repair.
3. Delete a local `.opencode` in the project, tracked or ignored:

   ```powershell
   Remove-Item -LiteralPath <project>\.opencode -Recurse -Force
   ```

4. Recreate a broken global mount from `~/.config/opencode`, pointing into this repo:

   ```powershell
   New-Item -ItemType Junction -Path skills -Target <repo>\skills
   New-Item -ItemType Junction -Path agent -Target <repo>\agent
   ```

5. Repair a drifted hook copy by reinstalling it from the template:

   ```powershell
   node <repo>\skills\devops\setup-ci\scripts\install-version-hook.mjs <project>
   ```

6. Delete a leftover engine copy that moved into a skill, and use the skill command instead.

7. Run the doctor again until it prints `doctor: ok`.

## Checks

- `skills/` and `agent/` exist in this repo.
- `~/.config/opencode/skills` and `~/.config/opencode/agent` are symlinks resolving into this repo. `OPENCODE_CONFIG_DIR` overrides the config directory.
- The known skills carry a `SKILL.md` through the mount.
- With a project argument, `<project>/.opencode` must not exist at all. Tracked entries, ignored entries and an empty directory fail the same way.
- With a project argument, `<project>/scripts/version.mjs` must match `lib/templates/version.mjs` apart from line endings. A husky hook cannot import `#lib/*`, so the project carries a copy; this check is what stops the copies from drifting.
- With a project argument, the engine files that moved into skills must be gone from the project: `scripts/release.mjs`, `scripts/changelog.mjs`, `scripts/commit-convention.mjs`. A copy is a fork.

## Exit codes

- `0`: every check passed.
- `1`: at least one `fail` line.

## Constraints

- Read only, except for the repair steps run by hand.
- No LLM steps.
