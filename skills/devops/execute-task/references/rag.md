# Experience Memory via pgvec

Loaded by `execute-task` for `component` and `review` flows. Native Pi tools registered under `pgvec_`; call directly.

## Architect-ingested memory (architect → workers)

The owning architect (frontend-architect / backend-architect) recalls domain
memory once per task and embeds it in the payload before delegating.
Workers consume it; they never recall (`component.md` step 3 enforces).

```
// Depth-1 architect, before delegating:
results = pgvec_recall_memory({ query:"<main goal> <project>", limit:10 })
metadata.memory_context = summarize(results)
metadata.anti_patterns = pgvec_recall_memory({ query:"<main goal> <project>", tag:"anti-pattern", limit:3 })
```

Workers read `task.metadata.memory_context` and `task.metadata.anti_patterns`
verbatim; a missing field means no context was available — proceed without
memory.

## Principles

- Memory is experiential and advisory, never authoritative. `AGENTS.md` on disk is the source of truth.
- Append-only. Updates via `pgvec_remember` (idempotency_key) or `pgvec_retract_evidence`. Never delete or rewrite.
- Retract only records your own profile submitted. The owning worker holds task evidence; reviewer owns review evidence.
- Never block the task on a memory call; on error, continue without context.
- Store compressed structured outcomes, never raw full-source dumps.
- Write only when the outcome is a reusable lesson: non-obvious approach, pitfall, or reusable decision. Skip routine/mechanical tasks and "passed" verdicts; composing trivial evidence wastes cost. Bounce, explore, design-decision, and feedback writes always write. Rules and docs caches are plain on-disk files, not memory.

## Recall (when batched context is absent)

- `pgvec_recall_memory({ query:"<concise goal of the work>" })`
- Short goal-oriented query (e.g. `StyleX tokens + createT i18n pages for <project>`), not a long paste.
- Filter by record type via `tag`, not tokens in the query: `pgvec_recall_memory({ query:"auth form", tag:"anti-pattern" })`.
- Response items: `{ evidence_id, context, space_kind }`. Read `context` (≤ 2000 chars); never `content`. The structured prefix is the discriminator: `project:`, `valid_until:`, `type:`.
- Top results are context hints; high-confidence results still pass validation (lint / test / build) before commit.
- Anti-pattern recall: `pgvec_recall_memory({ query:"<goal> <project>", tag:"anti-pattern" })`.
- Exploration anti-patterns: same call, then check content for an exploration flag — decomposition strategies that failed after ≥3 review iterations, do not repeat.
- On failure or empty results: proceed without context.

## Remember (after a successful task)

```
pgvec_remember({
  content: "project: <project>\ntype: <type>\ntags: project:<project>,<type>,<relevant-concepts>\nconfidence: medium\nvalid_until: <YYYY-MM-DD, today + 90 days>\n\n<concise summary, under 200 chars>",
  tags: ["project:<project>", "<type>", "<relevant-concepts>"],
  source_type: "observation",
  valid_until: "<YYYY-MM-DD, today + 90 days>",
  confidence: "medium",
  idempotency_key: "<type>:<project>:<task_id>"
})
```

- Required: `content`, `source_type` (enum `conversation|document|observation|manual`), `idempotency_key`. Unknown keys rejected (`additionalProperties: false`) — no `predicate`/`entity`/`polarity`.
- `tags` — query filter; recall `tag` must equal a stored tag.
- Record types: `anti-pattern`, `review-bounce`, `design-decision`, `verified`, `user-feedback`, `project:<name>`.
- `source_type`: experiential outcomes → `observation`; project metadata → `manual`.
- Structured prefix stays in `content`; flat `tags` array drives the recall `tag` filter.
- `valid_until` — TTL date (ISO `YYYY-MM-DD`); retired by QA's `memory-gc` after it passes.
- `idempotency_key` — stable key per record; dedupes re-sent writes.
- `remember` is async fire-and-forget; returns `submission_id`. Do not poll in the task flow; a failed async write is harmless.
- Call `remember` only AFTER success (validation passed / task completed), never for work in progress.
- `content`: one sentence (~200 chars) for ordinary tasks; longer for review verdicts and exploration anti-patterns.

## Corrections

- Recalled solution proved wrong: `pgvec_retract_evidence({ evidence_ids:["<evidence_id from recall>"], reason:"..." })` — take `evidence_id` from the recall result.
- Retract only your own records. Reviewer-owned records are corrected by the reviewer.