---
name: accessibility-engineering
description: Practical WCAG 2.2 AA pass for agent-built UI — contrast pairs, visible and unobscured focus, target sizes, form labels/errors/autocomplete, keyboard paths for modals and menus, headings/landmarks, text-spacing survival, reduced motion, plus an automated axe-core scan step. Use when building or reviewing any UI for accessibility, a11y, WCAG, or screen-reader support.
license: MIT
metadata:
  source: fullstack-agent-os (authored; references WCAG 2.2 quickref, Base UI component compliance)
  category: frontend
---

# Accessibility Engineering — the AA pass that matters

Buy behavior, don't rebuild it: accessible primitives (`component-library`: Base UI/Radix/shadcn) already handle focus management, ARIA, and keyboard interaction for the hard components. Your job is everything around them.

## The checklist (check in this order — the first four catch most failures)

1. **Contrast pairs** (`color-and-contrast`): text 4.5:1, large text 3:1, UI components/borders/icons/focus rings 3:1. Check the REAL pairs, including muted-foreground on card and placeholder-on-input.
2. **Focus visible + not obscured:** every interactive element shows a focus ring (`--color-ring`); sticky headers/floating bars must never cover the focused element (WCAG 2.4.11); tab order follows visual order.
3. **Forms:** every input has a real `<label>` (placeholder is not a label); errors identified in text next to the field + `aria-invalid` + `aria-describedby`; `autocomplete` set (email, name, new-password…) so browsers and password managers work (1.3.5).
4. **Keyboard paths:** the whole flow works without a mouse — modals trap focus and return it on close, menus open/navigate/escape, custom widgets use primitives so this is inherited. Test: unplug the mouse mentally, walk the journey.

## Also required

- **Target size** ≥24×24px with spacing (2.5.8) — icons-only buttons are the usual offenders.
- **Headings & landmarks:** one `h1`, logical heading order (no skipped levels), `<main>`/`<nav>`/landmarks — screen-reader users navigate by structure.
- **Tooltips/dismissibles:** hover/focus content is dismissible (Esc), hoverable (mouse can reach it), persistent (WCAG 1.4.13).
- **Text-spacing survival:** user text-spacing overrides must not break the layout (1.4.12) — no fixed heights on text containers.
- **Images:** meaningful images have `alt` describing their PURPOSE; decorative are `alt=""`; icon-only buttons have accessible names.
- **Reduced motion** (`motion`) and **zoom to 200% without loss of content**.
- **Language & direction:** `lang` set (and changes per locale); RTL via `rtl-arabic`.

## Verification

- **Automated:** axe-core scan in the review loop (Playwright: `AxeBuilder` or `npx axe <url>`) — zero violations on the surfaces you touched. Fix, don't filter.
- **Manual spots (automation can't catch):** keyboard walk of the journey, one screen-reader pass of the main flow (Tab + a reader extension is enough to catch the big ones), focus visible in both themes.

"Not accessible yet" is not a state a feature ships in — the floor is this checklist, on every feature, in both themes and RTL when supported.
