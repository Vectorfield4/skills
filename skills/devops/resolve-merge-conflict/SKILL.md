---
name: resolve-merge-conflict
description: "Automatically resolves merge conflicts."
---

# Resolve Merge Conflict

1. Ensure on the feature branch.
2. `git fetch origin && git merge origin/<base_branch>`
3. If no conflicts → success.
4. If conflicts:
   - Check conflicted files: `git diff --name-only --diff-filter=U`
   - For each file, inspect conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`):
     - Your code → keep your version
     - Base branch code you didn't touch → take theirs
     - Both changed → merge logically
   - If cannot determine → `git merge --abort` and return error
   - **Never use `--strategy-option theirs`**
5. On success → commit and push.
