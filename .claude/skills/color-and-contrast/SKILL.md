---
name: color-and-contrast
description: Construct the color palette — dominant color with sharp accents, 12-step scales with semantic aliases, WCAG/APCA contrast floors for text and UI, chart palettes, and tasteful gradient use. Use when building a theme palette, fixing contrast failures, choosing chart colors, or when a UI looks washed-out or timid.
license: MIT
metadata:
  source: fullstack-agent-os (authored; references Radix Colors scale roles, WCAG 2.2, Anthropic design-quality guidance)
  category: frontend
---

# Color & Contrast — dominant, sharp, compliant

## Strategy: dominant + sharp accent

Pick ONE dominant color that owns the surface (60–75% visual weight), ONE sharp accent that only appears where attention is wanted, and a neutral ramp for text/surfaces. Timid even palettes read generic; "high contrast = interesting" — but boldness lives in the accent, not everywhere (`premium-frontend`: boldness in ONE place).

## Build on 12-step scales

Each hue as a 12-step scale with fixed roles (see `design-tokens` for the role table). Components consume semantic aliases only — remapping aliases re-themes the app without touching components.

## Contrast floors (non-negotiable)

| Pair | Floor |
|------|-------|
| Body text vs its background | 4.5:1 |
| Large text (≥24px / ≥19px bold) | 3:1 |
| UI components & graphics (borders, icons, focus rings, chart lines) | 3:1 |
| Disabled/decorative | exempt |

Reference points beyond WCAG: aim APCA **Lc 60** for body text and **Lc 90** for small critical text on step-2 backgrounds (12-step scales built for roles 11–12 deliver this). Check every new pair — this is a build-time check, not a post-launch apology.

## Chart palette

Use `chart-1…5` tokens; order by distinguishability for color-blind viewers (vary lightness AND hue, not hue alone); never rely on color as the only channel — label lines directly where feasible.

## Gradients

Allowed as atmosphere: subtle layered background gradients creating depth (dominant hue family). Banned as decoration: the purple-to-pink button/banner gradient — an AI-tell. If a gradient is the idea, it must survive the question "what is it FOR?"

## Dark mode colors

Re-chosen, not inverted: surfaces step DOWN in lightness, borders lighten slightly, saturated accents calm down, shadows barely exist (elevation = surface steps, not blur). All via the same semantic tokens under `.dark`.
