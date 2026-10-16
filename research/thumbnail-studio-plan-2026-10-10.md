# Thumbnail Studio — Current State + Feature Plan (for owner review)

Date: 2026-10-10. Sources: full repo audit + market research (research/thumbnail-studio-market-2026-10-10.md, cited). NO CODE WRITTEN — plan only, awaiting owner's feature picks.

---

## 1. WHAT EXISTS TODAY (all free to run, all proven)

### Renderers (4 + a design lab)
| Renderer | Tech | Used for | Customizable inputs |
|---|---|---|---|
| **Photo-poster factory** (thumbnails/poster-factory.mjs) | headless Chrome screenshot 1280×720 | every long-form upload + 34 backfilled | title, channel skin, photo (pool/path), chip, out — but hardcodes layout/fonts/shadow |
| **renderYouTubeThumbnail()** (youtube-engine.mjs:325) | pure sharp + SVG, base64 fonts (no Chrome!) — Vercel-safe | Shorts, deep-dives, weekly | headline, accent, eyebrow, any photo/frame |
| **Doc style** (thumbnails/gen-doc-thumbnail.py --spec) | Pillow 1280×720 | long-form fallback | full spec: photo, mask(oval/block/key), kicker, serif, big word, subtitle, monogram, accent |
| **Remotion Thumb Lab** (explainer/remotion/thumb-lab.tsx) | Remotion stills | design lab | **12 designed variants** (ic/mr/dfd/qq × A/B/C) + OverlayThumb (AI bg + no text) + TSThumb |

### Supporting machinery
- Photo pipeline: `longvideo/poster-photo.mjs` — Wikipedia lead photo → Pexels search → pool, with **no-repeat ledger** (state/poster-photos-used.json).
- Auto-attach at upload everywhere via `yt.thumbnails.set` (50 quota units vs 1600 upload — cheap).
- Per-channel skins: poster-factory CHANNELS map (ic gold/navy, mr red/maroon, dfd green, qq yellow/black) — **NOTE: diverges from lib/brands.json accents for mr/dfd** (poster-factory is the visual truth; needs reconciliation).
- Fonts fully embedded (Anton, Inter, Oswald, Playfair, Cinzel, Archivo…) → renders anywhere.
- AI backgrounds PROVEN free: Agnes gateway (apihub.agnes-ai.com), 2K 16:9, ~15s, free 10 RPM; known weakness = in-image text clipping → solved pattern exists (`OverlayThumb`: AI bg with NO text + crisp SVG/DOM text overlay).
- Owner taste encoded in code comments: NO thick text borders (soft shadow), NO B&W cutouts, NO data lines/boxes, cinematic not flat.

### Weak spots
- **Zero control after upload** — no regenerate, no UI, no A/B test (YouTube native Test & Compare unused; we upload ONE thumbnail per video).
- Shorts thumbnails = plain frame + text (weakest path).
- Brand accents diverge between poster-factory and lib/brands.json.
- No CTR feedback loop (we already pull Analytics — CTR metric is available).

---

## 2. MARKET FACTS (see market doc for all sources)
- **Test & Compare**: YouTube tests up to 3 thumbnails, winner = watch-time share, NO API — third parties can only do sequential swap-testing (TubeBuddy-style). testers charge $16–80/mo (ThumbnailTest 24–44, TestMyThumbnails 16–80, TubeBuddy Legend ~23–28).
- **Programmatic template APIs** (Bannerbear $49/1k, Placid $19/500, HCTI $14/1k) validate in-house rendering as a paid category — ours is already built and free.
- **AI thumbnail leader Pikzels $28–80/mo** — face-focused, wrong fit for faceless; complaints: quality inconsistency, credit burn.
- **CTR rules**: strong emotion, ≤3–4 words text, ≤3 visual elements, ~63% watch time is mobile → big type, single focal subject; faceless leaders use dramatic statues/cityscapes + brand-consistent palettes.
- **AI bg costs elsewhere**: fal FLUX ~$0.025/img, gpt-image-1 $0.01–0.25, Imagen 4 ~$0.025–0.24 → ours = $0 via Agnes/Pollinations = zero-COGS differentiator.
- **Competitors** (AutoShorts, faceless.video, OpusClip, Pictory) auto-generate thumbnails but **none ship a client-facing template studio + testing** → real differentiator. Pricing anchor: designers charge $5–150/thumb; supports $20–50/mo tier or $5–15/video upsell.

---

## 3. FEATURE MENU (scored: effort S/M/L × value 1–5) — OWNER PICKS

### Core studio
- [x] **F1. Template gallery** ✅ SHIPPED 10-11 (M, 5): all existing styles as pickable templates — photo-poster, frame+text (Shorts), doc paper style, Thumb Lab variants as "premium" collection.
- [x] **F2. Live editor** ✅ SHIPPED 10-11 (L, 5): title text (≤4-word guidance), accent word, category chip, accent color, photo source (search Pexels/Wikipedia keyword, upload own, pool pick) → live preview. Render: sharp+SVG in-Vercel for instant styles; Chrome/doc styles via an Actions render job (pattern proven).
- [x] **F3. One-click attach** ✅ SHIPPED 10-11 (S→M, 5): pick any of the channel's videos → set thumbnail via thumbnails.set. YT_TOKEN_* secrets ALREADY on Vercel (ytTokenRaw) → can attach directly server-side; quota cheap, gate per day.
- [ ] **F4. "Give me 3 more" regenerate** (M, 4) — NOT BUILT yet: production already saves render inputs in meta → rerun with different photo/accent/layout for options; stored as variants.

### Growth loop
- [x] **F5. A/B swap-testing** ✅ SHIPPED 10-10 (M–L, 5): pick 2–3 variants on one video → auto-swap on schedule → track CTR per period via Analytics API → winner board + auto-keep. (Our own sequential testing — exactly what paid testers charge for; native Test & Compare has no API.)
- [x] **F6. AI backgrounds** ✅ SHIPPED 10-10 (M, 4): "AI background" button — Agnes (free, 10 RPM) primary, Pollinations fallback; NO-text art + text overlay (OverlayThumb pattern). Zero COGS.
- [x] **F7. CTR insights** ✅ SHIPPED 10-10 (views/day until YPP) (M, 4): per-thumbnail CTR from Analytics we already collect; "best template" board; feed into auto-generation choices.

### Client & scale
- [x] **F8. Client access** ✅ SHIPPED 10-10 (S, 4): clients see/edit only their channel's thumbnails (binding exists from BYOK stage 3). DFY + SaaS sell.
- [x] **F9. Brand kit editor** ✅ SHIPPED 10-11 (M, 3): per-channel accent/chip/font pickers + reconcile the poster-factory vs brands.json accent divergence.
- [x] **F10. Bulk redesign / backfill** ✅ SHIPPED 10-11 (per-batch, cap-aware) (M, 3): regenerate thumbs for old videos in bulk (the 34-video backfill flow, productized).
- [x] **F11. Mobile-legibility checklist** ✅ SHIPPED 10-11 (S, 3): auto-preview at 120px + rules (≤4 words, contrast, 1 subject) before attach.
- [x] **F12. Face/persona AI** — SKIPPED by decision (L, 2 — Pikzels-style faces): SKIP unless a faceless client asks; wrong fit for the niche.

---

## 4. RECOMMENDED BUILD ORDER
- **Stage A (core)**: F1 + F2 + F3 + F11 — gallery, editor, attach, checklist. The studio exists end-to-end.
- **Stage B (growth)**: F6 + F5 + F7 — AI backgrounds, swap A/B, CTR board. The differentiator + the thing testers charge $16–80/mo for.
- **Stage C (clients)**: F8 (+F9/F10 as needed) — client-facing, monetizable via Paddle/LS at $20–50/mo or $5–15/video.

## 5. OPEN DECISIONS FOR OWNER
1. Which features (whole Stage A? additions?).
2. Editor preview style: instant sharp/SVG styles only in v1, or also Chrome styles via Actions render (slower, ~1 min)?
3. A/B: auto-swap schedule preference (daily? 48h?) and metric (CTR vs watch-share proxy).
4. AI backgrounds: Agnes-first OK (free, rate-limited 10 RPM)?
5. Attach quota guard: cap thumbnails.set per channel/day (suggest 10).
