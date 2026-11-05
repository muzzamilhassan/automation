# Spec + QA — storybook stat directives (step 4, the word-timed pops)

Source: research/hassan-video-skills-findings-2026-11-05.md §Integration —
the Hassan core trick, scoped to the deterministic v1: **stat pops**. When a
spoken beat contains a number the viewer should see ($65 billion, 70%, 1920),
that word fires a themed stat chip at its exact word timing.

## Requirements (EARS)

- R1: WHEN a beat's spoken words contain a number-like token
  (`$65 billion`, `70%`, `1920`, `3,000,000`, `1.5 million`), THE PLANNER
  SHALL attach `beat.pop = { kind: 'stat', text, w }` where `w` is that
  word's index, and mark the word `key: true`.
- R2: WHEN a beat has no number (or no words — dividers), THE PLANNER SHALL
  leave it unmodified (no pop, no key flag).
- R3: THE ENGINE SHALL render a beat's pop as a theme-styled chip that
  springs in at the pop word's timing and holds inside the content safe
  area (below the top furniture band).
- R4: WHEN a beat has no pop, THE ENGINE SHALL render it byte-identically
  to today (default-inert).
- R5: THE PLANNER SHALL be pure and deterministic (no LLM in v1 — the LLM
  enrichment seam is a later slice; numbers are detectable deterministically).

## QA rows

| # | Requirement | Check | Type | Result |
|---|---|---|---|---|
| 1 | R1 stat detection | $ / % / year / comma-grouped / magnitude words all pop | A | **PASS** (5 token classes pinned) |
| 2 | R2 default-inert beats | no-number beats carry no pop/key | A | **PASS** |
| 3 | R3 engine chip | BeatPop present in DocV2, springs from the pop word's t0, inside safe area | A | **PASS** — local still frame: chip at top-center + karaoke active on the same spoken word |
| 4 | R4 default-inert engine | pop-less beats render identically (source pin: the pop render is conditional) | A | **PASS** |
| 5 | wire | yt-deepdive calls planStoryDirectives after timeBeats, logs the count | A | **PASS** (SOURCE PIN) |
| 6 | regressions | full storybook + pipeline suites green | A | **PASS** — storybook 51/51; full 1075/1077 (2 pre-existing network flakes) |
