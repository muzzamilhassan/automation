# Spec + QA — Feedback round 1: thumbnail designs per channel (A) + template drawer demos and Story/Chapters (G) (2026-11-19)

Source: FEEDBACK.md items A and G (owner, 2026-11-19).

- A: "when adding a new channel I want to select its thumbnails, but the
  built-in thumbnail templates are not showing there."
- G: "the template drawer shows just text, not demos — how will we know
  which template is best? Also the story-based / chapters-based option
  should show there."

## Ground truth (what already exists)

- Engine: `youtube-engine.mjs` `registryThumbCandidates(brand, …)` rotates
  through `brand.thumbTemplates` (design ids); empty/absent = today's frames.
  The eligible pool is the thumbnail registry launch set
  (`studio/lib/thumb-registry.mjs` `loadThumbRegistry()` — the
  needsPhoto:false designs). An assigned id outside that pool is dropped.
- `brand` comes from `lib/brand-resolve.mjs` `resolveBrand` →
  `registryToKit(entry)`, which reads `entry.kit` from
  `yt-mcp/studio-channels.json`. `registryToKit` copies an explicit field
  list — any kit key NOT on the list never reaches the engine.
- Studio saves channel kit fields through `POST /api/channels/profile`
  (owner only) → `upsertChannel` (Neon `kit` JSONB `||` merge, then the
  per-slug repo sync to `yt-mcp/studio-channels.json`). The route copies an
  explicit kit allowlist.
- Real thumbnail samples: `GET /api/thumbs/demo?id=v2/<id>&accent=<hex>`
  renders the design through the same v2 renderer the engine uses (400×225
  JPEG, public + CDN-cached, accent in the channel colour).
- Template demos: `/api/template-previews` (CI-rendered poster + MP4) and
  `previewFor` / `ratiosForFormats` in `studio/lib/templates-gallery.mjs`.
- Doc chapters: `yt-deepdive.mjs` computes
  `hasChapters = pres.hasChapters !== false && …` with
  `pres = docPresentation(meta, b)` (`b` = the resolved brand). Today
  `docPresentation` returns no `hasChapters`.

## Requirements (EARS)

### A — thumbnail designs per channel

- A1: THE studio SHALL show every design in the thumbnail registry as a
  real rendered sample image (the demo route, in the channel's accent), and
  a design whose sample fails to load SHALL show an honest "No preview yet"
  tile instead of an image.
- A2: WHEN the owner ticks designs, THE picker SHALL allow at most 5 and
  SHALL say plainly that 2–5 rotate on uploads and none = automatic.
- A3: WHEN the owner saves the Add Channel wizard after ticking designs,
  THE wizard SHALL send them as `kit.thumbTemplates`; WHEN the owner never
  touched the picker and the channel had no set, THE wizard SHALL NOT send
  the field (no accidental wipe).
- A4: WHEN `POST /api/channels/profile` receives `kit.thumbTemplates`, THE
  route SHALL accept only an array of known registry design ids (deduped,
  max 8) and SHALL reject anything else with a 400 that names the problem;
  an empty array SHALL clear the set (back to automatic).
- A5: WHEN a saved channel kit carries `thumbTemplates`, THE resolved
  engine `brand` SHALL carry the same ids, and the engine's selection
  (`pickCandidates(…, { assignedIds: brand.thumbTemplates })`) SHALL pick
  from them.
- A6: WHEN the owner opens the channel's Thumbnails drawer
  (`ThumbnailAssignPanel`), THE panel SHALL load the current set, show it
  ticked, and save changes with a Save button in the drawer footer; staff
  SHALL see it read-only.

### G — template drawer

- G1: THE template drawer SHALL show each template as a preview card
  (poster image, MP4 plays on hover / tap — the same media component the
  /templates gallery uses), and a template with no render SHALL say
  "Preview not rendered yet".
- G2: THE drawer SHALL clearly mark the channel's assigned template on its
  card, and SHALL keep assign / pin / re-pin / unassign, the plain-English
  block reasons, and owner-edits / staff-read-only exactly as before.
- G3: THE drawer SHALL offer a "Template default / Full story / Chapters"
  choice for the channel, showing "Template default" when nothing is saved.
- G4: WHEN the owner picks Full story or Chapters, THE studio SHALL save
  `kit.hasChapters` = false / true through the same profile route; WHEN the
  owner picks Template default, THE studio SHALL save `null` (= unset).
  The route SHALL accept only true / false / null.
- G5: WHEN the kit has no boolean `hasChapters`, `docPresentation` SHALL
  NOT return a `hasChapters` value (output identical to today); WHEN it is
  `false`, `docPresentation` SHALL return `false` and the deep-dive's
  computed `hasChapters` SHALL be `false`. `docPresentation` SHALL NOT read
  the template's `story_structure.has_chapters` (no change to existing
  renders).
- G6: WHEN a saved channel kit carries a boolean `hasChapters`, THE
  resolved engine `brand` SHALL carry it; null / absent SHALL resolve to
  undefined.

## QA checklist (plain English)

| # | Req | What to check | How | Result |
|---|---|---|---|---|
| 1 | A1 | Add Channel → Thumbnails shows a grid of real cover pictures, one per design, tinted with the channel's accent colour. | Browser | source pins PASS; browser check pending (lead) |
| 2 | A1 | A design whose picture can't load shows "No preview yet", not a broken image. | Source pin + browser (block the demo URL) | PASS (automated, 2026-11-20) |
| 3 | A2 | Ticking a 6th design is blocked; the text says "pick 2–5, or none for automatic". | Source pin + browser | PASS (automated, 2026-11-20) |
| 4 | A3 | Save the wizard with 3 designs ticked → the channel's saved kit lists those 3 ids. | Unit (payload pin) + browser + DB check | PASS (automated, 2026-11-20) |
| 5 | A3 | Editing a channel and saving without touching thumbnails keeps its existing set. | Source pin (prefill + conditional send) | PASS (automated, 2026-11-20) |
| 6 | A4 | The save API refuses an unknown design id, a non-array, and more than 8 ids, with a clear message. | Unit (`tests/channel-kit-fields.test.mjs`) | PASS (automated, 2026-11-20) |
| 7 | A4 | Sending an empty list clears the set. | Unit | PASS (automated, 2026-11-20) |
| 8 | A5 | A saved set reaches the engine's `brand.thumbTemplates` and drives the rotation. | Unit end-to-end (`tests/channel-kit-fields.test.mjs`: route helper → registry file → `resolveBrand` → `pickCandidates`) | PASS (automated, 2026-11-20) |
| 9 | A6 | Channel → Manage → Thumbnails drawer shows the current set ticked; Save in the footer saves it; staff can look but not change. | Source pin + browser (after Team 3 registers the drawer) | source pins PASS; browser check pending (lead) |
| 10 | G1 | The template drawer shows cards with real posters; hovering plays the demo. | Source pin + browser | source pins PASS; browser check pending (lead) |
| 11 | G2 | The assigned template's card says "Assigned"; assign / unassign / re-pin still work; staff sees read-only. | Existing pins + browser | source pins PASS; browser check pending (lead) |
| 12 | G3 | The drawer shows "Template default / Full story / Chapters", with "Template default" picked for a channel that never chose. | Source pin + browser | source pins PASS; browser check pending (lead) |
| 13 | G4 | Picking "Full story" saves `hasChapters: false`; "Template default" saves `null`; anything else is refused. | Unit + browser | PASS (automated, 2026-11-20) |
| 14 | G5 | With no channel choice the documentary looks exactly like today; with "Full story" the chapter divider slides disappear. | Unit (`docPresentation` + the deep-dive's own expression) | PASS (automated, 2026-11-20) |
| 15 | G6 | A saved `hasChapters` reaches the engine `brand`; null does not. | Unit end-to-end | PASS (automated, 2026-11-20) |
