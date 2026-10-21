// The shared semantic-sensor catalog (Phase 4). Each entry decomposes one axis
// a critic owns into an atomic `noul` question the engine runs in the same batch
// as the G1 checklist. High `answer.noul` is good; a low value is a finding.
//
// Scopes: `unit` asks once per paragraph/Markdown unit (`{{i}}` → index),
// `document` asks once over the whole state. `needs` gates a sensor on a state
// field, so an article-only sensor (AEO, persona) never runs on a service.
//
// The set is deliberately conservative: the residue a local sensor cannot judge
// (`argument_holds`) stays a single document-level question, and the critic
// still confirms it on the light `clean` path.

export const SENSORS = [
  // Two readers ------------------------------------------------------------
  {
    id: "register_jump",
    scope: "unit",
    rule: "REGISTER_JUMP",
    instruction:
      "`units[{{i}}]` keeps one register; it does not jump between technical detail and sales pitch inside itself.",
  },
  {
    id: "persona_fit",
    scope: "document",
    rule: "PERSONA_FIT",
    needs: ["persona"],
    instruction: "`document` speaks to `persona` at their level — not above it, not below it.",
  },
  {
    id: "lead_standalone",
    scope: "document",
    rule: "LEAD_NOT_STANDALONE",
    instruction: "`lead` conveys the point on its own, without the reader going further.",
  },
  {
    id: "conclusion_rephrase",
    scope: "document",
    rule: "CONCLUSION_RESTATES_LEAD",
    instruction: "`conclusion` restates the point in fresh words rather than copying `lead`.",
  },

  // Grounding --------------------------------------------------------------
  {
    id: "claim_supported",
    scope: "unit",
    rule: "CLAIM_UNSUPPORTED",
    instruction: "`units[{{i}}]` supports its claim with a number, a source, or a stated limit.",
  },
  {
    id: "boundary_named",
    scope: "document",
    rule: "BOUNDARY_MISSING",
    instruction: "`document` names who the offer is not for, or states a hard boundary.",
  },
  {
    id: "limits_disclosed",
    scope: "document",
    rule: "LIMITS_HIDDEN",
    instruction: "`document` discloses its limitations in the body, not only in passing.",
  },

  // AEO --------------------------------------------------------------------
  {
    id: "entity_essence_early",
    scope: "document",
    rule: "AEO_ENTITY_LATE",
    needs: ["entity"],
    instruction: "`lead` names `entity` and its essence within the first sentences.",
  },
  {
    id: "lead_answers_query",
    scope: "document",
    rule: "AEO_QUERY_UNANSWERED",
    needs: ["query"],
    instruction: "`lead` answers `query` directly.",
  },
  {
    id: "one_query",
    scope: "document",
    rule: "AEO_MULTI_QUERY",
    instruction: "`document` targets one query, not several at once.",
  },

  // Argument ---------------------------------------------------------------
  {
    id: "point_first",
    scope: "unit",
    rule: "POINT_BURIED",
    instruction:
      "`units[{{i}}]` leads with its point (a number, a decision or a conclusion) rather than a run-up.",
  },
  {
    id: "no_opening_restatement",
    scope: "unit",
    rule: "PARAGRAPH_RESTATES_OPENING",
    instruction: "`units[{{i}}]` does not end by restating its own opening.",
  },
  {
    id: "section_advances",
    scope: "unit",
    rule: "SECTION_OFF_POINT",
    instruction: "`units[{{i}}]` advances the document's single central point.",
  },
  {
    id: "single_cta",
    scope: "document",
    rule: "MULTIPLE_CTA",
    instruction: "`document` carries one call to action, not several competing ones.",
  },
  {
    id: "terminology_stable",
    scope: "document",
    rule: "SYNONYM_CYCLING",
    instruction:
      "`document` uses one term per concept; it does not cycle synonyms for the same thing.",
  },
  {
    id: "term_defined",
    scope: "document",
    rule: "TERM_UNDEFINED",
    instruction:
      "`document` explains each term of art (jargon, acronym or coined phrase) at its first use, before the text relies on it.",
  },

  // Residue — a document-level judgement, confirmed by the critic on the clean path.
  {
    id: "argument_holds",
    scope: "document",
    rule: "ARGUMENT_RESIDUE",
    instruction:
      "`document` holds one argument from lead to conclusion, with no section contradicting another.",
  },
];
