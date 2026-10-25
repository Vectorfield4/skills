---
name: create-skill
description: "Creates a new skill in the centralized skills repo. Use when adding a skill, scaffolding a SKILL.md, or registering a new capability. Triggers: create skill, new skill, scaffold skill, add skill, register capability."
---

# Create skill

Follow these instructions when adding a new skill to the centralized skills repo.

## Location

- Path: `skills/<domain>/<skill-name>/SKILL.md`.
- Use an existing folder under `skills/` (ai, backend, content, creative, data, devops, frontend, quality). Add a new domain only with justification.
- Use kebab-case for the skill name.
- Optional scripts live under `skills/<domain>/<skill-name>/scripts/`.
- Never create a skill inside a project or under `.opencode`.

## Frontmatter

- Required fields: `name` (kebab-case, matches directory name) and `description`.
- Put prose and triggers in `description` only.
- Wrap description in quotes when it contains colons or special characters.

## Body

- Write strict instructions. No narrative prose outside the description.
- Use sentence case headings.
- No em dashes. Use periods or commas.
- Run the `unslop` skill on all text before committing.

## Shared code

- Put shared code in `lib/` at repo root.
- Import it through the `#lib/*` alias, for example `import { isEntryPoint } from "#lib/cli.mjs";`.
- Never use relative climbs such as `../../lib/...`.
- Never use package-name specifiers for repo code.
- Entry points detect themselves with `isEntryPoint(import.meta.url)` from `#lib/cli.mjs`.

## Dependency direction

- Common skills must not reference any project repository (hellorobot, loginai).
- Repository-specific skills may depend on common skills and libs. The reverse is forbidden.
- Keep common skills generic and reusable.

## Single responsibility

- Split search or discovery skills from publish-to-storage skills.
- No cross-links between those two kinds.
- One skill, one job.

## Parallel creation

- Create each independent skill in a separate subagent.
- Run the subagents in parallel when their files do not overlap.
- Give each subagent a complete file list, the constraints, and the lib imports it may use.
- Review the output, run `unslop`, then run `npm test`.

## Scripts

- Scripts open project files relative to `process.cwd()` when the files belong to the project.
- Accept absolute paths for project files and document them in `SKILL.md`.
- Engine imports always come from this repo through `#lib/*`.
- Entry points use `isEntryPoint` from `#lib/cli.mjs`.
- Inside `SKILL.md` write script paths relative to the skill directory.
- In a shell outside the skill, spell out the path to the script.

## Validation

- Run `npm test`. The module graph test must pass.
- Confirm every `#lib/*` import resolves to an existing file.
- Confirm no relative climb into `lib/` or package-name specifier appears in skill scripts.

## No local opencode

- Do not create `.opencode` in any project.
- Load skills from the global mount only.

## Checklist

- [ ] Directory created at `skills/<domain>/<skill-name>/`.
- [ ] `SKILL.md` written with valid frontmatter.
- [ ] `name` is kebab-case and matches the directory.
- [ ] `description` includes triggers.
- [ ] Body uses strict instructions and sentence case headings.
- [ ] No em dashes anywhere.
- [ ] `unslop` applied to all text.
- [ ] Shared code uses `#lib/*`, no relative climbs.
- [ ] Entry points use `isEntryPoint`.
- [ ] No references to project repositories in common skills.
- [ ] Search and publish skills are separate.
- [ ] Independent skills were built in separate parallel subagents.
- [ ] Scripts use `process.cwd()` for project files.
- [ ] `npm test` passes.
- [ ] No `.opencode` directory created in projects.

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
