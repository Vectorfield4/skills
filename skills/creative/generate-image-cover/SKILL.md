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
   `docs/image-prompts/keyword-motifs.mjs`) into the record, runs the advisory
   scene gate
   (`.opencode/skills/creative/generate-image-cover/scripts/story-gate.mjs`), builds
   `<slug>.prompt.txt` with `image-prompt.mjs --force`, renders once through the
   Runware MCP, verifies real pixels (≥1200×630, no resize) and places it as
   `<slug>.png`.
2. Report the placed `<slug>.png`. The queue record stays until the publishing
   pipeline drops it — this skill never removes it.

## Builder

```
node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs <kind> <slug> [--idea "..."] [--lang "..."] [--force] [--print]
node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs <kind> --all [--force]
```

The scene comes from the record's `visual_config` (compiled by `buildScene()`)
and a deterministic slug-derived composition. There is no per-kind prompt branch
or legacy centered fallback. The deprecated free-form `story` no longer drives
the prompt. `--idea` overrides the scene for a one-off. An entry with no
`visual_config` gets a `[TODO: ...]` marker. The pickers glob only
`png/jpg/jpeg/webp`, so `.prompt.txt` files never ship.
