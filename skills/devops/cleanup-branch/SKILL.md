---
name: cleanup-branch
description: "Deletes the local and remote branch."
---

# Cleanup Branch

1. Operate in shared repo: `cd /workspace/<project>`
2. Switch to a safe branch first (e.g., `git switch main`). Do not delete the branch you are currently on.
3. Remove all worktrees for this branch:
   ```
   git -C /workspace/<project> worktree list | grep "<branch>" | awk '{print $1}' | xargs -I {} git -C /workspace/<project> worktree remove {}
   ```
4. Delete local: `git -C /workspace/<project> branch -d <branch>`
5. Delete remote: `git -C /workspace/<project> push origin --delete <branch>`
