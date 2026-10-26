# Stock assets & thumbnail system — platform research 2026-10-24

Read-only research round for the v2 multi-tenant SaaS design (§10.2 rights-aware stock-asset layer, §10.8 deterministic thumbnail rendering). Builds on `free-video-clips-research-2026-09.md` (b-roll sources), `youtube-thumbnail-templates-research-2026-10-18.md` (template system + YouTube specs), `thumbnail-templates-2026-research.md` (style catalog), `thumbnail-studio-market-2026-10-10.md` (tool landscape). This doc answers the NEW question: **which stock sources are license-safe for a monetized multi-tenant platform, and which rendering stack can produce deterministic, rights-auditable thumbnails — including Urdu RTL — on our stack.** Every license fact below was re-verified from the provider's own license/API page on 2026-10-24; quotes are verbatim. External claims cite primary sources (section: Sources).

---

## 0. TL;DR verdicts

| Question | Verdict | One line |
|---|---|---|
| Free stock layer for a monetized SaaS | **YES — Pexels + Pixabay + Unsplash + NASA + Wikimedia + Coverr** | All six grant free commercial use in monetized videos; each forbids re-serving their RAW assets as a stock/wallpaper service — composites are the safe unit. |
| Multi-tenant raw-asset caching/re-serving | **NO — re-serve composites only** | Pixabay bans "Standalone" distribution; Unsplash requires hotlinking + bans replicating a competing service; Coverr bans offering videos "as part of services"; Pexels bans redistribution on stock/wallpaper platforms. |
| Deterministic renderer for the template system | **KEEP sharp+SVG (v2 plan); add one browser lane for Urdu/Nastaliq** | satori is disqualified for RTL (opentype.js, no complex shaping); Pillow needs libraqm; browsers shape RTL natively. |
| satori / @vercel/og as the thumbnail engine | **NO** | Text renders as opentype.js glyph paths — Arabic/Urdu letters come out disconnected/reversed (vercel/satori#228, #406, #409); fine for Latin OG cards, not for multi-language thumbnails. |
| Default rembg model for background removal | **NO — switch model** | rembg (MIT) now defaults to `bria-rmbg`, and its README warns that RMBG "requires a paid agreement for commercial use." Use BiRefNet (MIT) or MODNet (Apache-2.0) weights instead. |
| Where the rights registry lives | **Neon Postgres (metadata) + object storage (cached composites)** | Same infra as the RAG plan (pgvector on every Neon plan); raw assets never re-served, so only composites + provenance rows need durability. |
| Biggest existential risk found today | **rembg default model + "unverified-safe" asset habits** | One default-model download or one raw-asset re-serve breaks the commercial chain on monetized channels. |

---

## 1. Stock asset sources — licensing & API facts (§10.2)

All facts fetched from provider pages on **2026-10-24** unless noted. "Re-serve raw via our service" = our platform downloads the asset and serves the unmodified file to tenants (distinct from embedding it in a generated thumbnail).

### 1.1 Master table

| Source | API / auth | Rate limits (as fetched) | Commercial use | Attribution | Modification | Re-serve raw to tenants? | Model releases | Key restriction |
|---|---|---|---|---|---|---|---|---|
| **Pexels** | REST, key in `Authorization` header, instant signup | 200 req/hr + 20,000/mo default; "unlimited requests for free" if you show attribution | Yes (ads, "a template you sell") | License: not required. API: "prominent link to Pexels" + photographer credit | Yes | RISKY (see 1.10) | Not provided; "Identifiable people may not appear in a bad light or in a way that is offensive" | No wallpaper apps / core-functionality clones |
| **Pixabay** | REST, `key` query param | 100 req/60s; "requests must be cached for 24 hours"; "Systematic mass downloads are not allowed" | Yes, except content with "recognisable trademarks, logos or brands" | Not required; API asks "show your users where the images and videos are from" | Yes | NO — "cannot sell or distribute Content ... on a Standalone basis" | Not mentioned; "check whether you require the consent of a third party" | No permanent hotlinking; URLs valid 24h; full-res needs full API access approval |
| **Unsplash** | REST, client-id + Bearer; **hotlink required** | Demo 50 req/hr; production 1,000 req/hr; CDN image hits don't count | Yes | Not required by license; API guidelines require attribution | Yes | NO — hotlink mandated + no "compile images from Unsplash to replicate a similar or competing service" | Not addressed in license/API docs | Must trigger `download_location` GET per download; preserve `ixid` |
| **Wikimedia Commons** | MediaWiki action API (`prop=imageinfo`), no key | No published numeric cap for read calls (rate limits apply per WMF policy) | Per file (PD or CC) | CC-BY/CC-BY-SA: "appropriate credit ... link to the license ... indicate if changes were made" | Yes; **CC-BY-SA imposes share-alike on derivatives** | YES for PD files; CC-BY-SA derivative obligations follow the composite | N/A (varies per file; Commons hosts no release database) | Per-file license checking mandatory; some files are NC/ND — filter |
| **Openverse** | REST (api.openverse.org); anonymous vs OAuth tiers | Tiers: `standard` (auth), `enhanced` (granted), `exempt`; numbers not published on docs page | Depends on filtered licenses (NC excluded by filter) | Per-result `attribution` string + `license_url` + creator provided by API | Per underlying license; ND results must be excluded | Same rules as underlying license (aggregates Flickr/Wikimedia/NASA...) | N/A (per source) | **Default results include NC/ND licenses — must filter to `cc0,by,pdm`** |
| **Internet Archive** | advancedsearch/scrape/metadata APIs, no auth for reads (per prior repo research; today's fetch blocked) | Undocumented/UNVERIFIED | Per item (mostly PD film/footage) | Per item rights statement | Per item | YES for PD items (verify per item) | N/A (per item) | Per-item rights verification kills automation-at-scale; treat as curated-source only |
| **NASA** | images-api.nasa.gov; api.data.gov key or DEMO_KEY | DEMO_KEY ~30 req/IP/hr, 50/day (api.data.gov standard limits; read via reader) | Yes — media "generally not protected by copyright" | Not required (public domain); credit appreciated | Yes | YES (PD) | N/A | NASA insignia/logos have separate usage rules (endorsement) |
| **Mixkit** (Envato) | **No API** (verified in prior research; license index page lists "Stock Video — Free License" + "Restricted License") | n/a | Yes (Free License) — full text fetch FAILED today | Not required (Free) | Yes (Free) | Free License historically bans stand-alone redistribution — UNVERIFIED today | Not stated on index | Manual batches only; not automation-grade |
| **Videvo** | Licensing URL now **301-redirects to freepik.com/licensing** (observed 2026-10-24) | under Freepik | under Freepik license | Free tier historically attribution-required — now consolidated | Yes | Under Freepik terms | Under Freepik | Freepik acquired Videvo June 2022 (finsmes) |
| **Coverr** | Content API (/developers) + MCP endpoint | Not published | Yes | Not required | Yes ("download, copy, modify, perform, and use") | **NO — "can't be resold or offered as part of services to which providing videos can help"** | "We do obtain model releases ... we do not provide these releases to users"; "We do not hold releases for any brands, trademarks, or identifiable properties" | **No AI training on content**; terms changeable anytime |
| **Storyblocks** | Paid subscription; API on higher tiers | n/a | Yes | No | Yes | Embedded-in-video OK; raw re-serve not addressed on overview page | Not guaranteed on page; indemnity $20k (Individual/Small Business) / $1M (Business) | **Perpetual use after cancellation: Business tier ONLY**; no free tier |
| **Freepik** | REST API exists (docs/term fetch BLOCKED 403) | UNVERIFIED | Yes (Premium); Free tier requires attribution | Free: attribution mandatory | Yes | Free content "cannot redistribute as-is / standalone" (partial read) | AI-output terms exist; details UNVERIFIED | Content License v3.0 (2025); AI-generated content governed separately |

### 1.2 Pexels — verified quotes

License page (pexels.com/license):
- "All photos and videos on Pexels are free to use." Permitted uses include "a template you sell."
- "Attribution is not required." / "You can modify the photos and videos from Pexels."
- Prohibitions: "Don't sell unaltered copies of a photo or video, e.g. as a poster, print or on a physical product"; "Don't imply endorsement of your product by people or brands on the imagery"; "Don't redistribute or sell the photos and videos on other stock photo or wallpaper platforms"; "Don't use the photos or videos as part of your trade-mark ... or service mark"; "Identifiable people may not appear in a bad light or in a way that is offensive."
- No model-release database is offered; the people clause is the only portrait safeguard.

API page (pexels.com/api/documentation):
- Key: "Anyone with a Pexels account can request an API key, which you will receive instantly." Header: `Authorization`.
- Limits: "the API is rate-limited to 200 requests per hour and 20,000 requests per month"; "you can get unlimited requests for free" if you show attribution (they review a demo).
- Usage: "You may not copy or replicate core functionality of Pexels (including making Pexels content available as a wallpaper app)."
- Required on our surfaces: "make sure to show a **prominent link to Pexels**" and "Always credit our photographers when possible (e.g. 'Photo by John Doe on Pexels' ...)."
- Hotlinking/caching: **not addressed** in the API docs (verified absence — flagged; our registry should therefore self-host copies of composited assets, never raw re-serving).

### 1.3 Pixabay — verified quotes

Content License summary (pixabay.com/service/license-summary/):
- "You cannot sell or distribute Content (either in digital or physical form) on a Standalone basis." Standalone = "no creative effort has been applied" and substantially unaltered.
- "If Content contains any recognisable trademarks, logos or brands, you cannot use that Content for commercial purposes."
- "You cannot use Content in any immoral or illegal way, especially Content which features recognisable people."
- "You cannot use any of the Content as part of a trade-mark, design-mark, trade-name, business name or service mark."
- "It is your responsibility to check whether you require the consent of a third party or a license to use Content." No model-release guarantee.

API docs (pixabay.com/api/docs/):
- "By default, you can make up to 100 requests per 60 seconds." Headers expose `X-RateLimit-*`.
- "**requests must be cached for 24 hours**" and "Systematic mass downloads are not allowed."
- "permanent hotlinking of images (using Pixabay URLs in your app) is not allowed" — download to your own server; `webformatURL` is "URL valid for 24 hours."
- In exchange for the free API: "show your users where the images and videos are from, whenever search results are displayed."
- Full-resolution URLs (`imageURL`, `fullHDURL`) "are only returned to accounts approved for full API access."

### 1.4 Unsplash — verified quotes + ownership note

License (unsplash.com/license):
- Grants use for "Commercial and non-commercial purposes" "without permission from or attributing the photographer or Unsplash," including the right to "download, copy, modify, distribute."
- "Images cannot be sold without significant modification."
- Excludes "the right to compile images from Unsplash to replicate a similar or competing service."

API docs (unsplash.com/documentation):
- Demo apps "rate-limited to 50 requests per hour"; production "increased to 1000 requests per hour." "Image file requests (`images.unsplash.com`) do not count against your rate limit."
- **Hotlinking mandated**: "we require the image URLs returned by the API to be directly used or embedded in your applications" — explicitly so Unsplash "can better track photo views and pass those stats on to the photographer." All URL manipulations "must keep" the `ixid` parameter.
- Every download must "trigger a GET request" to `GET /photos/:id/download` ("for tracking purposes only").
- Attribution is required per the API Guidelines ("properly providing attribution for the photographer and Unsplash"), even though the photo license itself doesn't demand it.

Ownership: Getty Images acquired Unsplash on March 30, 2021 (unsplash.com/blog/unsplash-getty: "Unsplash will continue to operate as a standalone brand and division of Getty Images"). A search for a 2025 ownership change (2026-10-24) found none — no new ownership event to report; the operative change for us remains the hotlinking-mandated API posture.

### 1.5 Wikimedia Commons — licensing machinery

- Only free content is hosted; each file carries its own license (PD, CC-BY, CC-BY-SA, ...), visible on the file page and machine-readable via the API. (commons.wikimedia.org/wiki/Commons:Licensing — fetched via reader, 2026-10-24.)
- API: `prop=imageinfo&iiprop=extmetadata` returns "formatted metadata combined from multiple sources" (mediawiki.org/wiki/API:Imageinfo); it is flagged "an expensive property to request, and should be avoided unless you need it"; `iiextmetadatafilter` limits returned keys (max 50). The convention fields our registry needs (`LicenseShortName`, `LicenseUrl`, `Artist`, `AttributionRequired`) are the documented Commons extmetadata keys — mechanism verified today, field list from practice (marked).
- CC BY-SA 4.0 obligations (creativecommons.org/licenses/by-sa/4.0/), verbatim:
  - Attribution: "You must give appropriate credit, provide a link to the license, and indicate if changes were made."
  - ShareAlike: "If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original."
  - Changes: "you must indicate if you modified the material and retain an indication of previous modifications."
- Consequence (FACT): a CC-BY-SA stock photo composited under text in a tenant thumbnail makes the *thumbnail* a derivative — attribution machinery must be automatic, and if the tenant wanted the thumbnail itself under a different license they'd need CC-BY (not SA) or PD files. For a SaaS this is acceptable (we distribute the composite to the tenant under the CC terms), but it must be disclosed per-tenant.

### 1.6 Openverse — aggregation and filtering

- The images API (api.openverse.org/v1/images/) returns per result: `license` slug (`pdm`, `cc0`, `by`, `by-sa`, `by-nc-sa`, `by-nc-nd`, `by-nd` observed), `license_version`, a ready-made `attribution` string (e.g. "\"Sun\" by Fr@ηk is licensed under CC BY-NC-ND 2.0."), `license_url`, `creator`, `creator_url`, `foreign_landing_url`, plus `source` (nasa, flickr, wikimedia) and `provider`.
- Trap (FACT): results include NC and ND licenses unless the query filters them out — a monetized platform MUST query with `license=cc0,by,pdm` (and `by-sa` only with a share-alike policy decision).
- Rate limits: docs describe tiers only — `standard` ("The default rate limit that anyone is able to unlock simply by authenticating"), `enhanced` ("selectively granted"), `exempt` (docs.openverse.org/api/reference/authentication_and_throttling.html). Exact numbers are not published on that page — UNVERIFIED.

### 1.7 Internet Archive + NASA (public-domain footage)

- Internet Archive: rights are **per item** — the ToU (archive.org/about/terms.php, fetched via reader 2026-10-24) requires respecting the rights attached to each item; the Archive hosts everything from PD film to rights-reserved lending items, so "it's on archive.org" is NOT a license. Reads via advancedsearch/scrape/metadata APIs run without keys (documented in prior repo research `free-video-clips-research-2026-09.md`; today's direct fetch of developers docs was blocked — carry-over, marked). Practical stance (RECOMMENDATION): curated, per-item vetting for history-niche footage; never bulk-automated.
- NASA: images.nasa.gov FAQ states the media "is generally not protected by copyright" (public domain as US-government works) subject to usage guidelines (images.nasa.gov/faq, fetched via reader 2026-10-24). API: api.nasa.gov uses api.data.gov keys; DEMO_KEY exists with standard api.data.gov limits (~30 req/IP/hr, 50/day; read via reader — treat as approximate). NASA footage is the safest possible layer (PD + API + stable org) for space/earth/engineering b-roll and thumbnails.

### 1.8 Mixkit / Videvo / Coverr / Storyblocks / Freepik (Envato/freemium tier)

- **Mixkit**: no API (prior research); license index page (mixkit.co/license/, fetched 2026-10-24) lists "Stock Video — Free License" and "Stock Video — Restricted License" and warns "Be sure you are aware of which license applies to the item you have downloaded." The full Free License text failed to load today (mixkitlicense.com DNS) — clauses UNVERIFIED today; historically free-commercial-no-attribution with stand-alone redistribution banned. Not automation-grade either way.
- **Videvo**: videvo.net/licensing returned **HTTP 301 → freepik.com//licensing/** on 2026-10-24 — Videvo's licensing is now served by Freepik. Freepik Company acquired Videvo in June 2022 (finsmes.com). Treat Videvo as a Freepik-family source; the old "Videvo Standard License" page no longer exists at its URL.
- **Coverr** (coverr.co/license, verified): free commercial use ("You may use Coverr.co's videos and music for both commercial and non-commercial purposes at no cost"); no attribution required; modification allowed; prohibitions include "Coverr videos can't be resold or offered as part of services to which providing videos can help" (explicitly covering "video editing services" and "app builders"), building "a service that is similar to or competes with Coverr.co", and AI training ("must not be used to train AI algorithms, develop AI models, or serve as part of any dataset"). Releases: "While we do obtain model releases for individuals appearing in our content, we do not provide these releases to users" and "We do not hold releases for any brands, trademarks, or identifiable properties or landmarks." Terms modifiable "at any time." API exists (coverr.co/developers) plus an MCP endpoint; no published rate limits (UNVERIFIED).
- **Storyblocks** (storyblocks.com/license, verified): subscription, "100% royalty free"; tier table shows "Perpetual use of assets after your subscription ends" — **No for Individual, No for Small Business, Yes for Business** — but a blanket guarantee: "Anything you create and publish during your time as a Storyblocks member will be covered by our license - forever." Business adds broadcast/OTT/streaming rights and $1M indemnification (vs $20k on lower tiers). No free tier on the page. Prohibition clauses (reselling as stock) live in per-tier license documents not shown on this page — UNVERIFIED today.
- **Freepik** (freepik.com/licensing/, partial read via reader; direct fetch 403): "Freepik Content License Version 3.0 (2025)"; Free license requires attribution; free content cannot be redistributed as-is/standalone; Premium removes attribution and widens rights. AI-generated content is governed by a separate AI Content License (help center article exists; exact clauses UNVERIFIED — 403). Freepik API exists; terms and quotas UNVERIFIED (blocked).

### 1.9 The multi-tenant question — can WE cache + re-serve assets to tenants?

This is the load-bearing legal distinction for the SaaS. Evidence assembled per source:

| Source | Serve RAW asset to tenants through our platform | Serve our COMPOSITE (thumbnail with text/branding) to tenants |
|---|---|---|
| Pexels | RISKY: "Don't redistribute or sell the photos and videos on other stock photo or wallpaper platforms" + API "core functionality" clause; a multi-tenant raw CDN starts to look like a stock/wallpaper service | SAFE: modification is explicitly licensed, incl. "a template you sell"; keep Pexels link + photographer credit in tenant surfaces |
| Pixabay | NO: "You cannot sell or distribute Content ... on a Standalone basis" (Standalone = no creative effort applied) | SAFE: "Modify or adapt Content into new works" is granted; credit surfaced per API courtesy requirement |
| Unsplash | NO: API requires URLs to hotlink Unsplash's CDN; license excludes compiling images "to replicate a similar or competing service" | SAFE: modification+distribution granted by license; keep attribution per API guidelines |
| Coverr | NO: "can't be resold or offered as part of services to which providing videos can help" — literally our use case if raw | SAFE within license: composites are modified works; no AI training; re-check terms "at any time" drift quarterly |
| Wikimedia | PD files: yes. CC-BY: yes with automatic attribution. CC-BY-SA: yes, but derivative licensing obligations ride along | Same, with attribution text auto-generated into the tenant's video description/template |
| NASA | YES (PD) | YES |
| Storyblocks | Not addressed on public overview — assume NO raw re-serving | Embedded in published projects is the licensed use |

**Platform rule (RECOMMENDATION, synthesized from the quotes above):** the unit our tenants ever receive is the **composite** (stock + brand + text rendering) or the tenant's own uploaded asset. Raw provider files are inputs, stored privately for processing, never exposed at a stable URL, never browsable as a catalog through our UI (and where we do surface provider search — e.g. Pexels — the provider-required links/credits render inline). This one rule simultaneously satisfies: Pixabay's Standalone ban, Unsplash's hotlink/compete clauses, Coverr's service clause, Pexels's stock-platform clause, and the API guidelines that require credits "whenever search results are displayed."

Also note (FACT): search-engine accessibility ≠ license permission — all four freemium providers grant rights through their own license pages only; nothing on Google Images or third-party mirrors carries any license at all. The registry (section 2) must record the license **snapshot at download time**, because at least Coverr reserves the right to change terms "at any time."

---

## 2. Rights-aware asset registry (§10.2)

RECOMMENDATION (synthesis grounded in the section-1 facts). One Postgres table on Neon (same instance as the RAG corpus — pgvector "available on every Neon plan", per neon.com docs) + object storage (Vercel Blob or R2/S3) holding **processed composites only**; raw provider files go to a private, non-served prefix used only during rendering.

```sql
CREATE TABLE asset_registry (
  id                 TEXT PRIMARY KEY,            -- "pxl:12345" | "pix:987" | "unsp:abc" | "cmn:File.jpg" | "nasa:..."
  provider           TEXT NOT NULL,               -- pexels | pixabay | unsplash | commons | openverse | nasa | coverr | upload
  provider_asset_id  TEXT NOT NULL,               -- provider's own ID / page slug
  original_url       TEXT NOT NULL,               -- provider page URL (never the raw CDN as a served URL)
  license            TEXT NOT NULL,               -- normalized: SPDX where one exists (CC0-1.0, CC-BY-4.0, CC-BY-SA-4.0,
                                                  -- LicenseRef-Pexels-License, LicenseRef-Pixabay-Content, LicenseRef-Unsplash, PD-USGov-NASA)
  license_url        TEXT NOT NULL,               -- deed or license page
  license_snapshot_hash TEXT,                     -- sha256 of license text at download time (Coverr-style drift detection)
  attribution_text   TEXT,                        -- auto-generated; NULL when not required
  attribution_required BOOLEAN NOT NULL DEFAULT false,
  creator            TEXT, creator_url TEXT,
  restrictions       JSONB DEFAULT '{}',          -- ["no-standalone-redistribution","no-trademark-use","people-not-in-bad-light","no-ai-training"]
  release_status     TEXT DEFAULT 'unknown',      -- unknown | model-release-held-but-not-provided | pd-no-releases-needed | editorial
  download_date      TIMESTAMPTZ NOT NULL,
  content_hash       TEXT NOT NULL,               -- sha256 of raw file (dedup + reuse detection)
  cache_key          TEXT,                        -- object-storage key of the RAW file (private prefix, TTL-managed)
  composite_keys     TEXT[] DEFAULT '{}',         -- object-storage keys we actually serve (composites)
  ttl_refetch_at     TIMESTAMPTZ,                 -- provider URL expiry (Pixabay: +24h) or license re-check schedule
  meta               JSONB DEFAULT '{}',          -- width/height/duration/orientation, api-quota headers seen
  created_at         TIMESTAMPTZ DEFAULT now()
);
```

Field-level justifications (FACT → design):
- **SPDX normalization**: CC licenses map to SPDX ids; provider-specific licenses have no SPDX entry, so `LicenseRef-*` (SPDX's custom-license namespace) keeps the column uniform.
- **Attribution auto-generation**: Openverse returns a ready `attribution` string per result (verified); Commons `extmetadata` supplies Artist/LicenseShortName (mechanism verified); Pexels API prescribes the format "Photo by John Doe on Pexels" with a link (verified); Unsplash API guidelines require photographer+Unsplash attribution. For Pixabay (no license attribution) the API still asks us to "show your users where the images and videos are from" — render it in tenant UI, not in the video.
- **TTL policy per provider** (FACT where stated): Pixabay URLs expire in 24h ("URL valid for 24 hours") → `ttl_refetch_at = download_date + 24h` for raw re-fetch, or simply keep the private local copy and never re-fetch; Unsplash requires live hotlinks + a download trigger per download → store no raw local copy for Unsplash at all (render from CDN, fire the trigger once per composite); Pexels/other: quarterly `license_snapshot_hash` re-check.
- **Dedup**: `content_hash` unique-ish index prevents the same Pexels file being licensed-forked per tenant; the composite keys carry per-tenant branding so shared raw input is fine.
- **What we serve**: `composite_keys` are the only publicly reachable objects — the multi-tenant rule from §1.9 enforced by construction.

---

## 3. Thumbnail rendering stacks (§10.8)

### 3.1 Comparison (all facts verified 2026-10-24 unless dated)

| Stack | Output path | Layout engine / CSS | RTL & complex scripts | Emoji | Serverless fit (Vercel) | Verdict for v2 |
|---|---|---|---|---|---|---|
| **Pillow** (current repo renderer) | raster direct | manual (draw.text, anchors) | Only with **libraqm**: `Layout.RAQM` "Advanced features are supported"; `direction` "can be 'rtl' ... Requires libraqm"; "Raqm layout is recommended for all non-English text"; language param takes BCP-47, requires libraqm (ImageFont docs). Without it: `Layout.BASIC` — "Advanced features such as text direction are not supported" | `embedded_color` param "Whether to use font embedded color glyphs (COLR, CBDT, SBIX)" (ImageDraw docs) — depends on the font file | Runs in CI/GHA today (repo pattern); on Vercel would need Python function (500MB bundle limit — verified) | Keep for CI-side longform posters; **require raqm** (`PIL.features.check('raqm')`) before any Urdu template touches it |
| **sharp + SVG** (v2 template plan; Studio `thumb-templates.js` today) | SVG → libvips/librsvg → PNG/JPEG | SVG geometry we generate ourselves (rects, bars, autofit via measured advances) | SVG `<text>` goes through librsvg's text stack; community reports of Arabic shaping failures with sharp exist (vercel/satori#409: "downstream tools like sharp don't perform proper text shaping"; #406 recommends resvg-js instead) — **verify with a test matrix before trusting with Urdu** | No native color-emoji path in SVG text; use vector accents or a Noto Emoji font | Already the repo's engine (sharp ^0.33.5, ESM); small, fast, deterministic | **Primary lane for Latin/numeric templates** (matches the Oct-18 v2 plan) |
| **resvg** (standalone) | SVG → PNG | static SVG 1.1 subset; "No native text rendering" — implements its own text pipeline, "doesn't rely on any system libraries"; pixel-identical output cross-platform (README) | Community evidence it shapes Arabic correctly (satori#406: "Resvg handles Arabic shaping and RTL properly"); internals (rustybuzz/unicode-bidi) not verified today — marked | same caveat as sharp | MIT/Apache-2.0 dual (README); tiny binary; @resvg/resvg-js bindings | Best rasterizer if SVG-text shaping must be pinned cross-platform; benchmark vs sharp before switching |
| **ImageMagick** | raster | its own MVG/SVG delegate | delegates vary by build | — | **Security-policy friction**: ships "everything allowed unless denied"; best practice: "Turn off vector graphics (MVG) and remote network fetches (HTTPS) on public instances"; hardened profiles (`limited`,`secure`,`websafe`) disable coders incl. SVG/HTTP (security-policy page) | **No** — policy drift between CI/serverless images is exactly the "works here, policy-blocked there" class |
| **Playwright/Puppeteer (headless Chromium)** | HTML/CSS → screenshot | full Blink/CSS | **Native, correct** (Blink+HarfBuzz shape Arabic/Urdu incl. Nastaliq as shipped in browsers — no plugin needed) | Native color emoji | Fits Vercel limits ONLY via trimmed builds: @sparticuz/chromium = 136,964,856 bytes (130.62 MiB) uncompressed / 33.21 MiB brotli, extracted to `/tmp`, MIT (repo README) vs Vercel's 250 MB uncompressed function bundle cap, 4.5 MB response body cap, 2–4 GB memory, 300s default/800s max duration (limitations page, fetched 2026-10-24). Full Playwright browser bundles (~400MB) do NOT fit; cold start = brotli inflation (0.712s measured on their table) + Chromium boot — no Vercel-published number (marked estimate: ~2–6s warm-less) | **Urdu/Nastaliq lane** — render the same template JSON as HTML in Chromium, screenshot 1280x720; or run this lane in CI/GHA where the repo already has puppeteer experience (poster-factory.mjs) |
| **satori / @vercel/og** | HTML/JSX → SVG (text as `<path>`) → PNG via Resvg ("uses Satori and Resvg" — Vercel OG docs) | "Taffy to lay out Flexbox, Grid and block layouts" (satori README, current); Vercel's OG docs (2026-06-16) still say "Only flexbox (display: flex) ... Advanced layouts (display: grid) will not work" and cap the bundle at 500KB — **doc discrepancy, treat grid as unavailable until tested** | **BROKEN for RTL**: opentype.js "does not support RTL or complex text shaping" (satori docs via issue #289); Arabic renders disconnected/reversed (issues #228, #406, #409) | supported via fonts (OG docs example: emoji), but same shaping limits for complex scripts | built for Vercel (Node runtime) | **Do not use for thumbnails**; only acceptable for Latin-only OG/social cards |
| **Canva-like OSS editors** (fabric.js / Konva / react-design-editor / Polotno SDK) | client canvas | DOM/canvas | browser-native (same Blink shaping) | native | client-side; Polotno is a commercial SDK | Out of scope for deterministic server rendering; relevant only if a tenant-facing manual editor ships later — licenses UNVERIFIED (marked) |

### 3.2 Recommendation (RECOMMENDATION)

1. **Primary deterministic lane stays sharp+SVG** — it is already chosen (Oct-18 v2 plan), matches the no-shadow/crisp-edges constraints, renders 1280×720 JPEG <2MB, and adds zero new infra. All numeric/Latin templates go here.
2. **Add one browser lane for shaped scripts.** The moment a template needs Urdu/Arabic (Nastaliq/Arabic shaping), route that render to a headless-Chromium screenshot (same template JSON → HTML) with Noto Nastaliq Urdu + Noto Sans Arabic (OFL, verified in google/fonts) installed in the image. Run it in CI/GHA (where poster-factory already proved puppeteer) or on Vercel via @sparticuz/chromium within the 250MB cap. Browsers are the only stack with *native, correct* RTL — every non-browser path needs libraqm/resvg-class shaping with caveats.
3. **Explicitly disqualify satori** for anything with RTL; its own docs admit opentype.js lacks complex shaping, and the open issues are years old with "PRs welcome" maintainership.
4. **Pillow + libraqm is acceptable, not preferred** — `check_feature("raqm")` must gate any Urdu render, and Nastaliq display quality (cascading baseline) should be eyeballed against browser output before trusting it (UNVERIFIED: nastaliq-specific rendering fidelity in raqm).

---

## 4. Text rendering & fonts

- **OFL 1.1 scope** (openfontlicense.org, verbatim): the license allows anyone "to use, study, copy, merge, embed, modify, redistribute, and sell modified and unmodified copies of the Font Software"; "Original or Modified Versions of the Font Software may be bundled, redistributed and/or sold with any software"; "The requirement for fonts to remain under this license does not apply to any document created using the Font Software" (i.e., thumbnails/videos/embedding are unrestricted commercial use). Conditions: fonts may not "be sold by itself"; redistributions must carry the license; **Reserved Font Names** forbid modified versions keeping the original name; derivatives stay under OFL.
- **Repo fonts verified in google/fonts (fetched 2026-10-24):** `ofl/anton` — Anton-Regular.ttf + OFL.txt; `ofl/inter` — Inter[opsz,wght].ttf (variable) + italic variable + OFL.txt; `ofl/cinzel` — Cinzel[wght].ttf (variable) + OFL.txt. All three repo TTFs are OFL 1.1 → commercial thumbnails, repo redistribution, and subsetting are all permitted (keep the OFL.txt beside the files).
- **Urdu/Arabic-capable OFL fonts (verified in google/fonts):** `ofl/notonastaliqurdu` — NotoNastaliqUrdu[wght].ttf (variable); `ofl/notosansarabic` — NotoSansArabic[wdth,wght].ttf (variable). Both OFL. Nastaliq is the correct script style for Urdu headlines; Noto Sans Arabic is the pragmatic UI/impact companion (nastaliq is calligraphic and vertically tall — template boxes need larger line boxes; flagged as a template-parameter concern, UNVERIFIED specifics).
- **Variable fonts**: Inter, Cinzel, and the Noto Arabic families ship as variable TTFs in google/fonts. Pillow ≥ current supports named instances/`set_variation_by_axes`; sharp/librsvg and browsers handle variable fonts natively — but template autfit code should instantiate *static weights* where deterministic metrics matter (RECOMMENDATION).
- **Subsetting**: OFL permits modification with renaming only if the RFN applies — subsetting a font for rendering is modification but the subset is internal (not redistributed under the original name), so no RFN conflict for private subsetting; if we ever redistribute a modified font publicly, strip/replace the Reserved Font Name. (OFL text quoted above; application = RECOMMENDATION.)
- **Emoji paths per stack**: Pillow — `embedded_color=True` renders "font embedded color glyphs (COLR, CBDT, SBIX)" (ImageDraw reference) so a CBDT/SBIX emoji font (e.g. Noto Color Emoji family variants) is required per font file; browsers — native color emoji; satori — emoji work as font glyphs (OG example) subject to the same shaping limits; SVG-via-sharp — no reliable color-emoji story (marked). Practical rule: treat emoji as vector sticker assets in templates rather than font glyphs in the deterministic lane (RECOMMENDATION).

---

## 5. Thumbnail quality checks (§7 tie-in)

- **YouTube specs — re-verified 2026-10-24** (support.google.com/youtube/answer/72431): resolution "3840 x 2160 pixels for videos and 2160 x 3840 for Shorts"; minimum width "640 pixels"; aspect "16:9" (Shorts 9:16, podcast playlists 1:1); size caps — "2 MB for video thumbnails" mobile / "50MB" desktop; "image formats such as JPG or PNG"; custom thumbnails require a verified account; violations can cost privileges ("30 days"); daily-limit error exists. ⇒ Our 1280×720 render with <2MB output remains valid and mobile-safe.
- **Contrast gate** (WCAG 2.1 SC 1.4.3, w3.org, verbatim): normal text "at least 4.5:1"; "Large-scale text and images of large-scale text have a contrast ratio of at least 3:1" (large = ≥18pt/24px, or 14pt/18.5px bold); formula "(L1 + 0.05) / (L2 + 0.05)" with sRGB luminance "L = 0.2126 * R + 0.7152 * G + 0.0722 * B" and per-channel linearization; "computed values should not be rounded (e.g., 4.499:1 would not meet the 4.5:1 threshold)". AAA is 7:1 (SC 1.4.6); SC 1.4.11 covers non-text graphic contrast. Application (RECOMMENDATION): run the formula on every headline/accent pair at template-validation time — thumbnails are "large-scale text" so 3:1 is the hard floor; 4.5:1 for small chips/kickers; treat decorated text-on-photo pairs by measuring against the *effective* background (sample the composited region, not the theme color).
- **Safe area**: no official YouTube safe-zone spec exists (established in the Oct-18 research; unchanged — the only official anchors are the 16:9 canvas and Test & Compare's "thumbnails might look cropped" mobile experiment). Carry forward the observed constants: bottom-right ≥260×120px reserve for the duration chip, ≥64px edge inset (synthesis, flagged). Validation gate (RECOMMENDATION): template JSON already encodes `safeZone` — enforce it in the renderer, and add a synthetic overlay draw (fake duration chip) for visual QA batches.
- **Face detection** (for placement/two-face templates): **YuNet** — "a light-weight, fast and accurate face detection model" detecting "faces of pixels between around 10x10 to 300x300"; "All files in this directory are licensed under MIT License" (code + ONNX weights, opencv/opencv_zoo); WIDER Face ≈ 0.834 AP_easy / 0.708 AP_hard (repo README). **MediaPipe** — Apache-2.0, Python + Web runtimes (repo README). Either runs CPU-side in CI at thumbnail scale. Wire-up (RECOMMENDATION): detect faces → template places headline on the empty half; reject templates whose text box overlaps a detected face box >N%.
- **AI-image artifact checks**: no accepted open-source detector standard found in this pass (marked UNCERTAIN) — keep the current human-review + sharpness/heuristics gates rather than shipping an unvalidated "artifact score."
- **Resolution/size validation** (RECOMMENDATION): render gate = width ≥1280, aspect 16:9 ±0.5%, bytes <2MB (mobile cap, verified above), JPEG q≈90; reject-and-escalate otherwise. This already exists in Studio bulk paths per the Oct-18 integration notes.
- **A/B candidates**: YouTube-native Test & Compare facts from the Oct-18 research stand (up to 3 variants, winner by watch-time share, sub-720p variants downscaled to 480p, no API to start tests). Our pipeline pattern (RECOMMENDATION): generate 3 deterministic template variants per video, upload via `thumbnails.set`, owner starts Test & Compare manually — the only API-supported workflow (verified in market research Oct-10).

---

## 6. Background removal (brief)

| Tool | Code license | Weights / default model | Commercial? | Notes (verified 2026-10-24) |
|---|---|---|---|---|
| **rembg** (danielgatis/rembg) | MIT ("Licensed under the MIT License") | **"Model weights carry their own licenses, independent of rembg's MIT license"** — README. Default model is `bria-rmbg` ("The default"), and RMBG-2.0 "requires a paid agreement for commercial use" | Engine yes; **default weights NO** | Models auto-download to `~/.rembg/models/`; Python ">=3.11, <3.14"; onnxruntime backends (cpu/gpu/rocm) |
| **BiRefNet** (ZhengPeng7/BiRefNet) | MIT | Official weights on HuggingFace/GitHub releases; ONNX conversions published ("We converted from .pth weights files to .onnx files") | Yes (MIT) — but note the README flags briaai/RMBG-2.0 as "weights are for only non-commercial use" | "17 FPS with resolution==1024x1024 with 3.45GB GPU memory on a single RTX 4090" (FP16); ONNX adds ~75–90% latency; best cutout quality of the OSS set per its DIS benchmark positioning |
| **MODNet** (ZHKKKe/MODNet) | Apache-2.0 — "The code, models, and demos in this repository" (excluding doc GIFs) | weights in-repo `pretrained/`, ONNX + TorchScript conversions in-repo | Yes | "real-time portrait matting with only RGB image input"; portrait-focused — good for head/person sticker templates, weaker on general objects |
| U-2-Net (rembg's classic `u2net`) | code historically Apache-2.0 — **weight license UNVERIFIED today** (repo URL 404'd on fetch) | bundled via rembg releases | treat as unverified | Don't rely on it for monetized output until the weights license is confirmed |

Verdict (RECOMMENDATION): use rembg **as the engine only** with an explicit model choice — `birefnet-general` / `birefnet-general-lite` (MIT) for objects, `modnet` (Apache-2.0) for portrait cutouts — and a registry rule that bans the default `bria-rmbg` on any monetized path. CPU-only Colab/GHA runs: `u2netp`-class speed, but license first.

---

## UNCERTAIN register (do not build on these without re-checking)

- Openverse numeric rate limits (tiers only documented).
- Mixkit Free License full text (DNS failure today; index page verified only).
- Freepik AI-content clauses + API terms/quota (403 blocked; partial reader read only).
- Storyblocks per-tier license documents (resale clauses not on the overview page).
- resvg's exact shaping internals (rustybuzz/unicode-bidi) — community evidence only that Arabic renders correctly.
- Wikimedia extmetadata field-name list (mechanism verified; field names from practice).
- Internet Archive API auth/rate specifics (developers docs fetch blocked today; facts carried from in-repo Sept research).
- U-2-Net weights license (repo fetch 404).
- Chromium-on-Vercel cold-start seconds (no primary measurement exists; estimate flagged in §3.1).
- Nastaliq-specific rendering fidelity in Pillow/raqm (needs a render test matrix).
- The Oct-18 research's industry data (vidIQ stats, 168×94 test size, safe-zone geometry) — carried over, still industry observation rather than official spec.

## Sources (fetched 2026-10-24 unless noted)

1. Pexels License — https://www.pexels.com/license/ (free commercial use, modification, prohibitions incl. stock-platform redistribution, people clause)
2. Pexels API docs — https://www.pexels.com/api/documentation/ (Authorization header, 200/hr + 20k/mo, unlimited-with-attribution, prominent link + photographer credit, no core-functionality clones, hotlinking not addressed)
3. Pixabay Content License — https://pixabay.com/service/license-summary/ (Standalone ban, trademark/brands bar, recognisable people clause, third-party consent responsibility)
4. Pixabay API docs — https://pixabay.com/api/docs/ (100 req/60s, 24h caching requirement, no permanent hotlinking, 24h URLs, show-source requirement, full-res gated)
5. Unsplash License — https://unsplash.com/license/ (commercial grant, no significant-modification sales, no competing-service compilation)
6. Unsplash API docs — https://unsplash.com/documentation/ (50/hr demo, 1000/hr production, CDN hits free, hotlinking mandated + ixid, download trigger, attribution via guidelines)
7. Unsplash/Getty announcement — https://unsplash.com/blog/unsplash-getty (2021 ownership; no 2025 event found via search)
8. Wikimedia Commons licensing — https://commons.wikimedia.org/wiki/Commons:Licensing + https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia (per-file free licenses; reader-fetched)
9. MediaWiki imageinfo/extmetadata — https://www.mediawiki.org/wiki/API:Imageinfo (extmetadata mechanism, expensive-property caution, iiextmetadatafilter)
10. CC BY-SA 4.0 deed — https://creativecommons.org/licenses/by-sa/4.0/ (attribution + share-alike + indicate-changes, verbatim)
11. Openverse images API — https://api.openverse.org/v1/images/ (license slugs incl. NC/ND, attribution strings, source/provider fields)
12. Openverse throttling docs — https://docs.openverse.org/api/reference/authentication_and_throttling.html (standard/enhanced/exempt tiers)
13. Internet Archive ToU — https://archive.org/about/terms.php (per-item rights; reader-fetched)
14. NASA Image & Video Library FAQ — https://images.nasa.gov/faq (media "generally not protected by copyright"; reader-fetched) + https://api.nasa.gov/ (api.data.gov keys, DEMO_KEY; reader-fetched)
15. Mixkit license index — https://mixkit.co/license/ (Free vs Restricted license categories; full text unfetched)
16. Videvo→Freepik redirect — observed HTTP 301 videvo.net/licensing → freepik.com/licensing (2026-10-24); acquisition: https://www.finsmes.com/2022/06/freepik-company-acquires-uk-based-videvo.html
17. Coverr License — https://coverr.co/license/ (commercial, no attribution, service/resale ban, AI-training ban, releases held-not-provided, terms changeable) + https://coverr.co/ (API + MCP endpoint)
18. Storyblocks license overview — https://www.storyblocks.com/license (royalty-free, tiered perpetual rights, indemnity, no free tier)
19. Freepik licensing — https://www.freepik.com/licensing/ (Content License v3.0 2025; partial reader read; direct fetch 403)
20. Pillow ImageFont reference — https://pillow.readthedocs.io/en/stable/reference/ImageFont.html (Layout.BASIC/RAQM verbatim, direction/features/language require libraqm, raqm recommended for non-English)
21. Pillow ImageDraw reference — https://pillow.readthedocs.io/en/stable/reference/ImageDraw.html (embedded_color COLR/CBDT/SBIX)
22. sharp input API — https://sharp.pixelplumbing.com/api-input (SVG listed as supported decoder)
23. resvg — https://github.com/linebender/resvg (static SVG subset, no system libs, cross-platform pixel identity, MIT/Apache-2.0)
24. satori — https://github.com/vercel/satori (Taffy layout, CSS subset, SVG output, text as paths, not-a-browser guarantee) + RTL failures: https://github.com/vercel/satori/issues/228, /issues/406, /issues/409, discussion #289 (opentype.js lacks RTL/complex shaping)
25. Vercel OG image generation — https://vercel.com/docs/og-image-generation ("uses Satori and Resvg", flexbox-only note, 500KB bundle, runtime support)
26. Vercel Functions limits — https://vercel.com/docs/functions/limitations (250MB bundle, 5GB large-functions beta, 4.5MB body, 2–4GB memory, 300s/800s/1800s durations, 1024 fds, fluid compute)
27. @sparticuz/chromium — https://github.com/Sparticuz/chromium (130.62 MiB uncompressed / 33.21 MiB brotli, /tmp extraction, MIT, Lambda-oriented)
28. ImageMagick security policy — https://imagemagick.org/security-policy/ ("everything allowed unless denied", disable MVG/HTTPS on public instances, hardened profiles)
29. YouTube thumbnail requirements — https://support.google.com/youtube/answer/72431 (4K recommendation, 640px min, 16:9/9:16, 2MB mobile / 50MB desktop, JPG/PNG, verified account, 30-day privilege loss)
30. WCAG 2.1 SC 1.4.3 — https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html (4.5:1 / 3:1 / formula / luminance, no rounding)
31. YuNet — https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet (MIT incl. weights, 10x10–300x300 faces, WIDER Face APs)
32. MediaPipe — https://github.com/google-ai-edge/mediapipe (Apache-2.0, Python/Web runtimes)
33. rembg — https://github.com/danielgatis/rembg (MIT engine; weights carry own licenses; bria-rmbg default needs paid commercial agreement; model list)
34. BiRefNet — https://github.com/ZhengPeng7/BiRefNet (MIT, ONNX conversions, 17 FPS FP16 RTX 4090, RMBG-2.0 non-commercial warning)
35. MODNet — https://github.com/ZHKKKe/MODNet (Apache-2.0 code+models, real-time portrait matting, ONNX in-repo)
36. google/fonts — https://github.com/google/fonts/tree/main/ofl/anton, /ofl/inter, /ofl/cinzel, /ofl/notonastaliqurdu, /ofl/notosansarabic (OFL.txt files verified; variable-font filenames)
37. SIL OFL 1.1 official text — https://openfontlicense.org/open-font-license-official-text/ (use/modify/redistribute/sell-copies grant, document exemption, no standalone font sales, RFN, null-and-void clause)
38. Prior in-repo research (context carried): research/free-video-clips-research-2026-09.md, research/youtube-thumbnail-templates-research-2026-10-18.md, research/thumbnail-studio-market-2026-10-10.md (Test & Compare mechanics, thumbnails.set quota, safe-zone observations)
