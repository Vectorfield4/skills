# Synthetic depth filter (anti-slop gate)

Targets the structural predictability of a raw model draft: placeholder code,
empty transitions, adjective padding, voiceless diction. The `prose-critic`
subagent applies it before returning PASS.

## Code block hygiene

- No placeholder stubs: `// TODO: implement logic`, `// your code goes here`, a
  bare `...` in a body, or a signature with no body.
- A snippet that claims to run names its check, its expected output, or its
  error path. A conceptual illustration must say so, as the Jev example does
  with «Концептуальный пример», and is not required to carry `try/catch`. Do
  not demand production error handling from a marketing illustration.

## Voice and diction

- Second person «вы», active voice. The subject performs the action: «камера
  ловит дефект», not «дефект ловится камерой». No condescension.
- Prefer the plain word: utilize becomes use, leverage becomes use, facilitate
  becomes help.
- Say "is", not "serves as", "stands as", "boasts".
- Do not cycle synonyms for one object; pick one name and repeat it.
- Vary sentence length. The full rhythm rules live in
  `docs/frontend/prose-quality.md`.

## Terminology

Introduce a term once, then reuse it unchanged. Order: the term, why the reader
needs it, how it works, one example. «Контекстное окно (сколько текста модель
видит за раз): 128k токенов на вход, 4k на ответ. На 200 страницах точность
падает».

## Lexical sweep

Empty transitions, delete or replace with a claim:

- «В заключение», "in conclusion"
- «Важно отметить», "it is important to note"
- «Кроме того», "furthermore", "moreover"
- «Рассмотрим подробнее», "let's take a closer look"

Spatial bridges, delete or replace with the downstream claim:

- «Ниже», «выше», «в следующем разделе», "below", "above", "in the next
  section". The link between paragraphs is a downstream dependency, never page
  topography. «Ниже приведена матрица» becomes the claim that follows the
  table, or goes away.

Puffery adjectives, allowed only with a quantitative parameter:

- «гибкий» / "flexible"
- «мощный» / "powerful"
- «надёжный» / "reliable"
- «масштабируемый» / "scalable". A bare "scalable" is a violation; "scales to
  10k RPS on 4 vCPU" is not.

Banned lexicon, the short version. `docs/frontend/prose-quality.md` is the
canonical full list and `test/copyRules.ts` enforces the deterministic part:

- EN: leverage, robust, seamless, delve, utilize, facilitate, truly, pivotal,
  showcase, «in today's landscape», «experts say» with no source.
- RU: «инновационный», «передовой», «комплексный», «уникальный», «раскрыть
  потенциал», «вывести на новый уровень», «в эпоху цифровизации», «эксперты
  считают» with no source.

## Finding

One line per hit: `[file:line] SYNTHETIC_DEPTH_VIOLATION: <placeholder | empty
transition | unqualified adjective | synthetic diction>.`
