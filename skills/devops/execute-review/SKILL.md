---
name: execute-review
description: "Runs the full branch-review pipeline inside the reviewer agent: load context, validate, score the diff against main, decide, write memory, return a structured result."
---

# Execute Review

The full review pipeline for a single feature branch. Make the
merge/bounce/explore decision on the **branch diff against `main`** and write
the result. There is no PR.

The task arrives as a **JSON string** — parse it as `task` and read fields via
`task.project`, `task.cwd`, `task.branch`, `task.metadata.*`, etc.

## Input

- `task.cwd`: resolved project path (`/workspace/<project>`)
- `task.project`: project name (workspace dir under `/workspace/<project>`)
- `task.branch`: feature branch name
- `task.metadata.acceptance_criteria`: list of strings, may be empty
- `task.metadata.review_iterations`: int, starts at 0, incremented on each bounce
- `task.metadata.exploration_triggered`: bool, default false
- `task.metadata.complex`: bool — `true` for cross-cutting/architectural changes;
  apply extra scrutiny to shared architecture and i18n dictionary
  parity (see step 4)

## Tunables

- `CI_POLL_INTERVAL_S` (default 30): seconds between CI status checks.
- `CI_TIMEOUT_S` (default 600): max seconds to wait for CI.
- `SCORE_PASS` (default 7): threshold to approve the push.
- `SCORE_NEEDS_FIXES` (default 5): below this, bounce with anti-pattern.

## Steps

### 1. Load context
Read project rules from disk: `/workspace/<project>/AGENTS.md` and `/workspace/<project>/SOUL.md` (if present). The disk files are the source of truth. `task.rules_hash` is informational only.

Recall past anti-patterns:
`pgvec_recall_memory({ query:"<feature summary> <project>", tag:"anti-pattern" })`. If recalled, these are known failures — use a different approach.

If this is a re-review (the branch was bounced before), recall the prior bounce
findings so you check the **fix delta** against them instead of re-scoring from
scratch:
`pgvec_recall_memory({ query:"<feature summary> <project>", tag:"review-bounce" })`.
Match by `task_id`. If a prior record exists, verify each prior finding is
resolved in the new diff, then score only what changed.

If `exploration_triggered == true` in `task.metadata`, also recall exploration anti-patterns:
`pgvec_recall_memory({ query:"<feature summary> <project>", tag:"anti-pattern" })` and avoid repeating the same approach.

### 2. (No CI wait needed)
The branch is local-only, so no CI runs on it. Skip `gh run` polling; local
validation (step 3) is the gate. On re-review, check only the fix delta
against the recalled bounce findings.

### 3. Pre-push validation
If `task.metadata.acceptance_criteria` contains any of: `lint`, `test`, `build`, `typecheck`:
- Read validation commands from `/workspace/<project>/AGENTS.md` (look for `## Commands` or similar)
- Run each inside `task.cwd` — the single worktree (branch checked out there)
- If any fails → `decision: bounce`, findings = the failing command and its output

Skip this step if no validation commands are mentioned. The skill must not invent commands that aren't in `AGENTS.md`.

### 4. Score the diff
Use the `pr-judge` skill to score:
- Get the file list first: `git diff --name-only origin/main...HEAD`.
- Prefer `task.metadata.file_inventory` (if present) to focus reads on the
  files that changed for this task; read the remaining
  `name-only` files to catch drift or unrequested edits.
- Compute score per `pr-judge` rubric.
- If `task.metadata.complex == true`, add targeted checks for the failure modes
  of architectural changes: shared layout/theme/StyleX-token edits are
  consistent, new i18n keys exist in ALL locale dictionaries the project
  defines (parity — a missing translation in any one is a defect), and
  dependencies stay on the project's declared stack (`package.json` + project
  `AGENTS.md`).
- Verify structural claims and run the overwrite check per the `# tools`
  contracts (`find_definition`, `find_callers`, `find_callees`,
  `list_symbols`).

If total added/removed lines exceed 3000, do not run the full diff inline; score from per-file reads.

### 4a. Asset coverage (when `task.metadata.assets` is present)

Skip if `task.metadata.assets` is missing or empty.

For each row in the array:
- If `source: generate`:
  - `git -C /workspace/<project> ls-files <row.repo_path>` must return a hit.
  - If missing → `findings[]: missing-asset: <row.slug>`.
- If `source: stock-*:...`:
  - `grep -ri "<name>" src/` must return at least one import or use.
  - If not → `findings[]: stock-mismatch: <row.slug>`. Note, not bounce.
- If `source: existing:...`:
  - `git -C /workspace/<project> ls-files <path>` must return a hit.
  - If missing → `findings[]: missing-existing: <row.slug>`.

Then scan the diff for image references outside `metadata.assets`:
```
git diff origin/main...HEAD | grep -E '\.(png|jpg|jpeg|webp|gif)'
```
A hit not in `metadata.assets` → `findings[]: untracked-asset: <path>`.

`missing-asset`, `untracked-asset`, and
`missing-existing` each trigger `decision: bounce`. `stock-mismatch` is a
note only.

### 5. Decide
- `score >= SCORE_PASS` → `decision: merge`
- `SCORE_NEEDS_FIXES <= score < SCORE_PASS` → `decision: bounce`, persist findings (step 5.5)
- `score < SCORE_NEEDS_FIXES` → `decision: bounce`, store anti-pattern
- `task.metadata.review_iterations >= 3` and the same kind of issue keeps appearing → `decision: explore` (see step 7)

### 5.5. Persist bounce findings (on any `bounce`)
Record the exact failure reasons so a re-review checks the fix delta, not a
cold re-score:
```
pgvec_remember({
  content: "project: <project>\ntype: bounce\ntags: review-bounce,project:<project>\nvalid_until: <YYYY-MM-DD, today + 7 days>\n\ntask_id: <task_id> review_iterations: <n>\nFindings: <one line per issue>",
  tags: ["review-bounce", "project:<project>"],
  source_type: "observation",
  valid_until: "<YYYY-MM-DD, today + 7 days>",
  idempotency_key: "review-bounce:<project>:<task_id>:<n>"
})
```
Also surface the findings text in the `[REVIEW_RESULT]` `findings:` field —
the fix round gets it in the reply, not only in memory.

### 6. Merge decision (do NOT push)
`decision: merge` means the branch is approved for push. No `git push origin
main`, no `gh pr merge`, no deploy.

### 7. Exploration escalation (only on `decision: explore`)
Write an anti-pattern (best-effort):
```
pgvec_remember({
  content: "project: <project>\ntype: exploration\ntags: anti-pattern,exploration,project:<project>\nconfidence: high\nvalid_until: <YYYY-MM-DD, today + 30 days>\n\nTask '<title>' failed <N> iterations. Recurring: <pattern>. Task must be re-decomposed.",
  tags: ["anti-pattern", "exploration", "project:<project>"],
  source_type: "observation",
  valid_until: "<YYYY-MM-DD, today + 30 days>",
  confidence: "high",
  idempotency_key: "exploration:<project>:<task_id>"
})
```
Set `exploration_flag: true` in the result. Do not bounce, do not approve.

### 8. Memory write (best-effort, at most once per task)
- `score >= SCORE_PASS` **and** the task documents a reusable approach (a
  technique, pattern, or architectural decision worth repeating) → write
  verified pattern:
  ```
  pgvec_remember({
    content: "project: <project>\ntype: verified\ntags: verified,project:<project>\nconfidence: high\nvalid_until: <YYYY-MM-DD, today + 90 days>\n\n<reusable approach, under 200 chars>",
    tags: ["verified", "project:<project>"],
    source_type: "observation",
    valid_until: "<YYYY-MM-DD, today + 90 days>",
    confidence: "high",
    idempotency_key: "review-verified:<project>:<task_id>"
  })
  ```
  A routine pass that only confirms the obvious writes nothing — a verified
  label with no reusable content is wasted LLM cost. The bounce/explore
  writes already carry the corrective signal.
- `score < SCORE_NEEDS_FIXES` → anti-pattern already written in step 5; do not write again
- `bounce` at 5-6 → findings already written in step 5.5; do not write again
- Otherwise → no memory write

Cap `content` at one sentence (~200 chars). Never store full source dumps.

### 9. Return structured result

```
[REVIEW_RESULT]
decision: merge | bounce | explore
score: <1-10>
breakdown: quality=<n> tests=<n> security=<n> docs=<n>
findings: <one-line per issue, or "none">
memory_written: <true|false>
exploration_flag: <true|false>
summary: <one sentence>
```

For `decision: merge`, no URL is needed.

## Verification

- Result has exactly one `decision` value.
- `score` is 1-10 integer.
- `findings` is non-empty for `bounce` and `explore`, empty/`none` for `merge`.
- Memory write attempted at most once.
- If `explore`: `exploration_flag: true`, no bounce, no approve.
- If `merge`: no `git push origin main` / `gh pr merge` ran.

# tools

## read

- when: pr-judge scoring — task criteria, file states, raw logs
- how: never parse change sets; analyze only the `git diff` delta

## bash (git)

- when: diff extraction, asset scans, validation commands in the worktree
- how: `git diff`, `--stat`, `--name-only` within the task worktree only

## list_symbols

- when: integrity check of executor-updated files before merge
- how: fail the gate on full overwrite of an existing tracked file →
  `findings[]: full-overwrite: <path>` → `decision: bounce`

## find_definition

- when: confirming a changed symbol exists
- how: named entities only

## find_callers

- when: impact verification of changed shared components
- how: scan consumers within the active git diff window

## find_callees

- when: verifying references inside a modified function
- how: mutated node scopes only

## get_symbol_body

- when: analyzing a modified symbol for execution defects
- how: target the mutated symbol directly