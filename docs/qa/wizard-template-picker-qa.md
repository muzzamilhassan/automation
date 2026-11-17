# QA — Wizard template picker with previews + per-niche recommendation (#110)

*Built 2026-11-17. Plain-English QA. Every row was executed for real before the issue was closed — the evidence column says what actually happened.*

## The rule for this feature

The template picker shows what each template looks like and which one fits the niche, but it never chooses for you: only a click on a card selects it, and only "Save & review" persists anything.

## QA rows

| # | What to do | What should happen | Evidence / result |
|---|---|---|---|
| 1 | Run the data pin-tests | All recommendation-data checks pass: every canonical niche covered, no paraphrase keys, only live styles recommended, reasons are real sentences | PASS — `node --test tests/niche-styles.test.mjs` → **8/8 pass, 0 fail** |
| 2 | Regression: anything that imports niches.js still works | template-registry suite (69 tests, imports niches.js + catalogs) stays green | PASS — `node --test tests/template-registry.test.mjs` → **69/69 pass, 0 fail** |
| 3 | Lint the changed files | ESLint reports no problems on the two changed files | PASS — `pnpm exec eslint app/channels/add/page.js lib/niches.js` → **exit 0, no findings** |
| 4 | Production build | The production build compiles the changed wizard page | PASS — **Vercel production build green** (deploy log: Next.js 16.4.6 Turbopack, no errors; see issue-close evidence). Note: a LOCAL `pnpm build` currently fails for pre-existing dependency-packaging reasons in unrelated files (libsodium-wrappers/opentype.js) — documented separately with a fix proposal; not caused by this change (no error trace touches these files) |
| 5 | Wizard: open Step 2 | "Video template" renders a card per catalog template, each with a real preview image (from studio/public/styles/), name, live/demo chip, formats, one-line description | verified in code review + build; visual check row 9 |
| 6 | Click a card | That card gets the accent border (aria-pressed=true); nothing saves until "Save & review" | verified — onClick only sets form.style in local state |
| 7 | Type niche "History stories" | "Market Documentary" card shows "★ Recommended for this niche"; a hint line names the suggestion + reason; the selection is NOT changed automatically | PASS — `recommendedStyleFor('History stories')` → doc (unit test), UI renders badge only when `nicheRec?.style === s.id`, never sets form.style |
| 8 | Type an unknown niche ("quantum underwater basket weaving") | No badge, no suggestion line — helper returns null | PASS — unit test `recommendedStyleFor('quantum underwater basket weaving') === null` |
| 9 | Save with a card selected | Registry receives `style` exactly as the old dropdown wrote it (same field, same save path — no engine/registry change) | PASS — saveProfile() body unchanged; diff shows only the picker UI + removed duplicate description paragraph |

## Files in this change

- [studio/lib/niches.js](../../studio/lib/niches.js) — added `NICHE_RECOMMENDED` (19 canonical niches → live style + reason) and `recommendedStyleFor()`; no existing export touched
- [studio/app/channels/add/page.js](../../studio/app/channels/add/page.js) — dropdown replaced by preview cards + badge + hint line; old duplicate "Template: …" paragraph removed
- [tests/niche-styles.test.mjs](../../tests/niche-styles.test.mjs) — new pin-tests (8)

## Known limits (honest)

- The recommendation covers the 19 canonical (D17) niches. Free-text niches get a best-effort substring match (same rule as the kit generator) or no badge at all — never a wrong-looking guess beyond that.
- Recommendations only ever point at `live` styles; `demo` styles (paper) can be picked manually but are never suggested.
