# Service prose rules (self-contained)

The editorial contract for one service page: every string in `services.<slug>.*`,
RU and EN. The writer reads it while drafting; the `service-critic` subagent
applies it before a service leaves draft.

This file is self-contained on purpose: apply it directly, do not load another
skill's rules or a shared file. Where an external checklist has the same idea,
that idea is restated here so the gate never depends on a second skill.

Scope note: the deterministic suite already enforces volume (RU ≥ 700 words,
EN ≥ 90% of RU), banned lexicon and constructions, EN typography, the item-text
length floors and the title/text root overlap. Do not recount those from prose —
judge what a regex cannot.

## Two readers

- **Skim** (manager): `title`, `tagline` and `description` work alone. They say
  what the service does and for whom, with no run-up and no scene-setting.
- **Deep dive** (engineer): `features`, `sections`, `mechanism`, `processSteps`
  and `faqItems` carry the numbers, limits and mechanism.
- The CTA (`ctaBanner`) names the actual next step («Получить программу»), not
  the sale («Оставьте заявку»).

## Grounding — what stands behind a claim

- Every benefit claim carries a number, a source, a named standard or the
  mechanism it rides on. «Быстро» becomes «за 40 мс»; «дешевле» becomes «в 400
  раз».
- A comparative needs a value or a named driver (batch size, volume, context
  window, hardware tier). «Считается иначе» names no driver and is a violation.
- A superlative with no number is a violation. «Корпоративного уровня» is allowed
  only against a named standard (SOC 2, ISO 27001) or a concrete capability.
- Introducing an architecture names at least one trade-off or limit. A flawless
  rollout reads as fiction.
- Banned gloss, each with its required replacement:
  - «Бесшовная интеграция» / "seamless integration" → the mechanism: webhook,
    shared DB view, queue subscription, API call.
  - «Отказоустойчивость из коробки» → the retry, fallback or failover policy,
    with its threshold.
  - «Под ключ» as the only argument → the stages and the scope.
  - "enterprise-grade" → the named standard or the concrete capability.
- Tags: `FAKE_DEPTH_BLOCK` for an ungrounded, false or pure-gloss claim (ground
  it or replace it; rewording alone does not rescue it); `FAKE_DEPTH_REWRITE` for
  a legitimate point stated with no value and no driver (keep the point and
  restate it, never delete the sentence).

## Voice — synthetic depth

- Second person, active voice: «камера ловит дефект», not «дефект ловится
  камерой».
- Prefer the plain word: `utilize`→`use`, `leverage`→`use`,
  `facilitate`→`help`.
- Say "is", not "serves as", "stands as", "boasts".
- One name per object: do not cycle service / solution / tool / system for the
  same thing.
- No empty transitions («кроме того», «важно отметить», "furthermore",
  "moreover") and no page-topography bridges («ниже», «в следующем разделе»,
  "below", "in the next section"). A forward reference is a downstream
  dependency, not a location.
- An unqualified puffery adjective is a violation: «гибкий», «мощный»,
  «надёжный», «масштабируемый» / "flexible", "powerful", "reliable", "scalable".
  "scales to 10k RPS on 4 vCPU" passes.
- Tag: `SYNTHETIC_DEPTH_VIOLATION`.

## Negation filter — positive argument

Argue from what the service does and from a number, never from what fails
without it. Scaring the reader into a purchase is the banned move. This filter
is judgement, not a ban on the words «не/ни/нет» or "no/not/never": a bare
negation is a violation only when it carries a value judgment or builds the
argument. Most «…, а не …» / "…, not …" in service copy are concrete
disambiguation and stay.

Banned reasoning — flag it:

- Antithesis «не X, а Y» / "not X, but Y", and the postposed «X, а не Y» /
  "X, not Y" when the foil is a rhetorical opposite: «Это не чат-бот, а агент» →
  «Агент выполняет задачу».
- «не просто», «не только» / "not just", "not only".
- Doomsaying («без этого проиграете»), legacy-bashing («старые решения
  безнадёжны»), conditional negatives («если не внедрите, потеряете рынок»),
  fear with no number.

Allowed — leave it alone:

- A concrete disambiguation where the foil is a second real metric or option, not
  a rhetorical opposite: «Считаем по шагам, а не по сумме», "we measure the tail,
  not the average".
- A factual limit stated directly: "we do not auto-publish without review".
- A FAQ answer that opens with «Нет» / "No" and then explains.
- A `fitItems` entry with `positive: false` — the sanctioned «кому не подходит»
  boundary; state the concrete boundary plainly («нужен свой ML-стек»), not a
  scare.

`tradeoffs`, `mechanism`, `outcomes` and `deliverables` read positive: no
negation or contrast framing there (the deterministic suite already enforces
this).

Tag: `NEGATIVE_CONNOTATION_VIOLATION: <argument built on negation or fear>.`

## Structure — structural slop

- Vary sentence and paragraph length; break a run of five near-equal ones.
- No tri-colon ("not A, not B, but C"); no forced rule of three; no false range
  ("from X to Y" off a real scale) — list the items directly.
- A colon only before a list or an example, never as a mid-sentence "that is".
- Sentence-case headings (RU is unaffected).
- No name-dropping, promotional language (nestled, vibrant, groundbreaking),
  hedging, generic conclusions, chatbot phrases, or abstract metaphor nouns
  (substrate, wedge, vector, nexus, paradigm, flywheel) — pick the concrete word.
- A `sections` item is a full sentence, not a fragment. `mechanism.text` reads as
  a paragraph because a diagram sits beside it: the point plus its consequence.
- The title of a block item names something its text actually talks about.
- Tag: `STRUCTURAL_SLOP_VIOLATION: <pattern>.`

## Density — tautology

- Delete the sentence: if the meaning survives, it repeated something.
- No cognate self-definition (predicate restates the subject with the same root).
- No adjacent repeat of the same lemma or phrase (an anchored term — a glossary
  term, the entity name — is exempt, and dodging it with a synonym is itself a
  violation).
- One form per list: let the block carry the items and the prose carry meaning,
  not both.
- Tag: `TAUTOLOGY_VIOLATION: <claim> repeats <claim>, adds no fact.`

## Output

One line per finding: `[file:line] TAG: <what>`. If every rule holds, the single
line `VERDICT: PASS`. Never both. Never invent a finding to look useful.
