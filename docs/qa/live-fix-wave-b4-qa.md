# Spec + QA — Live fix wave B4 (2026-11-20)

Source: research/live-e2e-test-2026-11-20.md, items T3-05, T3-06, T3-09,
T3-18, T3-21, T3-25, T4-08, T4-09, T4-10, T4-13, T4-14, T4-15, T4-16, T4-17,
T4-20. Evidence: studio-ui-audit/e2e/t3-channels (`s5-schedule.json`,
`s10.json`) and studio-ui-audit/e2e/t4-wizard.

Tests: `tests/drawer-history.test.mjs`, `tests/wave-b4.test.mjs` (plus the
updated pins in `channels-drawers`, `schedule-panel-load`, `slot-planner`,
`wizard-rebuild`).

## What was wrong

- **T3-05.** Closing the Schedule, Thumbnails or Keys drawer threw away
  unsaved edits without asking.
- **T3-06.** The browser Back button left the page instead of closing the
  open drawer.
- **T3-18.** "Save schedule" was enabled with nothing changed.
- **T3-09.** On the start-time timeline, a channel's own hour that another
  channel also uses showed "taken". After picking another hour, the owner
  could not pick the original one again.
- **T3-25 / T4-20 / T3-21.** The cell read "yours · sh…". The "Taken:" list
  was not in clock order and rounded every time to the hour.
- **T4-13.** While the channel list was loading, the wizard starred hours that
  were really taken.
- **T4-09 / T4-10.** A new channel's default short time, and "Add a short",
  could land on another channel's hour. Removing every short was allowed.
- **T4-08.** Reloading the wizard lost everything, with no warning.
- **T4-14.** A bad colour code silently kept the old colour.
- **T4-15.** Names of any length were accepted, but the API keeps 60.
- **T4-16.** The drafted eyebrow was cut mid-word ("… // QUOTE QU") and kept
  the old name after a rename.
- **T4-17.** Review did not list the thumbnail designs or the audience. It
  said "(next day)" for a daily short.

## Requirements (EARS)

Drawer guard and Back (`studio/components/Drawer.js`,
`studio/lib/drawer-history.mjs`, `studio/components/ChannelDrawers.js`)
- G1: WHEN a drawer is closed by Escape, ✕, the backdrop or browser Back AND
  it is not dirty, THE DRAWER SHALL close at once.
- G2: WHEN such a close happens WHILE the drawer is dirty, THE DRAWER SHALL ask
  "Discard your changes?" (Keep editing / Discard) and SHALL close only on
  Discard.
- G3: WHILE a drawer is open and dirty, THE PAGE SHALL ask before the browser
  leaves the site (beforeunload).
- G4: THE SCHEDULE, KEYS AND ROUTING PANELS SHALL report dirty through
  `frame(body, footer, { dirty })`. Schedule is dirty when it differs from the
  values it loaded or last saved. Keys are dirty when a key is typed but not
  saved. Routing reuses Wave A's unsaved draft.
- H1: WHEN a drawer opens, THE DRAWER SHALL add one browser-history entry
  (same URL; the Next router's own state is kept on it).
- H2: WHEN the owner presses Back WHILE a drawer is open, THE DRAWER SHALL
  close (through G1/G2) and the page SHALL stay.
- H3: IF the owner picks "Keep editing" after Back, THE DRAWER SHALL stay open
  and its history entry SHALL be added again.
- H4: WHEN a drawer is closed by the page, THE DRAWER SHALL remove its entry
  (`history.back()`) only if that entry is still on top.
- H5: WHEN one drawer replaces another in the same step (overview → a Manage
  drawer), THE NEW DRAWER SHALL take over the same entry: no extra entry, and
  the new drawer stays open.
- H6: Focus trap, focus return, scroll lock, the portal, and "Escape is
  ignored while a confirm is open" SHALL keep working.

Schedule drawer and timeline (`SchedulePanel.js`, `SlotTimeline.js`,
`studio/lib/slot-planner.mjs`)
- S1: WHILE nothing has changed since load or save, "Save schedule" SHALL be
  disabled.
- S2: THE CHANNEL'S OWN SAVED HOUR SHALL stay selectable even when another
  channel uses it. It is tagged "shared" (or "saved" when no other channel
  uses it).
- S3: Cell tags SHALL be short ("shared", "taken", "saved") and never cut off.
- S4: THE "Taken:" LIST SHALL be sorted by the viewer's clock and SHALL show
  real minutes ("7:13 am").
- S5: WHILE times are loading, THE TIMELINE SHALL show "Loading times…", star
  no hour, show no suggestions and allow no pick.

Wizard (`studio/app/channels/add/page.js`, `wizard/*`,
`studio/lib/wizard-steps.mjs`)
- W1: WHEN a new channel (no saved times) is loaded, THE WIZARD SHALL move
  the default short time to the nearest free hour. "Free" means no other
  channel uses that hour or the hour next to it.
- W2: WHEN "Add a short" is pressed, THE NEW SHORT SHALL go to the nearest
  free hour. It also avoids this channel's other shorts.
- W3: IF there are no daily shorts, THE SCHEDULE STEP SHALL warn "At least one
  daily short is needed" and block Next and Save. The engine has no
  "no shorts" setting in the kit. An empty list falls back to old kit times,
  or breaks a new channel. For long videos only, turn off Shorts days in the
  Schedule drawer.
- W4: WHILE the setup differs from what was loaded or saved, THE WIZARD SHALL
  keep it in sessionStorage. The key is `qs-wizard-draft:<new|edit>:<slug>`.
  Only plain form fields are stored, never tokens or keys.
- W5: WHEN the wizard opens a channel that has a stored draft, THE WIZARD
  SHALL restore it on top of the loaded values and show "Restored your unsaved
  setup." with a Start over button.
- W6: WHEN a save succeeds or Start over is pressed, THE DRAFT SHALL be
  removed.
- W7: WHILE the setup has unsaved changes, leaving the site SHALL ask first.
  The Google sign-in redirect does not ask.
- W8: IF the colour code is invalid, THE LOOK STEP SHALL block Next and show
  "Use a colour code like #38BDF8."
- W9: THE NAME SHALL be capped at 60 characters. A longer one blocks Identity.
- W10: WHEN the name changes, an eyebrow that carries the old name (full,
  cut-off, or initials) SHALL switch to the new name. A drafted eyebrow SHALL
  get the current name. Eyebrows SHALL never be cut mid-word.
- W11: THE REVIEW STEP SHALL list the picked thumbnail designs and the
  audience. A daily short reads "3:35 am your time (22:35 UTC)".
- W12: Wave A2 behaviour SHALL stay: edit prefill from engine values, and edit
  saves send only the changed fields.

## Plain-English QA (do these on the live site)

Drawers
1. Channels → Manage → Schedule. Toggle one day. Press Escape. It asks
   "Discard your changes?". Press "Keep editing". The drawer stays, with your
   change. Press ✕ and then "Discard". The drawer closes.
2. Open Schedule again. Change nothing. Press Escape. It closes with no
   question.
3. Open Schedule. Press the browser Back button. The drawer closes, and you
   are still on the Channels page.
4. Open Schedule, toggle a day, press Back. It asks. "Keep editing" keeps the
   drawer. Press Back again, then "Discard". The drawer closes and you stay on
   Channels.
5. Click a channel name to open the overview. Pick Schedule from it. Press Back
   once. The Schedule drawer closes. Press Back again. You leave Channels.
   There is no extra dead Back press.
6. API keys: type something in a key box, then click the dark backdrop. It
   asks first. Discard closes it.
7. AI routing: move a provider (do NOT save), press Escape. It asks first.
8. With a dirty drawer open, try to reload the tab. The browser asks before
   leaving.
9. Tab still cycles inside the drawer. Closing returns focus to the button
   that opened it.

Schedule timeline
10. On Quote Quarry (its start hour is shared with Investor's Compass), the
    7 am cell says "shared" and is not crossed out. Pick 5 am, then pick 7 am
    again. It works.
11. "Save schedule" is greyed out until you change something. After a
    successful save, it is greyed out again.
12. The "Taken:" line is in clock order and shows minutes, for example
    "Investor's Compass 7:13 am · The Money Rulebook 8:21 am".

Wizard
13. Add channel (after connecting): on Schedule, the first short is NOT on an
    hour another channel uses (or the hour next to one). "Add a short" also
    lands on a free hour.
14. Remove every short. A warning shows, and Next is disabled.
15. While the timeline loads (slow network), no stars show and it says
    "Loading times…".
16. Fill a few steps, then reload the page. Your setup comes back with
    "Restored your unsaved setup." "Start over" clears it. Reloading with
    unsaved changes asks first.
17. Type `#12` as the accent. Next is disabled, and the message shows. Fix it
    and Next works.
18. Paste a 200-character name. It stops at 60.
19. Draft with AI, then rename the channel. The eyebrow's name part follows,
    and no word is cut in half.
20. Review shows "Designs" (by name) and "Audience". Daily shorts read like
    "3:35 am your time (22:35 UTC)".
21. Edit an existing channel and change one field. Save sends only that field
    (wave A2 check).
