# Research — "Customer Just Logs In With Gmail": The Three Doors (Selling the Product)

**Date:** 2026-10-07 · **Type:** READ-ONLY research
**User's ask:** "When I sell this, the customer should just log in with their Gmail and be done — no 'add test user' steps. How is that possible?"

**Short answer: with your own Google app, "any stranger can just log in" requires Google's verification + a yearly security check (CASA, ~$540+). Every real YouTube-posting SaaS (Zernio, Blotato, AutoShorts…) paid that toll — there is no free unlimited shortcut, by Google's design. But there are two zero-verification doors for getting there step by step, and one of them gives the exact "just log in" experience TODAY.**

---

## 1. Why the "test user" step exists

Your Google app is (most likely) in **"Testing"** status. Google's rules for a Testing app:
- Only Gmails you list as **test users** can log in (max 100) — that's the step you didn't want.
- Refresh tokens for **restricted scopes** (youtube.upload etc.) **expire every 7 days** in Testing — confirmed still active in 2024-2026 sources (Unipile, nango, PostProxy + Google Ads API forum May 2024: even "production but unverified" hit 7-day expiries for their scopes).
- Our own 4 channels run for months without weekly re-auths — so our app is probably already in **"In production"** status (unverified), OR our tokens were grandfathered. Worth one glance: Console → OAuth consent screen → "Publishing status" says **Testing** or **In production**.

## 2. What Google allows, per status (verified against official docs)

| App status | youtube.upload (autopilot) | yt-analytics (read-only) | Strangers can log in? |
|---|---|---|---|
| Testing | ✅ but only test users + 7-day tokens | same | only your listed Gmails |
| Production, unverified | ❌ **"Access blocked: …has not completed verification"** for new users | ⚠️ yes, via "unverified app" warning screen (scary but clickable) | partially |
| Production, **verified** (+ CASA for restricted scopes) | ✅ anyone, your brand on the consent screen | ✅ anyone | ✅ **yes — the real product** |

Sources: [Google — Unverified apps](https://support.google.com/cloud/answer/7454865) · [Unipile — Google OAuth 100-user limit & 7-day rule](https://www.unipile.com) · [PostProxy — YouTube upload API guide](https://postproxy.dev) · [GMass — OAuth scope verification issues](https://www.gmass.co) · Google Ads API forum (May 2024) · Google Developer Discuss.

## 3. The three doors to "customer just logs in"

### Door A — Test users (free, manual, fine for your first pilots)
Keep the app as-is; add each early customer's Gmail once (2 min, 100 cap). Not per-login — one line per customer, forever. Good for **5–20 pilots you onboard yourself**. Limitation: tokens of restricted scopes may need re-consent weekly while in Testing (watch the pilot!).

### Door B — Ride a verified app (zero-touch TODAY, ~$6/account)
**Zernio's API already does exactly the UX you described:** `GET /v1/connect/youtube` returns a hosted login link under **Zernio's fully verified Google app** — your customer clicks, logs in with ANY Gmail, done. No test users, no CASA, no Google paperwork for you. Your dashboard stays yours; the consent screen shows Zernio's name.
Cost: first 2 accounts free, then ~$6/account/month. We already have a working Zernio client in the repo (`zernio-tiktok-publisher.mjs`) — wiring the YouTube connect + posting is small work.
Trade-offs: per-account fee, dependency, their app name on the Google screen.

### Door C — Your own verified app (the sellable endgame, ~$540–700/yr + paperwork)
1. Publish app to "In production" (free, instant).
2. **Google OAuth verification** — free: privacy policy + homepage + demo video + review (~3–5 business days official, often 2–6 weeks; 7+ weeks reports exist for restricted scopes).
3. **CASA Tier 2 security assessment** — required for youtube.upload (restricted scope): **~$540–700/yr** via TAC Security (cheapest authorized lab), $1,200+ elsewhere; annual re-validation. (Self-scan option was retired in 2024.)
4. **YouTube API audit + quota request** — free form in Cloud Console (needed at commercial scale; review 4–8 weeks).
After this: customer clicks "Connect YouTube" → sees **YOUR app name** → Allow → done. Zero manual steps, unlimited customers (up to quota), no per-account fees. This is the ladder every competitor climbed.

Also possible while verification is pending: **request a test-user cap increase** from Google Developer support (documented path, case-by-case).

## 4. Recommendation (ladder, spend follows revenue)

| Stage | Door | Why |
|---|---|---|
| First 2–5 pilots (you onboard) | A — test users | Free; 2 min per customer; you're talking to them anyway |
| Strangers want self-serve before CASA is done | B — Zernio connect link inside your wizard | Zero-touch customer login TODAY; ~$6/acct (your margin at $49–99/mo stays >85%) |
| ≥10 paying customers or self-serve launch | C — own verified app | One-time-ish ~$540–700 + paperwork removes fees + dependency; your brand; the true product |

Start Door C's paperwork EARLY (it's waiting-time): the verification + audit run in parallel with pilots, and CASA is paid only when you commit.

## 5. Immediate answers for your two points
- **Step 1 (redirect URI): done by you ✓** — the login link works now.
- **Step 2 (test users):** still needed ONLY for Door A pilots (one line per Gmail, once). If you don't want to do it even for pilots, the alternative is Door B (Zernio link) — customer needs nothing from you. For selling at scale, Door C is mandatory and budgeted above.

## 6. Sources
- [Google — Unverified apps page](https://support.google.com/cloud/answer/7454865) (warning screen, 100-user cap, Access blocked behavior)
- [Google — OAuth API verification](https://support.google.com/cloud/answer/9110914) · [App Defense Alliance — CASA Tier 2](https://appdefensealliance.dev/casa/tier-2/tier2-overview) (self-scan deprecated)
- [Unipile — Google OAuth refresh token 7-day/100-user rules](https://www.unipile.com) · [PostProxy — YouTube upload API limits](https://postproxy.dev) · [GMass — verification pitfalls](https://www.gmass.co) · Google Ads API forum May-2024 thread (unverified production 7-day expiries) · Google Developer Discuss (cap-increase requests; 7+ week reviews)
- Zernio connect API + pricing: docs.zernio.com + zernio.com (verified 10-04)
- Prior docs in repo: `product-saas-blueprint-2026-10-04.md` (full ladder) · `scalable-channel-factory-2026-10-05.md`
