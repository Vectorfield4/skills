---
name: code-quality
description: Use when reviewing source code for design quality with the Jev System One gate — SOLID (SRP, OCP, LSP, ISP, DIP) and separation of concerns. Extracts top-level functions and classes from TS/JS files and prints advisory candidates. Triggers: "CodeQuality", "code quality", "SOLID", "single responsibility", "separation of concerns", "проверить код на SOLID", "качество кода", "разделение ответственности".
---

# CodeQuality

An advisory design gate over source code. It extracts the top-level functions,
arrow functions and classes of each file and asks the TypeSafe System One model
`Jev` (`typesafe:jev@1`) which single design principle — SRP, OCP, LSP, ISP, DIP
or separation of concerns — each unit most clearly violates. It labels
candidates; it never explains, ranks or rewrites them.

The engine is shared: `lib/jev/` (transport, thresholds, question factories,
findings, report, CLI). This skill owns only its rubrics
(`scripts/jev-prompts.mjs`), its extractor (`scripts/jev-lines.mjs`) and its CLI
wiring (`scripts/jev-review.mjs`).

## Scripts

Run from the repo root.

```
node .opencode/skills/quality/code-quality/scripts/jev-review.mjs <path...> [--json] [--advisory] [--min-confidence 0.5]
node .opencode/skills/quality/code-quality/scripts/jev-review.mjs --stdin [--json] [--advisory]
```

- A path is a file or a directory; a directory is walked recursively for
  `.ts/.tsx/.js/.jsx/.mjs/.cjs`, skipping `node_modules`, `dist`, `.git`, `build`,
  `coverage`.
- Prints `[<file>:<line>] <PRINCIPLE>_CANDIDATE (<confidence>) — <code>` per unit.
  Exits 1 when candidates exist, unless `--advisory`.
- `--stdin` reviews a pasted fragment instead of files.
- Without `RUNWARE_API_KEY` it prints a skip notice and exits 0, so it is safe in
  CI.

## Reading the output

Rules: `SRP_CANDIDATE`, `OCP_CANDIDATE`, `LSP_CANDIDATE`, `ISP_CANDIDATE`,
`DIP_CANDIDATE`, `SOC_CANDIDATE`. A hit is a question, not a verdict — a `choice`
above the confidence bar still needs a human. The definitions, what to look for
and the fixes live in `references/solid-soc.md`.

## Procedure

1. Run the CLI over the change set, e.g.
   `node .opencode/skills/quality/code-quality/scripts/jev-review.mjs src/features src/widgets`.
2. For each candidate, open the file at the reported line and judge it against
   the principle in `references/solid-soc.md`.
3. Fix or dismiss. Re-run until the report is empty or every remaining hit is an
   accepted tradeoff.
4. `npm run lint && npm run test`.

## Acceptance criteria

- [ ] No `SRP`/`SOC` candidate left unjudged in a changed function or class.
- [ ] Every `DIP` candidate either depends on an abstraction or states why the
      concrete dependency is acceptable.
- [ ] `lint`, `test` green.

## Limits

- Advisory, not a gate: Jev labels, the human decides.
- The extractor is shallow (regex header + brace matching), so it can miss units
  inside heavy generics or JSX and can slice an expression-bodied arrow early.
- It judges structure, not correctness or style; use the type checker and tests
  for those.
