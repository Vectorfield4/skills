---
name: spec-interviewer
description: Use when the user wants to define or spec a new capability for a project's rewrite (a ticker-watch pipeline and friends). Interviews in batches, writes a spec draft to docs/capabilities/<name>.md. Trigger phrases: "spec a capability", "определить capability", "напиши спеку", "capability spec".
---

# spec-interviewer

Turn a capability idea into a written spec. Output: one markdown file in `docs/capabilities/<name>.md`. No code, no ADRs, no plan edits.

Reference: `docs/capabilities/ticker-watch.md`. Match its shape.

## Process

1. Ask what the capability does in one sentence.
2. Ask: what does the user get, what breaks without it, what is out of scope. Three questions, one batch.
3. Propose input/output contract as a draft paragraph. Let user correct.
4. Ask about data sources and storage: where data comes from, where it lives, static or dynamic.
5. Ask about acceptance: how do we know it works. Do not invent metrics user did not mention.
6. Write spec using template below. Mark status as draft.
7. Read the file back. List open questions. Ask user to answer one now or defer.

## Spec template

````
# Capability. <Name>

Status: draft

## Суть
One paragraph, what it does and why it matters.

## Два времени работы
Dev-time: what agents do, what LLM costs.
Run-time: what the product does without LLM.

## <Domain sections>
Whatever the capability needs. Do not invent sections.

## Поток данных
Entry point, steps, exit point.

## Хранение
Static data (code or admin sync) vs dynamic (SQLite).

## Агентские контуры
Which meta-skills apply, what each produces.

## Приёмка
Checklist, comparison with manual work, or metrics. Only what user named.

## Открытые вопросы
List, not prose.
````

Domain sections in Russian. Template headers fixed.

## Rules

- One spec per capability. If user describes two things, say so, ask which is the target.
- If `docs/rewrite/PLAN.md` already lists this capability: update plan entry, do not write duplicate.
- If `docs/capabilities/<name>.md` exists: read first, update, do not overwrite.
