---
name: orchestrate-task
description: "Routes tasks to Depth-1 architects (frontend/backend), coordinates a single feature branch, parallel copy rounds, and final push to main."
---

# Orchestrate Task

Depth 1: every frontend
task maps unconditionally to `frontend-architect`; every non-frontend
task maps unconditionally to `backend-architect`. Every task closes
through the quality loop: `reviewer` (scoring) → `qa` (push on
`decision: merge`); `bounce` routes findings back to the owning worker,
`explore` re-decomposes.

## Steps

### 1. Validate the task contract

`task.cwd` is the resolved project. On empty/absent `task.cwd`, or a
validation mismatch (project does not fit the task), end the run with
terminal `completed` and output `needs_clarification:` followed by the
candidate list when inferable. Example:

  needs_clarification: the resolved project is the backend, the task is about
  UI. Candidates: secret-base-ai, admin-portal.

Nothing else happens in this step — no triage, no track checks, no intent
tags.

### 2. Detect Project Type

Identify the project type by markers; route per depth-1 rules:
- **frontend**: `astro.config.*` / `**/*.astro` or package.json with `astro`
- **backend**: package.json + Express/Fastify/Nest, or go.mod, requirements.txt, Cargo.toml
- **fullstack**: Monorepo or both frontend + backend markers
- **CLI/lib**: package.json with bin/main, or Makefile + src/
- **infra**: docker-compose.yml, Dockerfile, .github/workflows
- **content**: Markdown-heavy, no code

### 3. Load Project Rules (lightweight)

The orchestrator's cache dominates the bill. Loading the full `AGENTS.md` into
the orchestrator's context is expensive (replayed as cacheRead on every
turn). Stay light; let workers do the heavy reads.

- Navigate to `/workspace/<project>`.
- Pull latest: `git pull origin dev` (or `main` if `dev` doesn't exist).
- Run `wc -l AGENTS.md SOUL.md 2>/dev/null` first. If the total is ≤ 200
  lines, `read` both fully. Otherwise stop. Do not read sections, do not
  `grep` then `head/tail`. Every `read` token replays as cacheRead on every
  subsequent turn. Pass `metadata.file_inventory` (step 4.7) and let the
  worker read what it needs from the inventory.
- Ensure `artifacts/` directory exists in the project root: `mkdir -p /workspace/<project>/artifacts`. This is where worker reports (task reports) live; architects write nothing.
- Workers read the rules sections they need; the orchestrator passes only `metadata.file_inventory` (see step 4.7).

### 3.5. Rules stay on disk (orchestrator does not load them)

Rules live in `/workspace/<project>/AGENTS.md` / `SOUL.md` and are read by the
workers that need them. The orchestrator ships only `metadata.file_inventory`
(step 4.7) so workers read the sections they need directly. Workers must not
write rules anywhere; rule freshness is whatever is on the branch they work.

### 4.7. Build a file inventory (orchestrator does NOT read)

Heavy file reads belong to workers. Build a `file_inventory` array per
sub-task (≤ 30 paths, scoped to the sub-task) and ship it as
`metadata.file_inventory`. The worker reads what it needs; the orchestrator
never does. Full procedure (template, build commands, what to include) lives
in `references/file-inventory.md`. Read it when you reach this step.

### 5. Decompose the Task

Decomposition is owned by the Depth-1 architect (step 7 row-owner): it recalls
domain memory, splits composite tasks, and delegates to its worker inside
its own turn. The orchestrator never re-plans.

- Forward the task to the row-owner; do not split it here.
- Patterns: frontend structure lives in `ui-architect`; backend layering,
  CLI surface, infra, and content structure live in `backend-architect`.
- `acceptance_criteria`: name concrete verifiable gates (`lint`/`test`/`build`/`typecheck` per `AGENTS.md` Commands) — that reference is the reviewer's trigger to run them (execute-review step 3)

### 5.1. Carry complexity to the review

`metadata.complex: true` in the task JSON signals a high-risk change
(cross-cutting, schema, new architecture). The reviewer reads it as a cue to
take extra care; a repeat failure may escalate to `explore`. It is a carry,
never a branching gate.

### 5.3. Pre-batch asset table (when images are part of the request)

Build the asset list before delegation from the user's request: one row per
requested image, `type` from `hero | cover | og | illustration | concept |
background | avatar | thumbnail | diagram`, `prompt` paraphrased from the
request, `aspect` guessed from the context (`16:9` hero/og, `4:3`
illustration, `1:1` avatar/thumbnail, default `1:1`), `source: "generate"`,
`repo_path`: `shared/assets/images/<slug>.<ext>`.

Skip when the request asks for no images.

For each assembled `source: generate` row, run
`git -C /workspace/<project> ls-files shared/assets/images | grep -i <slug>`.
If a match exists, rewrite the row to `source: existing:<path>` and drop
it from the generation list. Ship the remaining list as
`task.metadata.assets: [{slug, type, prompt, aspect, source, repo_path}, ...]`.
Delegate drawer **only** the `source: "generate"` rows; the implementing worker gets
the full list (it handles `stock-*`/`existing` rows itself). The worker
iterates the list and does not re-decide what to generate.
The `<ext>` in `repo_path` is refined by the drawer from the first
`hf_generate_image` result and corrected back in the asset list.

### 6. Generate Branch Name
- `feature/<task_id>-<sanitized_title>` — the task's only branch

### 6.5. Create the single worktree

Depth 0 is the sole creator of the working directory. Before delegating,
materialize exactly one worktree under this `task_id`:

- `git -C /workspace/<project> worktree add /workspace/<project>-<task_id> -b feature/<task_id>-<title>`
- Drop `-b` (reuse the existing branch) when the worktree/branch already
  exists — a bounce retry works in the same worktree.
- Delegated payloads carry `task.cwd: /workspace/<project>-<task_id>`; the
  feature branch is checked out there.

### 7. Delegate Sub-Tasks

`subagent` accepts `task` as a **string only** (an object fails with
`task: must be string`). Serialize the output state strictly matching the
structural layout provided in `./payloads/task.json`. TASK
payloads carry the full bundle — steps 4.7 (`file_inventory`), 5.1
(`complex`), 5.3 (`assets`).

- Frontend: delegate `frontend-architect` **once** with the
  full context bundle. It recalls domain memory, binds the i18n keys, splits
  composite tasks, and delegates to `frontend-implementer` (and `content`
  in parallel on heavy copywork) inside its own turn. Never pre-plan or
  re-invoke it; an underspecified scope is fixed by the architect.
- **Image generation: fan out `drawer` in parallel with the architect pass.**
  When `metadata.assets` has `source: generate` rows, launch the architect
  and the `drawer` in one pass (`runs.all`) with the **same `task.cwd`**
  (the single worktree, step 6.5) and the **same `task.branch`**. Partition:
  `drawer` touches only `shared/assets/images/`; the implementing worker
  never calls `hf_generate_image`/`generate_image`. Disjoint paths keep the
  parallel commits race-free; nothing to merge afterwards.
- **Multiple independent changes in one request** → **not one task**. Each
  change is its own task (own scope, own file area, own test), each routed
  through the scope's architect in its own worktree. Fan out via
  `runs.all([{key, agent, task}, ...])` (see step 8.5). One sibling failing
  does not block the others; bounce findings are routed back per-worker, not
  to the group.
- Non-frontend (backend/CLI/lib/infra/content): delegate to
  `backend-architect` — the single authority for non-frontend scopes. It
  recalls domain memory, routes to `backend`/`devops`/`content`, and splits
  composite tasks. `complex` is carried for the reviewer, never a gate.

### 7.2. Stage assembly — no merge, one branch

There is no images branch: every worker (implementer, content, drawer)
committed locally into the same feature branch in the single worktree; path
partition kept the parallel commits race-free. Wait for all
`<subagent_notification>`s (step 8.5), then delegate QA (step 8). The branch
is local-only — QA sends it upstream and fast-forwards it into `main`
(execute-qa-task section 3).

### 8. Finalize Task (push to main)

The push is centralized: workers never ran `git push`.

```
subagent({ agent: "qa", task: '{"type":"push","cwd":"/workspace/<project>-<task_id>","project":"<project>","branch":"feature/<task_id>-<title>","metadata":{"complex":<bool>,"file_inventory":["<path1>","<path2>"]}}', skill: "execute-qa-task" })
```

`cwd` is the single worktree (step 6.5) where the branch is checked out. QA
runs the reviewer on **every** coding task (the quality loop), then sends the
branch upstream and pushes it into `main` on `decision: merge` (or bounces
findings back to the orchestrator on `decision: bounce`). No PR, no human gate.

### 8.2. Record project-task (after success)

After the push completes, write the routing memory so the next
message routes without re-discovery:

```
pgvec_remember({ content: "task pattern: <sig> -> project: <name>", tags: ["project-task", "project:<name>"], source_type: "observation", valid_until: "<today+90d>", idempotency_key: "project-task:<hash>" })
```

`<sig>` = first line of the task, lowercased, ≤ 80 chars, project names
redacted. `<hash>` = short hash of `<sig>`. Similar future tasks then match
the same entry.

### 8.5. Wait Discipline (notification-based; don't poll)

The intended flow: `subagent({ agent, task, skill })` returns a `runId`; end
the turn; the result-watcher injects a `<subagent_notification>` into your
next turn with the worker's outcome. `subagent_wait` and `subagent status`
are diagnostic only — polling them burned 13+ calls per task and produced
duplicated acceptance reports. `subagent_wait` is the exception path for
`pi -p` non-interactive runs where there is no next turn to receive the
notification.

**One LLM pass authors all sibling launches.** Compose every independent
worker's `task` in a single generation — multiple `subagent` tool calls in
one turn, or a `workflowScript` using `runs.all([{ key, agent, task }, ...])`
where the tasks are literal values. Pi fans the children out; it never asks
the model to re-decide a child's task. Do not launch siblings across separate
turns, which forces a fresh model call per worker.

- Launch all sibling workers in a single pass (fan-out budget 64); end
  the turn. Each completion arrives as its own notification turn, in
  finish order. Track outstanding workers by which notifications you
  have already received.
- Prefer `runs.all` for independent siblings: one `subagent` call returns
  when all complete, no per-child call. Reserve per-child `subagent` calls
  for dependent work (a step that must start after an earlier child finishes).
- `subagent({ action: "status", id, view: "transcript", lines: 30 })` —
  one-shot diagnostic only (events.jsonl under
  `/tmp/pi-subagents-uid-0/async-subagent-runs/<id>/` for crashes).
- Blocked-fallback: if a downstream step truly cannot proceed and the
  notification has not arrived, use **one** `bash sleep 120` then read
  the events log directly.

### 9. Execution Checkpoint

Evaluate only the objective execution success flag returned by the downstream
subagent thread. If the review result is flagged as a failure, trigger an
immediate loop rollback. Do not evaluate file content, compile logs, or verify
code quality rules directly.

## Verification

- `task.cwd` validated at step 1; every delegated payload carries
  `cwd` = the single worktree
- Every sub-task delegated to a worker; maybe drawer too: every `source:
  generate` asset row has a `drawer` delegation; the implementer does not
  generate images
- Every frontend task delegated to `frontend-architect`; every
  non-frontend task to `backend-architect` — each at most once per task
- Exactly one worktree per `task_id`, created by the orchestrator
  (step 6.5); every delegated payload carries `cwd` = that worktree
- No Depth 1/2 subagent runs `worktree add` / `fetch` / `pull` / `rebase` /
  `push` — local `git add <paths>` + `git commit` only; QA pushes centrally
- `metadata.complex` is a reviewer signal, not a routing gate
- Reviewer invoked for every coding task via `qa` (quality loop); `bounce` findings are routed back to the worker
- Finalize task (push to main) created and delegated; branch sent upstream, merged into `main`, and cleaned up
- No task remains in intermediate state
- Wait discipline (step 8.5): workers' results are received via the result-watcher `<subagent_notification>` injection, not via `subagent_wait` or `status` polling loops. `subagent status` only as a one-shot diagnostic, never as a wait primitive.