# Changelog (window → dated entries → action)

## When chosen

A `product` release that changes an account already in production: an API
upgrade, a pipeline change, a price or quota move. Genre: `product`, funnel
`HoFu` (retention) — the reader already runs the system and needs to know what
moved and how to react.

## Skeleton

1. **Window.** The date and the version or surface the entry covers, so the
   reader learns in one line whether the change is theirs.
2. **Entries.** Newest first. One dated block per change, each with three lines:
   what changed, who it affects, how to roll back or opt out.
3. **Action.** The one step the reader takes if the change touches them,
   with the deadline when there is one.

## Blocks

- Window: one screen; the affected surface and the effective date.
- Entries: self-contained. A value (a number, a field, a limit), the affected
  accounts, and a rollback — never a pointer to another entry for context.
- Action: the migration or the opt-out, as a single directive.

## Failure modes

- An entry that only says «улучшили производительность» with no number.
- An entry that hides the affected accounts or drops the rollback.
- An announcement of a new capability mixed into the log — that is `PSI`, not
  `Changelog`. A changelog describes a change to what already exists.
