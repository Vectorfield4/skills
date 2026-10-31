# Extract types to `lib/<domain>`

Moves TypeScript domain contracts that are scattered across a project into one
place — `%skills_repo%/lib/<domain>/*.ts` — so the YAML reader, the
questionnaire generator and any other tool can read a single source of truth.

## When to use

- A project has `interface`/`type` declarations describing domain data in
  several files and the same shape is needed by a skill.
- A new domain contract is being added and should land in `lib/` from the
  start.
- After a refactor, to check that no duplicate or drifting copy of a type
  remains.

## Job

One pass, dry-run by default:

1. Walk `--from` and collect every `export interface` and `export type` block.
2. Group them by source file and propose `lib/<domain>/<kebab-basename>.ts`.
3. Report duplicates (same name declared twice), conflicts (target already
   exists) and external references (a type that imports from another file).
4. With `--write`, move the blocks, leave a re-export in the source and
   create the target file. Without `--write`, print the plan only.

## Usage

```bash
node skills/mlops/extract-types-to-lib-domain/scripts/extract.mjs \
  --from D:\docs\GitHub\skills \
  --domain content \
  [--write] [--overwrite] [--allow-external] [--json]
```

Flags:

- `--from <path>` — directory to scan. Required.
- `--domain <name>` — target domain under `lib/`. Required.
- `--write` — apply the plan. Default: dry-run.
- `--overwrite` — replace an existing target file instead of reporting a conflict.
- `--allow-external` — allow `--write` when `--from` is outside the skills repo.
  The source is then copied, not rewritten, and the script prints a note.
- `--json` — machine-readable plan on stdout.

## Safety rules (these are not optional)

- Dry-run is the default. Nothing is written without `--write`.
- `--from` outside the skills repo refuses `--write` unless `--allow-external`
  is passed; even then the source is only copied, never rewritten, because a
  cross-repository rewrite is not reversible.
- A target that already exists is a conflict, not an overwrite, unless
  `--overwrite` is passed.
- Duplicate type names are reported and block `--write`.
- Only `export interface` and `export type` blocks are moved. Runtime code,
  imports, `enum`, `namespace` and `class` stay where they are.
- The moved contract must stay erasable TypeScript: no `enum`, no namespace,
  no class, no function type, one member per line. The reader in
  `lib/yaml/typescript.mjs` enforces the same subset, so a contract that does
  not fit it is reported, not moved silently.
- Imports that referenced a moved type are rewritten to a relative re-export
  only when both files live in the same repository.

## Rules

- One domain per run. Mixing `content` and `yaml` in one pass hides drift.
- Run the reader tests after a write: `npm test`.
- Never move a type that is imported by a `.mjs` script as a value; types are
  `import type` only.

## Validation

- `node --check scripts/extract.mjs`
- In the skills repo: `npm test`
