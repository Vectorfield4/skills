# SOLID and separation of concerns

The rule home for the `code-quality` gate. A Jev candidate names the principle;
this file says what the principle means, what a violation looks like in code, and
how to report or fix it. The gate is advisory — judge every candidate here before
acting on it.

## SRP — single responsibility

A unit should have one reason to change. A violation mixes concerns: business
rules with I/O, validation with persistence, parsing with formatting,
orchestration with policy.

- Look for: a function that fetches, transforms and renders; a class named
  `...Manager`/`...Service` that owns unrelated state; a handler that validates,
  writes and emails.
- Report: `[file:line] SRP_CANDIDATE`. Fix by extracting the secondary concern
  into its own unit and passing the result in.

## OCP — open/closed

A unit should be extendable without editing it. A violation is a growing
`if`/`switch` on a type tag, or a branch list that every new case must touch.

- Look for: `switch (kind)` returning per-kind behavior; an array of special
  cases checked inline; a `type === "x"` ladder.
- Report: `[file:line] OCP_CANDIDATE`. Fix with a map/strategy keyed by the tag,
  or a polymorphic handler, so a new case is data, not a new branch.

## LSP — Liskov substitution

A subtype or implementation must honour the contract of the type it substitutes.
A violation throws where the base promises a value, narrows an accepted input, or
widens a returned type.

- Look for: `throw new Error("not supported")` in an implementation; an override
  that drops a parameter; a subtype that returns a narrower shape.
- Report: `[file:line] LSP_CANDIDATE`. Fix the contract or split the hierarchy so
  the substituted type is genuinely interchangeable.

## ISP — interface segregation

A consumer should not depend on members it does not use. A violation is a fat
interface, or an options/context bag every caller must partially fake.

- Look for: a component that takes a 12-field props object and uses three; a
  client interface with methods some implementations stub out.
- Report: `[file:line] ISP_CANDIDATE`. Fix by splitting the interface into the
  roles its consumers actually need.

## DIP — dependency inversion

High-level policy should depend on abstractions, not on infrastructure details. A
violation constructs a concrete dependency, reaches a global, or reads config in
domain code.

- Look for: `new ConcreteClient()` inside a domain function; inline `fetch`
  in business logic; `process.env` read where a policy decision is made; a direct
  import of an infra module in a rule.
- Report: `[file:line] DIP_CANDIDATE`. Fix by taking the dependency as a
  parameter/port and supplying the concrete implementation at the edge.

## SoC — separation of concerns

Closely related to SRP but across layers: one unit mixes layers or
responsibilities — I/O with parsing, transport with rendering, validation with
persistence, UI with data access.

- Look for: a component that fetches and renders; a parser that also writes
  files; a form handler that validates, submits and updates global state.
- Report: `[file:line] SOC_CANDIDATE`. Fix by moving each layer behind its own
  boundary and composing them.

## Reporting

One line per finding, in the skill's log format: `[file:line] RULE (confidence) —
offending code`. State the reason in prose only when you act on it; the gate only
locates the candidate.
