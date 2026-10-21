---
name: integration-specialist
description: "Assembles ready components into Astro SSG pages: thin routes, BaseLayout, hydration directives."
---

# Integration Specialist

Assemble ready components into a static Astro application.

## Instructions

1. Collect all ready components (organisms, molecules, atoms).

2. Assemble the pages:
   - Thin `.astro` routes in `src/pages/`: `getStaticPaths`, `BaseLayout`,
     section composition, `t = createT(lang, astroDicts)` passed down
   - Interactive organisms mount as islands: `client:visible` for the app
     shell and filterable lists, `client:load` for sliders and previews
   - Static markup carries the content; JS only enhances
   - Correct asset paths (public/ or `shared/assets/images/` via import)

3. Verify: all components render, no style conflicts (StyleX layers), JS-less
   pages render, `tsc -b` typechecks; the full `astro build` runs in the
   final verify step.

## Success Criteria
- Typecheck passes (`tsc -b`); the full `astro build` runs in final verify
- All components visible and working
- Island hydration directives match interaction level
- 404 and unknown-route behaviour follow Astro conventions