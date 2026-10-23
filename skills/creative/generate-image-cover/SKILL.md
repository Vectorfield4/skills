---
name: generate-image-cover
description: Use when producing a cover or backdrop image — an article cover (assets/images/articles/<slug>.png), a service backdrop (assets/images/services/<slug>.png) or a solution backdrop (assets/images/solutions/<slug>.png). Dispatches the art-agent subagent, which authors the scene, builds <slug>.prompt.txt from the generation-queue record with this skill's image-prompt.mjs, and renders the PNG through the Runware MCP. Triggers: "GenerateImageCover", "generate cover", "cover gate", "article cover", "service backdrop", "solution backdrop", "image prompt", "сгенерировать обложку", "обложка", "бэкдроп".
---

# GenerateImageCover

Owns the cover/backdrop pipeline for all three content kinds. This skill holds
the prompt templates and the prompt builder; `art-agent` runs the pipeline end to
end — author, gate, build, render, place — so the procedure lives in one place.

`write-article` and `write-service` delegate their cover gate to this skill
instead of reaching into each other's folders.

## Kinds

| kind | prompt file | image |
| --- | --- | --- |
| `article` | `assets/images/articles/<slug>.prompt.txt` | `assets/images/articles/<slug>.png` |
| `service` | `assets/images/services/<slug>.prompt.txt` | `assets/images/services/<slug>.png` |
| `solution` | `assets/images/solutions/<slug>.prompt.txt` | `assets/images/solutions/<slug>.png` |

## Input

`kind` and `slug`. Kind selects only the conventional output directory. The slug
must already have a record in `content/generation-queue.json`; every kind uses
the same template, style block and composition pool. If the record omits
`visual_config.composition`, `docs/image-prompts/composition.mjs` derives a
stable key from the slug. The `object` and `topic` ground the subject; one
supporting motif may be resolved from `keywords`.

## Procedure

1. **Dispatch `art-agent`** with `kind` and `slug`. It reads the finished copy,
   inventories the concrete entities, authors a structured `visual_config` and
   exactly ten English `keywords` (each a key of
   `docs/image-prompts/keyword-motifs.mjs`) into the record with
   `scripts/queue.mjs set-visual-config`, runs the advisory scene gate
   (`scripts/story-gate.mjs`), builds `<slug>.prompt.txt` with
   `image-prompt.mjs --force`, renders once through the Runware MCP, verifies real
   pixels (≥1200×630, no resize) and places it as `<slug>.png`.
2. Report the placed `<slug>.png`. The queue record stays until the publishing
   pipeline drops it — this skill never removes it.

## Scripts

Paths below are relative to this skill directory. From the project root, spell
out the global mount:

```powershell
node "$env:USERPROFILE\.config\opencode\skills\creative\generate-image-cover\scripts\queue.mjs" list --json
```

```
node <this-skill>/scripts/queue.mjs list [--kind article|service|solution] [--json]
node <this-skill>/scripts/queue.mjs get|remove <kind> <slug>
node <this-skill>/scripts/queue.mjs add --kind <k> --slug <s> --title "<t>" --keywords "a, b" [--object "<o>"] [--topic "<t>"] [--visual-config '<json>']
node <this-skill>/scripts/queue.mjs set-visual-config|set-topic|set-object|set-keywords <kind> <slug> <value>
node <this-skill>/scripts/image-prompt.mjs <kind> <slug> [--idea "..."] [--lang "..."] [--force] [--print]
node <this-skill>/scripts/image-prompt.mjs <kind> --all [--force]
node <this-skill>/scripts/story-gate.mjs <kind> <slug> [--advisory]
```

The queue engine is `lib/generation-queue.mjs`; the CLI only adds the project's
composition normalizer. The visual language in `docs/image-prompts/` is project
data, loaded from the project the script runs in. A project without those modules
gets a clear error instead of a broken prompt.

The scene comes from the record's `visual_config` (compiled by `buildScene()`)
and a deterministic slug-derived composition. There is no per-kind prompt branch
or legacy centered fallback. The deprecated free-form `story` no longer drives
the prompt. `--idea` overrides the scene for a one-off. An entry with no
`visual_config` gets a `[TODO: ...]` marker. The pickers glob only
`png/jpg/jpeg/webp`, so `.prompt.txt` files never ship.
