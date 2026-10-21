---
name: svg-composition
description: "Author and compose SVG illustrations: layered gradient scenes, IconCircle wrappers, data-driven asset wiring. Raster enough — no inline SVG in JSX."
---

# SVG Composition

Compose vector illustrations and iconography. SVGs are **assets, not
components**: render via `<img>`, never inline `<svg>` in JSX.

## Solution illustration template

`shared/assets/images/<slug>.svg` — authored illustration for a card/section.

- `viewBox="0 0 800 500"`, background `<rect width="800" height="500" rx="32">`.
- Root `<svg>`: `xmlns`, `viewBox`, `aria-hidden="true"`.
- Header comment: purpose, palette note, "no text by design (i18n)".
- Palette from `shared/design/tokens.stylex.ts` — pull the primary/neutral ramps
  as hex and use them consistently across the illustration set.
- Background gradient:
  ```xml
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#E3F2FD"/>
    <stop offset="0.55" stop-color="#C7E0F8"/>
    <stop offset="1" stop-color="#B3D6F4"/>
  </linearGradient>
  ```
- Layer order: bg rect → decorative corner dots/dashed rings → translucent
  drop shadows (`fill-opacity="0.06–0.07"`) → subject → dashed connection
  lines (`stroke-dasharray="1 10"`, `stroke-linecap="round"`) → arrow
  polygons → accent indicator dots (solid dot + `stroke-opacity="0.35"` ring).
- No text anywhere — all copy lives in the component (i18n).

## IconCircle wrapper

Lucide icon in a translucent tinted circle (from `shared/ui/atoms/IconCircle.tsx`):

```tsx
import stylex from "@stylexjs/stylex";
import { tokens } from "@/shared/design/tokens.stylex";

type Props = {
  icon: LucideIcon;
  size?: number;
  color?: string;
};

export function IconCircle({ icon: Icon, size = 48, color = tokens.primary }: Props) {
  return (
    <div
      style={{ width: size, height: size, borderRadius: "50%", color }}
      {...stylex.props(s.Circle, s[color])}
    >
      <Icon size={size * 0.5} strokeWidth={2} />
    </div>
  );
}
```

## Data-driven wiring

- Illustrations: import each SVG in the data file
  (`import img from "../assets/images/<slug>.svg"`), assign to the model field,
  render via `<img src={...}>` with `aspectRatio: "8 / 5"`,
  `objectFit: "cover"`.
- Icons: type the field as `LucideIcon`, import the icon in the data file,
  render through `IconCircle`. Adding an entry = adding a row + asset, no new
  components.

## Rules

- Theme-consistency: baked-in colors; SVGs render identically on light and
  dark themes. Do not reference the StyleX vars object inside SVG files.
- Never use raster images where an SVG reduces to vectors (icons, diagrams,
  charts, logos).
- Do not author raster/generated assets (`hero`, `cover`, `og`, `background`,
  `avatar`, `thumbnail`, `concept`, `illustration` for photos); SVG-authorable
  assets stay inline here.