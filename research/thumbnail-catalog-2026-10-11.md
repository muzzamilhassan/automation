# Quarry Studio — Thumbnail Template Catalog v2 (24 new templates)

Date: 2026-10-11. Grounded in research/thumbnail-templates-2026-research.md (30 styles, all sourced: Canva/Envato/Behance 2026 trend reports, Thumby May-2026 dataset, VIDIQ style list, faceless-channel formulas). Every template is spec'd for the path-SVG engine (vector text over background) — backgrounds come from Pexels search, user upload, the video's own frame, or **AI generation (Agnes free now; any OpenAI-style image key later; Claude cannot generate images)**. All templates automatically support AI backgrounds via the existing "✨ Generate" button.

Owner taste rules encoded: NO thick text borders (soft shadows), NO B&W cutouts, cinematic over flat, 3-words-max guidance.

---

## FAMILY A — Photo-based (instant preview, Pexels/upload/current-frame)

| # | Name | Layout | Background | Text treatment | Best niches | Effort |
|---|---|---|---|---|---|---|
| 1 | **Hero Object** | Single object large in right third, left 55% dark for text; heavy vignette | Pexels: "[object] black background" / AI: "single [object], dramatic rim light, dark charcoal backdrop, left third plain dark" | Anton left, ≤4 words, one accent word | finance, stoicism, tech | M |
| 2 | **Statue Close-Up** | Extreme close-up statue/hooded figure right half, storm sky | AI: "marble statue extreme close-up, dramatic side light, gold rim, stormy sky" / Pexels: "greek statue dark" | Anton left on scrim, serif eyebrow | stoicism, motivation | S |
| 3 | **Silhouette Vignette** | Backlit lone figure center, bright source behind, heavy vignette | Pexels: "silhouette sunset figure" / AI: "lone figure silhouette, backlit, fog" | One accent word centered, minimal | motivation, drama | S |
| 4 | **Dark Luxury Minimal** | Near-black bg, single warm-lit subject (watch/car/marble), generous space | AI: "[subject] on dark silk, single amber rim light, editorial" / Pexels: "luxury watch dark" | Playfair serif headline, gold accent | old money, luxury | S |
| 5 | **Before/After Split** | Vertical split: left desaturated "before", right vivid "after", thin accent divider, 2 labels | Two Pexels/AI images ("cluttered desk" vs "minimal office") | Labels in chips; small Anton bottom | glow-up, investing, renovation | M |
| 6 | **VS Comparison** | Two half-photos + center VS medallion (accent circle) | Two images per side | Big VS in circle; two short labels | finance ("CASH vs CREDIT"), tech | M |
| 7 | **Documentary Collage** | 2-3 layered photos, torn/halftone edges, dark headline bar bottom | Pexels pairs: archival + modern of same subject | Slab-serif headline bar, dateline chip | true crime, docs | L |
| 8 | **Retro Newspaper** | Aged-paper texture, duotone photo, serif masthead + dateline chip | AI: "aged newspaper texture halftone" / Pexels: "vintage newspaper" | All-serif, black on paper, red dateline | history, true crime | M |
| 9 | **Magazine Cover** | Masthead top, cover lines down left side, portrait/object right | AI/Pexels portrait or object | Serif masthead + thin cover lines, barcode gag | business, wealth profiles | M |
| 10 | **Motion Blur** | Horizontal blur/zoom burst on subject, streaks | Pexels: "speed blur night city" / AI: "long exposure motion blur [subject]" | Italic Anton (tilted 2°), accent word | finance crashes, cars, drama | S |
| 11 | **Hand-Drawn Annotation** | Photo + hand-drawn arrows, circles, underlines, chalk notes | Any photo | Marker-style annotations (rough stroke filter) + short title | education, finance markups | M |
| 12 | **Giant Number** | Massive outlined number fills left 60%, title right | Dark moody backdrop (storm, night city) | Number: Anton 400px with stroke; title 3 lines | listicles, self-improvement | S |
| 13 | **Equation X = Y** | Giant equation fills left half on dark, subject photo right sliver | Optional moody bg; type IS the design | Anton equation with accent "="; "$1M = 1 IDEA" | finance, education | S |
| 14 | **Timeline** | Horizontal timeline, 3-4 glowing milestone nodes, era labels | Any dark backdrop | Node labels small caps; title top | company histories | M |
| 15 | **Stats Hero** | One giant stat ("$0 → $1M") + simple 2-bar chart | Dark blurred cityscape | Anton stat with accent arrows; bars as vector | finance, data docs | M |
| 16 | **Glass Panel** | Vivid busy background + frosted translucent panel holding the headline | Pexels: city bokeh / aurora gradient | Inter 800 on frosted panel (blur + 12% white), thin light border | tech, SaaS, productivity | M |
| 17 | **Duotone Aurora** | Photo mapped to 2-color duotone (teal+coral etc.) + soft glow | Any Pexels photo + duotone filter | White Anton + accent word | stoicism, music, motivation | S |
| 18 | **Burning Question** | Mystery subject dimmed behind, serif italic question, accent "?" | Subject photo dimmed 60% | Playfair italic question, big accent ? | commentary, true crime | S |
| 19 | **Brutalist Big-Type** | Type fills the frame; harsh black/white + one acid accent; tilted 2° baseline | None or texture only | Anton 200px+ tilted, acid accent word | commentary, edgy finance | S |

## FAMILY B — AI-art backgrounds (generate via Agnes free / any image key; text overlaid by engine)

| # | Name | AI background prompt pattern | Text treatment | Best niches | Effort |
|---|---|---|---|---|---|
| 20 | **Anime Panel** | "anime style dramatic panel, speed lines, [scene], bold ink shading, no text" | Anton bottom-left w/ shadow | anime recaps, gaming, stories | S (bg preset) |
| 21 | **Soft 3D Object** | "soft 3D render, glossy [coin/brain/chart], studio light, dark stage, octane" | Minimal: 2-3 words + accent chip | fintech, AI/tech | S |
| 22 | **Liminal Atmosphere** | "liminal space, endless corridor, fluorescent hum, fog, desaturated, unsettling" | Small serif title, lots of silence | mystery, psychology, space docs | S |
| 23 | **POV Hands** | "POV first person, hands holding [object], facing [scene], cinematic" | Anton top strip | survival, finance POV, unboxing | S |
| 24 | **Isometric Strategy** | "isometric 3D illustration of [system], clean dark background, glowing nodes" | Labels as chips | crypto, infra, business systems | M |
| 25 | **Map Strategy** | "dark world map, glowing cyan route lines, city markers, top-down" | 1-3 labels + title chip | geopolitics, strategy docs | M |

## FAMILY C — Already live
Clean Frame · Bold Poster · Paper Doc (existing three stay as the "Core" category).

**Total: 3 existing + 25 new = 28 templates** (research table has 30 styles; #29 shock-face and real-face sticker styles deliberately excluded as 2026 anti-patterns for faceless channels; red-arrow trope folded into Hand-Drawn Annotation as a rough-marker option).

---

## Engine work notes (for implementation)
- New SVG capabilities needed: duotone filter, frosted glass (blur+translucent rect), stroke/outline text (path stroke), tilted baselines, split/dual-photo layouts, halftone/grain/scanline filter layers, hand-drawn rough strokes, VS badge, timeline/equation/chart vector primitives. All are standard SVG filters/primitives — no new deps.
- AI mode: EVERY template gets an "AI background" option (the existing ✨ button) + per-template **prompt preset** so users press Generate without writing prompts.
- Template gallery UI: category tabs (Photo / AI-art / Typographic / Core), preview cards rendered with sample data, "AI" badge on AI-preset templates.
- Per-template legibility checklist stays (≤4 words, mobile size, <2MB).

## Suggested rollout (2 batches)
- Batch 1 (photo family, 16): #1-12 + #16-19 — instant preview, no new AI dependencies.
- Batch 2 (AI + complex, 9): #20-25 + #7-variants — AI preset prompts + the L-effort layouts (collage, timeline, stats).
