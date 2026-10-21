# Review Fix (`type == "review"`)

Loaded by `execute-task` for a bounce fix; the same branch is reused.

## Steps

1. **Load project rules** — run load procedure from `references/memory.md`.

2. **Read QA findings**
   - Extract issues from the task description / latest comment.
   - Recall the persisted bounce record too: `pgvec_recall_memory({ query:"<feature> <project>", tag:"review-bounce" })` — match by `task_id`; the `context` holds the issue list.
   - If none from either → return "No QA findings in task".

3. **Retract proven-wrong evidence** (best-effort)
   - If the failing code came from memory recall and the recalled record is wrong → `pgvec_retract_evidence({ evidence_ids:["<evidence_id from recall>"], reason:"<fixed bug>" })`. The recall result supplies the `evidence_id`, so no relationship lookup is needed.

4. **Apply fixes**
   - Work in `task.cwd` — the same single worktree.
   - Fix each reported issue per project `AGENTS.md` and relevant stack references.
   - Never write exploration anti-patterns here. If `review_iterations >= 3`,
     apply the best fix you can; the review loop escalates on its own.

5. **Validate** — run project validation (lint/test/build). Fix failures before committing.

6. **Commit** — `git add <changed files> && git commit -m "fix: <summary>" -- <same files>`

7. **Hand back**
   - Return: "Fixed: <summary>".
   - Do NOT mark as complete — the task stays in the review loop until it passes.
   - On failure: return error details.
