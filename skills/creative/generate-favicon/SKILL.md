---
name: generate-favicon
description: Generates a site favicon via Runware direct API and wires it into the Astro layout. Use when a project needs a favicon/icon. Triggers: "GenerateFavicon", "generate favicon", "сгенерируй иконку", "favicon для сайта", "icon for the site".
---

# generate-favicon

Generate a square favicon for a site, place it under `public/`, and wire it into
the base layout.

## Input

- `name` - site name. Defaults to `package.json` `name`.
- `topic` - site theme for the prompt (e.g. `robotics`).
- `bg` - background hex (default `#1f1f1f`).
- `fg` - icon hex (default `#ffffff`).

Runware reads `RUNWARE_API_KEY` from the environment. Do not write the key into
any file. The transport lives in `lib/runware.mjs`.

## Script

Paths below are relative to this skill directory. From the project root, spell
out the global mount:

```powershell
node "$env:USERPROFILE\.config\opencode\skills\creative\generate-favicon\scripts\render.mjs" --json
```

```bash
node <this-skill>/scripts/render.mjs [--name <site>] [--topic <topic>] [--plan] [--json]
node <this-skill>/scripts/render.mjs [--name <site>] [--topic <topic>] --apply [--json]
```

Default is `--plan`: it prints the prompt, the model, the size and the output
path, writes nothing, spends nothing, and reports `hasKey`. `--apply` renders,
verifies the real pixels, and writes the PNG.

## Procedure

1. **Plan.** Run with `--json`. Read `prompt`, `negativePrompt`, `hasKey`.
2. **Author the prompt if the default misses.** The default is a flat vector icon
   for the site name and topic. Pass `--prompt` and `--negative` with your own
   wording when the topic needs a concrete symbol. Keep: flat vector, one
   symbol, square, centered, high contrast, no text, no gradient, no photo.
3. **Apply.** `--apply`. The script verifies the PNG header is at least 512x512
   before writing `public/favicon.png`.
4. **Wire into the layout.** In the base layout `<head>`:
   - `<link rel="icon" type="image/png" sizes="512x512" href="/favicon.png" />`
   - `<link rel="apple-touch-icon" href="/favicon.png" />`
5. **Verify.** `npm run build` must pass and `dist/favicon.png` must exist.

## Failure modes

- `RUNWARE_API_KEY is not set` - set it in the environment (User or Machine scope
  on Windows works, `lib/env.mjs` reads the registry too).
- `runware: no imageURL in the response` - wrong response path; the API returns
  `{ data: [{ imageURL }] }`, not a bare array.
- `image is 384x384, expected at least 512x512` - the model ignored `size`. Raise
  `--size`, or drop `--size` and let the default apply.
- Misspelled or busy icon - rerun `--apply --seed <n>`; the default prompt omits
  text on purpose, because a model cannot be trusted to spell it.
