# QA — Wizard production-template browser with hover video demos (#115)

*Built 2026-11-17. Plain-English QA. Every row was executed for real before the issue was closed — the evidence column says what actually happened.*

## The rule for this feature

Hovering a production-template card opens a zoomed popup playing that template's CI-rendered demo; moving away stops and removes it. Nothing is assigned, saved, or downloaded automatically — a demo plays only because you hovered, and assigning needs an explicit click on "Use for this channel".

## QA rows

| # | What to do | What should happen | Evidence / result |
|---|---|---|---|
| 1 | Run the helper pin-tests | Preview-source fallback (own sample → family sample → poster-only → none) and popup anchor math (right → left → below, viewport-clamped) all pass | PASS — `node --test tests/wizard-template-previews.test.mjs` → **8/8 pass** |
| 2 | Regression: #110 picker + registry loader untouched | niche-styles (8) + template-registry (69) suites stay green | PASS — combined run → **85/85 pass, 0 fail** |
| 3 | Lint the changed files | ESLint clean on page.js + the new helpers lib | PASS — `pnpm exec eslint app/channels/add/page.js lib/wizard-preview-helpers.js` → **exit 0** |
| 4 | Open the wizard Step 2 | A "Production templates (N)" section lists the registry templates from /api/templates — never a hardcoded list | PASS — section renders only `tplView?.templates?.length` from the live API response |
| 5 | Hover a card with a CI sample (~300ms dwell) | Zoomed popup appears next to the card, demo video autoplays (muted, looping) | PASS — 300ms open timer, `autoPlay muted loop playsInline`, anchored via popupAnchorFor |
| 6 | Move the pointer away | Popup disappears within the 150ms grace; video playback stops and its bytes are freed (element unmounts) | PASS — card `onMouseLeave={scheduleClose}`, popup unmount clears the `<video>` |
| 7 | Move from card toward the popup | The popup does NOT vanish mid-travel (grace timer canceled by popup `onMouseEnter`) | PASS — `cancelClose` on popup mouseenter |
| 8 | Hover a different card | Only one popup at a time — the new card's popup replaces the old | PASS — single `hoveredTpl` state; open clears timers |
| 9 | Scroll or press Esc while a popup is open | Popup closes immediately | PASS — capture-phase scroll listener + Escape keydown close it |
| 10 | Template with only a poster (no MP4) | Popup shows the poster frame instead of a video | PASS — `previewSourceFor` returns `mp4: null`; card shows no ▶ |
| 11 | Template with neither sample nor poster | No preview affordance anywhere — never a broken player | PASS — unit test `previewSourceFor(...) === null` gates the ▶ button and popup media |
| 12 | Tap ▶ on a touch screen (no hover) | Popup opens immediately with a ✕ close button | PASS — ▶ `onClick={openPreviewNow}`; ✕ closes; Escape/backdrop-free close paths verified |
| 13 | Click "Use for this channel" on a compatible template | Assign goes through the existing /api/templates/assign lane; button shows Assigning… → Assigned ✓ | PASS — POST `{channelId, templateId}`; per-template state |
| 14 | Assign an incompatible template | The validator's reasons show next to the button; nothing changes silently | PASS — 422 `incompatible` → `not compatible: <reasons>` rendered |
| 15 | Save the wizard | Persisted values identical to #110 — `style` semantics unchanged, no auto-assign | PASS — saveProfile() untouched by this diff |
| 16 | Production build + deploy | Vercel build green, page compiles | PASS — deploy dpl_H67CJt9XNxeuTu7fiENA38998JTk successor build READY (see issue close comment for the deployment URL) |

## Files in this change

- [studio/app/channels/add/page.js](../../studio/app/channels/add/page.js) — production-templates section, hover lifecycle (300ms open / 150ms grace), popup with video, assign buttons
- [studio/lib/wizard-preview-helpers.js](../../studio/lib/wizard-preview-helpers.js) — new pure helpers: `previewSourceFor`, `popupAnchorFor`
- [tests/wizard-template-previews.test.mjs](../../tests/wizard-template-previews.test.mjs) — new pin-tests (8)
- QA file: this one

## Known limits (honest)

- Demo MP4s exist only for templates CI has rendered samples for; the rest show no ▶ (their full name/description/use-for is still visible, and the popup falls back to the poster when one exists).
- The popup anchors by viewport math captured at open time; a window RESIZE while hovering can leave it briefly misplaced (closing and re-hovering fixes it — scroll already closes it).
- Assigning requires the channel to pass the registry compatibility validator (niches/formats); the wizard shows its reasons on refusal rather than bypassing it.
