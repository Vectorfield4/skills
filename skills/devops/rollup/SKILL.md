---
name: rollup
description: Use when work on a plan in docs/plans/*.md is finished — every item done, verification passed, Pending empty — and the plan must be compressed in place to what was actually delivered. Triggers: "rollup", "rollup the plan", "finish plan", "compress plan", "close out plan", or auto when a plan's checklist is fully checked and its verification line is current.
---

# Plan rollup

A finished plan is a working document: it carries the path taken, the options
rejected, the intermediate decisions, the abandoned items. None of that belongs
in the codebase once the work is done. A rollup rewrites the plan **in place**
into the short record of what was actually delivered.

The file keeps its path and name. Links to it keep working. Only the content
shrinks.

## When to roll up

All three must hold:

1. Every item in the plan is done.
2. Verification has been run and passed.
3. Pending is empty (or the plan has no Pending section left).

If any of these is false, do not roll up. The plan is still in progress.

## What stays

- **Done.** What was built: files, slugs, counts, commands. Facts, not narration.
- **Acceptance criteria.** Rewritten to say what was actually delivered, not
  what was originally hoped for. If an AC changed shape during the work, the
  rollup states the delivered version.
- **Verification.** The last run that passed, with its numbers.
- **Completion date.**
- **References** worth keeping: PR, commit, published pages, related plans.

## What goes

- The path taken, the reasoning, the rejected options.
- Intermediate decisions that no longer matter.
- Abandoned or superseded items.
- TODO, open questions, "future work" — unless a real follow-up plan exists,
  in which case link it in References.
- Duplicated tables and sections that restate the same facts.
- Anything that is not Done, AC, Verification, Date, or References.

## Shape

```markdown
# <Plan title> — done (YYYY-MM-DD)

## Done

- <work unit>: <files, slugs, numbers>.

## Acceptance criteria

- [x] <AC, phrased as what was delivered>.

## Verification

`lint` clean; `test` N passed / 0 failed; `verify` N pages, `verify:dist` ok.

## References

- PR #N, commit <sha>, pages <slug>.
```
