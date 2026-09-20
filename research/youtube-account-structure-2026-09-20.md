# Research: 4 channels on one email — risks, limits, scaling to 10

2026-09-20. Grounded in official Google/YouTube policy pages + 2025-26 policy changes + this network's own incidents.

---

## 1. The rules (official)

| Rule | Number |
|---|---|
| Channels per Google account (via Brand Accounts) | up to **100** — 4 or 10 is allowed |
| Channels per phone number (verification) | **2 per year** ⚠️ the real scaling bottleneck |
| AdSense accounts per person | **1** (multiple = suspension) |
| Channels per AdSense | unlimited (officially supported) |
| YPP threshold | per channel (1,000 subs + watch-hours/Shorts views) |

## 2. Same email (current setup) — side effects

**Fine:**
- 4 niches, distinct branding, original daily content = a textbook legitimate multi-channel setup. Many networks run this way.
- Ops simplicity: one login, one 2FA, all channels switchable in one Studio session, our pipeline already runs all 4 from one OAuth account.

**Risks (ranked):**
1. **Shared blast radius.** If ANY channel gets TERMINATED (not just a strike), YouTube's circumvention policy bars the PERSON from owning channels and commonly terminates the linked channels under the same Google account. One email = one blast radius.
2. **Correlation fingerprint.** 10 channels on one email + one IP + one pipeline template + same upload cadence = a high-correlation spam fingerprint. If one channel gets spam-flagged, reviewers see the siblings.
3. **Security single point.** The Google email is the kingdom's key — compromise = everything gone. 2FA + backup codes are mandatory.
4. **Ops hazards we already lived:** the OAuth token cascade (Sep 13-19: re-authing channels revoked QQ's token) gets worse linearly with channel count on one account+API client; one API project = one shared upload quota (~100/day — fine at 16 uploads/day, tight at 10 channels × 3).

## 3. Different emails per channel — what actually changes

**What it helps:**
- Isolation of TERMINATION risk per identity (a spam termination on one Google account doesn't automatically nuke the others).
- Separate Studio sessions/logins.

**What it does NOT help (common misconception):**
- **Monetization risk is NOT isolated** — AdSense is one-per-PERSON. All monetized channels must link the same AdSense; creating multiple AdSense accounts violates policy and risks suspension. Google links identities via phone verification, payment identity, and behavior — separate emails don't hide ownership.
- **Circumvention detection links them anyway** — if YouTube terminates channel A for spam and the "new" identity verifies with the same phone number or shows the same content patterns, the new channel gets terminated as circumvention.
- Costs: N passwords, N 2FAs, N recoveries, N token sets.

## 4. The July 2025 policy that matters most for this network

"Repetitious content" was renamed **"Inauthentic Content"** — targeting mass-produced, low-originality, template AI content for DEMONETIZATION. Our model (original scripts + TTS + licensed/stock visuals, 4 distinct niches) is defensible, but a 10-channel copy-paste expansion is exactly the pattern that policy hunts. **The quality bar per channel — not the email layout — is the real safety line.**

## 5. Recommendations

1. **Stay on one email for the current 4.** It's the simplest, sanctioned setup. Fix the real exposures instead: 2FA + backup codes on the Google account; distinct voices/thumbnails/pacing per channel (mostly done via brand kits); never reuse the same footage/script across channels.
2. **When scaling past ~6 channels:** split into 2-3 Google accounts (3-4 channels each, grouped by niche family), each with its own API project (quota) — this contains the termination blast radius without multiplying AdSense.
3. **Verification planning:** only 2 channels verifiable per phone number per year — verify strategically (docs >10 min need >15-min upload allowance? 10-min docs fit the unverified 15-min cap, but verified status unlocks longer + features). Use different phone numbers across years if scaling fast.
4. **Never:** clone content across channels, re-upload network content to new channels, or create multiple AdSense accounts. These are the actual termination triggers — not the email count.
5. **Monetization:** link every channel to the ONE AdSense when they qualify; treat the July 2025 inauthentic-content line as the network's constitution (original scripts ✓, human-review of AI output ✓, niche-distinct formats ✓).

## 6. Incident note (ours)

The Sep 13-19 OAuth token cascade (re-authing 3 channels revoked QQ's token) is a same-account+same-API-client behavior. With 6+ channels on one client, schedule re-auths one channel at a time and re-test the others after each.

Sources: [Google Support — manage channels / Brand Accounts](https://support.google.com/youtube/answer/4642409), [YouTube verification limits](https://support.google.com/youtube/answer/171664), [AdSense for YouTube setup](https://support.google.com/youtube/answer/9914702), [YouTube Spam Policy](https://support.google.com/youtube/answer/2801973), [Channel termination & circumvention](https://support.google.com/youtube/answer/2802168), [Monetization policies / inauthentic content update](https://support.google.com/youtube/answer/1311392), [Second Chances pilot](https://blog.youtube/inside-youtube/second-chances-on-youtube)
