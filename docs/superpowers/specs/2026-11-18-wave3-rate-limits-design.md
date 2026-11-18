# Wave 3 design — shared rate limiter (audit RL-1 … RL-6)

*2026-11-18 · Design only — no code written yet. Owner approval required before the issue is created.*

## The problem, in plain words

The panel has exactly two limits today: the login lockout (5 wrong tries per IP, works) and a small daily cap on thumbnail attaching. Everything else is unlimited. One leaked session — or one browser tab stuck in a refresh loop — can, per request:

- start **unlimited billable GitHub Actions runs** (real video uploads) via `/api/action` and `/api/create-video` — with the `topup` parameter unbounded,
- bypass all caching with `fresh=1` and re-pull **every channel's YouTube quota** per click — draining the exact quota the nightly autopilot needs,
- hammer the 60-second AI background generator (a free provider that allows 10 requests/minute) and the 12 MB preview encoder,
- do uncached Google fan-outs on the performance/videos surfaces.

The audit's fix is one small shared primitive plus wiring it into ~8 expensive routes. In-memory counting is useless on Vercel (every serverless instance has its own memory) — so the counter lives in Neon, next to the login throttle that already proves the pattern works.

## The design

### Part A — one primitive: `studio/lib/rate-limit.mjs`

```js
allow({ bucket, key, limit, windowSec }) → { ok, remaining, retryAfterSec }
```

- Neon-backed **fixed-window** counter. One table:

  ```sql
  CREATE TABLE IF NOT EXISTS rate_limits (
    bucket TEXT, key TEXT, window_sec INTEGER,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, key, window_sec)
  );
  ```

- The whole check is **one atomic statement** — `INSERT … ON CONFLICT … DO UPDATE … RETURNING count, window_start` (window restarts when the old one elapsed). No read-then-write race is possible.
- **Keying**: the signed-in user's email (the "actor" — stable across their sessions). Routes call it *after* auth, so the key always exists.
- A thin `enforceLimits(req, user, [{ bucket, limit, windowSec }, …])` helper returns a ready-made **429 response** (`Retry-After` header + plain-English error) or `null` to continue. Multiple specs = multiple windows (e.g. hourly AND daily) — denied if any is exceeded.

**Deliberate fail-open (documented deviation):** if Neon is unreachable, the limiter *allows* and logs a warning. This is a cost guard, not an auth gate — auth has already happened when the limiter runs, and failing closed would lock the whole panel out during every database blip. The fail-closed doctrine (#118) stays exactly where it was: authentication and authorization.

- Every denial writes a best-effort row to the existing audit log (`appendAudit`, catch-wrapped) so abuse shows up in the same surface you already watch.

### Part B — the limits (from the audit, exactly)

| Route(s) | Bucket | Limit |
|---|---|---|
| `/api/channels/kit` (LLM autofill) | `llm-kit` | 10 / hour / actor |
| `/api/thumbs/ai-bg` (60 s AI calls, free 10-RPM provider) | `ai-bg` | 5 / hour **and** 20 / day |
| `/api/action` + `/api/create-video` (billable Actions dispatches) | `dispatch` (shared) | 10 / hour **and** 30 / day; `topup` param clamped to ≤ 20 |
| `fresh=1` on `/api/analytics` + `/api/overview` | `fresh-pull` | **owner-only**, 5 / hour |
| `/api/thumbs/preview` (12 MB fetch + encode) | `preview` | 30 / 10 min |
| `/api/thumbs/performance` + `/api/thumbs/videos` (Google fan-outs) | `thumbs-read` | 20 / hour |
| `/api/thumbs/demo` (public) | no limiter — gets `s-maxage=86400` so the CDN caches one render instead of the lambda re-rendering per URL variant |

What is NOT limited: all cheap reads (overview/analytics cached path, logs, registry, topics read…). Normal panel use — even heavy clicking — never touches a limit; the numbers above sit well above any human's real usage.

### Part C — platform step (owner, one click, not code)

Vercel's **Attack Challenge Mode** (Firewall settings) on the project — a free platform toggle that challenges suspicious traffic before it reaches the code. I'll give exact steps in the runbook; it cannot be done from the CLI.

## EARS acceptance criteria

- **R1**: `allow` SHALL be a single atomic Neon upsert that counts once per call and restarts the window when it elapses (tested against a stub client that only accepts the exact SQL).
- **R2**: `enforceLimits` SHALL return a 429 with a `Retry-After` header naming the wait, and a plain-English error, when any spec is exceeded.
- **R3**: WHEN the database is unreachable, the limiter SHALL allow the request and log a warning — never block the panel.
- **R4**: every denial SHALL attempt one audit-log row (best-effort, cannot fail the request).
- **R5**: all eight route wirings SHALL match the Part B table exactly (source-scan pinned per route), including the shared `dispatch` bucket for action + create-video and the `topup` ≤ 20 clamp.
- **R6**: `fresh=1` SHALL be owner-only on analytics and overview, limited to 5/hour.
- **R7**: the demo route SHALL send `s-maxage=86400` (and keep its existing validation).
- **R8**: the full test suite stays green (modulo the known pre-existing T4b).

## Test plan

- `tests/rate-limit.test.mjs`: `allow()` behavioral — first call = 1, increments, window reset after expiry (injectable clock), limit exceeded → ok:false + retryAfter, DB error → fail-open + warning; stub client rejects any SQL that isn't the exact upsert (house pattern — tests can't pass trivially).
- Route wiring: source scans per route (bucket names + limits + 429 shape + `topup` clamp + fresh=1 owner gate + demo `s-maxage`).
- QA file `docs/qa/rate-limits-qa.md` in plain English.

## Out of scope (later)

- Consolidating the three drifted `DAILY_CAP=10` thumbnail-attach copies onto the new limiter (they work; a tidy-up, not a security win).
- SEC-7 class items (constant-time compares, global login counter) — separate small issue.
- Vercel Firewall rules beyond Attack Challenge Mode.

## Risks

- Limits too tight for real usage → the numbers come from the audit's measurement of actual usage patterns and sit well above human pace; every limit is one line to adjust afterward.
- Neon blip → fail-open means limits vanish briefly (documented above; the alternative locks the owner out of the panel).
- The `rate_limits` table grows one row per (bucket, actor, window) — a few hundred rows total; no cleanup needed.
