# TikTok Upload Research — Open Source & Free Options (09-28)

GOAL: link TikTok channel(s) + upload videos automatically, free if possible.
Status: RESEARCH ONLY — nothing built/changed yet.

---

## 0. What we ALREADY have (no new setup needed)

- **Zernio API** — integrated and tested (`zernio-tiktok-publisher.mjs`,
  ZERNIO_API_KEY + ZERNIO_TIKTOK_ACCOUNT_ID in .env). Direct posts throttled;
  **drafts always work**; +3h reschedule supported. = working path #1 today.
- **Quarry Studio app** (own TikTok developer app) — rejected earlier as
  "autoposts"; repositioned with website/privacy pages; needs a re-submission
  with the audit-ready build (tiktok-audit-kit.md in repo).
- **Official Content Posting API rules (2026):** unaudited apps can only post
  PRIVATE/DRAFT videos (~15/day cap, max 5 users per 24h). PUBLIC direct post
  requires passing TikTok's audit. Sources: SkedCast, postpeg.com, mallary.ai.

## 1. Official TikTok API (free — needs app audit for public posts)

- Unaudited: private/draft only, ~15 posts/day, 5 users/24h window.
- Audited: public direct post, scheduler has NO reach penalty (confirmed by
  zoomsphere Sep 2026).
- Our blocker: earlier rejection. Repositioning done; re-submit is the path.
- **Free forever once approved. Best long-term route.**

## 2. Open-source cookie-based uploaders (free, NO approval, fragile)

- **wkaisertexas/tiktok-uploader** (~753★, PyPI `pip install tiktok-uploader`):
  Selenium + your browser cookies (`auth`, `tt-target-idc`). No API at all.
- **haziqmk/tiktokautouploader** (Playwright version).
- Reality check: breaks often (DOM changes, CAPTCHAs), and TikTok aggressively
  blocks DATACENTER IPs — so it works best from a RESIDENTIAL IP = your own PC,
  not GitHub Actions. Also ToS-gray: small ban risk on the account used.
- Fit for us: run LOCALLY once a day (scheduler on the PC) or don't use on the
  main account (use a separate test TikTok account first).

## 3. Open-source scheduler: Postiz (self-hosted, free software)

- gitroomhq/postiz-app — full scheduler (25+ platforms incl. TikTok), self-host
  free (Docker). BUT TikTok in Postiz still uses the official API with YOUR OWN
  developer app = same audit requirement as Option 1. Postiz does NOT bypass
  TikTok's audit; it's just a nice free UI around it.
- Verdict: only worth it AFTER the app is approved (then it's a great dashboard).

## 4. Paid intermediaries (no app approval needed on your side)

| Service | TikTok | Price |
|---|---|---|
| Upload-Post | ✓ | free tier EXCLUDES TikTok; paid from ~$16-24/mo |
| Blotato | ✓ (API) | $29/mo starter (7-day trial, API excluded from trial) |
| Post Bridge | ✓ | ~$29/mo, no real free plan |

They host the approved TikTok app and post on your behalf. Zero setup, but a
recurring cost the user wanted to avoid.

## 5. RECOMMENDATION (staged, free-first)

- **Step 1 (today, $0):** verify Zernio still works — one test draft upload to
  @munnabhai3483. If yes: TikTok is live again via the existing integration
  (drafts mode; manual 1-tap to publish, or +3h scheduled direct where allowed).
- **Step 2 (this week, $0):** re-submit Quarry Studio app (audit kit already in
  repo: tiktok-audit-kit.md). Unaudited = private posts + ~15/day is ALREADY
  usable (private videos can be manually made public in 1 tap; or wait for audit).
- **Step 3 (after audit passes, $0 forever):** official direct post, automated
  end-to-end in the existing cloud pipeline (same pattern as YouTube uploads).
- **Optional test lane:** cookie-uploader on a THROWAWAY TikTok account, run
  locally daily — never on the main account, never on GitHub Actions.
- Avoid: paying $16-29/mo while free paths are available.

## Sources
- Unaudited limits & private-post behavior: postpeg.com, skedcast.com, mallary.ai
- Official API: developers.tiktok.com (Content Posting API)
- Postiz: docs.postiz.com, github.com/gitroomhq/postiz-app
- Cookie uploaders: github.com/wkaisertexas/tiktok-uploader, haziqmk tiktokautouploader
- Paid APIs: upload-post.com, blotato.com, postbridge.io
