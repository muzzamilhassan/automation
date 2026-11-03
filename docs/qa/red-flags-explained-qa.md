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
| 5 | R6 swap semantics | MR assignment = exactly 1 active row + audit row, front door only | sync CLI imported the entry (front door, skipped-invalid 0); POST attempted via local dev — route is Google-session-gated (by design); **swap = owner's panel click** | A/M | **PENDING owner click** |
| 6 | R7 captions | SRT uploaded as CC at publish (regression) | code pin longform-upload.mjs:253 (captions.insert) — unchanged by this feature; MR pilot run 41672112170 already shipped "[upload] captions uploaded" | A | **PASS** |
| 7 | R1 panel visibility | template listed in gallery + picker | Studio deployed to Vercel prod (deployment ai44vyr3j, Ready); the panel's own loader (loadRegistryTemplates) resolves it assignable: 10 templates, 0 invalid | M | **PASS (owner sign-in confirms visually)** |
| 8 | AC-5 live proof | forced doc on MR ships 10-chapter episode + left-stack thumb | blocked on Row 5's swap — dispatch force_doc=1 AFTER the owner assigns | A | **PENDING swap** |
| 9 | R5 regression | other lanes' thumbnails unchanged | the three paused channels stay paused; default render path asserted by #4 (source pins green) | A | **PASS** |
| 10 | R8 shorts skeleton | shorts keep numbered red-flag beats under the template | validator requires beats (registry suite green); pipeline proof rides Row 8's dispatch | A | **PENDING swap** |

## Regression watch

- The default `renderYouTubeThumbnail` path is incident-sensitive visual
  territory: #4's byte-stability assert is the guard. Any diff there is a
  FAIL even if the image "looks fine".
- `thumb_design` precedence: template value wins over kit accent (T6 rule) —
  pinned by an assert, not prose.
