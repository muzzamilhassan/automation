# Spec + QA — Thumbnail SVG injection guard + sharp/next upgrade (2026-11-15)

Source: research/deep-audit-2026-11-13.md, improvement #2 (security-02,
security-03). Template colours (`accent`, `shade`) and image hrefs
(`photoHref`, `faceImage`) are interpolated raw into SVG attributes, and
the SVG is rasterised by sharp/librsvg. `/api/thumbs/demo` is public and
passed `?accent=`/`?shade=` straight through; preview accepted any
`data:image/*` upload, including SVG. sharp 0.33.5 ships librsvg with
GHSA-wq5f-xc86-pv6w; next 16.3.4 had a critical advisory (GHSA-h694-7cp9-m8p3).

## Decision

Sanitise once at the shared render entry points (`buildThumbSvg`,
`renderV2`) so every route — demo, preview, bulk — is covered even if a
route forgets to validate. Routes still validate up front so callers get a
clear 400 instead of a silently-defaulted render.

## Requirements (EARS)

- R1: THE RENDERERS SHALL accept `accent`/`shade` only as `#RRGGBB`;
  anything else SHALL fall back to the template's default colour.
- R2: THE RENDERERS SHALL accept `photoHref`/`faceImage` only as base64
  `data:image/(jpeg|png|webp)` URLs; anything else SHALL render no image.
- R3: No hostile colour or href SHALL appear in any V1 or V2 template SVG.
- R4: WHEN `/api/thumbs/demo` gets a non-`#RRGGBB` colour, it SHALL return
  400; WHEN preview gets an upload that is not base64 jpeg/png/webp, it
  SHALL return 400.
- R5: Studio and root SHALL run sharp >= 0.35.5 and studio next >= 16.4.1.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | `safeThumbOpts` colour cases | automated | `node --test tests/thumbs-svg-safety.test.mjs` |
| 2 | R2 | `isSafeImageDataUrl` + href drop | automated | same |
| 3 | R3 | hostile opts through every V1 sample + every V2 catalog id | automated | same |
| 4 | R4 | demo/preview route guards (source pin) | automated | same |
| 5 | R5 | installed versions + real sharp render in root and studio | automated | `node_modules/*/package.json` + one-off render |
| 6 | R5 | `next build` passes on 16.4.6 | automated | `cd studio && npx next build` |
| 7 | R4 | live: `/api/thumbs/demo?id=poster&accent=%23fff%22%2F%3E` → 400; `/api/thumbs/demo?id=poster` → 200 image/jpeg | manual | curl after `vercel --prod` |
| 8 | — | signed-in owner: /thumbs preview + Pexels photo + upload JPEG still render | manual | owner check in browser |

## Regression

- Full root suite stays green; `tests/thumbs-studio.test.mjs` (V1/V2 render
  hardening) stays green.
- Known remaining studio advisories (out of scope here): `zod` and
  `source-map-js` (5 high, transitive).
