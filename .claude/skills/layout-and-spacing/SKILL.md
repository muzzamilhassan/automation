---
name: layout-and-spacing
description: Design page and component layout — the 8pt spacing rhythm mapped to the spacing token, fluid space, container queries, alignment as a deliberate choice, and the standard page archetypes (marketing, app-shell, dashboard, detail). Use when building page layouts, fixing cramped or inconsistent spacing, or choosing a page structure.
license: MIT
metadata:
  source: fullstack-agent-os (authored; references the 8-point grid spec, Utopia fluid space)
  category: frontend
---

# Layout & Spacing — rhythm you can feel

## The 8pt rhythm

- All dimensions, padding, margin: **multiples of 8**; text baseline and small dense controls may use 4.
- Implemented through the ONE `--spacing` token (`design-tokens`) — utilities like `p-4`/`gap-6` already land on the grid; arbitrary values (`p-[13px]`) are a smell and need a justification in a comment.
- Soft grid: the rhythm is felt, not drawn — no visible gridlines, no forced equal columns when content says otherwise.

## Fluid space

Like type, space can scale with the viewport via `clamp()` (Utopia-style `--space-*` steps) — section padding breathes on desktop, tightens on mobile, with no breakpoint jumps.

## Container queries over media queries (for components)

Components that must adapt to THEIR box (cards in grids, sidebars, embeds) use container queries; media queries stay for page-level layout. This is what makes a card correct in a 3-column grid AND a narrow sidebar.

## Alignment is a decision

Left-aligned = confident, content-first (most apps). Centered = ceremonial (heroes, empty states, auth screens). Choose per surface and keep it consistent within the surface. Defaulting to centered-everything is an AI-tell.

## Page archetypes (start from one, don't invent)

| Archetype | Structure | Notes |
|-----------|-----------|-------|
| App shell | fixed sidebar + content + optional detail pane | sidebar `sidebar-*` tokens; collapsible at mobile |
| Marketing | hero → proof → features → CTA rhythm | one bold element (see `premium-frontend`) |
| Dashboard | dense, scannable, filters top, content in cards/tables | density high, decoration near zero |
| Detail/form | single column, max-w ~640–720, labels above inputs | reading distance, focus order obvious |

## Whitespace is hierarchy

When a layout feels crowded, the fix is fewer elements or more space between groups — not smaller text. Group related things with less space than you leave between groups (`gap` inside a group < `gap` between groups).
