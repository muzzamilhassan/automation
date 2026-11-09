# Full template families — the build proposal (2026-11-09)

Synthesis of three same-day research files:
- `research/channel-structure-grammars-2026-11-09.md` — HOW the best faceless channels structure scenes
- `research/style-engines-remotion-2026-11-09.md` — verified libraries + Remotion capabilities
- `research/template-layout-market-catalog-2026-11-09.md` — 40 archetypes the commercial market sells

The owner's bar: FULL templates — each family changes its own SCENE RENDERERS,
TRANSITIONS, and CHAPTER DEVICES, never just palette/font swaps. This file is
the proposal; **the owner picks the families before any code** (planning-first).

---

## 0. The key insight (why every template so far looks the same)

Top channels differ on FIVE structural axes our single skeleton never varies:
(A) scene persistence — discrete scenes vs one canvas that BUILDS;
(B) cut rhythm — 1-3s stamps vs 8-20s holds; (C) annotation layer — highlighter /
red-circles / glow-trace / arrows; (D) chapter device — act cards / date bars /
rank ticks / fades; (E) text philosophy — 3-word stamps vs full sentences vs
verbatim receipts. **Every family below changes ≥3 axes.**

## 1. Shared infrastructure (build ONCE, every family reuses it) — ~800-1,200 lines

| Kit | What | Library (verified) |
|---|---|---|
| Annotation kit | hand-drawn highlight/circle/box/underline, draw-on | **@remotion/rough-notation** (official, MIT, seed prop = deterministic) |
| Draw-on line kit | handwriting/glow/map/border strokes | **@remotion/paths** evolvePath/getPointAtLength; roughjs (seeded) |
| Ken Burns pan | slow drift/zoom on photos — MISSING today (engine has entrance springs only) | ~25 lines, frame math |
| Transition presentations | page-turn (bookFlip), whip, ink-reveal, stamp impact | **@remotion/transitions** (21 built-ins, SUBPATH imports; custom = 80-150 lines each) |
| Stat counter + scramble | big-number count-up, text decode effects | hand-roll or @remotion/gsap (GSAP plugins now free) |
| Chapter device kit | date bars / rank ticks / act cards / letterbox / fade-to-black | pure CSS, ~150 lines |
| Charts kit (deferred to Phase C3) | animated SVG line/bar draw-on | hand-roll ~200-300 lines (Recharts adds nothing once animations are frame-driven) |

Dependency + license facts: 5-8 small MIT deps; @remotion/curves DOES NOT
EXIST (npm 404); Remotion free license = for-profit org ≤3 employees (we fit —
flagged for growth); LottieFiles is NOT CC0 (use UseAnimations MIT if needed);
@remotion/google-fonts verified for Playfair Display, Cinzel, Caveat, Patrick
Hand, Archivo Black, Special Elite, IBM Plex Mono, Space Grotesk, DM Serif —
pre-download woff2 for hermetic renders; pin Remotion 4.x exact (v5.0 breaking
change announced). Free 81-template MIT community pack to mine:
github.com/reactvideoeditor/remotion-templates (RVE).

## 2. The families (owner picks; cheapest/most-differentiating first)

### F1. STATEMENT-RECEIPT (investigation desk) — effort M (~400-600 lines)
- Grammar: claim slide → VERBATIM receipt card (red-circle annotation draws on
  the damning line) → verdict stamp (VERIFIED/FLAG slams in) → loop; receipt
  rhythm REPLACES chapter cards. Axes changed: B, C, D, E.
- New scenes: statement-slide, receipt-card, verdict-stamp, evidence-timeline.
- Market proof: evidence/investigation is the LEAST commoditized, most
  differentiating archetype cluster (case-file timeline freq 6).
- Serves: money-rulebook (PILOT), tax-shield, ai-observer, closing-table.

### F2. DARK-DOC STATEMENT (Glow-Trace minimal) — effort S-M (~250-400 lines)
- Grammar: ONE idea per screen, glowing line draws beneath short claims,
  8-20s holds, numbered typography chapters, near-inverse of our dense engine.
- Market proof: dark-doc statement scene freq 4, difficulty S.
- Serves: sleep-architect, ai-observer, deep-work-os, policy-brief.

### F3. RANK COUNTDOWN — effort S-M (~300-450 lines)
- Grammar: the only LIST macro-structure — criteria line up front, rank reveal
  every 30-60s over photo-grid mosaics, ticker between entries.
- Serves: gym, quotes, any lane as alternate structure.

### F4. LANDSCAPE-QUOTE LONGFORM — effort S (~150-250 lines; needs Ken Burns kit)
- Grammar: tempo INVERSION — minutes-long landscape pans + full-sentence
  literary quote holds, letterbox bars, fade-to-black chapters.
- Serves: old-money-code, wisdom lane, history.

### F5. GLASS NUMBER (sleek tech) — effort S-M (~200-350 lines)
- Grammar: dark glassmorphism stat cards, number-scramble reveals, light-sweep
  wipes — an effects layer over stat/terminal inventory.
- Serves: ai-observer, investors-compass, deep-work-os.

### F6. MAP ATLAS (wargame) — effort M-L (~500-800 lines incl. shared geo kit)
- Grammar: persistent map canvas, border draw-ons, route/unit arrows,
  advancing date-bar AS the chapter device.
- Libraries: d3-geo + topojson-client + world-atlas (public-domain Natural
  Earth data, fully offline — Mapbox/Leaflet ruled out, runtime tile engines).
- Serves: history, travel, policy-brief.

### F7. COLLAGE ARCHIVE (Vox, deepened) — effort M (~300-450 lines on existing pack)
- Grammar: parallax paper cutouts, rough-notation hand-annotations replacing
  our fixed grease-circle, bookFlip page-turns, "dive-in" push transition.
- Serves: money-rulebook alternate, quotequarry, history.

### F8. BOARD SYSTEMS (terminal/split-flap/checklist) — effort M (~350-500 lines)
- Grammar: index-board reveal; split-flap cascades (hand-roll ~250-400 lines,
  verified npm fallbacks exist); terminal scenes (Code Hike precedent).
- Serves: ai-observer, focus, closing-table.

DEFERRED (fight the zero-marginal-cost model): Fern (sound-design-led),
MagnatesMedia (per-video art), After Skool (draw-synced art), Johnny Harris
(3D flights), POLÒRI (channel unverified — genre archetype documented).

## 3. Phased build plan (MR-first pilot directive)

- **Phase C1** — shared kits (annotation, pan, transitions, chapter devices)
  + F1 Statement-Receipt (PILOT on Money-Rulebook) + F2 Dark-Doc Statement.
  Ships ~700-1,000 new lines + 2 families + preview renders.
- **Phase C2** — F3 Rank Countdown + F4 Landscape-Quote + F5 Glass Number.
- **Phase C3** — F6 Map Atlas + F7 Collage deepening + F8 Boards + charts kit.
- Every family: own scene-renderer module (stylepack pattern, like
  stylepacks.tsx) + registry family entry + hand-authored draft template +
  preview, then the bot's pool grows to draft with it.

Architecture decision needed at build time (owner-visible): how a template JSON
selects its scene system — today `doc_presentation.theme` picks token palettes;
families need a second selector (e.g. `doc_presentation.style` or the registry
`family` id → renderer dispatch in DocV2). Default-inert rule: absent field =
current storybook engine, byte-identically.

## 4. Verification status

All package names/claims verified against npm/GitHub/remotion.dev on
2026-11-09 by the libraries agent (marked items: @remotion/skia details,
svg2roughjs license — UNVERIFIED, do not rely). Channel links confidence-marked
in the grammars file; market claims carry per-archetype frequency from 35
sources. Sources live in the three research files.
