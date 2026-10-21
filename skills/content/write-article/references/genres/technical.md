# technical — технические и образовательные

## Case

A tutorial, guide, breakdown, or best practice. The reader reaches a working
result and knows the boundary conditions.

## When chosen

There is a procedure worth reproducing. This is the densest search genre.

## Reader and funnel

Stage: выбор or охват. Reader: an engineer doing the task. One action: inline
CTA to a service or solution.

## Volume and structure

RU 1000–1500 words. Structure: Breakdown or How-To
(`structures/breakdown.md`, `structures/how-to.md`). Breakdown explains a
mechanism; How-To is a procedure the reader reproduces, each step with its
check.

## Layout Topology & Rhythm

Paragraph blocks:

- **Anchor block (A).** 3–5 high-density technical or analytical sentences: a
  core proposition, a grounding metric, and a local friction point.
- **Breather block (B).** 1–2 sentences, each at most 12 words: a blunt verdict,
  an operational directive, or a hard contrast.
- **Cluster block (C).** 4–6 compound technical or narrative sentences for
  unbroken linear reasoning, a step-by-step analysis, or a trace teardown.

This genre's footprint:

| Target volume | Target reader | Allowed blocks | Wave cadence |
| --- | --- | --- | --- |
| 1000–1500 | Core engineer | A, C | Continuous stream: C -> A -> C (breathers stay outside loops) |

## Evidence

Commands, code, configs, and expected output. Each step names its check. Limits
and typical errors appear in the body. Link the runnable artifact when one
exists: a public repo, a gist, or the exact config. A term gets the
term → why → how → example treatment from
`filters/SyntheticDepthTextFilter.md`.

## Links

The service that owns the topic, a solution it belongs to, and adjacent
breakdowns.

## Voice

Instructional and precise. The reader is told what to run and what to expect.

## Anti-examples

- Steps with no check.
- A guide that skips the failure path.
- Copy-paste blocks with no parameter explanation.

## Spec asks

State `category: technical` and the exact step count with the check for each
step.
