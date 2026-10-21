# Component Execution (`component == true`)

Loaded by `execute-task` after project rules are loaded (see `references/memory.md`).

The task arrives as a **JSON string** — parse it as `task` and read fields
via `task.type`, `task.description`, `task.metadata.*`, etc. (the `subagent`
tool accepts `task` only as a string).

## Steps

0. **Check task type**
   - `task.metadata.type == "refactoring"` → skip to **Refactoring path** below.
   - Otherwise → standard flow.

## Standard flow (feature/bugfix/content/integration)

1. **Validate acceptance criteria**
   - Read the `acceptance_criteria` array from `task` (or
     `task.metadata.acceptance_criteria`). For each: does it trace to
     `task.description`? If invented → drop. If not verifiable via lint/test →
     note "manual review only".
   - Missing entirely → add comment: `"No acceptance_criteria — QA will review against description only"`.

2. **Identify component type** — from `task.type` / `task.metadata.type`,
   else infer from `title`/`description`.

3. **Consume memory (architect-supplied)** — load `references/rag.md` if not
   loaded. Use `task.metadata.memory_context` as your only memory context and
   treat each `task.metadata.anti_patterns` entry as a warning. Never recall. If
   context is absent or the call fails, continue without it.

4. **Place** — work inside `task.cwd`, the single worktree. If the index lock
   is busy (a sibling worker committing), wait briefly and retry.

5. **Implement the component**
   - Follow the delegated skill for this task type.
   - For library docs: load `docs-lookup` (Context7 + 7-day cache), not
     Context7 tools directly.

6. **Quality check and commit**
   - Verify against judge rubric (see `execute-task` → Quality Targets). Fix deficient dimensions.
   - `git add <changed files> && git commit -m "Task #<task_id>: <description>" -- <same files>`
   - Commit incrementally on long runs.

7. **Complete**
   - Success: store experience in memory **only if the task produced a
     reusable lesson** — a non-obvious approach, a pitfall, or a decision
     a future task should reuse. Skip routine/mechanical/plumbing tasks;
     writing trivial outcomes is wasted LLM cost. Best-effort, don't block:
     ```
      pgvec_remember({
        content: "project: <project>\ntype: <type>\ntags: project:<project>,<type>,<relevant-concepts>\nconfidence: medium\nvalid_until: <YYYY-MM-DD, today + 90 days>\n\n<the reusable lesson — what to do or avoid — under 200 chars>",
        tags: ["project:<project>", "<type>", "<relevant-concepts>"],
        source_type: "observation",
        valid_until: "<YYYY-MM-DD, today + 90 days>",
        confidence: "medium",
        idempotency_key: "task:<project>:<type>:<task_id>"
      })
     ```
   - Failure: return error details.

## Refactoring path (`task.metadata.type == "refactoring"`)

Applies targeted edits to existing code instead of generating new components.

1. **Validate criteria** — same as standard step 1. Also read `task.metadata.target_files`.

2. **Place** — work inside `task.cwd`, same as standard step 4.

3. **Read current code** — read each file in `task.metadata.target_files`. Understand current structure.

4. **Apply targeted edits**
   - Use `edit` per `change_description`; preserve external behavior.
   - Complex changes (>3 files or >100 lines diff) → split into smaller edits, commit incrementally.

5. **Validate** — run `npm run lint`, `npm run test`, `npm run build`. Verify existing tests pass, no API changes.

6. **Commit** — `git commit -m "Task #<task_id>: <description>" -- <changed files>`

7. **Complete** — same as standard step 7.
