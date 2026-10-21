---
name: skill-refactor
description: "Audits and refactors the centralized skills/agent repository for unification: fixes broken cross-skill references, normalizes frontmatter, parameterizes project-specific paths, adds agent names, and applies unslop. Use when unifying skills after migration or when references/paths/frontmatter are inconsistent."
---

# Skill Refactor

Refactor the centralized skills and agent repository for maximum ROI with minimal risk. Operate only inside `D:\docs\GitHub\skills`.

## ROI order

1. Quick wins: fix broken cross-skill references, normalize frontmatter, add `name` to agents.
2. Medium impact: parameterize project-specific paths in high-traffic skills.
3. Final polish: apply `unslop` to all `SKILL.md` and agent files, then validate.

## Inputs

- Central repo root: `D:\docs\GitHub\skills`
- Domain map: `skills/<domain>/<skill>/SKILL.md`
- Agent map: `agent/<domain>/<agent>.md`

## Step 1: Inventory

1. List all `SKILL.md` under `skills/`.
2. List all `.md` under `agent/`.
3. Verify each `SKILL.md` starts with valid YAML frontmatter containing `name` (kebab-case) and `description`.
4. Record missing or duplicate names.

## Step 2: Fix cross-skill references

Broken references caused by domain layout. Update:

- `content/content-strategist`: `execute-task/references/prose-quality.md` → `devops/execute-task/references/prose-quality.md`
- `content/narrative-designer`: same replacement.
- `content/write-service`: `write-article/references/jev.md` → `../write-article/references/jev.md`
- `content/write-solution`: same replacement.

Rule: any reference crossing domains must use `../<domain>/<skill>/...` or an absolute central path.

## Step 3: Parameterize project-specific paths

In high-traffic skills, replace hardcoded project assumptions with placeholders:

- `/workspace/<project>` stays as placeholder; never replace with a real project.
- `src/entities/...`: keep as an example only, clearly marked as the content-project layout.
- `lib/jev`, `lib/prose`: this repository's shared engine; a skill imports it
  through the `#lib/*` alias (`#lib/jev/findings.mjs`). Do not copy it into a skill,
  climb into it with `../../../../lib/`, or reintroduce a package name.
- Bare `@scope/*` specifiers are legacy from the extraction: rewrite them to
  `#lib/*` on sight.
- Another project's capability paths: keep as examples, marked as that project's
  layout.

Priority files:

- `devops/orchestrate-task/SKILL.md`
- `devops/execute-task/SKILL.md`
- `devops/execute-review/SKILL.md`
- `devops/execute-qa-task/SKILL.md`
- `devops/project-discover/SKILL.md`
- `devops/project-init/SKILL.md`

## Step 4: Normalize agent metadata

Add a `name` field to every agent frontmatter using kebab-case matching the file name:

- `agent/creative/art-agent.md` → `name: creative-art-agent`
- `agent/marketing/competitor-scout.md` → `name: marketing-competitor-scout`
- `agent/content/prose-critic.md` → `name: content-prose-critic`
- `agent/content/service-critic.md` → `name: content-service-critic`

## Step 5: Apply unslop

Run the `unslop` skill on every `SKILL.md` and agent `.md`:

1. Scan for AI tells, filler, repeated phrasing.
2. Rewrite while preserving meaning and triggers.
3. Keep frontmatter intact.
4. Keep code blocks and paths unchanged.

## Step 6: Validate

1. All `SKILL.md` have valid frontmatter with unique kebab-case `name`.
2. All agent `.md` have `name`.
3. All relative cross-skill references resolve under `skills/`.
4. No accidental edits to project repositories.
5. `git status` shows only intended changes in `D:\docs\GitHub\skills`.

## Safety

- Edit only files under `D:\docs\GitHub\skills`.
- Do not follow symlinks back into project repositories.
- Do not remove skill content, only normalize references and prose.
- Preserve triggers and code blocks.

## Output

Return a short report: files changed, references fixed, names added, and remaining project-specific assumptions.