# Project Initialization (`type == "init"`)

Loaded by `execute-task` for tasks with `task.metadata.type == "init"`. Project rules are not loaded — the project may not exist yet.

## Steps

1. **Initialize the project**
   - Clone the repo (if `/workspace/<project>` is missing) and pull the latest if present.
   - Load the `project-init` skill and follow it — it runs the deterministic scaffold script, installs deps, and sets up CI.
   - Data layer: synchronous fixture reads; i18n is build-time `createT`.
   - Report progress with a summary of what was set up.

2. **Set up CI**
   - Load and follow the `setup-ci` skill.
   - Create `.github/workflows/ci.yml`, commit and push it.

3. **Report result**
   - On success: return `"Project initialized and CI configured."`
   - On failure: return error details.
