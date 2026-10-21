# Tautology filter (anti-repetition gate)

The `prose-critic` subagent applies this before returning PASS. It targets text
that says the same thing twice. Density is the goal: every sentence adds a fact,
a number or a decision.

## Tests

- Delete the sentence. If the meaning survives, it was repetition.
- Cognate self-definition: the predicate restates the subject with the same
  root. «Конвейер стоит столько, сколько стоят его этапы», "the pipeline costs
  as much as its stages". Replace with the actual sum or the list.
- Adjacent repeat: the same lemma or phrase closes two neighbouring sentences
  («…запускают по рынкам. …планируют по рынкам»). One of them goes.
  - Exception: an anchored term, a word with one fixed referent in the article
    (a glossary term, an entity name, «модель», «запись», «сид»), is not a
    repeat. Dodging the anchored lemma with a pronoun or a synonym breaks the
    terminology-reuse contract (`acceptance.md`, `SyntheticDepthTextFilter.md`)
    and is itself a violation.
  - Fallback: when the only evasion forces awkward word order, drop the filler
    word or rebuild the clause, never the term.
- A list stated in prose, again in a table, again as headings: keep one form.
  Let the table carry the items and the prose carry the meaning.
- A section that reopens a closed point («как мы уже говорили», "as noted
  above").
- A conclusion that restates the intro. It states the next step or a new
  consequence.
- Two headings that split one idea: merge them.

## Finding

One line per hit: `[file:line] TAUTOLOGY_VIOLATION: <claim> repeats <claim>, adds
no fact.`
