# skills

Centralized skills and agent definitions for OpenCode. OpenCode loads them from
`~/.config/opencode`, where `skills` and `agent` are symlinks to this repo, so
every project sees the same set. A project must not keep its own `.opencode`
copy.

## Layout

```
agent/          subagent definitions (prose-critic, art-agent, ...)
skills/         SKILL.md + optional scripts/ per skill, grouped by domain
lib/            shared engine: http, cli, env, article-search and wp helpers, generation-queue, jev/ (gates), prose/ (rubrics)
test/           vitest tests for that shared code
```

Entry points live inside their skill, at `skills/<domain>/<skill>/scripts/`. The
repo keeps no `bin/`.

The repo keeps no link into a project. The queue engine is
`lib/generation-queue.mjs`, and the cover pipeline reads the project's
`docs/image-prompts/*` from the working directory at run time, because that
visual language is project data.

## Scripts inside skills

Skills live under `~/.config/opencode/skills/<category>/<skill>`. Run a script by
its path in the global mount:

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
`thematic-article-search`, `wp-publish`, `generate-image-cover`,
`generate-favicon`, `generate-logo`, `project-init`, `write-article`,
`write-service`, `write-solution`, `code-quality`, `doctor`, `release`,
`geo-source-search`, `geo-region-assemble`, `geo-domain-lib`, `product-match`,
`shop-audit`, `shop-vendors`, `shop-harvest`, `shop-price-ledger`, `shop-tagmap`,
`shop-plan`, `shop-gate`, `shop-catalog`, `shop-write`, `shop-verify`,
`shop-report`.

## Shop pipeline

The shop is a deterministic tree: every node is one skill script — flags in,
stable JSON out, exit `0/1/2`, no knowledge of its caller. That is what lets
`content-shop-filler` fan the nodes out to subagents.

| Node | Skill script | Output |
|---|---|---|
| capabilities | `shop-write/scripts/capabilities.mjs` | `data/<host>/transport.json` |
| vendors | `shop-vendors/scripts/vendors.mjs` | `data/<host>/sellers.yaml` |
| aliases | `product-match/scripts/aliases.mjs` | `data/<host>/tag-aliases.json` |
| audit | `shop-audit/scripts/audit.mjs` | `data/<host>/audit.json` |
| harvest | `shop-harvest/scripts/harvest.mjs` | `data/<host>/index/*.json` |
| ledger | `shop-price-ledger/scripts/ledger.mjs` | `data/<host>/prices.yaml` |
| tagmap | `shop-tagmap/scripts/tagmap.mjs` | `data/<host>/tagged-index.json` |
| plan | `shop-plan/scripts/plan.mjs` | `data/<host>/plan.json` |
| gate | `shop-gate/scripts/gate.mjs` | `data/<host>/gated.json` |
| catalog | `shop-catalog/scripts/merge.mjs` | `products/catalog.json` |
| write | `shop-write/scripts/write-rest.mjs` \| `write-wp-payload.mjs` | WooCommerce |
| verify | `shop-verify/scripts/verify.mjs` | `data/<host>/verify-*.json` |
| report | `shop-report/scripts/report.mjs` | `data/<host>/runs/<stamp>/summary.json` |

Three invariants hold across the tree: a product enters only with a tag the blog
uses; the brand allowlist is internal scoring; a price never leaves
`data/<host>/prices.yaml`. The project's `/add-products` command raises
`content-shop-filler`; `content-shop-optimizer` measures the run and makes the
second pass cheaper.

## News article pipeline

A plain news site keeps only `articles/<slug>.<lang>.md` — one file per locale the
site ships (`<slug>.ru.md` alone on a ru-only site, `<slug>.ru.md` + `<slug>.en.md`
when the site serves both): no `content/plan/`, no generation queue, no cover gate,
no `related*` entities. That site has one owner: the
`content-translate-related-articles` agent
(`agent/content/translate-related-articles.md`).

Call it and name the step range — nothing else:

> `content-translate-related-articles`: add two fresh robotics articles from
> `scripts/sources.json`, target language ru, verify and commit. Do not publish.

The agent runs the chain in order:

| # | Skill | Job |
|---|---|---|
| 1 | `news-fetcher` (or `thematic-article-search --topic`) | candidates from the project's sources (`scripts/sources.json`, `docs/article-sources.md`) |
| 2 | `candidates-triage`, then `published-check` | drop duplicates; skip a story that already has a published article (plus its translations, when the site ships more than one locale) |
| 3 | `article-extractor` (`try-parse-url` on failure) | the article body |
| 4 | `translate-article` | one file per locale the site ships — no mirror on a single-language site |
| 5 | `product-match` (through `content-product-scout`) | products for the tags the article uses, images copied into the project, caption = model name; keeps `data/<host>/tags.yaml` fresh |
| 6 | `wp-publish` -> `wp-record` -> `wp-sync-tags` | optional publish, then frontmatter write-back |

Gate 2 is the one that prevents duplicated work: a `published` match is skipped,
a `draft` match is finished rather than re-fetched, and a `wp_slug` match means
the archive is behind WordPress, not that the story is new.

Step 5 reads the tag registry before it touches WordPress. `data/<host>/tags.yaml`
holds every tag with `count` and `latestUpdate`, plus `synced_at` and `ttl_hours`.
Article runs bump the counters they use; a full tag pull through the WordPress
skill (`ewpa/get-tags`) happens only when `synced_at` is older than four hours —
that is what the `content-product-scout` agent owns. A fresh registry means no
WordPress call for tags at all.

Every chain skill stays individually usable: run one directly only when the
caller wants that single step. `write-article` is the other pipeline — it owns
the service site (content plan, generation queue, cover gate, related entities)
and must not be used on a plain news site.

## Setup

```bash
npm install     # jsdom, @mozilla/readability, vitest
npm test        # test/*.test.mjs
```

The health check of the mounts runs as a skill:

```bash
node skills/devops/doctor/scripts/doctor.mjs
node skills/devops/doctor/scripts/doctor.mjs <project>
```

It reads only. With a project path it also fails on `.opencode` leftovers, a
`scripts/version.mjs` copy that drifted from the template, and engine files that
moved into skills.

The Jev engine and the prose rubrics are part of this repo (`lib/jev`,
`lib/prose`) and skill scripts reach them through `#lib/*`, so nothing needs
linking after `npm install`: no workspace package, no `node_modules` junction to
recreate. `test/module-graph.test.mjs` fails if a package-name specifier, a
relative climb into `lib/`, or an unresolvable `#lib/*` import reappears.
