---
name: design-tokens
description: Build the design-token system for a project — Tailwind v4 @theme namespaces, semantic background/foreground pairs, oklch colors, single spacing/radius sources, and dark mode as same-token overrides. Use when starting a frontend project, building a theme, adding dark mode, or when raw hex values keep appearing in components.
license: MIT
metadata:
  source: fullstack-agent-os (authored; references Tailwind v4 @theme, shadcn/ui theming, Radix Colors scale)
  category: frontend
---

# Design Tokens — one source of truth, semantic names

Components consume SEMANTIC tokens, never raw values. If a component says `bg-zinc-900` or `#0f172a`, the token system has failed.

## The semantic set (shadcn/ui convention — adopt these names)

Background/foreground PAIRS (every surface gets both):
`background`, `card`, `popover`, `primary`/`primary-foreground`, `secondary`, `muted`/`muted-foreground`, `accent` (hover/focus surfaces), `destructive`, `border`, `input`, `ring`, `chart-1…5`, `sidebar-*`.

## Tailwind v4 @theme mechanics

- Tokens are CSS variables that generate utilities: `--color-mint-500` → `bg-mint-500`.
- Namespaces: `--color-*`, `--font-*`, `--text-*`, `--font-weight-*`, `--leading-*`, `--tracking-*`, `--breakpoint-*`, `--radius-*`, `--shadow-*`, `--ease-*`, `--animate-*`.
- ONE `--spacing` multiplier drives all spacing/sizing utilities; ONE radius variable drives the radius scale via `calc()`.
- `@keyframes` live inside `@theme` (emitted only when used). Use `@theme inline` when variables reference other variables.
- Colors in **oklch** — perceptually even, easy to build scales in.

## Building a palette: 12-step scales with fixed roles

For each hue, build (or take from Radix Colors) a 12-step scale — the roles are the point:

1 app background · 2 subtle background · 3 UI element background · 4 hovered · 5 active/selected · 6 subtle borders · 7 UI border + focus ring · 8 hovered border · 9 solid backgrounds (highest chroma) · 10 hovered solid · 11 low-contrast text · 12 high-contrast text.

Steps 11–12 must reach contrast floors (`color-and-contrast`). Components then use semantic aliases (`primary`, `muted-foreground`…) mapped onto scale steps — so retheming touches aliases only.

## Dark mode

- Same tokens overridden under `.dark` (declare via `@custom-variant dark (&:is(.dark *))` in v4). Dark values are RE-CHOSEN, not inverted — dark surfaces step down (app background ≈ scale step 1–2 of dark scales), borders lighten, saturated accents calm slightly.
- Never `filter: invert()` and never per-component dark hacks.

## Rules

- Every new color/size/shadow need: extend `@theme` first, then consume.
- Style Dictionary only when tokens must feed native/other platforms too — otherwise plain CSS-in-@theme is the whole system.
