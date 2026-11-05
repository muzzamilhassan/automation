# Brand logo sourcing — research + decision (2026-11-05)

Feature: entity pops fire the brand's LOGO at the spoken word. Requirement:
free, no key, CI-friendly (GitHub runners), premium quality (crisp at ~200px
on a white plate), fail-soft.

## Options tested / surveyed (live tests from this machine)

| Option | Quality | Free? | Key? | Verdict |
|---|---|---|---|---|
| **Simple Icons CDN** (`cdn.simpleicons.org/<slug>/<color>`) | **SVG — infinitely crisp, colorable (white for our plate)** | ✅ open-source (github simple-icons, ~3,500 brands) | none | **WINNER — primary**. Live: wordpress/goldmansachs/coinbase/paypal all HTTP 200 SVG. Defunct brands 404 (expected). |
| Google s2 favicons (`/s2/favicons?domain=X&sz=256`) | raster ~64–256px | ✅ free | none | **Fallback 2** — covers brands Simple Icons lacks |
| logo.clearbit.com | was the standard | — | — | **DEAD** — sunset post-HubSpot; HTTP 000/unreachable live |
| logo.dev | high-res | free tier w/ attribution + signup | key | Premium upgrade option; skip for v1 (signup friction) |
| Brandfetch | full brand kits (logo+colors+fonts) | paid tiers | key | Overkill for a chip; revisit at scale |
| unavatar.io / icon.horse | social-avatar proxies | ✅ | none | Smaller/less reliable than s2; skip |
| Wikimedia Commons API | very high-res for notable entities | ✅ | none | Coverage/API effort high; skip for v1 |

Note: brand logos remain trademarks of their owners (Simple Icons' own
stance) — usage in commentary videos is standard fair-use practice; no
attribution required by the CDN.

## Decision — a 3-tier chain, all fail-soft

1. **Simple Icons SVG** (white) for brands in the catalog — the premium look
2. **Google s2 favicon (256px)** for brands outside it
3. **Name-text chip** (today's chip) when both miss

Slug derivation: `domain.split('.')[0]` (wordpress.com→wordpress,
goldmansachs.com→goldmansachs) — verified against the live CDN for our
starter set; wrong-slug cases just 404 into the fallback.

## Later upgrades (queued, not built)

- LLM entity→domain extraction (beyond the curated map)
- logo.dev/Brandfetch premium tier if we outgrow the free chain
