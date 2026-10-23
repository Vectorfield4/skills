---
name: parallel
description: "Fans out independent tasks or subagents in a single pass and collects their results. Use for ad-hoc parallel work (research, analysis, disjoint edits) where there is no feature branch or quality loop. Triggers: parallel, fan out, run in parallel, параллельно, параллельный запуск."
---

# Parallel

Run independent tasks concurrently in one pass. No feature branch, no quality loop, no push. Just fan-out, wait, collect, report.

## When to use

- Independent research/analysis tasks (search, brainstorm, review).
- Disjoint edits across separate files or modules with no shared state.
- Batch operations where one failure must not block the others.

Use `orchestrate-task` instead when the work is a project feature that needs a branch, review, and push to main.

## Rules

1. **Independence first.** Tasks must not depend on each other's output and must not touch the same files. If they share state, run them sequentially.
2. **One pass.** Compose all sibling launches in a single generation: multiple `subagent` calls in one turn, or one `runs.all([...])`. Do not launch siblings across separate turns.
3. **No polling.** Results arrive as `<subagent_notification>`. Do not call `subagent_wait` or `status` in a loop. Use a single diagnostic `status` only if a notification is missing.
4. **Fail isolation.** One sibling failing does not block the others. Report per-task status.
5. **No shared writes.** Parallel code edits must target disjoint paths to avoid commit races.

## Steps

### 1. Define the task list

For each task capture:
- `key`: short stable id.
- `agent`: subagent type.
- `task`: payload string.
- `skill` (optional): skill to invoke.
- `description`: 3-5 word label.

Validate that no two tasks share a write target or a dependency.

### 2. Fan out

Launch all siblings in one pass:

```
runs.all([{ key, agent, task, skill }, ...])
```

or equivalent parallel `subagent` calls. End the turn and wait for notifications.

### 3. Collect

As each `<subagent_notification>` arrives, record:
- `key`, `status` (completed/failed), `summary`, `artifacts` (files/paths if any).

Track outstanding workers by which notifications have been received.

### 4. Report

Return a compact table:

| Key | Status | Summary |
|---|---|---|

Plus a short "Next" section: what to do with the results (merge, follow-up tasks, or stop).

## Constraints

- Do not create branches or worktrees.
- Do not push. Workers may commit locally only if paths are disjoint.
- Do not run quality loops here (that is orchestrate-task's job).
- Keep the fan-out budget reasonable (≤ 8 siblings per pass; split into waves if more).

## Verification

- All siblings launched in a single pass.
- No two siblings share a write target.
- Every sibling's result recorded before reporting.
- Failures reported, not swallowed.