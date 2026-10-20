---
name: rtl-arabic
description: Build and verify right-to-left and Arabic UI — dir on the html element, the logical-properties mandate, the mirror/no-mirror matrix, Arabic typography rules (letter-spacing 0, line-height headroom, skip-ink), numerals policy, and screenshot verification in RTL. Use when a product supports Arabic/RTL, when building bilingual layouts, or when an RTL layout looks broken or half-mirrored.
license: MIT
metadata:
  source: fullstack-agent-os (authored; references W3C qa-html-dir, RTL Styling 101, UAE design system typography)
  category: frontend
---

# RTL & Arabic — mirrored, not translated-left-to-right

## Foundation

- `dir="rtl"` + `lang="ar"` on **`<html>`** — base direction feeds the Unicode bidi algorithm. NEVER set base direction in CSS (direction must survive stylesheets failing to load).
- Runtime/user-generated content (chat names, comments): `dir="auto"`; mixed-direction inserts (a username inside Arabic text): `<bdi>`.
- `lang` does not imply direction and vice versa — set both, explicitly.

## The logical-properties mandate

Physical direction utilities are BANNED in component code: `left/right`, `ml-/mr-`, `pl-/pr-`, `text-left/right`. Use logical: `ms-/me-`, `ps-/pe-`, `start-/end-`, `text-start/end`, `border-s/e`, `rounded-s/e`. Tailwind's `space-x-*` already compiles to logical properties and flips with `dir` — physical utilities silently refuse to mirror, which is how half-mirrored UIs happen.

## The mirror matrix

| MIRROR in RTL | NEVER mirror |
|---------------|--------------|
| directional icons/arrows, breadcrumbs, tab order, tables (column order), toasts/snackbars position, progress direction, toggles/switches travel | logos, media playback controls (play is play in every language), clocks/watches, anything depicting a physical object with inherent handedness |

SVG arrows that don't flip via CSS: `scaleX(-1)` transform (wrap in a `[dir=rtl]` selector).

## Arabic typography (from `typography`, repeated because it breaks silently)

- `letter-spacing: 0` — ANY tracking disconnects the joined script.
- Line-height headroom — diacritics clip under Latin-tuned heights (this bug shipped at Twitter).
- `text-decoration-skip-ink` for underlines; never `word-break` Arabic; no `justify` (slows reading); buttons get `min-width` (labels shrink dramatically).
- Font stack: a real Arabic family as `--font-*` (Noto Kufi Arabic, Alexandria, IBM Plex Sans Arabic…), paired Latin companion declared.
- **Numerals policy:** pick Hindi digits (٠١٢٣) or Arabic numerals (0123) per product — and use one everywhere, including dates and tables.

## Content hygiene

Email/phone/URL inputs and code blocks stay LEFT-to-right inside the RTL page (`dir="ltr"` on the input, logical alignment around it). Container scrollbars flip; OS scrollbars don't — don't fight it.

## Verification (mandatory)

`visual-review-loop` screenshots in BOTH directions at all 3 widths. Common failures to hunt: half-mirrored icon rows, unmoved toast positions, clipped diacritics, spaced-out Arabic (letter-spacing leak), LTR-cramped buttons cutting labels.
