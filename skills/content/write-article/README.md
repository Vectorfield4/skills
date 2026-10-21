## Separation of concerns

One home per rule. Sibling layers communicate via upstream references, not duplication:

1. `references/spec-template.md` 
   - **What:** The Brief interface. 12 blank requirement slots defining what data and parameters to harvest before writing.
2. `references/structures/*.md`   
   - **What:** The Schema. Implements logical block sequences, matrix scale boundary anchors, and verdict compliance conditions.
3. `references/genres/*.md`       
   - **What:** The Strategy Ledger. Stores target word count limits, reader archetypes, evidence rules, link thresholds, voice guidelines, anti-examples, and the unique paragraph typography blueprint (Blocks A, B, C).
4. `references/acceptance.md`     
   - **What:** The Semantic Rubric. Holds human-readable checklist rules applied directly by the `prose-critic` subagent.
5. `scripts/`
   - **What:** The Readiness Gate. `audit.mjs` mirrors the deterministic suite for a draft: cover file and size, RU genre floor, the EN mirror ratio, and the relevants gate (every `relatedServices` / `relatedSolutions` / `relatedCases` target exists and is published). `publish.mjs` runs the audit, then sets `draft: false` in both locale files and drops the record from `content/generation-queue.json`. `density.mjs` reports the numeric text metrics. `npm run test` stays the source of truth.
6. `test/`
   - **What:** The Machine Validator. Code pipeline executing automated verification: `articles.test.ts` gauges word count floors, lexicon bans, the EN mirror ratio, the cover gate and the relevants gate; `article-sentence-length.test.ts` enforces the sentence word caps; `copy-guards` and `prose-quality` sweep the RU/EN dictionaries (banned lexicon, EN typography, volume floors, EN ≥ 90 %), and `astro-content` checks RU/EN key parity.
