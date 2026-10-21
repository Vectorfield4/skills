# Retry Protocol

## Error Classification

**Transient (retry):**
- Network: timeout, ECONNRESET, ETIMEDOUT, ENOTFOUND, "could not read from remote repository"
- HTTP: 429 (rate limit), 500, 502, 503, 504
- Git: push timeout, fetch timeout, "remote: internal server error"
- CLI: npm install/network timeout, npx download failure

**Permanent (do NOT retry, fail immediately):**
- Auth: 401, 403, "authentication failed", "permission denied", "fatal: could not read Username"
- Validation: 400, 404, "not found", "does not exist", "no such project"
- Syntax/logic: exit code 1 from lint/test with clear error message
- Conflict: "already exists", "conflict" (except merge conflict → use `resolve-merge-conflict`)

## Parameters

- `max_retries`: 3
- `base_delay`: 5s
- `max_delay`: 60s
- Backoff: exponential (`base_delay × 2^attempt`) + jitter (0–30% random)

## Algorithm

1. Execute the command.
2. On failure → classify the error output.
3. If **transient** AND `attempt < max_retries`:
   - Calculate delay = `min(base_delay × 2^attempt, max_delay)` + random jitter (0–30%).
   - Wait delay seconds, then retry (increment attempt).
4. If **permanent** OR `attempt >= max_retries`:
   - Report failure to the orchestrator with error classification and last error output.
5. Log each retry attempt for traceability.
