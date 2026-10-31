# skills

Centralized skills and agent definitions for OpenCode. OpenCode loads them from
`~/.config/opencode`, where `skills` and `agent` are symlinks to this repo, so
every project sees the same set. A project must not keep its own `.opencode`
copy.

## Layout

```
agent/          subagent definitions (prose-critic, art-agent, ...)
skills/         SKILL.md plus optional entry-point subdirs per skill, grouped by domain
lib/            shared engine: http, cli, env, article-search and wp helpers, generation-queue, jev/ (gates), prose/ (rubrics), yaml/ (reader + TS contract parser), content/ (domain contracts)
test/           vitest tests for that shared code
```

Entry points live inside their skill directory. The repo keeps no `bin/`.

The repo keeps no link into a project. The queue engine is
`lib/generation-queue`, and the cover pipeline reads the project's
`docs/image-prompts/*` from the working directory at run time, because that
visual language is project data.

## Scripts inside skills

Skills live under `~/.config/opencode/skills/<category>/<skill>`. Run a script by
its path in the global mount:

```
node <mount>/<category>/<skill>/<entry> ...
```

Two things that bite:

1. **A bare skill script name on the command line is not the skill's script.** The shell
   resolves it against the working directory. Always spell out
   `~/.config/opencode/skills/<category>/<skill>/...`. Inside `SKILL.md` the opposite is
   true: paths written there are relative to the skill directory, and OpenCode hands the
   agent that base directory - so never hardcode `~/.config/opencode/...` in a skill.
2. **Entry points must survive symlinks.** The `skills` and `agent` mounts are symlinks, so the CLI
   sees the real path in `import.meta.url` while `process.argv[1]` keeps the path the user
   typed. Detect yourself with `isEntryPoint(import.meta.url)` from `lib/cli`, never by
   comparing `import.meta.url` to `pathToFileURL(process.argv[1])`.

A third one is specific to content skills: `write-article`, `write-service`,
`write-solution` and `code-quality` open `articles/`, `content/plan/` and
`src/entities/...` relative to `process.cwd()`, because those files belong to the
project, not to the skill. Run them from the project root - the engine they import
still comes from this repo.

Scripts import shared code through the `#lib/*` alias declared in `package.json`
(`"imports": { "#lib/*": "./lib/*" }`), e.g.
`import { fetchText } from "#lib/http";` and
`import { noulFinding } from "#lib/jev/findings";`. Node resolves the alias
from the nearest `package.json` above the file's real path, so it works no matter
how deep the skill sits or which project runs it.

Scripts are never catalogued here. Each skill's `SKILL.md` is the single place
that names its scripts and their relative paths; `README.md` only describes the
mount, the stack and the shared rules. This keeps progressive disclosure intact
and avoids the pink-elephant effect: a reader of `README.md` does not learn about
a script it does not need.

## News article pipeline

A plain news site keeps only `articles/<slug>.<lang>.md` - one file per locale the
site ships (`<slug>.ru.md` alone on a ru-only site, `<slug>.ru.md` + `<slug>.en.md`
when the site serves both): no `content/plan/`, no generation queue, no cover gate,
no `related*` entities. That site has one owner: the
`content-translate-related-articles` agent
(`agent/content/translate-related-articles.md`).

Call it and name the step range - nothing else:

> `content-translate-related-articles`: add two fresh robotics articles from
> the project's sources list, target language ru, verify and commit. Do not publish.

The agent runs the chain in order:

| # | Skill | Job |
|---|---|---|
| 1 | `news-fetcher` (or `thematic-article-search --topic`) | candidates from the project's sources (its sources list and article-sources doc) |
| 2 | `candidates-triage`, then `published-check` | drop duplicates; skip a story that already has a published article (plus its translations, when the site ships more than one locale) |
| 3 | `article-extractor` (`try-parse-url` on failure) | the article body |
| 4 | `translate-article` | one file per locale the site ships - no mirror on a single-language site |
| 5 | `product-match` (through `content-product-scout`) | products for the tags the article uses, images copied into the project, caption = model name; keeps `data/<host>/tags.yaml` fresh |
| 6 | `wp-publish` -> `wp-record` -> `wp-sync-tags` | optional publish, then frontmatter write-back |

Gate 2 is the one that prevents duplicated work: a `published` match is skipped,
a `draft` match is finished rather than re-fetched, and a `wp_slug` match means
the archive is behind WordPress, not that the story is new.

Step 5 reads the tag registry before it touches WordPress. `data/<host>/tags.yaml`
holds every tag with `count` and `latestUpdate`, plus `synced_at` and `ttl_hours`.
Article runs bump the counters they use; a full tag pull through the WordPress
skill (`ewpa/get-tags`) happens only when `synced_at` is older than four hours -
that is what the `content-product-scout` agent owns. A fresh registry means no
WordPress call for tags at all.

Every chain skill stays individually usable: run one directly only when the
caller wants that single step. `write-article` is the other pipeline - it owns
the service site (content plan, generation queue, cover gate, related entities)
and must not be used on a plain news site.

## Setup

The list of scripts a skill ships lives in that skill's SKILL.md; README does not
duplicate it (progressive disclosure).

```
npm install     # jsdom, @mozilla/readability, vitest
npm test
```

The health check of the mounts runs as a skill:

```
node skills/devops/doctor/scripts/doctor.mjs
node skills/devops/doctor/scripts/doctor.mjs <project>
```

It reads only. With a project path it also fails on `.opencode` leftovers, a
drifted version-script copy, and engine files that moved into skills.

The Jev engine and the prose rubrics are part of this repo (`lib/jev`,
`lib/prose`) and skill scripts reach them through `#lib/*`, so nothing needs
linking after `npm install`: no workspace package, no `node_modules` junction to
recreate. The module-graph test fails if a package-name specifier, a relative
climb into `lib/`, or an unresolvable `#lib/*` import reappears.