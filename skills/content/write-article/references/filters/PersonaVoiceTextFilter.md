# Persona voice filter (metric vocabulary)

The `prose-critic` subagent applies this before returning PASS. The calendar row
names a buyer persona (`content/plan/contract.ts`, `PlanPersona`); the argument
must speak that buyer's metrics, not a generic audience. A piece aimed at a CTO
that argues in CAC is off-voice, even when every number is true.

## Metric vocabulary

| Persona | Vocabulary |
| --- | --- |
| CMO | CAC, LTV, velocity, channel conversion |
| Head-of-Content | editorial loop latency, glossary adherence, style match |
| CTO | latency, throughput, token economy, on-prem limits |
| Legal-Compliance | copyright risk, data leakage, consent logging |
| COO-Operations / COO-Plant | operational errors, automation ROI, throughput, utilization |

## Rules

- The lead and the verdict each name at least one metric from the persona's row.
- A claim borrowed from another persona's vocabulary is translated to this one
  (a CTO's latency becomes the CMO's time-to-market only when the number ties
  the two).
- The persona is the row's `persona`, not the genre: a `technical` piece for a
  CMO still argues in the CMO's metrics.

## Finding

One line per hit: `[file:line] PERSONA_VOICE_VIOLATION: <claim argues in another
persona's metrics>.`
