# QA — Live fix wave B1 (template names, preview media, Templates and Thumbnails drawers)

*Built 2026-11-20 from the live test report (research/live-e2e-test-2026-11-20.md). Plain-English QA. The "Evidence" column is filled by tests run here; the live rows are for the lead to check after deploy.*

## What changed, in one line each

- **P7 / T4-03 / T3-13 / T5-15:** Every template has its own real name, stored as data (`display_name` in the template registry). The wizard, the channel Templates drawer, the gallery and the API all show the same name. No more 36 "Documentary Master Frames", "Oldmoney Storybook" or "NO Spend 30day Storybook".
- **T3-13:** The "Assigned template" box names the exact template and shows the version the next video uses, the same version as its card. Example: "Red Flags Explained · v1.2.0 — the next long video uses this version. Assigned at v1.0.0; small updates apply on their own."
- **P8 / T5-04 / T3-03:** Preview posters and videos can now be cached by Vercel's CDN and the browser. Each link carries the render time, so a new render gets a new link. Videos play on hover from one player per card, and a second hover doesn't download again. Each lookup uses the shared database connection instead of opening a new one.
- **T3-04:** The Templates drawer shows the cards first. This channel's assignment, the demos and the story setting each load on their own. Each one has a 15-second limit and its own "Couldn't load — Retry", so the drawer never spins forever.
- **T3-12:** The Thumbnails drawer shows a shimmer in every tile until its sample arrives. The CDN keeps each sample for a year (it is the same image for the same design and colour).
- **T3-14:** When you pick a template card, its name and version picker appear in the sticky footer next to "Assign & pin", so they stay on screen.
- **T3-20:** Story shape is now a setting with three choices, not tabs. Changing it asks "Change story shape for Money Rulebook to Chapters? Next long video uses it." and shows "Saved." afterwards.
- **T5-05:** "Create a video with this style" only appears for templates that Create can actually make (set through a `create_style` field in the data). Today none can, because Create makes short vertical videos and all 41 templates are long documentaries. The drawer says so plainly. Create never shows a raw template id.
- **B4 contract:** The Templates and Thumbnails drawers tell the drawer when you have an unsaved pick (`frame(body, footer, { dirty })`).

## EARS rules

| ID | Rule |
|---|---|
| N1 | Every registry template SHALL carry a `display_name` of 3–40 characters that is not its id. |
| N2 | No two assignable templates (and no two gallery cards) SHALL share a display name, ignoring case. |
| N4 | The name of a template SHALL be decided by ONE rule (`templateDisplayName`): its `display_name`; else, if it IS its visual family, the family name; else its id made readable. It SHALL never be another family's name. |
| N5 | The wizard picker, the channel Templates drawer and the gallery SHALL show that name and SHALL NOT show a raw id or the family name as a template's title. |
| N6 | WHEN a channel has an assigned template, the Assigned box SHALL show that template's name and the highest version in its pinned major (the version the next video uses); the version it was assigned at SHALL appear only as history. |
| M1 | WHEN a media URL carries the current render's `v`, the media route SHALL answer `Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable`. |
| M2 | WHEN `v` is missing or stale, the route SHALL answer `Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate=86400`, and never `private`. |
| M3 | The previews list SHALL hand out media URLs with `v` = the render time, so a re-render changes the URL. |
| M4 | WHEN the stored media URL is a private Vercel Blob, the route SHALL proxy it and forward `Range` (206 Partial Content); otherwise it SHALL redirect (307) to it. |
| M5 | The media and previews routes SHALL use the shared DB client (`@/lib/db`) and SHALL NOT open a connection per request; found rows SHALL be cached for 5 minutes per warm instance. |
| M7 | Each preview card SHALL have at most one `<video>`, with `preload="none"` until the first hover or tap; hover SHALL call `play()`/`pause()` on that same element. Posters SHALL load only when the card is near the screen. |
| L1 | Each Templates-drawer request SHALL give up after 15 s and show "Couldn't load … Retry"; the cards SHALL render from `/api/templates` without waiting for the assignment, the demos or the story setting. |
| S1 | WHEN the owner selects a template card, its name and version picker SHALL show in the drawer's sticky footer. |
| R1 | The Story shape control SHALL be a radio group (`role="radiogroup"`/`role="radio"`), SHALL ask through `useConfirm` before saving a change, and SHALL show "Saved." after a successful save. |
| T1 | Each Thumbnails-drawer tile SHALL show a shimmer until its image loads; images SHALL be `loading="lazy"`. |
| T2 | `/api/thumbs/demo` SHALL answer `Cache-Control: public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800`. |
| C1 | A gallery template SHALL link to Create only when its data has `create_style`; otherwise the drawer SHALL say "Made by your channels' autopilot — Create can't make this look." |
| C4 | WHEN Create receives an id it cannot make, it SHALL name the look it falls back to and SHALL NOT show the raw id. |
| D1 | The Templates and Thumbnails panels SHALL pass `{ dirty }` to `frame()`: true while a pick differs from what is saved. |

## QA rows

| # | What to do | What should happen | Evidence |
|---|---|---|---|
| 1 | `node --test tests/template-names.test.mjs` | All naming rules pass | PASS — 7/7 |
| 2 | `node --test tests/wave-b1.test.mjs` | All media, drawer, thumbnail and Create rules pass | PASS — 19/19 |
| 3 | Full suite `node --test tests/*.test.mjs` | Only the known T4b (and flaky T4c) may fail | 2032/2036 — the 4 failures are T4b + 3× T4c |
| 4 | Live: Channels → Money Rulebook → Templates | Cards appear within a few seconds. Every card has a different name. The Assigned box says "Red Flags Explained · v1.2.0 — the next long video uses this version." | Lead, after deploy |
| 5 | Live: same drawer, click any card | Footer shows "Selected: <name>", a "Version 1 (latest)" picker, Clear and Assign & pin. You don't need to scroll. | Lead, after deploy |
| 6 | Live: same drawer, click "Chapters" under Story shape → Cancel | Nothing changes | Lead, after deploy |
| 7 | Live: click "Chapters" → Change, then click "Template default" → Change | "Saved. The next long video uses this." each time; the choice stays after reopening (put it back to what it was) | Lead, after deploy |
| 8 | Live: hover a card with a demo | A small "Loading" chip, then the video plays; leave and hover again and it resumes at once with no new download (DevTools → Network shows no second mp4 request) | Lead, after deploy |
| 9 | Live: DevTools → Network on /templates, reload twice | Posters show `x-vercel-cache: HIT` (or disk cache) on the second load, and the response says `cache-control: public, max-age=31536000, immutable` | Lead, after deploy |
| 10 | Live: `/templates` → open any template | Footer says "Made by your channels' autopilot — Create can't make this look."; no Create button | Lead, after deploy |
| 11 | Live: open `/create?template=oldmoney-storybook` | Note: "That template is made by your channels' autopilot, not here. Create makes short vertical videos — showing Old Money Luxury. Pick a look below." No raw id. | Lead, after deploy |
| 12 | Live: Channels → any channel → Thumbnails | Every tile shimmers until its picture arrives; no empty boxes | Lead, after deploy |
| 13 | Live: Add Channel → Look & sound | Template names match the gallery; descriptions are each template's own words | Lead, after deploy |

## Files

- `studio/lib/template-media.mjs` (new): cache headers, versioned media URLs, private-blob check, lookup ids, `fetchJsonWithTimeout`
- `studio/lib/template-registry.js`: `templateDisplayName` (the one naming rule), used by the loader
- `studio/lib/template-registry.data.js`: `display_name` on all 41 templates
- `studio/lib/templates-gallery.mjs`: name from the loader, `createStyle`, `highestInMajor` / `availableMajors` / `assignmentSummary`
- `studio/app/api/template-previews/route.js`, `.../media/route.js`: shared DB, versioned URLs, cache headers, Range, 307 for public URLs
- `studio/app/api/thumbs/demo/route.js`: one-year CDN cache
- `studio/components/TemplatePreviewMedia.js`, `TemplateAssignPanel.js`, `ThumbnailDesignPicker.js`, `ThumbnailAssignPanel.js`, `wizard/TemplatePicker.js`
- `studio/app/templates/page.js`, `studio/app/create/page.js`
- Tests: `tests/template-names.test.mjs`, `tests/wave-b1.test.mjs` (new); pins updated in `templates-gallery`, `thumb-picker`, `rate-limit`, `dashboard-bugfixes`
