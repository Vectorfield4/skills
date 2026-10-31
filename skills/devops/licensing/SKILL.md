---
name: licensing
description: "Licenses an entire project and its dataset under the Login AI License. Adds LICENSE and COPYRIGHT, updates package, README, site UI and API metadata, and removes third-party attribution after approval. Triggers: licensing, license project, relicense, Login AI License, лицензировать проект, лицензия Login AI."
---

# Licensing

Apply the approved Login AI License to a project and its dataset. Use only the
text in `references/login-ai-license.txt`. Never invent, shorten or reword
license terms.

## Preconditions

1. Read `references/legal-approval.md` and confirm the approved scope covers the
   project and its dataset.
2. Confirm `references/login-ai-license.txt` contains the signed legal text.
   Stop when it contains a placeholder or a TODO marker.
3. Read the project `.login-ai-license.json` when present. Otherwise copy
   `references/project-config.example.json` to the project root and adjust the
   dataset path, include list and forbidden strings.

## Run

The skill has one entry point. Run it from the skill directory or through the
global mount.

```powershell
node scripts/license.mjs <project> --check
node scripts/license.mjs <project> --apply
```

- `--check` is the default. It prints one JSON manifest and exits 1 on errors.
- `--apply` writes `LICENSE`, `COPYRIGHT`, the package license field and the
  dataset source metadata, then runs the same checks.
- `--config <path>` reads an explicit project config.
- `--license <path>` overrides the canonical license text for one run.

## Steps

1. Run `--check` and record every error, file and forbidden string.
2. Run `--apply` to create the mechanical artifacts.
3. Update the project UI and documentation that the script does not own:
   - footer copyright and license link;
   - About page and a `/license/` page with the canonical text;
   - README license section;
   - API license and copyright headers or metadata.
4. Remove third-party source links, source names and attribution from the
   application only when the legal approval covers them.
5. Delete the pipeline that downloads or derives data from third-party sources
   when the dataset is now canonical for Login AI. Remove its package script.
6. Run `--check` again. Every error must be resolved. Warnings need a written
   reason in the final report.
7. Run the project build and tests.

## Dataset rules

- The dataset source object becomes `name: "Login AI"`,
  `license: "Login AI License"`, `licenseUrl: "/license/"` and the configured
  copyright line.
- Remove fields named in `stripItemFields` from every dataset item.
- Do not keep an external source URL in the dataset metadata.
- Keep official regulatory citations such as EFSA opinions unless the approval
  explicitly removes them.

## Validation

- `node scripts/license.mjs <project> --check` exits 0.
- `LICENSE` exists and contains `Login AI License`.
- `package.json` uses `SEE LICENSE IN LICENSE`.
- No forbidden string remains in the configured include paths.
- The dataset has no stripped fields and no third-party source metadata.
- The project build passes.
- In this repository, run `npm test` after changing the skill itself.

## Output

The script prints one JSON manifest with `project`, `mode`, `ok`, `applied`,
`scanned`, `errors` and `warnings`. Progress goes to stderr, so the manifest can
be piped to `jq` or `ConvertFrom-Json`.

## Constraints

- Never edit or paraphrase the license text.
- Never remove a dependency license or a third-party package notice.
- Never touch `node_modules` or generated build output.
- Never claim legal approval that is not recorded in
  `references/legal-approval.md`.
- Run the `unslop` skill after every text change to this skill.
