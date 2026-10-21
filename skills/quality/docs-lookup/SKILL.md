---
name: docs-lookup
description: "Resolves and fetches library documentation via Context7 with a plain file cache. Returns docs text for the current task and caches the result for 7 days."
---

# Docs Lookup

Single entry point for library documentation. Wraps `resolve-library-id` and `query-docs` from Context7 with a file cache. Use instead of calling Context7 directly.

## When to use

- Backend, devops, content, frontend-implementer, reviewer agents need library/API documentation.
- The library is real and current docs matter (Astro, StyleX, React, lucide-react, Radix, etc.).
- Not for general knowledge — only for library-specific lookup.

## Cache

Docs lookups are a deterministic key→content cache — a plain file read/write, no embedding, no memory call.

- Cache dir: `/workspace/<project>/.pi-cache/docs/`
- Cache file: `/<safe-key>.md` where `safe-key` = `<libraryName>-<topic>-<version>` with slashes/spaces replaced by `-`.
- File header lines: `cache_key: <key>`, `valid_until: <YYYY-MM-DD, today + 7 days>`, then a blank line, then the docs text.

## Procedure

1. **Compose the cache key.**
   ```
   key = "<libraryName>:<topic>:<version-or-latest>"
   safe-key = key with non-alphanumerics replaced by "-"
   path = /workspace/<project>/.pi-cache/docs/<safe-key>.md
   ```

2. **Read the cache.** `read <path>`. If it exists and its `cache_key:` matches the current key and `valid_until:` is in the future → use the content. Skip step 3.

3. **Resolve and fetch from Context7 (cache miss or expired).**
   ```
   resolve-library-id(libraryName="<libraryName>")
   query-docs(libraryId="<resolved-id>", query="<topic>")
   ```

4. **Write the cache.** `write <path>` with header + the summarized docs text. Ensure the `/workspace/<project>/.pi-cache/docs/` directory exists first (`mkdir -p`).

5. **Return the docs text** to the caller.

## Rules

- TTL is 7 days.
- Cap the stored docs text at ~2000 chars (Context7 returns are often larger). Summarize to what's needed for the task.
- Cache miss rate is your signal: if you keep hitting the cache (key matches and valid), the TTL is fine. If you keep missing, the task is using an unusual library.
- One call per (library, topic) pair. Don't call twice for the same pair in the same task.
- Graceful degradation: if Context7 fails, fall back to training knowledge. Cache the failure as empty content with a short TTL (1 day) to avoid hammering a broken API — same shape, `valid_until: today + 1 day`.

## Verification

- Each call returns either cached or fresh docs.
- If fresh, the cache file now exists with a matching `cache_key`.
- If cached, no Context7 call was made.
