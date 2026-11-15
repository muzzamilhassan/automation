# Spec + QA — Doc titles never cut mid-word (2026-11-15)

Found live: investors-compass doc iGZCplBBDtA went up as "… | Investing
psychology & marke" — `yt-deepdive.mjs` built `${title} | ${authority}` and
`.slice(0, 95)`. (The wording half was fixed in 1fa9f2a; the video was
retitled by hand.)

## Requirements (EARS)

- R1: THE DOC TITLE SHALL be `<title> | <authority>` only WHEN it fits
  YouTube's 100-character limit; otherwise the bare title.
- R2: A title longer than 100 characters SHALL be trimmed at a word boundary
  with "…" — never mid-word.
- R3: The upload, the state's `deepdiveVideo.title` and the FB/IG outbox SHALL
  all use the same title.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | fits → suffix kept; overflow → suffix dropped whole | automated | `node --test tests/doc-title.test.mjs` |
| 2 | R2 | 140-char title → ≤100, ends "…", no mid-word cut | automated | same |
| 3 | R3 | no raw `${script.title} \| ${b.authority}` left; all three sites use `docTitle` | automated | same (source pin) |
| 4 | R1 | next doc title on YouTube is whole | manual | YouTube Studio |
