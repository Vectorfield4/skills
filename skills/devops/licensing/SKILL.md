---
name: licensing
description: "Applies the Login AI sublicense under the Vectorfield4 Main License. Adds LICENSE, LICENSE-LOGIN-AI and COPYRIGHT, sets the package author and license fields, updates README, site UI, API and dataset metadata, and removes third-party attribution after approval. Triggers: licensing, license project, relicense, Login AI License, Vectorfield4 license, лицензировать проект, лицензия Login AI, сублицензия."
---

# Licensing

Apply the approved license hierarchy to a project and its dataset:

- Vectorfield4 Main License (MIT), held by Filipp Kuksov (Vectorfield4). This is
  the main license and it is never replaced.
- Login AI License, a sublicense granted under the main license.

Use only the texts in `references/vectorfield4-main-license.txt` and
`references/login-ai-license.txt`. Never invent, shorten or reword license
terms.

## Preconditions

1. Read `references/legal-approval.md` and confirm the approved scope covers the
   project and its dataset.
2. Confirm both reference files contain the approved legal text. Stop when either
   file contains a placeholder or a TODO marker.
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
- `--apply` writes the main license, the sublicense, `COPYRIGHT`, the package
  author and license fields, and the dataset source metadata. Then it runs the
  same checks.
- `--config <path>` reads an explicit project config.
- `--license <path>` overrides the sublicense text for one run.

## Steps

1. Run `--check` and record every error, file and forbidden string.
2. Run `--apply` to create the mechanical artifacts.
3. Update the project UI and documentation that the script does not own:
   - footer copyright, author and license link;
   - About page and a `/license/` page that shows both licenses;
   - README license section with the hierarchy;
   - API license and copyright headers or metadata.
4. Remove third-party source links, source names and attribution from the
   application only when the legal approval covers them.
5. Delete the pipeline that downloads or derives data from third-party sources
   when the dataset is now canonical. Remove its package script.
6. Run `--check` again. Every error must be resolved. Warnings need a written
   reason in the final report.
7. Run the project build and tests.

## License hierarchy

- `LICENSE` holds the Vectorfield4 Main License.
- `LICENSE-LOGIN-AI` holds the Login AI Sublicense.
- `COPYRIGHT` holds `© 2026 Login AI`.
- `package.json` sets `license` to `Login AI` unless the field already names
  Vectorfield4 or Login AI. In that case the existing value stays.
- `package.json` sets `author` to the configured object unless the field already
  names Vectorfield4 or Login AI.
- The dataset source object keeps the owner and author as Vectorfield4, and
  records `license: "Login AI License"` plus
  `mainLicense: "Vectorfield4 Main License"`.

Do not rewrite Vectorfield4 to Login AI. Do not replace the main license.

## Dataset rules

- Keep the owner and author as Vectorfield4 and Filipp Kuksov.
- The dataset source object becomes `name: "Vectorfield4"`,
  `author: "Filipp Kuksov"`, `license: "Login AI License"`,
  `licenseUrl: "/license/"`, `mainLicense: "Vectorfield4 Main License"` and the
  configured copyright line.
- Remove fields named in `stripItemFields` from every dataset item.
- Do not keep an external source URL in the dataset metadata.
- Keep official regulatory citations such as EFSA opinions unless the approval
  explicitly removes them.

## Validation

- `node scripts/license.mjs <project> --check` exits 0.
- `LICENSE` contains the Vectorfield4 Main License.
- `LICENSE-LOGIN-AI` contains the Login AI Sublicense, both contacts and the AI
  and commercial-use restrictions.
- `package.json` uses `license: "Login AI"` unless Vectorfield4 or Login AI is
  already present, and carries the configured author object.
- No forbidden string remains in the configured include paths.
- The dataset has no stripped fields and no third-party source metadata.
- The project build passes.
- In this repository, run `npm test` after changing the skill itself.

## Output

The script prints one JSON manifest with `project`, `mode`, `ok`, `applied`,
`scanned`, `errors` and `warnings`. Progress goes to stderr, so the manifest can
be piped to `jq` or `ConvertFrom-Json`.

## Constraints

- Never edit or paraphrase either license text.
- Never relicense the Vectorfield4 Main License under Login AI.
- Never remove a dependency license or a third-party package notice.
- Never touch `node_modules` or generated build output.
- Never claim legal approval that is not recorded in
  `references/legal-approval.md`.
- Run the `unslop` skill after every text change to this skill.
