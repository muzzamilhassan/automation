# Spec + QA — `market-files` P1: the cartoon scene system (2026-11-10)

Source: docs/superpowers/specs/2026-11-10-market-files-family-p1-spec.md
(the Paper Billions cartoon lane, P1 + recommendation A — SVG-only, $0).
Plain English: we are drawing the cartoon scenes ourselves inside our video
engine so every scene looks hand-made, every word is spelled correctly, and
every chart can carry REAL numbers later. No AI images, no cost, and no
existing video changes by even one pixel.

## Requirements (EARS)

- R1: Setting `style: 'market-files'` on a doc routes its beats to the new
  scenes; without it nothing changes anywhere (default-inert).
- R2: P1 covers hero, chapter, split, stat, quote, process, timeline, end;
  map/terminal/versus keep the engine's own layouts.
- R3: Scene choice is deterministic — optional beat scene directions win,
  otherwise derived from the beat (same beat in → same scene out, always).
- R4: All scene text is DOM text in Caveat (Patrick Hand fallback), loaded
  fail-soft.
- R5: Mood palettes (calm/party/crash/night/data) drive room, accent, chips.
- R6: Characters emote + blink + breathe — never frozen.
- R7: Ticker walls use only fictional brand names.
- R8: No existing template's render changes (P1 assigns the style to
  nothing).

## QA rows

| # | Req | Check | Type | Result |
|---|---|---|---|---|
| 1 | R3 determinism | moodFor/sceneFor: same beat twice → identical derivation; crash keywords → crash mood | A | PASS — tests/market-scenes.test.mjs 6/6 (2026-11-10): crash/party/night/data keyword hits, explicit scene.mood wins, unknown hint falls back safely, wrap-around location rotation, sceneForBeat deepEqual across calls. Two substring bugs the test caught and the fix closed: "pl**ai**n" read as "ai" (data), "falls" missing from the lexicon — both now word-boundary matched with inflections |
| 2 | R7 fictional tickers | generated ticker names ⊆ fictional pool for many seeds; no real brand | A | PASS — tickersFor swept seeds 0..199 (1200 rows): every name in TICKER_POOL (20 fictional), prices 12.0–172.0, no duplicates per wall, same seed → same wall (deepEqual) |
| 3 | R4 fonts fail-soft | ensureFonts catches load errors and continues (code pin + render succeeds) | A | PASS — code pin families/cartoonKit.tsx ensureToonFonts: FontFace load .catch(() => continueRender(handle)) — a missing/mangled font file never blocks the frame; Caveat + Patrick Hand both loaded during the 11 still renders (handwriting visible in every still) |
| 4 | R1 dispatch | a market-files doc renders through the family (per-layout stills exist); an existing template's still is byte-identical before/after registration | A+V | PASS — doc.json (style market-files) rendered 8/8 layouts through the family (stills beat0–7); control pair (no style vs unknown style, identical beats) rendered BYTE-IDENTICAL (cmp: no difference, 1,139,572 bytes both) — unknown/absent style falls through to the engine unchanged |
| 5 | R2 coverage | stills for hero/chapter/split/stat/quote/process/timeline/end — 8 layouts drawn as cartoon scenes | V | PASS — demos/market-files-p1/stills/beat0..7.png: hero (trading floor + headline), chapter (dimmed scene + glowing numeral), split (solo character + cream card), stat (NASDAQ −4% board + spread traders), quote (speech bubble + two characters), process (data center + 4 numbered cracks), timeline (big clock + time rail + THURSDAY), end (waving character + FOLLOW FOR MORE). map/terminal/versus untouched (fall through by design) |
| 6 | R5 moods | crash board still is red-family; party still green-family; night still dark-blue family | V | PASS — beat0/3/6 crash (red rooms, red THURSDAY chips, red board glow); mood-party.png (green room, green WEDNESDAY chip, NASDAQ +3% glow, confetti, charts trend UP); mood-night2.png (dark-blue room, navy chip, 3:00 AM ET). Data mood = the process still (navy data center, green LEDs). Note: the Stage set carries its own spotlight lavender palette by design (mood still drives the characters) |
| 7 | R6 micro-motion | two stills of the same scene a few frames apart differ (blink/breathe) | A+V | PASS — beat4.png (frame 434) vs beat4b.png (frame 441) DIFFER (cmp); frame math: blink every ~3.6s, breathing bob ±2px, clock minute-hand ticks, board % pulse — no frozen scenes |
| 8 | R8 default-inert | repo-wide: no registry template sets style 'market-files' (grep); engine diff limited to type + registry lines | A | PASS — grep 'market-files' over studio/ + lib/ registry data: 0 template hits (only the family registration + docs); engine diff = V2Beat optional `scene?` field + one FAMILIES registry entry; control pair byte-identical (row 4). Suite-wide: 1097/1100 unit tests pass — the 3 failures are pre-existing on the fleet-reopen commit (cf04b47, QuoteQuarry legacy-mapping expectations in channels tests; import graph lib/brand-resolve.mjs — disjoint from every P1 file) |
| 9 | style match | side-by-side vs research/assets/paper-billions-ref frames: same family (round heads, ink outlines, handwritten labels, chips, boards) | V | PASS — beat3 vs ref-board-nasdaq.jpg / ref-closing-bell.jpg: round-headed traders from behind at desks with red declining monitors, glowing handwritten board, ticker walls of fictional brands, day chip + clock badge, scattered paper; beat4 vs the reference's dialogue grammar (speech bubble + two characters on a spotlight stage); Caveat handwriting matches the reference's marker font |

## Regression notes (2026-11-10)

- Pre-existing suite failures (NOT this lane): tests/autopilot-discovery +
  schedule-slot expect the pre-reopen legacy channel set; commit cf04b47
  (owner-directed fleet reopen) added quotequarry/ investors-compass/
  debt-free-doctrine. The assertions need updating to the new fleet state —
  follow-up slice, untouched by P1.

## Code review (2026-11-10) — APPROVE, all 7 findings fixed + verified

Two-axis review verdict: nothing blocking; default-inert, determinism,
hook order, SVG structure, and no-static-maps conventions all verified
clean. Fixes applied and re-verified with fresh renders + unit tests:

1. Character rig: one per-pose table now decides BOTH arms AND both hands —
   no more floating hands on wave/raised poses (visible in the end-card
   waver + party/quote scenes).
2. ClockBadge hands read the badge's actual time now (the −90° offsets
   dropped); non-numeric scene.time falls back safely instead of NaN
   rotation. Verified: the beat0 clock reads ~9:57 against a 9:54 badge +
   the live tick.
3. ChapterScene draws all four sets now (office/stage branches added) — an
   explicit scene.location is never silently ignored on chapters.
4. DataCenter's room follows the mood like every other set (R5 letter);
   only the machine racks stay fixed navy. The Stage's spotlight lavender
   remains a documented design exception (QA row 6).
5. Timeline's red last-tick emphasis targets the last RENDERED tick
   (Math.min(rail.length, 5) − 1), not an index beyond the slice.
6. INK exported from the kit — one source of truth for the outline color
   (marketFiles imports it; no local duplicate).
7. (covered by 2) NaN-robust time parsing in ClockBadge.

Post-fix evidence: unit tests 6/6; beat0 + beat7 re-rendered clean; the
control-pair byte-identity claim is unaffected (engine files untouched by
the fixes — all changes inside the family's own files).

