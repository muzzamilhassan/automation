# QA — `red-flags-explained` template + left-stack doc thumb

Spec: `docs/superpowers/specs/2026-11-03-red-flags-explained-template.md`
Type key: A=automated, M=manual, V=visual. Standing directive: no calendar
waits — force_doc dispatch, same-day checks.

| # | Requirement | Check | How | Type | Result |
|---|---|---|---|---|---|
| 1 | R1 registry valid | entry passes the schema v2 validator | `node --test tests/template-registry.test.mjs` (or the repo's registry suite) green with the entry present | A | |
| 2 | R2 doc plan | docStoryPlan returns chapters=10, minWords=170; plan line verbatim | `node --test tests/doc-template.test.mjs` incl. the new pin case | A | |
| 3 | R4 thumb design on | SVG carries chip text, brandmark, last-word accent tspan, scrim tint | new doc-visual-layer cases: render with thumb_design, assert elements | A | |
| 4 | R5 thumb default-inert | default SVG has NO chip/brandmark/tint elements (byte-stability) | same suite: render without thumb_design, assert absence + stable size | A | |
| 5 | R6 swap semantics | MR assignment = exactly 1 active row + audit row, front door only | sync CLI run + assign API call + DB-CHECK SELECT evidence | A | |
| 6 | R7 captions | SRT uploaded as CC at publish (regression) | code pin longform-upload.mjs:253 + run log "[upload] captions uploaded" on the QA dispatch | A | |
| 7 | R1 panel visibility | template listed in gallery + picker | open Studio /templates/registry + channel panel after deploy | M | |
| 8 | AC-5 live proof | forced doc on MR ships 10-chapter episode + left-stack thumb | workflow_dispatch force_doc=1 channel=money-rulebook; inspect log + artifact | A | |
| 9 | R5 regression | other lanes' thumbnails unchanged | the three paused channels stay paused; default render path asserted by #4 | A | |
| 10 | R8 shorts skeleton | shorts keep numbered red-flag beats under the template | pipeline log on the QA dispatch: Shorts ✓ with 4-point beats | A | |

## Regression watch

- The default `renderYouTubeThumbnail` path is incident-sensitive visual
  territory: #4's byte-stability assert is the guard. Any diff there is a
  FAIL even if the image "looks fine".
- `thumb_design` precedence: template value wins over kit accent (T6 rule) —
  pinned by an assert, not prose.
