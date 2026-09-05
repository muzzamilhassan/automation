# 15-Channel YouTube Branding — Onboarding Runbook

15 high-CPM channel brand kits live in `yt-brands/brands.mjs` (same shape as
`YT_BRANDS` in youtube-engine.mjs, so the content engine can adopt them 1:1).
Banners: `yt-brands/banners/<slug>.jpg` • Avatars: `yt-brands/avatars/<slug>.jpg`
(regenerate anytime: `node yt-brands/gen-banners.mjs`)

## The 15 channels

| # | Slug | Channel name | Niche (CPM tier) | Voice | Daily slot (UTC / ET) |
|---|------|--------------|------------------|-------|----------------------|
| 1 | investors-compass | Investor's Compass | Investing psychology ($30-50) | en-US-Christopher | 12:05 / 8:05a |
| 2 | money-rulebook | The Money Rulebook | Personal finance ($25-45) | en-US-Guy | 12:35 / 8:35a |
| 3 | old-money-code | Old Money Code | Old money / quiet wealth ($15-30) | en-GB-Thomas | 13:05 / 9:05a |
| 4 | ai-observer | The AI Observer | AI & future tech ($8-20, fastest growth) | en-US-Aria | 21:05 / 5:05p |
| 5 | founders-margin | Founders Margin | Entrepreneurship ($15-35 B2B) | en-US-Brian | 21:35 / 5:35p |
| 6 | debt-free-doctrine | Debt-Free Doctrine | Debt & credit ($20-40) | en-US-Eric | 22:05 / 6:05p |
| 7 | closing-table | The Closing Table | Sales & negotiation ($20-40 B2B) | en-US-Steffan | 22:35 / 6:35p |
| 8 | escrow-estate | Escrow & Estate | Real estate ($20-35) | en-GB-Ryan | 23:05 / 7:05p |
| 9 | corner-office | Corner Office Mind | Leadership ($18-35 B2B) | en-US-Andrew | 23:35 / 7:35p |
| 10 | tax-shield | Tax Shield | Tax education ($15-35) | en-GB-Sonia | 00:05 / 8:05p |
| 11 | deep-work-os | Deep Work OS | Focus & productivity ($10-20) | en-US-Michelle | 00:35 / 8:35p |
| 12 | longevity-code | The Longevity Code | Healthspan habits ($10-18) | en-US-Jenny | 01:05 / 9:05p |
| 13 | sleep-architect | The Sleep Architect | Sleep science ($10-18) | en-AU-Natasha | 01:35 / 9:35p |
| 14 | iron-discipline | Iron Discipline | Gym motivation ($8-15, big reach) | en-AU-William | 02:05 / 10:05p |
| 15 | policy-brief | The Policy Brief | Insurance explained (~$38 sleeper) | en-US-Roger | 02:35 / 10:35p |

All: US channel country, English, distinct palette + voice + theme bank per
channel (12 proven listicle themes each — this is what keeps 15 automated
channels distinct under YouTube's inauthentic-content policy).

## Step 1 — Authorize each channel (one consent click per channel, ~15 min total)

**One command does everything** (consents → branding → MCP entries → CI
secrets → smoke tests):

```
node onboard-all.mjs
```

or double-click **onboard-all.bat**. For each brand, the browser opens the
Google consent page — **pick the dummy channel you want for that brand**, click
Allow, press Enter for the next. Re-run anytime; authorized channels are
skipped. Picked the wrong channel? `node add-yt-channel.mjs <slug>` fixes it,
then `node brand-channels.mjs --apply --only <slug>`.

(Manual equivalent of step 1 only:)
```
for s in investors-compass money-rulebook old-money-code ai-observer founders-margin debt-free-doctrine closing-table escrow-estate corner-office tax-shield deep-work-os longevity-code sleep-architect iron-discipline policy-brief; do node add-yt-channel.mjs $s; done
```

## Step 2 — Push branding to all channels automatically

```
node brand-channels.mjs            # dry run
node brand-channels.mjs --apply    # sets description + keywords + country=US + banner
```

## Step 3 — One-time manual bits in YouTube Studio (API cannot do these)

Per channel (~2 min each): Settings → rename channel to the name above → set
the @handle → upload avatar from `yt-brands/avatars/<slug>.jpg`.

## Step 4 — Wire into cloud + MCP

```
node set-yt-secrets.mjs            # YT_TOKEN_<SLUG> secrets for GitHub Actions
node yt-mcp/smoke-test.mjs yt-mcp/channels/<slug>/token.json   # verify each
```

Restart ZCode → every channel appears as `yt-<slug>` MCP server (74 tools each).

## Quota plan (updated 2026-09-05 — GOOD NEWS)

- **Google restructured quota on Dec 4, 2025:** uploads now have their OWN
  free bucket of **~100 uploads/day per project** (search 100/day own bucket;
  10,000 units/day general pool for everything else). Resets midnight PT.
  Full research: research/youtube-upload-quota-research-2026-09.md
- Our plan: 15 channels × 1-3 Shorts/day = 15-45 uploads/day → fits with 2×+
  headroom. QuoteQuarry + branding + comment tools fit in the general pool.
- Keep the 3-4 channels/week activation ramp anyway — it protects against
  per-channel trust/spam limits and the inauthentic-content policy, which are
  the real gates now, not API quota.
- Phone-verify each new channel right after branding (raises per-channel
  daily upload caps + trust).
- File the free audit/quota-increase form
  (support.google.com/youtube/contact/yt_api_form) only if ever approaching
  ~100 uploads/day (≈ 25+ channels at 3/day).
- Do NOT create extra GCP projects — post-Jul-2020 projects have uploads
  locked to PRIVATE until audited.

## Phase 2 (ask when ready)

Wire youtube-engine.mjs to loop over `yt-brands/brands.mjs` per channel
(1 Short/channel/day, staggered slots, per-channel voice + accent + eyebrow
already in the kits) and extend content-machine.yml to consume the
YT_TOKEN_* secrets. Branding, MCP, and secrets above are the prerequisites.
