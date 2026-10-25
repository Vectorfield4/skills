---
name: parse-gap-review
description: "Reads parse-gaps.json, groups failures by reason, and checks the existing chain (skills/data/*/scripts/*.mjs, lib/*.mjs) before writing a prioritized parser-backlog.md. Every proposal carries alreadyImplemented plus the script and function that covers it, so a gap becomes extend-the-existing-parser instead of a duplicate. Triggers: parse gap review, parser backlog, improve parsing, parser proposals."
---

# Parse gap review

Turn classified parse failures into a concrete backlog for better extractors.
This is the feedback loop: failures are not dropped, they become proposals.

The review does not trust its own memory of the chain. It scans the scripts,
finds the implementation, and names it. A reason that is already covered never
comes back as "build a new parser".

## Run

```bash
node scripts/review.mjs --gaps parse-gaps.json \
  [--out parser-backlog.md] [--json-out parser-backlog.json] \
  [--min-count 2] [--root <skills repo>]
```

- `--gaps <file>`: `parse-gaps.json` from `parse-failure-triage`.
- `--out <file>`: markdown backlog (default `parser-backlog.md`).
- `--json-out <file>`: optional machine-readable proposals.
- `--min-count <n>`: drop reason groups below this count (default 2).
- `--root <dir>`: skills repo to scan; defaults to the repo this skill lives
  in, so the review works from a project checkout without the repo mounted.

## How existing parsers are found

The catalog lives in `lib/parse-catalog.mjs` and is built from the files, not
from a hardcoded list:

1. Scan `skills/data/*/scripts/*.mjs` (recursively) and `lib/*.mjs`.
2. For each file, collect exported functions, dash-case method literals
   (`ua-retry`, `google-cache`, ...), and the function that holds each
   capability: every failure reason declares `covers`, and each cover is a probe
   over the source text.
3. A cover counts as implemented only when the probe matches a real function
   body. A file that merely recommends `google-cache` does not qualify — this is
   why `parse.mjs` is not credited with the google-cache parser.
4. `alreadyImplemented` is true only when every cover the reason needs is
   present.

The catalog file is excluded from its own scan; otherwise its probe literals
would report every capability as implemented.

## Output (parser-backlog.md)

Header: the scripts scanned and what each one covers, e.g.

```md
- `skills/data/parse-fallback/scripts/fallback.mjs` — fallback(), run() — covers: decode-redirect via fallback(), ua-retry via fallback(), archive-org via fallback()
```

Then one section per failure reason:

- count, priority (count × reliability), and the domains involved;
- **Tried** — the methods the chain already ran, with ok/failed counters and the
  observed errors, taken from `attempts`;
- **Already implemented: true|false** and **Covered by** — the script and the
  function that implements it;
- **Still missing** — covers that no script implements;
- **Action**:
  - fully covered → `Extend the existing parser <file> → <function>: ...` (never
    a new parser);
  - partially covered → `Extend the existing parser <file> → <function> (...):
    add <missing covers>`;
  - not covered at all → `New parser: ...`.
- example URLs.

Reasons that must not become a parser (`paywall`, `not-found`) land in a
separate "No parser needed" section.

`--json-out` writes the same proposals with `alreadyImplemented`, `coveredBy`
(`file`, `function`, `capability`), `uncovered`, and `action` for each reason.

## Rules

- Read only. Never fetch or guess content.
- A proposal whose reason is already implemented must point at the existing
  script and function; it must not ask for a duplicate parser.
- Every gap must appear in at least one reason group.
- The backlog is an input for a human or an agent that creates the next parser
  script/skill, or extends the one named in "Covered by".
