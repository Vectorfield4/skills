---
name: setup-ci
description: "Creates a basic CI pipeline (GitHub Actions) for a project on the standardized stack, with mandatory husky pre-commit lint hook and the version hook."
---

# Setup CI

Run once during repository initialization.

## Algorithm

1. Install and configure husky (mandatory):
   - `npm install --save-dev husky`
   - `npx husky init`
   - Install the version hook: `node <base>/scripts/install-version-hook.mjs .`
     (writes `scripts/version.mjs` and rewrites `.husky/pre-commit` to `npm run lint && node scripts/version.mjs hook`)
   - Ensure `package.json` has `"prepare": "husky"` in scripts.
   - Run `npm run lint` locally; it must pass (exit 0) before continuing.

2. Create `.github/workflows/ci.yml`:
   - Trigger: `push` and `pull_request` on default branch
   - Steps: checkout → setup-node (Node 24) → npm ci → npm run lint → npm run test → npm run build

3. Commit and push the file.

4. Report: "CI configured".
