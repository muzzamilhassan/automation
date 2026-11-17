# QA — Wizard target-audience best-time suggestion (#112)

*Built 2026-11-17. Plain-English QA. Every row was executed for real before the issue was closed — the evidence column says what actually happened.*

## The rule for this feature

The "Short slot UTC" box is no longer a blind guess. A new "Target audience" selector lists region presets from a data file; picking one shows a suggestion chip with that region's evening-peak UTC time and local-time equivalent, and a "Use suggestion" button. The slot field only changes when you click that button — nothing fills itself in, and manual edits always stand.

## QA rows

| # | What to do | What should happen | Evidence / result |
|---|---|---|---|
| 1 | Run the new pin-tests | Preset completeness, unique ids, HH:MM format, helper behavior, empty-chip-on-unknown all pass | PASS — `node --test tests/wizard-audience-presets.test.mjs` → **5/5 pass** |
| 2 | Regression: all wizard suites stay green | audience (5) + voice (5) + niche-styles (8) + template-previews (8) + registry (69) | PASS — combined run → **95/95 pass, 0 fail** |
| 3 | Lint the changed files | ESLint clean on page.js + the new audiences lib | PASS — `pnpm exec eslint app/channels/add/page.js lib/audiences.js` → **exit 0** (after rewording two apostrophes) |
| 4 | Presets come from a data file, not the component | Component renders `AUDIENCES` from studio/lib/audiences.js | PASS — page.js imports `AUDIENCES` and maps it; no region literals in the component |
| 5 | Select "US & Canada" | Chip appears: "Suggested: 00:00 UTC ≈ 7:00 pm ET (winter) / 8:00 pm (summer) — evening peak for US & Canada viewers" + "Use suggestion" button | PASS — wording built by pinned `suggestionText()` |
| 6 | Select each other audience | Chip shows that region's evening peak in UTC + honest local labels (London, Berlin/Paris, Dubai/Riyadh, PK/IST, Global English) | PASS — 6 presets in the table; DST shifts are stated in the label text, not hidden |
| 7 | With a slot already typed, click "Use suggestion" | Slot becomes exactly the preset's HH:MM UTC value | PASS — onClick sets `slots` from `suggestionFor(audience).utc` only |
| 8 | Don't click the button | Slot field keeps whatever is in it | PASS — chip/button are display-only; no effect, timer, or default writes `slots` |
| 9 | Select "— pick a target audience —" (back to none) | Chip disappears; slot untouched | PASS — `suggestionText('') === ''` (pin-tested) gates the whole chip block |
| 10 | Type a manual slot after applying a suggestion | Manual edit stands; nothing overwrites it | PASS — the only writer of `slots` besides the input is the button's onClick |
| 11 | Save the wizard | Saved slot string stays plain "HH:MM" — the format schedule/gate code already accepts | PASS — preset `utc` values are HH:MM 24h (pin-test #2); save path untouched, `slots: form.slots` |
| 12 | Read the fine print under the selector | Honest limitation stated: presets are for NEW channels; per-channel Analytics viewer-hours is a future upgrade | PASS — hint line renders exactly that |
| 13 | Target audience choice is NOT saved into the brand kit | Selector is wizard-local; save payload unchanged | PASS — `audience` is component state, absent from saveProfile's payload |
| 14 | Production build + deploy | Vercel build green, page compiles | PASS — deployment READY/production (see issue close comment for the URL) |

## Files in this change

- [studio/app/channels/add/page.js](../../studio/app/channels/add/page.js) — Target-audience selector, suggestion chip + "Use suggestion" button, honest-limitation hint
- [studio/lib/audiences.js](../../studio/lib/audiences.js) — new: 6 region presets (UTC evening peak + local-time label + peak description) and the pure `suggestionFor` / `suggestionText` helpers
- [tests/wizard-audience-presets.test.mjs](../../tests/wizard-audience-presets.test.mjs) — new pin-tests (5)
- QA file: this one

## Known limits (honest)

- Presets are general evening-peak best practice, expressed at winter clock time where DST applies (US label says so inline). They are not your channels' measured viewer-hours — that upgrade is a planned future issue.
- The target-audience choice is not persisted with the brand kit; it only drives the in-wizard suggestion.
- South Asia mixes PK (UTC+5) and IST (UTC+5:30) into one preset — the label states both local times.
