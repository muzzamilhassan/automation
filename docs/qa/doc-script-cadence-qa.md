# Documentary scripts only when a long video is due (2026-11-25)

Owner: "why scripts are showing everyday for every channel although we are just publishing long video 1 video per week".

**Cause:** for a review-gated channel whose Shorts are clips, the review gate holds every day and the pipeline wrote a
new documentary script each time, skipping the doc-day check on purpose (T5c). Each approved one became a long video.

## Spec
- **S1** WHEN a gated clips channel has no approved script, the pipeline SHALL write a documentary script only if a long
  video is due (its doc day, or a missed one).
- **S2** WHILE a documentary script from the last 7 days waits for review, it SHALL NOT write another.
- **S3** A channel that never published a long video SHALL start on its doc day.
- **S4** A forced run or an owner-given topic SHALL always write one.
- **S5** IF the waiting scripts cannot be read, THEN S1 alone decides.
- **S6** Queued clip Shorts SHALL post exactly as before.

## QA

| # | Check | Type |
|---|---|---|
| 1 | tests/doc-script-due.test.mjs | automated |
| 2 | Pipeline seam tests: due day writes, other day writes nothing and still exits held | automated |
| 3 | Next live runs: no new script on a day that is not due | live |
