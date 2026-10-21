# Negative connotation filter (positive-argument gate)

The `prose-critic` subagent applies this before returning PASS. The section
argues from what the system does and from a number, never from what fails
without it. Scaring the reader into a purchase is the banned move.

## Banned reasoning

| Pattern | Example | Replace with |
| --- | --- | --- |
| Antithesis «не X, а Y» | «Это не чат-бот, а агент» | state Y: «Агент выполняет задачу» |
| Antithesis, postposed «X, а не Y» | «Решение опиралось на цифры, а не на общие слова» | state X and drop the foil: «решение опиралось на цифры и замеры» |
| «не просто», «не только» | «Не просто отвечает, а действует» | the action |
| Contrary «на деле иначе» | «На деле всё иначе» | the fact |
| Conditional negative | «Если не внедрите, потеряете рынок» | «Внедрение возвращает X за Y» |
| Doomsaying | «Без этого компания проиграет» | the cost of the status quo, with a number |
| Legacy-bashing | «Старые решения безнадёжны» | the criterion where the new option wins |
| Failure-mode framing | «Дорогая модель оплачивается впустую, дешёвая требует переделки» | the mechanism: «маршрутизация закрывает простые задачи дешёвой моделью» |
| Fear with no number | «Правки после публикации дороже любой сметы» | the concrete benefit: «проверка по источникам снимает риск до публикации» |

A limit is stated directly: «кэш окупается на потоках с повторами», never «кэш
работает не всегда». Comparison lives in a criteria table with a scale
(`common.md`), not in dismissal of the alternative.

The postposed form is banned when it carries a value judgment. «Считаем по шагам,
а не по сумме» stays: the foil is a second concrete metric, a disambiguation, not
a rhetorical opposite. Same rule for EN "X, not Y".

## Deterministic overlap

`test/copyRules.ts` already hard-fails the RU patterns «не просто … а» and the
rest for every article. This filter catches the semantic forms the regex cannot:
a paragraph built on fear, a legacy-bashing aside that never uses the word «не».

## Finding

One line per hit: `[file:line] NEGATIVE_CONNOTATION_VIOLATION: <argument built
on negation or fear>.`
