# Spec + QA — Proxy role matrix lets staff use schedule & clip-queue (2026-11-16)

Admin-panel review 2026-11-15 bug #7: the proxy's owner-only rule covered every
`/api/channels/*` path except flow/keys, so staff got 403 on
`/api/channels/schedule` and `/api/channels/clip-queue`, whose routes allow
owner+staff. The matrix moves to `studio/lib/route-roles.js` (testable).

- R1: `/api/channels/schedule` and `/api/channels/clip-queue` SHALL be owner+staff.
- R2: Every other rule SHALL be unchanged (other channel management owner-only; engine room owner+staff; thumbs/topics/flow/keys include clients; unlisted = any signed-in).

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | allowedRoles for the two routes = owner,staff | automated | `node --test tests/route-roles.test.mjs` |
| 2 | R2 | owner-only, owner+staff, client and unlisted cases | automated | same + `tests/session-admin.test.mjs` (/sessions) |
| 3 | — | proxy delegates to allowedRoles; `next build` OK | automated | same + local build |
