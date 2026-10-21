# skills

Centralized skills and agent definitions for OpenCode. OpenCode loads them from
`~/.config/opencode`, where `skills` and `agent` are symlinks to this repo, so
every project sees the same set. A project must not keep its own `.opencode`
copy.

## Layout

```
agent/          subagent definitions (prose-critic, art-agent, ...)
skills/         SKILL.md + optional scripts/ per skill, grouped by domain
lib/            shared engine: http/cli helpers, jev/ (gates), prose/ (rubrics)
test/           vitest tests for that shared code
```

`docs/` and `scripts/` are junctions into the content project (its `docs` and
`scripts` directories): the cover pipeline imports
`docs/image-prompts/*`, and several skills import the generation queue from
`scripts/generation-queue.mjs`. They are local, untracked, and unrelated to the
`lib/` move — `npm install` leaves them alone.

## Scripts inside skills

Skills are reached as `~/.config/opencode/skills/<category>/<skill>`, so run a
script by its path in the global mount:

```bash
node ~/.config/opencode/skills/data/news-fetcher/scripts/fetch-candidates.mjs --sources scripts/sources.json
```

Two things that bite:

1. **A bare `scripts/foo.mjs` on the command line is not the skill's script.** The shell
   resolves it against the working directory. Always spell out
   `~/.config/opencode/skills/<category>/<skill>/scripts/...`. Inside `SKILL.md` the opposite is
   true: paths written there are relative to the skill directory, and OpenCode hands the
   agent that base directory — so never hardcode `~/.config/opencode/...` in a skill.
2. **Entry points must survive symlinks.** The `skills` and `agent` mounts are symlinks, so the CLI
   sees the real path in `import.meta.url` while `process.argv[1]` keeps the path the user
   typed. Detect yourself with `isEntryPoint(import.meta.url)` from `lib/cli.mjs`, never by
   comparing `import.meta.url` to `pathToFileURL(process.argv[1])`.

A third one is specific to content skills: `write-article`, `write-service`,
`write-solution` and `code-quality` open `articles/`, `content/plan/` and
`src/entities/...` relative to `process.cwd()`, because those files belong to the
project, not to the skill. Run them from the project root — the engine they import
still comes from this repo.

Scripts import shared code through the `#lib/*` alias declared in `package.json`
(`"imports": { "#lib/*": "./lib/*" }`), e.g.
`import { fetchText } from "#lib/http.mjs";` and
`import { noulFinding } from "#lib/jev/findings.mjs";`. Node resolves the alias
from the nearest `package.json` above the file's real path, so it works no matter
how deep the skill sits or which project runs it.

Skills that ship scripts: `article-extractor`, `news-fetcher`,
`generate-image-cover`, `project-init`, `write-article`, `write-service`,
`write-solution`, `code-quality`.

## Setup

```bash
npm install     # jsdom, @mozilla/readability, vitest
npm test        # test/*.test.mjs
npm run doctor  # check the global mounts
npm run doctor -- <project>  # also check that project for a local .opencode
```

The Jev engine and the prose rubrics are part of this repo (`lib/jev`,
`lib/prose`) and skill scripts reach them through `#lib/*`, so nothing needs
linking after `npm install`: no workspace package, no `node_modules` junction to
recreate. `test/module-graph.test.mjs` fails if a package-name specifier, a
relative climb into `lib/`, or an unresolvable `#lib/*` import reappears.
