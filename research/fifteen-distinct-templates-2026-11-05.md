# 15 genuinely different niche templates — research + matrix (2026-11-05)

Owner ask: not one storybook look cloned 15× — **15 niches, visibly DIFFERENT
templates**. Verdict: possible WITHOUT new render engines, by differentiating
on five axes the DocV2 engine already (or almost) supports. One engine, many
looks — the same pattern every template platform uses (Canva/CapCut/Motion
Array): engines stay few, DATA makes the variety.

## What exists today (the raw material, audited)

- **DocV2 doc engine**: 5 slide layouts (hero / chapter / split / stat / end)
  chosen PER BEAT, 6 palettes (vox/investing/poster/history/wisdom/science),
  karaoke captions, furniture, stat+entity pops, photo splits (left/right)
- **Per-channel**: voice (Edge-TTS), approved-music pools, kit brand strings
- **Template DATA**: beats/hooks/titles per niche, doc_render, doc_presentation,
  disclaimers, thumb picking

## The five differentiation axes

| Axis | Cost per template | What it changes |
|---|---|---|
| 1. Palette + type voice | ~15 lines (a THEMES entry) | colors, serif vs sans, grain, caps |
| 2. Brand + voice + music pool | DATA only | name, kicker, badge, narrator voice, music mood |
| 3. **Layout mix** (the big one) | DATA once layouts exist | which slide kinds a niche uses and how often |
| 4. Motion grammar | engine (small config per theme) | stepped vs spring vs typewriter entrances |
| 5. Content patterns | DATA | beats, hooks, title shapes, disclaimers |

Axis 3 needs **new slide layouts** in DocV2 — each is a self-contained React
component (~1–2 h) added to the dispatcher; beats already carry `layout` per
beat, so new layouts instantly become template-DATA options. Proposed six new
layouts unlock the visibly-different looks:

- `map` — animated route/region card (travel, geopolitics)
- `timeline` — era rail with year ticks (history)
- `quote` — full-bleed serif quote card (wisdom, leadership)
- `terminal` — code/console composition (AI/tech)
- `process` — numbered step chain (productivity, business)
- `versus` — two-column comparison (finance, sales)

## The 15-niche matrix (each row = a visibly different template)

| # | Niche (canonical string) | Palette | Signature layouts | Voice/music mood |
|---|---|---|---|---|
| 1 | Personal finance rules & money habits | vox (has) | split+stat | Andrew / calm (has) |
| 2 | Investing psychology & market wisdom | investing (has) | stat+versus | male / tense |
| 3 | Old money habits & quiet wealth | history (has) | quote+split | Andrew / strings |
| 4 | Real estate wisdom & property | science-style paper | split+stat | male / calm |
| 5 | Insurance explained simply | investing | process+stat | female / soft |
| 6 | Small-business tax & legal | science (has) | process+versus | male / neutral |
| 7 | Entrepreneurship & lean business | poster | process+stat | male / driving |
| 8 | Sales & negotiation psychology | poster | versus+quote | female / punchy |
| 9 | Leadership & management wisdom | wisdom (has) | quote+process | Andrew / calm |
| 10 | Timeless wisdom & psychology | wisdom (has) | quote+split | has |
| 11 | History stories | history (has) | **timeline**+chapter | deep male / epic |
| 12 | Travel & geography explained | new warm-sunset | **map**+split | female / bright |
| 13 | Science & how things work | science (has) | process+stat | Andrew / curious |
| 14 | AI & future tech | poster | **terminal**+stat | male / digital |
| 15 | Focus & productivity systems | new cool-mint | process+split | female / minimal |

(Health trio + Gym + Human-psychology-social = batch 2, same machinery.)

## Phasing

- **P1 — layouts** (~1 day): build the 6 new DocV2 layouts + dispatcher
  entries + per-layout QA stills
- **P2 — motion grammar** (~½ day): THEMES gain a motion profile (stepped /
  spring / typewriter) the components read
- **P3 — the 15 DATA entries** (~½ day): each niche's template declares
  palette + layout mix + voice/music mood + content patterns; validator +
  sync + panel
- **P4 — per-template voice/music DATA** (~½ day): doc_presentation gains
  voice + music mood; the lane resolves them through the existing pools
- Result: 15 templates a viewer tells apart in 2 seconds of thumbnails —
  same maintained engine.

Sequencing note: P1 layouts first (the visible difference), then P3 data,
then P2/P4 polish. Every phase default-inert for existing templates.
