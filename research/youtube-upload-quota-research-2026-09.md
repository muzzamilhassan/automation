# YouTube Upload Limits — Full Research (2026-09-05)

Question: how to get past YouTube's upload limits for 15 automated channels —
official paths, alternatives, and open-source help.

## TL;DR — the limit mostly disappeared on Dec 4, 2025

Google restructured YouTube API quota. Per the official docs
(developers.google.com/youtube/v3/determine_quota_cost, updated Sep 2026),
every project now gets THREE separate daily buckets, resetting midnight PT:

| Bucket | Free daily allowance | Notes |
|---|---|---|
| **videos.insert (uploads)** | **~100 uploads/day** (own bucket) | was 1,600 units each → only ~6/day before Dec 4, 2025 |
| **search.list** | **100 searches/day** (own bucket) | search is now the quota hog (100 units/call) |
| Everything else (lists, updates, comments, playlists) | 10,000 units/day shared | read=1, writes=50, captions 400-450 |

**For our 15-channel plan:** 15 channels × 3 Shorts/day = 45 uploads/day =
45% of the upload bucket. QuoteQuarry (3/day + weekly compilation) and all
branding/comment management fit alongside. **No workaround is needed anymore.**
The "only ~6 uploads/day" math in older notes (and my earlier messages) was
pre-December rules.

## Option A — Official quota increase (free, the sanctioned path)

- Form: YouTube API Services Audit & Quota Extension Form
  (support.google.com/youtube/contact/yt_api_form).
- Audit first, quota second: Google reviews your API client for compliance
  with YouTube API ToS, then grants more. Reviews take weeks–months and are
  discretionary; you cannot pay for quota.
- Realistic outcomes reported: 100k units/day general pool for legitimate
  multi-channel publishing use cases.
- **When we'd need it:** only past ~100 uploads/day/project (≈ 20 channels ×
  3/day). Not yet.

## Option B — Multiple GCP projects (legit scaling, but each needs audit)

- Quota is **per Google Cloud project**, not per channel — one project serves
  all 15 channels' tokens (what we do now).
- ⚠️ **Official rule:** videos uploaded via `videos.insert` from *unverified*
  API projects created after **July 28, 2020 are locked to PRIVATE** until the
  project passes the audit (developers.google.com/youtube/v3/docs/videos).
- So new projects = one audit form each before public uploads work. Worth it
  only at ~100+ uploads/day scale. Do NOT create extra projects to "dodge"
  quota — you just inherit the private-lock.

## Option C — Open-source browser automation (no API, no API quota)

Uploads through YouTube Studio's web UI with Selenium/Playwright. Works, but
the December quota change removed the main reason to use it. Landscape:

| Project | Status | Notes |
|---|---|---|
| wanghaisheng/easy-uploader (PyPI: `upgenius`, also `ytb-up`) | Aging — changelog ~Dec 2023, 346 commits | Playwright/Selenium "act like a human"; multi-account + per-channel cookies (Firefox profiles), scheduled publishing. Explicitly does NOT bypass the ~100 uploads/day UI spam cap |
| fawazahmed0/youtube-uploader | No longer maintained | Was the most popular Playwright uploader |
| github.com/topics/youtube-uploader | Mixed | Mostly small/abandoned Selenium scripts |

Hard facts about the UI route (even without the API):
- Verified channels: ~100 uploads/24h cap (agency reports: ~100 first day,
  then ~50/24h); new/unverified channels much lower until trust builds.
  **Phone-verify each new channel early** — raises both UI limits and trust.
- Risks: Studio DOM changes break scripts; session cookies expire; mass
  robotic uploads = spam-detection strikes on YOUR channels; automating the
  web UI is ToS-gray (your own content, but still).
- Verdict: keep as emergency fallback only; prefer the API at 100 uploads/day
  free.

## Option D — Third-party platforms with their OWN audited quota

They upload via their audited API projects — your quota problem becomes their
plan limit:

| Platform | Price | YouTube fit |
|---|---|---|
| Upload-Post | Free 10 uploads/mo; whitelabel ~$50/mo | Cheapest paid, simple API |
| Blotato | $29/mo Starter: 20 accounts, 1,250 credits | Cheapest multi-account; BYO-keys beta |
| Ayrshare | $149/mo (1 profile) → $299 (10) → $599+ | Built for products/agencies; overkill here |
| Postiz (self-hosted — already in our Docker stack) | free | ⚠️ self-hosted uses YOUR OWN Google OAuth app = same Google quota → no gain |

Verdict: unnecessary since Dec 2025 unless we later want their other features
(unified analytics, cross-platform scheduling UI).

## Option E — Manual/semi-auto Studio (zero API anything)

- Drag-drop bulk upload with CSV metadata in Studio; verified channel caps
  ~100/day. 256 GB / 12 h per file.
- Useful as a human fallback (e.g., CI renders videos, user drags a folder +
  CSV weekly). Fully automatable pipeline is still better for us.

## Non-quota limits that actually matter for 15 channels

1. **Per-channel trust limits**: new/dummy channels have low daily upload
   caps and tighter spam filtering → ramp slowly (our 3-4 channels/week
   rollout), phone-verify every channel.
2. **Inauthentic-content policy (July 2025)**: mass-produced repetitive AI
   content risks monetization rejection — the real gate at 15-channel scale.
   Our defense is built in: distinct niches, distinct voices, distinct
   palettes, per-channel theme banks, human-review hooks.
3. **Monetization per channel**: each channel needs its own 1k subs +
   10M Shorts views/90d — staggered activation concentrates watch time.

## Recommended plan

1. Proceed on the standard API — the Dec 2025 buckets fit the full 15-channel
   plan (~45 uploads/day) with 2× headroom.
2. Phone-verify every new channel right after branding.
3. Keep the 3-4 channels/week activation ramp (policy + trust reasons now,
   not quota).
4. File the audit/quota form ONLY if we ever approach ~100 uploads/day
   (≈ 25+ channels at 3/day) — apply ~1 month before needed.
5. Don't bother with browser-automation uploaders or paid SaaS for quota
   reasons; revisit only if Google reverses the bucket change.

## Sources

- Official quota buckets: https://developers.google.com/youtube/v3/determine_quota_cost
- Official audit/quota form: https://support.google.com/youtube/contact/yt_api_form
- Audit process: https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits
- Private-lock rule: https://developers.google.com/youtube/v3/docs/videos
- Quota change reporting: https://www.getphyllo.com/post/is-the-youtube-api-free-in-2026-quota-limits-costs-when-to-pay , https://www.blotato.com/blog/youtube-api-pricing
- Studio limits at scale: https://www.thepolarbears.co.uk/insights/youtube-studio-limits-at-scale-what-breaks-at-5-50-500-channels
- UI uploader ecosystem: https://github.com/wanghaisheng/easy-uploader , https://github.com/fawazahmed0/youtube-uploader , https://github.com/topics/youtube-uploader
- SaaS comparison: https://www.blotato.com/blog/blotato-vs-ayrshare , https://www.upload-post.com/pricing-comparison , https://www.ayrshare.com/pricing/
