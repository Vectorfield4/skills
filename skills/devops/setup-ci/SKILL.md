---
name: setup-ci
description: "Creates a basic CI pipeline (GitHub Actions) for a project on the standardized stack."
---

# Setup CI

Run once during repository initialization.

## Algorithm

1. Create `.github/workflows/ci.yml`:
   - Trigger: `push` and `pull_request` on default branch
   - Steps: checkout → setup-node (Node 24) → npm ci → npm run lint → npm run test → npm run build

2. Commit and push the file.

3. Report: "CI configured".
