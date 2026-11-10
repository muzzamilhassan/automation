# Spec — the `market-files` cartoon family, P1: scene system (2026-11-10)

Source: research/paper-billions-cartoon-market-lane-2026-11-10.md. Owner
approved P1 + recommendation A (SVG-only v1, $0, no AI images). P1 is the
ENGINE-side scene system only — no registry template uses it yet (that is
P4), no script schema (P2), no data layer (P3).

## What P1 builds

A new template FAMILY (`style: 'market-files'`) in the existing DocV2
families system (explainer/remotion/families/), reproducing the Paper
Billions visual grammar as parametric vector scenes: flat 2D cartoon rooms,
round-headed characters, handwritten Caveat labels, day/time chips, ticker
walls of fictional brands, big glowing % boards, dialogue stages — all
drawn in React/SVG, all text as DOM text (never rasterized), micro-motion
(blinks, breathing) so scenes never sit frozen.

## EARS requirements

- R1: WHEN a doc sets `style: 'market-files'`, THE ENGINE SHALL render the
  doc's beats through the family's scene renderers; WHEN the style is
  absent or unknown, THE ENGINE SHALL render byte-identically to before
  (default-inert — the existing FAMILIES dispatch already guarantees this;
  P1 adds a registry entry + an additive OPTIONAL beat field only).
- R2: THE FAMILY SHALL cover a P1 subset of layouts — hero, chapter, split,
  stat, quote, process, timeline, end — and SHALL leave map/terminal/versus
  falling through to the engine's theme layouts (no regression surface).
- R3: SCENE CHOICE SHALL be deterministic: an OPTIONAL beat field
  (`b.scene: {location, mood, time, day}`) wins when present; otherwise the
  scene derives from the beat itself (layout + index + headline keywords).
  The same beat SHALL derive the same scene on every render.
- R4: EVERY LABEL the scenes draw SHALL be DOM text rendered in the Caveat
  font (Patrick Hand fallback), loaded fail-soft (a missing font file must
  never block or fail a render).
- R5: THE MOOD SYSTEM SHALL drive the palette: `calm` / `party` (greens,
  confetti) / `crash` (reds) / `night` (dark blues) / `data` (navy+glow) —
  room gradient, accent color, and the day chip follow the mood (crash day
  chips red, party chips green).
- R6: CHARACTERS SHALL show mood (brows/mouth), blink every few seconds,
  and breathe — no frozen stills in any seed scene.
- R7: TICKER WALLS SHALL use only FICTIONAL brand names from a fixed pool
  (the PIKE/QUAY/RIFT pattern) — no real-world trademark inside scene art.
- R8: THE FAMILY SHALL NOT change any existing template's render output:
  no registry template assigns the style in P1, and the only engine-file
  edits are the optional V2Beat field + the family registry entry.
