---
name: pgvector-memory
description: "Native Pi tool syntax for pi-pgvector-api-embeddings lightweight RAG. Tools are registered as `pgvec_*` at session start; call them directly."
---

# pgvec memory call syntax (pi-pgvector-api-embeddings)

Call `pgvec_*` tools directly by name. Registered as native Pi tools at session start.

## Recall

```
pgvec_recall_memory({ query: "<query>", limit: 10, tag: "<tag>" })
```

- `query` — required, embedded and cosine-matched. Semantic goal only; no filter tokens in the string.
- `tag` — optional; restrict to a record type (`anti-pattern`, `review-bounce`, `design-decision`, `verified`, `user-feedback`). Omit to search all records.
- `limit` — default 10, max 50.
- Response items: `{ evidence_id, context, space_kind }`. Read `context` (≤ 2000 chars); never `content`.

## Remember

```
pgvec_remember({
    content: "<verbatim evidence text, ≤ 2000 chars>",
    tags: ["project:<project>", "<record-type>", "<relevant-concepts>"],
    source_type: "observation",
    valid_until: "<YYYY-MM-DD, today + N days>",
    confidence: "medium",
    idempotency_key: "<stable key, e.g. 'task:<project>:<task_id>'>"
})
```

- Required: `content`, `idempotency_key`, `source_type` (enum `conversation | document | observation | manual`). Unknown keys rejected (`additionalProperties: false`) — no `predicate`/`entity`/`polarity`.
- `tags` — query filter; recall `tag` must equal a stored tag. Record types: `anti-pattern`, `review-bounce`, `design-decision`, `verified`, `user-feedback`, `project:<name>`.
- `valid_until` — TTL date (ISO `YYYY-MM-DD`); `memory-gc` retires past it.
- `source_type`: experiential outcomes → `observation`; project metadata → `manual`.
- `idempotency_key` — dedupes re-sent writes.
- `remember` is async fire-and-forget; returns `submission_id`. Do not poll in the task flow; a failed write is harmless.
- Structured prefix (`project:`, `type:`, `tags:`, `confidence:`, `valid_until:`) goes in `content`; the flat `tags` array drives the recall `tag` filter.

## Other tools

- `pgvec_retract_evidence({ evidence_ids: [...], reason: "..." })` — retire evidence you own. Take `evidence_id` from the recall result.
- `pgvec_gc({ })` — retire evidence past `valid_until`. QA `memory-gc` only, not workers.

## Graceful degradation

On `pgvec_*` error or "not connected": continue without memory. Disk `AGENTS.md` / `SOUL.md` remain the source of truth. Never block the task on a memory call.