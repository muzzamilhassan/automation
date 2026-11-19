# Spec + QA — Feedback round 1, items E + F: drawers that scroll, less text, a schedule picker the owner understands (2026-11-19)

Owner feedback:

- **E:** "The Schedule drawer (first Manage option) is not the best UI. It's not scrollable, and every heading shows a description. I want less text."
- **F:** "The autopilot start time where the daily cron runs is not understandable. How will I know the best timing? I want AI to show me best times, and also the available slots not used by other channels, so we can pick one."

## Root cause of "not scrollable"

`studio/components/shell/AppShell.js` wraps every page in `<div className="fade-up">`. The `fade-up` animation runs with `both` fill-mode and ends on `transform: translateY(0)`, so the wrapper keeps a transform after the animation finishes. In CSS, any transform (even an identity one) makes that element the containing block for `position: fixed` descendants. The Drawer is rendered inside the page, so its `fixed inset-0` overlay was sized to the whole page content instead of the viewport:

- the panel grew as tall as the page;
- its `overflow-y-auto` body therefore never overflowed, so there was no scrollbar;
- the body scroll lock (`overflow: hidden`) then made everything below the fold unreachable.

The fix is to render the Drawer through a portal on `document.body`, so no ancestor can change what it is positioned against.

## A note on the two times

The engine has two different times, and they must not be mixed up:

- **Goes public** (publish time): the kit `slots` / `longSlot`, in UTC HH:MM. `yt-daily.mjs` sets `publishAt = nextFutureSlotISO(b.slots)`. This is the time the audience sees.
- **Autopilot start** (gate): the registry `cron` / `kit.gateCron`, in daily UTC form `M H * * *`. This is when the run starts making the video. It does NOT change when the video goes public.

Each picker gets its own honest suggestions:

- In the **Add Channel wizard** (publish time), the stars come from the audience: the channel's viewers, then the audience the owner picked, then the niche table.
- In the **Schedule drawer** (start time), the stars mark free hours that leave review time before the video goes public. Audience peaks do not apply to a start time.

## EARS acceptance criteria

### E — Drawer and panels

- **E1:** WHEN any Drawer opens, THE studio SHALL render it in a portal on `document.body` (only after mount on the client), so no page ancestor can change its size.
- **E2:** WHILE a Drawer is open and its content is taller than the screen, THE studio SHALL scroll the body region only, with the header and footer staying in place, on desktop and at 390 px.
- **E3:** WHILE a Drawer is open, THE studio SHALL keep these behaviours:
  - focus moves inside;
  - Tab is trapped;
  - Escape closes the Drawer, except while a `[role="alertdialog"]` is open;
  - focus returns to the opener on close;
  - the body scroll is locked;
  - `onClose` is read through a ref.
- **E4:** WHEN the Schedule, API keys or AI routing drawer opens, THE studio SHALL show no help paragraph under any section heading. There SHALL be at most one short line at the top, and only text that prevents a real mistake.

### F — Slot timeline

- **F1:** WHEN the owner picks a time (Schedule drawer start time, or wizard short time), THE studio SHALL show ONE shared 24-hour timeline (`SlotTimeline`) in the viewer's local time, with a "your time (Zone)" label from `Intl`.
- **F2:** WHEN another channel already uses an hour, THE timeline SHALL grey that hour out and mark it "taken by <Channel>". The current channel's own hour SHALL NOT count as taken.
- **F3:** THE timeline SHALL star up to 3 suggested hours, each with a one-line reason that names its real source:
  - "your channel's viewers" (real analytics), else "the audience you picked", else "typical for this niche";
  - for start times: "about N h to review before it goes public".
  - THE studio SHALL NOT invent analytics. No existing API exposes per-hour audience data today, so that source is skipped.
- **F4:** THE suggestions SHALL avoid every taken hour and keep at least a 1-hour gap from other channels. They SHALL relax to "not exactly taken" only when nothing else is free.
- **F5:** WHEN the owner clicks an hour, THE studio SHALL set that time, keeping the existing minute. The cron string SHALL never be the main UI; it appears only inside an "Advanced" disclosure in the Schedule drawer, and never in the wizard.
- **F6:** THE taken hours SHALL come from live registry data, with no per-channel maps:
  - the Schedule drawer reads `GET /api/channels/schedule`, which adds `channels` (owner/staff only) and this channel's `publish` times;
  - the wizard reads the existing `GET /api/channels/registry`.
- **F7:** WHEN the owner saves, THE studio SHALL use the existing save paths (`POST /api/channels/schedule` with `gateCron`; the wizard's `slots` through the profile route) and SHALL NOT change what the engine reads.
- **F8:** All time logic SHALL live in the pure module `studio/lib/slot-planner.mjs` (no `@/` imports), tested with `node --test`.

## QA checklist

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | E1 | Drawer imports `createPortal` and portals to `document.body` behind a mounted guard | automated | `node --test tests/slot-planner.test.mjs` (Drawer pins) |
| 2 | E2 | Panel is `fixed`-anchored, body `flex-1 min-h-0 overflow-y-auto`, header/footer `shrink-0` | automated | same |
| 3 | E2 | Owner: open Channels → Manage → Schedule on a laptop and on a phone (390 px); the middle scrolls, the Save button stays visible | manual | browser |
| 4 | E3 | Focus trap, Escape + alertdialog guard, focus return, scroll lock, `onCloseRef` still in the source | automated | same |
| 5 | E3 | Owner: press Tab and Escape inside a drawer; focus goes back to the Manage button | manual | browser |
| 6 | E4 | No `DayPicker` hint, no cron help line, no long intro in keys/routing panels | automated | same |
| 7 | F1 | Timeline: 24 hour cells sorted by local time; zone label from `Intl` | automated | planner `timelineHours` tests + source pins |
| 8 | F2 | `takenHours` excludes the current slug and labels each hour by channel | automated | planner tests |
| 9 | F3 | `suggestHours` source order (audience → preset → niche → general) and honest reason text; `suggestStartHours` uses the publish time | automated | planner tests |
| 10 | F4 | Gap rule + relax-when-full rule | automated | planner tests |
| 11 | F5 | `cronFromUtc` / `parseDailyCron` round-trip; the wizard source has no "cron" | automated | planner tests + `tests/wizard-rebuild.test.mjs` |
| 12 | F6 | Schedule GET returns `channels` only for owner/staff, built with `channelTimes` | automated | source pins |
| 13 | F7 | Save still posts `gateCron` to `/api/channels/schedule`; wizard still calls `onSlots` with UTC HH:MM | automated | source pins |
| 14 | F1–F5 | Owner: in Schedule, the other channels' hours are grey "taken by …"; click a ★ hour; Save; the drawer reopens on that hour | manual | browser |
| 15 | F8 | `node --check studio/lib/slot-planner.mjs`; full suite green except known T4b | automated | `node --test tests/*.test.mjs` |
