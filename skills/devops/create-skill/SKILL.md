---
name: create-skill
description: "Creates a new skill in the centralized skills repo. Use when adding a skill, scaffolding a SKILL.md, or registering a new capability. Triggers: create skill, new skill, scaffold skill, add skill, register capability."
---

# Create skill

Follow these instructions when adding a new skill to the centralized skills repo.

## Location

- Path: `skills/<domain>/<skill-name>/SKILL.md`.
- Use an existing folder under `skills/` (ai, backend, content, creative, data, devops, frontend, quality). Prefer an existing domain and add a new one with justification.
- Use kebab-case for the skill name.
- Keep optional scripts under `skills/<domain>/<skill-name>/scripts/`.
- Keep every skill inside the centralized repo, under `skills/<domain>/`.

## Frontmatter

- Required fields: `name` (kebab-case, matches directory name) and `description`.
- Put prose and triggers in `description` only.
- Wrap description in quotes when it contains colons or special characters.

## Body

- Write strict instructions; keep narrative prose in the description.
- Use sentence case headings.
- Use periods and commas in place of em dashes.
- After every change to skill text, run the `unslop` skill on it before committing.

## Shared code

- Put shared code in `lib/` at repo root.
- Import repo code through the `#lib/*` alias in every file, for example `import { isEntryPoint } from "#lib/cli.mjs";`.
- Entry points detect themselves with `isEntryPoint(import.meta.url)` from `#lib/cli.mjs`.

## Dependency direction

- Keep common skills generic and reusable.
- Common skills reference only this repo's skills and libs.
- Repository-specific skills may depend on common skills and libs.

## Single responsibility

- Split search or discovery skills from publish-to-storage skills.
- Keep the two kinds independent of each other.
- One skill, one job.

## Parallel creation

- Create each independent skill in a separate subagent.
- Run the subagents in parallel when their files are disjoint.
- Give each subagent a complete file list, the constraints, and the lib imports it may use.
- Review the output, run `unslop`, then run `npm test`.

## Scripts

- Scripts open project files relative to `process.cwd()` when the files belong to the project.
- Accept absolute paths for project files and document them in `SKILL.md`.
- Inside `SKILL.md` write script paths relative to the skill directory.
- Expose one entry point and document that command for the caller (see One entry point).

## Progressive disclosure

- A script is mentioned in exactly one place: its own SKILL.md, with a path relative to the skill directory.
- README.md and agent/*.md reference the skill by name; the skill's SKILL.md provides the command.
- Agent prompts and README files name the skill.

## One entry point

- A skill whose scripts run in order has one entry script that sequences them, stops on the first failure, and prints one JSON manifest on stdout while progress goes to stderr.
- Expose that entry through the project as a single command, for example `npm run <name> -- --region ...`, and document only the command.
- Run a single stage as a flag on the same entry (`--stages <name>`).
- The entry resolves paths to scripts in other skills itself and reports a missing one by name.
- Describe every run as one command with stage flags.

## Validation

- Run `npm test`. The module graph test must pass.
- Confirm every `#lib/*` import resolves to an existing file.
- Confirm every repo import in skill scripts uses `#lib/*`.

## Global mount

- Load skills from the global mount only.
- Keep every skill in the centralized repo.

## Checklist

- [ ] Directory created at `skills/<domain>/<skill-name>/`.
- [ ] `SKILL.md` written with valid frontmatter.
- [ ] `name` is kebab-case and matches the directory.
- [ ] `description` includes triggers.
- [ ] Body uses strict instructions and sentence case headings.
- [ ] Em dashes replaced with periods and commas.
- [ ] `unslop` applied after the last text change.
- [ ] Shared code imported through `#lib/*`.
- [ ] Entry points use `isEntryPoint`.
- [ ] Common skills stay generic and free of project repository names.
- [ ] Search and publish skills kept separate.
- [ ] Independent skills were built in separate parallel subagents.
- [ ] Scripts use `process.cwd()` for project files.
- [ ] The skill exposes one entry point documented as a single project command.
- [ ] `npm test` passes.
- [ ] Skills live in the centralized repo under the global mount.

## Minimal template

```markdown
---
name: <skill-name>
description: "<one line purpose>. Triggers: <trigger1>, <trigger2>."
---

# <Skill title>

<Strict instructions.>

## Steps

1. ...
2. ...

## Validation

- `npm test`
```
