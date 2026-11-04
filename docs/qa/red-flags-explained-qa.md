# QA — `red-flags-explained` template + left-stack doc thumb

Spec: `docs/superpowers/specs/2026-11-03-red-flags-explained-template.md`
Type key: A=automated, M=manual, V=visual. Standing directive: no calendar
waits — force_doc dispatch, same-day checks.

| # | Requirement | Check | How | Type | Result |
|---|---|---|---|---|---|
| 1 | R1 registry valid | entry passes the schema v2 validator | `node --test tests/registry.test.mjs` 9/9 + full suite 1026/1026 (2026-11-03) | A | **PASS** |
| 2 | R2 doc plan | docStoryPlan returns chapters=10, minWords=170; plan line verbatim | tests/doc-template.test.mjs real-entry pins 18/18 — plan line asserted verbatim | A | **PASS** |
| 3 | R4 thumb design on | SVG carries chip text, brandmark, last-word accent tspan, scrim tint | tests/doc-visual-layer.test.mjs R4 suite (chip/SCANDALS, diamond brandmark, tint-under-gradient, last-word tspan ×2 layers) | A | **PASS** |
| 4 | R5 thumb default-inert | default SVG has NO chip/brandmark/tint elements (byte-stability) | R5 suite: thumbDesignFor null cases + SOURCE PINs (default literals untouched, branch gates on data) | A | **PASS** |
| 5 | R6 swap semantics | MR assignment = exactly 1 active row + audit row, front door only | owner clicked the panel swap 2026-11-03 19:04 UTC; DB-CHECK: one active row `red-flags-explained` pin 1 (assigned_by muzzamilhassan302@gmail.com); pipeline preflight on run 41702116271 resolved the block with the full finance governance | A | **PASS** |
| 6 | R7 captions | SRT uploaded as CC at publish (regression) | **GAP FOUND 2026-11-04:** captions.insert lives in longform-upload.mjs (the OTHER lane); the deepdive doc lane ships the SRT as an artifact only — no CC insert. The video gets YouTube auto-captions. Follow-up: wire captions.insert into the deepdive upload tail | A | **GAP — follow-up filed** |
| 7 | R1 panel visibility | template listed in gallery + picker | Studio deployed to Vercel prod (deployment ai44vyr3j, Ready); the panel's own loader (loadRegistryTemplates) resolves it assignable: 10 templates, 0 invalid | M | **PASS (owner sign-in confirms visually)** |
| 8 | AC-5 live proof | forced doc on MR ships 10-chapter episode + left-stack thumb | run 41873055603: chapters 1-10/10 rendered, SRT 172 cues, episode.mp4 9.1 min, EPISODE scheduled h1uhT6h5oYA → public 2026-11-04T22:30Z, Errors: 0; thumb candidates emitted (note: candidate url:null recording gap — desk swap may not display them; follow-up) | A | **PASS** |
| 9 | R5 regression | other lanes' thumbnails unchanged | the three paused channels stay paused; default render path asserted by #4 (source pins green) | A | **PASS** |
| 10 | R8 shorts skeleton | shorts keep numbered red-flag beats under the template | pipeline tally: Shorts ✓ under the template; validator enforces beats | A | **PASS** |

## Follow-ups found in live proof (2026-11-04)

1. **Captions gap (R7):** deepdive lane ships SRT artifact but never calls captions.insert — wire it into the episode upload tail.
2. **Thumb candidate url:null:** recordThumbCandidates stored hash without URL — the /review thumb swap cannot read bytes for this run's candidates.
3. **Title drift:** the generated title ("The Hidden Frugal Playbook…") did not hit the red-flags title patterns — tighten title pinning if the owner wants the reference shape enforced.

## Regression watch

- The default `renderYouTubeThumbnail` path is incident-sensitive visual
  territory: #4's byte-stability assert is the guard. Any diff there is a
  FAIL even if the image "looks fine".
- `thumb_design` precedence: template value wins over kit accent (T6 rule) —
  pinned by an assert, not prose.
