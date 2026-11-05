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

## Step 5 — entity pops (2026-11-05)

- R6: WHEN a beat has no stat pop AND its spoken words contain a proper-noun
  entity (capitalized token group, not sentence-initial, ≥3 chars), THE
  PLANNER SHALL attach `beat.pop = { kind: 'entity', text, w }` at the group's
  first word.
- R7: THE STAT POP SHALL WIN — a beat with both keeps its stat pop.
- R8: THE ENGINE SHALL render entity chips filled (accent bg, theme text) —
  visually distinct from the bordered stat chips. Pop-less beats unchanged.
- R9: THE PLANNER SHALL stay deterministic in v1 (capitalization heuristics;
  the LLM/logo-domain upgrade is a later slice).

| # | Requirement | Check | Type | Result |
|---|---|---|---|---|
| 7 | R6 entity detection | capitalized mid-sentence tokens/groups pop at their first word | A | **PASS** (multi-word groups joined, sentence-initial excluded, verb-after-function-word excluded) |
| 8 | R7 stat wins | a beat with both keeps stat | A | **PASS** |
| 9 | R8 filled entity chips | BeatPop styles entity kind filled | A | **PASS** — local history-theme frame: filled cobalt chip + karaoke active on the same word |
| 10 | R9 deterministic | no LLM/network in the planner | A | **PASS** (pure capitalization heuristics) |
