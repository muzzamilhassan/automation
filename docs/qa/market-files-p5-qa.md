# Spec + QA — `market-files` P5: the thumbnail (2026-11-11)

Source: the P4 spec's phase plan; owner directive: run all phases
autonomously, demo video at the end. Plain English: the episode's own
cartoon frame (the big glowing board shot) becomes the YouTube thumbnail —
same left-stack text design as the fleet's thumbnails (dynamic gradient,
crisp accent word, brandmark), zero stock photos. The art IS the show.

## Requirements (EARS)

- R1: THE thumbnail background SHALL be a rendered frame of the episode's
  own doc (first STAT beat mid-frame; hero fallback) — never a stock photo.
- R2: THE text SHALL go through the existing renderYouTubeThumbnail
  left-stack design (wrap ≤3 lines, brandmark, last-word accent, dynamic
  gradient) — no new text renderer.
- R3: a missing episode doc SHALL refuse loudly (render first).

## QA rows

| # | Req | Check | Type | Result |
|---|---|---|---|---|
| 1 | R1 | background = a DocV2 still of the episode doc (thumb-scene.png exists, stat layout frame) | A | PASS — thumb-scene.png rendered from the episode doc, frame 304 (the first stat beat mid-frame) |
| 2 | R2 | thumbnail.jpg via renderYouTubeThumbnail left-stack; brandmark MARKET FILES; accent word crisp | V | PASS — visual review: cartoon trading floor bg, "WHY THE STOCK MARKET JUST" white + "CRASHED" accent red, brandmark MARKET FILES bottom-right, dynamic gradient keeps the text crisp — same design language as the fleet's thumbnails |
| 3 | R3 | no episode doc → loud refusal (code pin) | A | PASS — market-thumb.mjs exits 1 with "episode doc missing — run scripts/market-render.mjs first" |
| 4 | E2E | the Nov-5 episode's thumbnail rendered and visually reviewed | V | PASS — 142 KB thumbnail.jpg next to the episode. Tuning notes for the premium pass: the frame catches the in-scene caption band at the bottom (pick a frame a beat-in earlier or hide captions for the still) and the accent could take the board's own −4.4% as the highlighted element |
