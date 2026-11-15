# Spec + QA — Pre-upload media QC gate (2026-11-15)

Source: research/deep-audit-2026-11-13.md item #13 (tests-qa-03). No render
QC existed: a black video reached YouTube (5fae2bf pulled 4 videos); the
pre-upload check (6228c56) inspects only bytes and magic numbers.

## Design

`lib/media-qc.mjs`: ffprobe (streams, codecs, resolution, duration) +
ffmpeg `blackdetect` / `silencedetect` totals. Renders longer than 120s are
decoded keyframes-only (fast; enough to see "mostly black"). `evaluateQc` is
pure. `uploadWithIntent({ mediaPath })` runs it before the intent row and the
upload session. Bad media → `{ ok:false, qcFailed:true }` (the lane's existing
upload-failure path). A QC TOOL error fails OPEN (logged, upload proceeds).

## Requirements (EARS)

- R1: WHEN a lane uploads, THE SYSTEM SHALL QC the rendered file before
  creating the upload intent.
- R2: THE QC SHALL refuse: no video or audio stream; video codec not
  h264/hevc/vp9/av1 or audio not aac/opus/mp3; Shorts not vertical or outside
  5–180s; docs not landscape or under 60s; shorter side < 720; ≥50% black;
  ≥80% silent.
- R3: WHEN ffprobe/ffmpeg is missing, times out or returns unreadable output,
  THE UPLOAD SHALL proceed with a logged "media QC skipped".
- R4: All four lanes (yt-deepdive doc, yt-daily ×2 shorts, shorts-clips) pass
  their file as `mediaPath`.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R2 | evaluateQc: pass, black, silent, missing streams, codec, shape, duration per kind | automated | `node --test tests/media-qc.test.mjs` |
| 2 | R2 | parseDetectDurations sums ffmpeg detector output | automated | same |
| 3 | R1/R2 | real lavfi media: testsrc2 + tone passes; black + silence refused | automated | same (skips only if ffmpeg absent) |
| 4 | R3 | bogus ffprobe → ok, skipped, toolError | automated | same |
| 5 | R1/R4 | QC before `store.createIntent`; every call passes mediaPath | automated | same (source pin) |
| 6 | R2 | NO false positives on real renders: 4 local docs (732–790s) and 6 archived Shorts (21–24s) all pass, 2–6s each | automated | local run 2026-11-15 |
| 7 | R1 | next uploads log `media QC ok {…stats}` in autopilot runs | manual | run log |

## Observation

debt-free-doctrine's local doc render measured 214s of near-black frames out
of 732s (29%, below the 50% gate) — worth an owner look (dark styling vs
black gaps).

## Regression

- Full root suite green (1218/1218).
