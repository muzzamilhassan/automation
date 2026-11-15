# Spec + QA — Review thumbnails load (2026-11-16)

Admin-panel review 2026-11-15 bug #6: /review's `<img>` pointed at
`/api/review/thumb?id=&idx=` — a route that never existed (404). The bytes are
served by the `thumb=1` branch of `GET /api/review` (owner/staff; URL resolved
from the script row server-side; hash-verified).

- R1: THE REVIEW PAGE SHALL load candidate images from `/api/review?thumb=1&id=&idx=`.

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | page uses the existing endpoint; no `/api/review/thumb` reference | automated | `node --test tests/review-thumb-url.test.mjs` |
| 2 | R1 | endpoint keeps owner/staff gate + server-side lookup + hash verify | automated | same |
| 3 | R1 | owner: a script with thumbnail candidates shows real images in /review | manual | browser |
