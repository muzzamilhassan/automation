---
name: premium-frontend
description: Orchestrator for premium-grade frontend work — the design-lead process that avoids generic AI-looking UI — two-pass design (token plan, then self-critique), the named AI-cliché blacklist, distinctive typography and color policies, and routing into the frontend sub-skills. Use for ANY UI work building pages, components, themes, or screens, whenever the user wants it to look good, premium, distinctive, or production-grade.
license: MIT
metadata:
  source: fullstack-agent-os (authored; process model from anthropics/frontend-design skill + Anthropic design-quality guidance)
  category: frontend
---

# Premium Frontend — the design-lead process

You are the design lead at a studio known for giving every client a distinct visual identity. The client has already rejected proposals that felt clichéd or templated. Take deliberate, opinionated positions on palette, typography, and layout.

## Two-pass process — never skip pass one

**Pass 1 — the design plan (before any component code):**
1. Read the brief/spec; state the one message the surface must land.
2. Token plan: 4–6 named colors (dominant + sharp accent + neutrals), type roles (display/text faces, scale), spacing rhythm, radius/shadow policy.
3. ASCII wireframe of the main surface + the alignment decision (left-aligned confident, or centered ceremonial — a choice, not a default).
4. Which sub-skills apply (tokens? RTL? dashboard vs marketing?).

**Pass 2 — self-critique against the blacklist (below) and the brief:** "if any part reads like the generic default — revise it." THEN write code.

## The AI-design blacklist (named tells — none may appear)

1. **The cream+serif+terracotta default** (warm off-white background, serif display, terracotta/orange accent) — the most-copied "tasteful AI" look.
2. **Near-black + acid green** — the "edgy AI" look.
3. **Broadsheet/hairline style** — thin rules everywhere, tiny caps labels, editorial cosplay without editorial content.
4. **The SaaS-card kit** — one radius everywhere, identical soft shadows, cards on washes, gradient buttons.
5. **Template chrome** — ALL-CAPS eyebrow labels, `A · B · C` meta strings, `→` decorating every link, near-black-tinted "blacks".
6. **Scattered motion** — fade-slide-up on every section. One orchestrated moment per page instead (see `motion`).

Also banned: default fonts (Inter, Roboto, Arial, system stack) as the identity face; timid even palettes; size jumps of only 1.5x between hierarchy levels.

## Policies

- **High contrast = interesting.** Dominant color with sharp accents; extreme weight pairs (100/200 vs 800/900); display sizes 3x+ over body.
- **Spend your boldness in ONE place.** One memorable element per surface; the rest stays quiet.
- **Microcopy:** "Save changes" not "Submit"; errors specific and unapologetic; empty states invite action (`app-states`).
- **Anti-convergence:** do not drift to the new default (e.g. Space Grotesk on everything). Justify the pick per brief.

## Quality floor (always, unannounced)

Responsive at 375/768/1440 · visible keyboard focus · `prefers-reduced-motion` respected · accessible (contrast, labels, targets). Not optional, not listed as a feature — just done.

## Routing

| Need | Skill |
|------|-------|
| Colors/spacing/radius/dark mode system | `design-tokens` |
| Layout, grids, page archetypes | `layout-and-spacing` |
| Font picks, scale, line rules | `typography` |
| Palette construction, contrast floors | `color-and-contrast` |
| Buttons/inputs/dialogs — compose, don't invent | `component-library` |
| Animation | `motion` |
| Loading/empty/error/success | `app-states` |
| Breakpoints, fluid scale | `responsive` |
| WCAG AA pass | `accessibility-engineering` |
| RTL/Arabic surfaces | `rtl-arabic` |
| Figma input | `figma-to-code` |
| ANY page/screen finished | **`visual-review-loop`** (mandatory before done) |

Screenshots are worth more than introspection: LOOK at the UI you built (`visual-review-loop`), and hand the shots to the `design-critic` agent for fresh-eyes review when available.
