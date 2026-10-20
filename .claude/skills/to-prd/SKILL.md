---
name: to-prd
description: Synthesize the current conversation or idea into a product requirements document (PRD) that describes the end state, not the journey. Use when the user says "to-prd", "write a PRD", or asks to pin down mission, users/personas, scope, prioritized features (P0/P1/P2), success metrics, or risks before any tickets exist.
license: MIT
metadata:
  source: authored (inspired by mattpocock/skills + aihero.dev)
  category: lifecycle
---

This skill takes the current conversation context and turns it into a PRD: a document that describes the **end state** of the product, not the journey to it. Do NOT interview the user; just synthesize what you already know. If major product questions are still open, suggest running the `grill-me` skill first, then synthesize.

**The doctrine: the PRD describes the end state, not the journey.** Write what will be true when the product is done, never how you will get there. "Users can pay with a credit card" belongs in a PRD; "integrate Stripe webhook handler" does not - that is a ticket. A reader should be able to hold the shipped product against every line and answer "does the product do this?" with a plain yes or no.

## Process

1. Explore the repo (if one exists) and the conversation for context. Use the project's domain glossary vocabulary throughout, and respect any ADRs in the area.

2. Write the PRD using the template below, then publish it where the project keeps product documents (`docs/` or whatever location the project has agreed on). If no convention is clear, ask the user where to publish it.

3. Once the PRD is approved, point the user at the `to-tickets` skill to split it into dependency-ordered tickets. Do not create tickets yourself.

<prd-template>

## Mission

One paragraph: what this product is and why it exists - the change it makes in the world once it is done.

## Users and Personas

Who this is for. For each persona: who they are, what they are trying to accomplish, and what success looks like from their side. Keep personas few and load-bearing: three real ones beat seven decorative ones.

## In Scope

What this product will do, written as end-state statements.

## Out of Scope

What this product explicitly will NOT do, at least for now. Every entry here is a decision, not an omission: record why, so it does not get re-litigated every cycle.

## Features

A table of features, each an end-state capability:

| #   | Feature | Description (end state)                     | Priority |
| --- | ------- | ------------------------------------------- | -------- |
| F1  | ...     | A statement of what users can do when done  | P0       |

Priorities:

- **P0** - the product does not ship without it. The mission fails if this is missing.
- **P1** - expected at launch, but the product is usable and valuable without it.
- **P2** - wanted later; record it so it is not lost, but nothing depends on it.

## Success Metrics

How you will know the product works, from the user's side and the business's side. Each metric must be observable once the end state is reached: if you cannot measure it, it is not a success metric, it is a hope. Name the instrument (analytics event, benchmark, support-ticket count) wherever that is not obvious.

## Risks

What could sink this, ordered by severity. For each: the risk, the signal that would tell you it is happening, and the mitigation or the bet being made. Cover build risks (unknowns, dependencies, integrations) and product risks (adoption, trust, cost).

## Open Questions

Anything explicitly deferred, with who or what needs to answer it. A PRD may ship with open questions; it may not ship with silent ones.

</prd-template>

Keep the PRD free of file paths, ticket breakdowns, and implementation plans: they belong to the `to-tickets` stage and go stale fast. Exception: if a prototype produced an artifact that pins the end state down more precisely than prose can (a schema, an API contract, a type shape), inline it within the relevant feature and note briefly that it came from a prototype. Trim to the decision-rich parts.
