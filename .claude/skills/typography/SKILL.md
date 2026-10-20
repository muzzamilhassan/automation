---
name: typography
description: Choose and configure a project's type system — distinctive font selection (never default fonts), modular/fluid type scale, line-length and line-height rules, weight budgets, and Arabic type exceptions. Use when setting up a project's fonts, fixing text hierarchy, or building bilingual/Latin+Arabic typography.
license: MIT
metadata:
  source: fullstack-agent-os (authored; references Anthropic design-quality guidance, Utopia fluid scale, RTL Styling 101)
  category: frontend
---

# Typography — the identity voice

Type is the loudest identity signal a UI has. Treat font selection as a brand decision made once per project, justified per brief.

## Selection policy

- 1–2 typefaces total (display + text; one family with a real weight range is often strongest).
- **Banned as the identity face:** Inter, Roboto, Arial, the system stack. They render "AI default".
- **Anti-convergence:** don't just swap in the current community favorite — pick for the brief's temperament (technical, editorial, warm, brutal…) and say why in one line.
- Weight budget: 3–5 weights max, usually 2 do the work. Extreme pairs (200 + 800) create hierarchy without a second family.

## Scale

- Build a modular scale: 16px base, ratio ~1.25 for app UI, ~1.333 for editorial; or generate a fluid `clamp()` scale (Utopia-style) so type scales with viewport without breakpoint jumps.
- Display jumps BIG: heading sizes 3x+ over body create instant hierarchy; 1.5x jumps read as timid.
- Line length 60–100 characters (hard upper bound ~80ch for long-form reading).

## Line-height & rhythm

- Body ≥ 1.5; UI labels ~1.2–1.4; display tighter (1.05–1.2).
- Headings tighter tracking, body neutral; all-caps only for genuine labels, and they must NOT be eyebrow-decoration.

## Arabic exceptions (mandatory when Arabic is in the font stack)

- **`letter-spacing: 0`** — any tracking disconnects Arabic's joined letters.
- **Taller line-height** — diacritics clip under Latin-tuned heights.
- `text-decoration-skip-ink` for underlines (letter dots).
- Never `word-break` Arabic (connected script); give buttons `min-width` (labels shrink dramatically across languages).
- Font stack: a real Arabic family (e.g. Noto Kufi Arabic / Alexandria / IBM Plex Sans Arabic) paired with its Latin companion — declared explicitly in `--font-*` tokens.

## Rules

- Fonts load via `next/font`, `@font-face` with `font-display: swap`, or the framework equivalent — no FOUT surprises, `document.fonts.ready` awaited before screenshots.
- New text style need → extend the `--text-*` scale in `design-tokens`, never an inline size.
