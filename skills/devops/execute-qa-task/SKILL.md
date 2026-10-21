---
name: execute-qa-task
description: "Executes a single QA task — orchestrates the reviewer subagent (review) and pushes branches into main (push)."
---

# Execute QA Task

The task arrives as a **JSON string** — parse it and read fields via
`task.type`, `task.cwd`, `task.project`, `task.branch`, `task.metadata.*`, etc.

## Steps

### 1. Fetch the task
- Parse the `task` JSON string: extract `title`, `description`, `metadata`
  (`project`, `branch`).

### 2. Dispatch by task type
- **`type == "push"`** → run the push-to-main steps (section 3)
- **Otherwise (review task)** → continue with step 4

### 3. Push to main (delegated by the orchestrator)
The reviewer must pass first — delegate the review (step 4) and only push
after `decision: merge`. QA has no `subagent_wait`: on a `push` task, launch
the reviewer, **end the turn**, and push in the resume turn after the
`<subagent_notification>` carries `decision: merge`. Never block in-turn.

1. Review gate (always):
   - Delegate the reviewer (step 4), end the turn.
   - Resume on its notification. `decision: merge` → continue. `bounce` /
     `explore` → do NOT push; return the reviewer result to the orchestrator.
2. Send the branch upstream, then fast-forward it into `main`:
   ```
   cd <cwd>                     # the single worktree; branch checked out
   git push origin <branch>     # workers committed locally — this is the upstream send
   cd /workspace/<project>
   git fetch origin main
   git switch main && git merge --ff-only origin/<branch>
   git push origin main
   ```
   - The branch is local-only when you receive it (workers never pushed). If
     it was already upstream (bounce retry), `git push origin <branch>` is a
     no-op fast-forward.
   - Not fast-forwardable → load `resolve-merge-conflict` (rebase the branch on
     `main` first), then retry once.
   - Push rejected → `git pull --ff-only` then retry once.
3. Post-push: load and run `cleanup-branch` for `branch` (drop feature branch
   and worktrees).
4. Run `memory-gc`.
5. Report: push commit.

### 4. Review task — delegate to the reviewer subagent

The reviewer runs for **every** coding task. It reviews the branch diff against
`main`, scores it, and returns `merge` / `bounce` / `explore`. On `bounce`, the
orchestrator routes the findings back to the worker for a fix; QA does not push
until a `merge`. The reviewer task is a **string** — build it as its own
JSON string (never an object):

```
subagent({
  agent: "reviewer",
  task: `{"type":"review","cwd":"<path>","project":"<project>","branch":"<branch>","metadata":{"acceptance_criteria":["<...>"],"review_iterations":<n>,"exploration_triggered":<bool>,"complex":<bool>,"file_inventory":["<path1>","<path2>"]}}`,
  skill: "execute-review"
})
```

Pass `cwd`, `project`, `branch`, and the
`metadata` fields `acceptance_criteria`, `review_iterations`,
`exploration_triggered`, `complex`, `file_inventory` from the push task
through unchanged. On a re-review after `bounce`, pass `review_iterations + 1`;
pass `exploration_triggered: true` on the 3rd+ pass so the reviewer
escalates to `explore` instead of bouncing a 4th time.

The reviewer reviews the **branch diff against `main`** (local git) and returns
a structured result. This agent does not call `pr-judge` or
`resolve-merge-conflict` directly — only the reviewer owns the judge rubric.

### 5. Handle the reviewer's result

**decision: `merge`** (reviewer passed)
- The reviewer validated the branch but did NOT push. For a `push` task, push
  it to `main` (section 3). Do NOT push for a task that was review-only — return
  `decision: merge` for the push.

**decision: `bounce`**
- Call `telegram_ask(question="QA блок: <one-line>. Автофикс?", options=["Автофикс","Отменяю"], expects_answer=true)` (via `ping-a-human-pi`).
- Do not end the turn. Do not write a prose summary above the ask. Do not paste `findings`.
- "Автофикс" → forward `findings` to orchestrator; do not push.
- "Отменяю" → report `cancelled` to orchestrator; end turn.
- Re-review: read `review_iterations` from the persisted bounce record (written by `execute-review` step 4), launch reviewer with `n + 1`.

**decision: `explore`**
- Forward `exploration_flag: true` and the summary. The orchestrator
  re-decomposes the task. Do NOT bounce a 4th time.

### 5.5. Run memory-gc
After a successful push, load and run the `memory-gc` skill.
Not after a bounce or review-only iteration, since those write no memory.
The skill retires memory evidence whose `valid_until` has passed. Best-effort,
never blocks the flow. If it fails, the next push iteration retries.

### 6. Complete
- Forward the result. No memory writes from this skill (reviewer owns review
  memory; push outcomes can be stored as verified patterns best-effort).
- This skill is the dispatcher. It does not write rules, scores, or anti-patterns.

## Final-message contract

- `push` → `✅ <project>@<sha> on main. reviewer: <merge|bounce|explore>.` (≤4 lines)
- `review` + `bounce` → `telegram_ask` is the message. No prose above it.
- `review` + `merge` / `explore` → one-line decision + why. No JSON, no fenced code, no verbatim report. Detail → `artifacts/<task_id>-review.md`.

## Tool-call discipline

- One `telegram_notify(kind="task", status="complete")` per turn. Never per sub-step.
- `telegram_ask(expects_answer=true)` → do not end the turn. Wait for reply or timeout/cancel.

## Verification

- Review tasks delegate to `reviewer` for **every** coding task (no `skip_review`);
  `metadata.complex` is passed through for extra scrutiny.
- `type == "push"` runs only after the reviewer's `decision: merge`; the branch
  is fast-forwarded into `main`; branch cleaned up; `memory-gc` attempted.
- `decision: bounce` / `explore` → the branch is NOT pushed; findings are
  forwarded for routing back to the worker.
- No memory writes happen here (except best-effort verified outcomes).