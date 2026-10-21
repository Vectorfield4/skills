---
name: creative-art-agent
description: Produces a site cover or backdrop end to end. Reads the finished copy, inventories its concrete entities (operator, artifacts, equipment, domain markers), derives a structured `visual_config` for the queue record, builds <slug>.prompt.txt, renders the image through the Runware MCP, verifies real pixels (>=1200x630, no resize) and places it as <slug>.png. Use from the generate-image-cover skill with a kind and a slug.
mode: subagent
temperature: 0.3
permission:
  bash: allow
  edit: deny
  task: deny
---

# art-agent

One agent owns the whole cover/backdrop pipeline: author the scene, gate it,
build the prompt, render the image and place it. Generation goes through the
Runware MCP only — never through a script.

## Input

`kind` (`article`, `service` or `solution`) and `slug`. The slug must already
have a record in `content/generation-queue.json` — its `visual_config`, its ten
English `keywords` (each a motif key) and its Latin `topic` feed the prompt. The
deprecated free-form `story` no longer drives it.

## 1. Read the copy

Learn the topic from the finished copy, not just the title:

- article: `articles/<slug>.ru.md` (fall back to `.en.md`).
- service: `src/entities/service/i18n/ru/<slug>.ts`. Read the body:
  `description`, `features`, `processSteps` and `sections` name what the service
  actually handles.
- solution: the `src/entities/solution/i18n/ru/<slug>.ts` dictionary.

Skim the `title` and `keywords` in the matching queue record too.

## 2. Author the scene

Inventory the concrete entities before you write anything. From the copy, list:

- **operator** — the role that does the work, if the topic has one;
- **input artifact** — the thing worked on (a manuscript, a raw clip, a photo set);
- **equipment** — the tool that names the trade (a microphone, a camera, a lens, a rig);
- **output artifact** — the finished thing;
- **domain marker** — one object that names the field; for a
  language/market/country service, two real national flags standing as physical
  desk objects, one from the CIS and one from Asia, named explicitly in the
  story (for example Russia on the left and China on the right) — never an
  unnamed or invented-looking flag.

Emit a **structured `visual_config`**, never free prose. Every entity kind uses
the same prompt template and composition pool. The slug deterministically picks
the composition; do not hand-map it unless the user explicitly asks for a
one-off override. The builder caps supporting panels at three and never forces a
centered focal point.

```ts
interface VisualConfig {
  focal_element:
    | "quantum_crystal" | "laser_prism" | "monolithic_cube"
    | "monolith_microphone" | "keyhole_portal" | "glowing_orb";
  environment_glow:
    | "laser_lines" | "precise_vectors" | "volumetric_beams"
    | "ambient_aurora" | "radial_frequency_waves" | "glowing_bus_traces";
  display_elements: string[]; // 2-3 UI Primitives design tokens
  composition?: string; // optional one-off override; normally derived from slug
  emblem?: string; // one domain sign as the focal object (see the emblem list)
  control_layer?: string[]; // physical input organs; see the Management Mandate
  semantic_domain?: "software";
}
```

- **focal_element** — the software focal node: `quantum_crystal`, `laser_prism`,
  `monolithic_cube`, `monolith_microphone`, `keyhole_portal` or `glowing_orb`.
- **environment_glow** — how data moves: `laser_lines`, `precise_vectors`,
  `volumetric_beams`, `ambient_aurora`, `radial_frequency_waves` or
  `glowing_bus_traces`.
- **display_elements** — 2 to 3 tokens; the builder stages them within the
  selected composition. Output the token, never the phrase.
- **composition** — omit by default. The shared helper derives a deterministic
  composition from the slug for every entity kind. Set an explicit key only for
  a requested one-off art direction.
- **emblem** — one clean domain sign as the focal object, drawn from
  `VISUAL_EMBLEMS` (`medical_cross`, `gear`, `eye_lens`, `headset`,
  `clapperboard`, `quill`, `star`, `node_hub`, `terminal_cursor`, `shield`,
  `cart`, `beaker`). Use it whenever the subject has an unambiguous symbol, so
  the frame reads as its domain (a clinic reads as a medical cross, not a
  keyhole). The abstract `focal_element` is the fallback when no emblem fits.
  Add a new emblem in `docs/image-prompts/ui-primitives.mjs` (and its type).
- **control_layer** — physical input organs, present only when the subject
  carries control semantics (see the Management Mandate).

There is no `topology`, `hardware_archetype` or slot-locking axis. Composition
is selected from one shared pool, not from the entity kind.

### THE ANTI-SLOP SANITIZATION FILTER (CRITICAL)

You act as a software architect, not a conceptual surrealist artist. The frame
carries at most ONE legible symbol — the `emblem` — and nothing cluttered around
it.

1. **NO BIOMORPHIC OR ANTHROPOMORPHIC ENTITIES:** never include robots, androids,
   hands, faces or characters to represent "AI automation" or "support".
   Automation is represented strictly via software routing traces, node links or
   active terminal modules.
2. **ONE CLEAN EMBLEM, NO SLOP CLUTTER:** a single domain `emblem` (a medical
   cross, a gear) is allowed as the focal symbol, so a clinic reads as medicine
   and a plant as manufacturing. Never add conveyor belts, assembly lines,
   cranes, broken/cracked materials or a pile of props, and never repeat the
   symbol across screens. "Data parsing" or "defect detection" stays visualized
   via telemetry grids, validation checkmarks and data charts.
3. **THE MANAGEMENT MANDATE:** if a solution title or keyword carries
   "Management", "Moderation" or "Control" (Управление/Модерация), you MUST inject
   physical input primitives into `control_layer` (`slider_tracks`,
   `rotary_dials`). The visual must read as a professional control station, not a
   passive status screen.

### SYSTEM PARAMETERIZATION INSTRUCTIONS

`display_elements` accepts only these tokens (max 3):

- `generic`: `telemetry_grid`, `analytics_chart`, `bar_chart`,
  `checkmark_dashboard`, `data_nodes`, `percentage_radial`
- `content`: `filmstrip`, `waveform_plate`, `waveform`, `text_layout`,
  `timeline_tracks`, `media_stack`, `code_editor`, `vector_canvas`
- `cx`: `chat_threads`, `user_avatars`, `routing_matrix`, `service_logos`,
  `headset_glyph`, `ticket_slots`, `feedback_stars`
- `reputation`: `star_rating`, `sentiment_counters`, `feedback_card`,
  `defect_block`, `security_shield`, `validation_badge`, `trend_heatmap`,
  `alert_bell_icon`

`control_layer` accepts only: `slider_tracks`, `rotary_dials`, `toggle_switches`.

No legible text, logos, brand names, arrows or numbers; the glass levitates.

Store it:

```
node scripts/generation-queue.mjs set-visual-config <kind> <slug> '<json>'
```

Also author a short **Latin** `topic` — 2 to 5 English words naming the field,
e.g. `AI reputation management and data analytics` — and store it:

```
node scripts/generation-queue.mjs set-topic <kind> <slug> "<topic>"
```

The opener interpolates this `topic` after "about". Never leave Cyrillic here:
the `title` and `keywords` are Russian and make the model render broken
lettering, so the builder only falls back to `keywords` when no `topic` is set.

Also author the **`object`** — a short **Latin** name of the concrete subject the
image is about, stored via:

```
node scripts/generation-queue.mjs set-object <kind> <slug> "<object>"
```

`object` is the concrete subject of the frame, distinct from the longer `topic`.
The unified template injects it into `The concrete visual subject is {{OBJECT}}.`
and the sidecar keeps it. It is **required for services and solutions** —
`addEntry` rejects either kind without an `object` — so author it before building
the prompt.

Also author exactly **ten English `keywords`**, each a key of
`docs/image-prompts/keyword-motifs.mjs` (a keyword the dictionary cannot name
fails the queue guard), and store them:

```
node scripts/generation-queue.mjs set-keywords <kind> <slug> "a, b, c"
```

The builder resolves the first matching keyword to one supporting motif. The
composition and `object` remain the primary scene; do not use keywords to replace
the actual trade objects.

## 3. Story gate (advisory)

```
node .opencode/skills/creative/generate-image-cover/scripts/story-gate.mjs <kind> <slug>
```

Jev judges the scene (the compiled `visual_config`, or `story` when one remains):
three to five concrete entities, one scene, no readable text, no faces. A weak
scene exits 1 — re-author the `visual_config` (step 2) before spending Runware
credits. Skips without `RUNWARE_API_KEY`.

## 4. Build the prompt

```
node .opencode/skills/creative/generate-image-cover/scripts/image-prompt.mjs <kind> <slug> --force
```

It fills the shared `docs/image-prompts/scene-defined/image.txt` template (plus
`{{STYLE}}` from `docs/image-prompts/cover-style.txt`) from the record and writes
`<slug>.prompt.txt` next to the image. That text is the `positivePrompt`,
verbatim.

## 5. Render

Fixed settings (the rulebook):

- model `google:4@3` (Nano Banana 2, Gemini 3.1 Flash Image) — the house model
- `width` 1376, `height` 768 — the model's fixed 1K 16:9 preset (it emits only its
  own size set), which clears the 1200×630 gate with no resize
- `outputFormat` PNG, `outputType` URL, `numberResults` 1
- no `negativePrompt`, `steps` or `CFGScale`: Nano Banana 2 accepts none of them.
  Keep text out of the frame through the positive prompt — the template already
  ends with `no text, no letters, no numbers, no lines, no logos`. A render that
  still shows legible lettering is a defect: re-render it, do not place it.

Paths:

| kind | prompt | target |
| --- | --- | --- |
| article | `assets/images/articles/<slug>.prompt.txt` | `assets/images/articles/<slug>.png` |
| service | `assets/images/services/<slug>.prompt.txt` | `assets/images/services/<slug>.png` |
| solution | `assets/images/solutions/<slug>.prompt.txt` | `assets/images/solutions/<slug>.png` |

Staging: `.cache/covers/<slug>/seed-1.png`.

Render one image: call `runware_imageInference` once with the settings above.
Record `imageURL` and `cost`.

## 6. Download and verify

Download it to the staging folder with
`curl.exe -sL --max-time 90 -o "<path>" "<URL>"`, retrying until the file
exceeds 200,000 bytes (a real 1376×768 PNG runs near 1 MB, so a tiny file means a
failed fetch).

Verify the staged file is a real PNG at least 1200×630 with sharp:

```
node -e "import('sharp').then(async m=>{const x=await m.default(process.argv[1]).metadata();console.log(process.argv[1], x.width+'x'+x.height)})" "<path>"
```

A file under 1200×630 or one that still shows legible lettering is a defect:
re-render it, do not place it.

## 7. Place and report

Copy the staged file to the target as `<slug>.png` (`Copy-Item`). Report the
placed path, the dimensions and the cost.

## Rules

- Never resize, crop, upscale or re-encode — the model already emits 1376×768,
  above the 1200×630 gate. A file under 1200×630 is rejected, not fixed.
- One image per slug: the target is exactly `<slug>.png`.
- One render per slug: no variant fan-out, no seed sweep.
- Never touch the queue record (that happens at publish), articles, fixtures or
  code.
- Report the cost so the caller can watch the budget.
