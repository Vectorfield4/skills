---
name: generate-logo
description: Generates a site logo via Runware direct API and wires it into the Astro layout with responsive optimization. Use when a project needs a wordmark logo (site name, brand header). Triggers: "GenerateLogo", "generate logo", "СЃРіРµРЅРµСЂРёСЂСѓР№ Р»РѕРіРѕС‚РёРї", "Р»РѕРіРѕС‚РёРї СЃР°Р№С‚Р°", "logo for the site".
---

# generate-logo

Generate a wordmark logo for a site, place it under `src/shared/assets/images/`,
and wire it into the base layout with Astro's responsive `<Image>`.

## Input

- `name` - the wordmark text. Defaults to `package.json` `name`.
- `topic` - site theme for the prompt (e.g. `robotics news`).
- `bg` - background hex (default `#1f1f1f`, dark charcoal).
- `fg` - text hex (default `#ffffff`).

Runware reads `RUNWARE_API_KEY` from the environment. Do not write the key into
any file. The transport lives in `lib/runware.mjs`.

## Script

Paths below are relative to this skill directory. From the project root, spell
out the global mount:

```powershell
node "~/.config/opencode\skills\creative\generate-logo\scripts\render.mjs" --json
```

```bash
node <this-skill>/scripts/render.mjs [--name <site>] [--topic <topic>] [--plan] [--json]
node <this-skill>/scripts/render.mjs [--name <site>] [--topic <topic>] --apply [--json]
```

Default is `--plan`: prompt, model, size, output path, `hasKey`, nothing written.
`--apply` renders, verifies the real pixels, and writes the PNG.

## Procedure

1. **Plan.** Run with `--json`. Read `prompt`, `negativePrompt`, `hasKey`.
2. **Author the prompt if the default misses.** The default is a flat vector
   wordmark with a small icon before the text. Pass `--prompt` and `--negative`
   with your own wording when the brand needs a concrete symbol. Keep: lowercase
   geometric sans-serif, high contrast, wide frame, no gradient, no photo.
3. **Apply.** `--apply`. The script verifies 1536x512 before writing
   `src/shared/assets/images/<name>-logo.png`.
4. **Wire into the layout.** In the base layout:
   - `import { Image } from "astro:assets"` and the PNG.
   - Header bar: `background: <bg>; padding: 0.75rem 2rem;` with a link to `/`.
   - `<Image>` with `widths={[320, 480, 640]}`, `sizes="(max-width: 768px)
     320px, 480px"`, fixed `width`/`height` matching the 3:1 ratio, and
     `style="height: 2.5rem; width: auto;"`.
5. **Verify.** `npm run build` must pass and `dist/_astro/` must contain the
   generated `*-logo.*.webp` variants, one per `widths` entry.

## Failure modes

- `RUNWARE_API_KEY is not set` - set it in the environment (User or Machine scope
  on Windows works, `lib/env.mjs` reads the registry too).
- `runware: no imageURL in the response` - wrong response path; the API returns
  `{ data: [{ imageURL }] }`, not a bare array.
- Misspelled wordmark - rerun `--apply --seed <n>`. FLUX.1 is strong with text but
  not deterministic; a second seed is cheaper than editing the image.
- Empty webp list in `dist/_astro/` - the `<Image>` widths were not applied;
  check the import and the `widths` prop.
