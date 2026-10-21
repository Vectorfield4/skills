# Fake depth filter (anti-gloss gate)

The `prose-critic` subagent applies this before returning PASS. It targets text
that sounds substantial but names no mechanism, limit or number. It is a judged
rule set, not a regex pass: read the claim and ask what stands behind it.

A finding lands in one of two tiers, and the tier sets the remedy:

- **BUILD BLOCKER** — the claim is false, ungrounded or pure gloss. Ground it
  against a named standard, boundary or mechanism, or replace it. Rewording
  alone does not rescue it.
- **REWRITE CRITERION** — the point is legitimate but stated with no value and
  no driver. Keep the point and rewrite it by substitution; do not delete the
  sentence to make the finding go away.

Both tiers block PASS. The tier tells the writer which fix applies.

## Stance

The section reads as field notes, not a press release. Every text brings a
number, a limit or the cost of a mistake. A paragraph that survives with no
number, no limit and no mechanism is gloss.

## Grounding — BUILD BLOCKERS

- No happy path. When the text introduces an architecture or a shift, it names
  at least one trade-off or limitation. A flawless rollout reads as fiction.
- A metric carries its operating boundary: hardware tier, model context limit,
  dataset or document volume, load. An unbounded "scales infinitely" claim is a
  violation.
- A superlative without a number is a violation. "Enterprise-grade" passes only
  when it maps to a named standard (SOC 2, ISO 27001).
- Name who the solution is not for, and the condition under which it breaks.
  «Подход работает на Astro 7 и React 19, на более старых версиях сборка
  падает». Limits and errors sit in the body, not in footnotes.
- The gloss idioms below stay BUILD BLOCKERS until the named replacement lands.

## Evidence and qualifiers — REWRITE CRITERIA

- A number on every benefit claim. «Быстро» becomes «за 40 мс», «дешевле»
  becomes «в 400 раз».
- A number carries a source, date or condition. With no source, write «нужен
  замер».
- When no number exists, the fallback is the mechanic driver: name the control
  the result rides on (batch size, dataset volume, context window, hardware
  tier). «Стоимость снижается по мере роста объёма пакета данных» holds because
  «пакет данных» is the lever. A bare «объём», «по-разному» or «иначе» names no
  lever and stays a violation.

## Cost and quantity — REWRITE CRITERIA

A cost or quantity claim carries a value with its conditions, or a measurement
plan that names the metric and the method. «Нужен замер» / "a measurement is
needed" is allowed once per article, and only when it names what to measure.
Repeating it as a general escape, or closing a section on "depends on volume"
without the mechanism, is a violation.

A comparative is a quantity claim. «Дешевле», «быстрее», «иначе», "cheaper",
"faster", "differently" need a value, a source, or a named driver (batch size,
volume, model). «Серия считается иначе» is a violation; «стоимость кадра
определяется размером партии» is not.

## Call to action — REWRITE CRITERION

The action names the next step, not the sale. «Посмотреть демо», «развернуть
шаблон», «проверить конфиг в песочнице» beat «оставьте заявку сейчас». A
technical reader follows a low-threshold step and ignores a hard sell.

## Banned idioms and their replacement — BUILD BLOCKERS

| Banned | Required replacement |
| --- | --- |
| «Продукт корпоративного уровня», "enterprise-grade solution" | the named standard (SOC 2, ISO 27001) or the concrete capability |
| «Бесшовная интеграция», "seamless integration" | the mechanism: webhook, shared DB view, queue subscription, API call |
| «Отказоустойчивость из коробки», "out-of-the-box resilience" | the retry, fallback or failover policy, with its threshold |

"seamless" already sits in the EN banned lexicon in
`docs/frontend/prose-quality.md`; the Russian «бесшовный» is banned here. When
the mechanism is unknown, the text states «нужен замер» instead of the adjective.

## Finding

One line per hit, tagged by tier:

- `[file:line] FAKE_DEPTH_BLOCK: <claim> names no boundary, trade-off or
  mechanism.`
- `[file:line] FAKE_DEPTH_REWRITE: <claim> states a result with no value or
  driver; state the value or name the lever.`

Both block PASS. A `FAKE_DEPTH_REWRITE` names a point to keep and restate, never
a sentence to delete.
