# Add Channel wizard: upload days (2026-11-24)

Owner: "there is nothing option for short select when shorts will be upload" → approved "yes".

**Why:** the wizard's Schedule step had Shorts times only. Days lived in the channel's Schedule drawer
(`yt-mcp/cadence.json`), and those saved days override the wizard's weekly day (`lib/brand-resolve.mjs applyCadence`).

## Spec
- **D1** WHEN the Schedule step opens for a connected channel, it SHALL show two day rows, Long video days and Shorts
  days (Mon–Sun, several can be picked), filled from the channel's saved schedule.
- **D2** WHEN the channel has no saved days, Long video days SHALL start on the current weekly day and Shorts days empty.
- **D3** WHEN the owner saves and the days differ from the saved ones, the wizard SHALL save them through
  `POST /api/channels/schedule` BEFORE the profile save, so "Save & start" checks readiness with the new days.
- **D4** IF the schedule save fails, THEN the wizard SHALL show the reason and SHALL NOT save the profile or start.
- **D5** IF the saved schedule could not be read, THEN the rows SHALL offer Retry and the wizard SHALL NOT write days.
- **D6** The save SHALL keep the channel's other schedule settings (where Shorts come from).
- **D7** Unchanged days SHALL NOT be sent.
- **D8** IF no day is picked in either row, THEN Next and Save SHALL be blocked with a plain message.
- **D9** The day picks SHALL survive a reload like the rest of the unsaved setup.
- **D10** Review and the saved message SHALL name the real days.

## QA

| # | Check | Type |
|---|---|---|
| 1 | Pure helpers: read, default, dirty, body, issue text (D1, D2, D6–D8) | automated |
| 2 | Wizard source: schedule POST precedes profile POST and stops on error (D3, D4) | automated |
| 3 | Failed read never writes (D5) | automated |
| 4 | Live panel: YT-BOT shows Sat / Mon–Thu, picks change, nothing saved by the test | visual |
| 5 | Regression: Schedule drawer, wizard suites | automated |
