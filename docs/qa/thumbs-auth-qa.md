# Spec + QA — Thumbs routes auth restore (2026-11-15)

Source: research/deep-audit-2026-11-13.md, improvement #1 (security-01,
studio-arch-01, security-10). Commit e9ef6d2 ("fix studio thumbnails
preview") removed the sign-in checks from `/api/thumbs/preview`,
`/api/thumbs/templates` and `/api/thumbs/videos`, and added five
`/api/thumbs/*` paths to the proxy's public list. Net effect on production:
anyone on the internet could make the server fetch any https URL and
render it through sharp/librsvg (SSRF + cost burn), and read private
pipeline titles for any channel slug.

## Decisions

- Keep e9ef6d2's product intent — **every signed-in Studio role that the
  proxy already lets onto /thumbs (owner, staff, client) can render a
  preview.** The original owner/staff-only rule (#60) existed because of the
  open server-side fetch; the fetch is now locked to the Pexels image host,
  so that reason is gone.
- `/api/thumbs/demo` stays public (template-picker card images; no fetch,
  no private data). Its unescaped colour params are fixed in item #2.
- The public-path list moves to `studio/lib/public-paths.js` so it can be
  tested directly; the photo-host check lives in `studio/lib/photo-url.js`.

## Requirements (EARS)

- R1: THE PROXY SHALL treat only `/api/thumbs/demo` as public among
  `/api/thumbs/*` paths; every other thumbs API path requires a session.
- R2: WHEN `/api/thumbs/preview` receives a request with no signed-in user,
  THE ROUTE SHALL return 401 before reading the body or fetching anything.
- R3: THE preview route SHALL fetch `photoUrl` only WHEN it is an https URL
  on an allowlisted image host (`images.pexels.com`), and SHALL refuse
  redirects; otherwise it SHALL return 400 without fetching.
- R4: WHEN `/api/thumbs/videos` receives no signed-in user, THE ROUTE SHALL
  return 401; WHEN the user cannot access the slug, it SHALL return 403 —
  no state-derived titles for unauthorised callers.
- R5: WHEN `/api/thumbs/templates` receives no signed-in user, THE ROUTE
  SHALL return 401.
- R6: Signed-in Studio users SHALL keep a working /thumbs page (templates
  list, channel videos, Pexels photo pick, live preview).

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | `isPublicPath` is true for `/api/thumbs/demo`, false for templates/registry/preview/videos/photos | automated | `node --test tests/thumbs-auth.test.mjs` |
| 2 | R1 | proxy.js uses `isPublicPath` and has no inline thumbs public paths | automated | same file (source pin) |
| 3 | R2 | preview route: `getUser` + 401 comes before `req.json()` and `fetch(` | automated | same file (source order pin) |
| 4 | R3 | `isAllowedPhotoUrl` accepts `https://images.pexels.com/...`, rejects http, other hosts, look-alike hosts, userinfo tricks, IP literals, non-URLs | automated | same file |
| 5 | R3 | preview fetch passes `redirect: 'error'` and is gated by `isAllowedPhotoUrl` | automated | same file (source pin) |
| 6 | R4 | videos route returns 401 on no user, 403 on no access, before `fallbackVideos` | automated | same file (source order pin) |
| 7 | R5 | templates route has `getUser` + 401 | automated | same file (source pin) |
| 8 | R1–R5 | live: anonymous `POST /api/thumbs/preview`, `GET /api/thumbs/videos?slug=money-rulebook`, `GET /api/thumbs/templates` on https://quarry-studio.vercel.app → 401; `GET /api/thumbs/demo?id=poster` → 200 image | manual | curl after `vercel --prod` |
| 9 | R6 | signed-in owner: /thumbs loads templates, videos, Pexels photo, preview renders | manual | owner check in browser |

## Regression

- Full root suite `npm test` stays green apart from known pre-existing
  failures (the `opentype.js` load failure is item #3).
