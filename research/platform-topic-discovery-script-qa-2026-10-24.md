# Topic discovery & script QA — platform research 2026-10-24

Read-only research round for the v2 platform design (user lanes: (A) trend-driven topic suggestions, (B) user-supplied topics, (C) scheduled topic research → reviewable content calendar). Builds on `python-rag-audit-2026-10-17.md` (script-brain inputs verified; Neon pgvector RAG decided), `youtube-upload-quota-research-2026-09.md` (quota buckets), `youtube-seo-2026-research.md`, `keyword-ranking-check-2026-09-27.md` (saturation rule), and `long-video-fast-monetization-research-2026-09.md` (topic→monetization evidence). No code or issues were created. External claims cite primary sources fetched **2026-10-24** unless noted; time-sensitive facts re-verified today.

---

## 0. TL;DR verdicts

| Question | Verdict | One line |
|---|---|---|
| Is lawful topic research possible at platform scale? | **YES — with one hard constraint** | Everything needed is official-API-reachable; the binding constraint is the search.list bucket: **100 calls/day per GCP project, shared by ALL tenants** (verified today — the assignment's "10k units = 100 searches" premise is outdated). |
| Biggest ToS trap for the v2 platform | **Aggregation ban + 30-day storage rule** | Dev Policy III.E.2.a forbids aggregating API Data across users; III.E.4.d forces delete-or-refresh of retrieved data after 30 days. Per-tenant research is fine; cross-tenant trend pooling and raw-data archival are not. |
| Can search results power topic suggestions to the data-owning user? | **YES, as derived recommendations** | Not prohibited — but scores are "derived metrics" (III.E.4.h): must be labeled non-YouTube, shown alongside API data, never sold as "YouTube data access" (III.G.1). |
| Google Trends | **Official API now exists (alpha, gated) + official RSS feed works** | Trends API alpha (Jul 2025) is application-gated; the RSS daily-trends feed fetched live today with approx-traffic + news links. pytrends stays unofficial/fragile (429s). |
| News data for the platform | **GDELT + GNews free tiers; NewsAPI free tier is DEV-ONLY** | NewsAPI's own FAQ: free plan "cannot be used in a staging or production environment." GDELT is free at 1 req/5s; GNews free = 100 req/day, 10 articles/req, 12h delay. |
| Reddit | **COMMERCIALLY RESTRICTED — license or drop** | Free tier is non-commercial (100 QPM with OAuth); a paid SaaS using it needs a paid data agreement. Exact clause text UNVERIFIED (primary page unfetchable today). |
| Scoring model | **Weighted 10-signal scorecard, every signal labeled measured / proxy / heuristic** | No fabricated volumes: numbers displayed only with provenance; LLM-estimated numbers are either cited, labeled "estimate," or stripped. |
| Script representation | **JSON + JSON Schema (draft 2020-12), compiled to the existing beats render format** | Repo render format verified (`lf-*.json` beats: layout/kicker/headline/sub/text/words); script JSON is the upstream authoring contract; markdown is an export for the review UI, not the source of truth. |
| LLM-as-judge fact-checking | **TRIAGE ONLY — never a guarantee** | Judges have systematic biases and ~85% human agreement (secondary); they cannot verify against ground truth. Grounding = planned pgvector RAG + 2-source rule + human review for gated topics. |
| Disclosure touchpoints | **Asset provenance must drive the AI-use checkbox** | Official policy fetched today: 4 disclosure categories (real person doing/saying something, altered real footage, realistic fake scene, AI music as main focus). Scripts/thumbnails/captions AI help is explicitly exempt. |

---

## 1. Lawful topic-discovery data sources

### 1.1 YouTube Data API — verified quota surface (fetched 2026-10-24, developers.google.com/youtube/v3/determine_quota_cost)

**FACT — the Dec 2025 bucket structure is still current today:** projects get "a default quota allocation of 100 `search.list` calls, 100 `videos.insert` calls, and 10,000 units per day combined for all other endpoints," resetting midnight PT. Both search.list and videos.insert "have their own quota buckets" (100/day at 1 unit/call) and **do not draw from the 10,000-unit pool**.

| Method | Cost | Bucket | Topic-research use |
|---|---|---|---|
| `search.list` | 1 unit | **own bucket, 100 calls/day** | new-query discovery, competition scans, velocity checks |
| `videos.list` | 1 unit | general 10,000/day | trending chart (`chart=mostPopular` + `regionCode` + `videoCategoryId`), batch statistics for outlier logic |
| `playlistItems.list` | 1 unit | general 10,000/day | competitor uploads monitoring **without search** (docs themselves recommend it: for `order=date` "you may experience indexing delays… recommend using `playlistItems.list`") |
| `commentThreads.list` | 1 unit | general 10,000/day | audience-question mining (any public video/channel threads) |
| captions/other reads | 1–50 units | general 10,000/day | not topic-relevant |
| `videos.insert` | — | own bucket, 100/day | unaffected by research (upload lane) |

**FACT — search.list parameters verified** (`developers.google.com/youtube/v3/docs/search/list`): `q` (supports `-`/`|` operators), `type`, `order` (`date|rating|relevance|title|videoCount|viewCount`), `publishedAfter`/`publishedBefore`, `regionCode`, `relevanceLanguage`, `safeSearch`, `topicId` (small curated set only since Freebase shutdown), `maxResults` 1–50 ("The API may return fewer items than the requested `maxResults`"), and `videoCategoryId` requires `type=video`. `channelId` searches are "constrained to a maximum of 500 videos." **`pageInfo.totalResults` "is an approximation and may not represent an exact value"** — usable only as a coarse saturation hint, never as a measured metric.

**FACT — videos.list verified** (`developers.google.com/youtube/v3/docs/videos/list`): `chart=mostPopular` ("Return the most popular videos for the specified content region and video category"), `regionCode` and `videoCategoryId` usable **only** with `chart`; parts include `snippet` (title, description, tags, categoryId, channelId) and `statistics`. `statistics` for arbitrary public videos = legal + 1 unit — this is the basis of lawful competitor/outlier research. Note: the docs page does not state an id-list cap (50/call is widely documented but **UNVERIFIED on today's fetch** — budget conservatively at ~25 ids/call).

### 1.2 What the Developer Policies allow and prohibit (exact clauses fetched 2026-10-24, developers.google.com/youtube/terms/developer-policies)

| Topic | Policy clause (quoted) | Consequence for the v2 platform |
|---|---|---|
| Storage — general | III.E.4.c: Authorized Data "may be stored for no longer than 30 calendar days. After 30 calendar days, the API Client must either delete or refresh"; III.E.4.d: Non-Authorized Data stored "not longer than 30 calendar days," then delete or refresh | Raw trend snapshots/search results are 30-day-TTL data. Refresh-or-delete on a schedule; never archive raw API payloads indefinitely |
| Storage — analytics exception | III.E.4.b: analytics/statistics data may be stored "for as long as is necessary" with consent, but "must still ensure every 30 days that it is still authorized by the user" | Own-channel Analytics data persists per tenant with 30-day reauthorization checks |
| Currency | III.E.4.e: "must use reasonable efforts to ensure that their stored API Data is consistent with the current data available" | Cache layers must carry TTLs and provenance timestamps |
| Aggregation | III.E.2.a: "Do not aggregate API Data except that you may only aggregate API Data relating to YouTube channels that are under" one content owner | **THE multi-tenant trap**: no pooled cross-tenant trend leaderboards built from API Data; per-tenant research views only |
| Derived metrics | III.E.4.h: must not use API Data "to create new or derived data or metrics" shown as YouTube data; independent metrics allowed only "alongside" API Data "with clear disclosure" that they are not from YouTube | The topic score is a derived metric → always labeled as platform-computed, never presented as a YouTube statistic |
| Display scope | III.E.3.b: Authorized Data "must not [be] display[ed]… to anyone other than the authorizing user"; III.E.2.b: no using API Data "to gain insights into YouTube's usage, revenue" | Tenant A never sees Tenant B's API-derived data; no "YouTube business insight" products |
| Scraping | III.E.6: clients "must not… scrape YouTube Applications or Google Applications, or obtain scraped YouTube data" (search-engine exception only); III.I.14: no technology "other than YouTube API Services to access or retrieve API Data" | No yt-dlp/HTML scraping of youtube.com for topic research; yt-dlp remains banned for this lane (repo already uses API + suggest endpoints only) |
| Search results handling | III.C.5: "must not modify or replace the text, images, information… of, the search results," nor merge other sources and "present them as YouTube search results"; III.F.2: per-source YouTube attribution required | Topic cards derived from search results must attribute YouTube as source and not pretend to be a search engine |
| Selling | III.G.1: no "sell[ing]… access to any components of YouTube API Services" without written approval | Market the platform as content tooling, never as "YouTube trend API access" |
| Revocation/deletion | III.D.2.c.1 / III.E.4.g: delete stored data "within 7 calendar days" of revocation/account deletion or deletion request | Tenant offboarding must purge API-derived data within 7 days (self-declared) |

**The assignment's core question — "can search results be used to propose topics to the data-owning user?"**

**RECOMMENDATION (grounded in the clauses above): yes, as a derived-recommendations feature, with five guardrails:**
1. Retrieve per tenant (or with the tenant's OAuth grant); treat retrieved snippets/stats as **Non-Authorized Data** with a 30-day refresh/delete cycle (III.E.4.d).
2. Never pool one tenant's retrieved data into another tenant's view (III.E.2.a aggregation ban; III.E.3.b for Authorized Data).
3. Present scores as clearly platform-computed derived metrics (III.E.4.h), with the underlying API facts (views, publish dates — attributed to YouTube per III.F.2) shown alongside.
4. Never re-present raw search results as a YouTube-search-like experience (III.C.5).
5. Keep **own decisions and creations** (user topics, chosen topics, scores, scripts, calendar) — these are the user's/platform's data, not API Data, and may be stored indefinitely. Only the **raw API payloads** obey the 30-day rule. Store the derivation, refresh the snapshot.

### 1.3 Source-availability table (the compliance centerpiece)

Compliance column: **COMPLIANT** (official, sanctioned), **GRAY** (unofficial/undocumented, works but unsupported), **PROHIBITED/RESTRICTED** (barred or commercially gated).

| Source | Access | Free allowance (as of 2026-10-24) | ToS status | Role in topic discovery |
|---|---|---|---|---|
| YouTube `search.list` | Official API | 100 calls/day own bucket | COMPLIANT (III.C.5/III.F.2 constraints) | new-query discovery, competition snapshot |
| YouTube `videos.list` (chart + stats) | Official API | ~10,000 units/day shared | COMPLIANT (Non-Authorized, 30-day rule) | trending per region/category; measured views for outliers |
| YouTube `playlistItems.list` | Official API | shared pool (1 unit) | COMPLIANT | competitor monitoring without burning search |
| YouTube `commentThreads.list` | Official API | shared pool (1 unit) | COMPLIANT | audience questions ("what do viewers ask about X") |
| YouTube Analytics API (`yt-analytics.readonly`) | Official OAuth | per-query cost, "API server evaluates each query"; owner-authorized only | COMPLIANT (III.E.4.b reauthorization) | own-channel performance signal (measured) |
| Google Trends API (alpha) | Official, **application-gated** | unpublished quota; "rolling window of the last 5 years," daily/weekly/monthly/yearly granularity, "consistently scaled data" (official docs) | COMPLIANT once granted | measured search-interest curves; the only legit volume proxy |
| Google Trends RSS (`trends.google.com/trending/rss?geo=US`) | Official published feed | free; fetched live today: 9 items/day with `ht:approx_traffic` ("20000+", "5000+") + linked news items | LOW-RISK GRAY (published feed, no stated API terms/SLA) | daily breaking trends, zero quota cost |
| pytrends | Unofficial scraper of Trends internal endpoint | free | GRAY/UNOFFICIAL — own README: "only good until Google changes things"; 429 breakage widely reported 2025–2026 (anecdotal) | fallback only, always labeled proxy |
| YouTube autocomplete (`suggestqueries.google.com`) | Undocumented Google endpoint | free | GRAY — not API Data (III.I.14 scope), not a documented API; repo-verified working 2026-09-27 (`keyword-ranking-check`) | seed expansion; label presence-only (no volume) |
| GDELT (DOC 2.0 API, GKG, BigQuery) | Official open service | free; ~15-min global news cadence; rate limit ~1 request/5 s (third-party corroboration + live 429 today); terms text UNVERIFIED (project site unfetchable today) | COMPLIANT-leaning (verify terms before production) | global news event stream; source-quality and recency signals |
| GNews | Official API | free: "Requests / day": 100, "Articles / request": 10, last-30-days archive, "12-hour delay," truncated content | COMPLIANT (no non-commercial restriction stated in docs) | niche news discovery, recency signal |
| NewsAPI | Official API | free: "100 requests per day," 24h delay, 1-month archive, localhost CORS — and its FAQ: free plan "may be used for development and testing in a development environment only, and cannot be used in a staging or production environment"; paid starts $449/mo | **PROHIBITED for the platform's production use on free tier** | dev/testing only; skip for v2 unless budgeted |
| Wikipedia **Portal:Current events** | Official wiki portal (fetched live today: daily date headings, topic sections "Armed conflicts", "Disasters and accidents", "Law and crime", …, inline citations to Reuters/BBC/AP) | free, CC BY-SA (+GFDL) — attribution + share-alike | COMPLIANT | event scaffolding, authoritative source list, historical accuracy cross-check |
| Wikimedia APIs / Wikidata | Official | free | COMPLIANT | entity/date grounding for claim checks |
| Reddit API | Official OAuth | free tier **non-commercial**, 100 queries/min with OAuth (support wiki, updated May 2026); 10 QPM unauthenticated; commercial use = paid agreement; "Responsible Builder Policy" approval for new apps. Exact terms text UNVERIFIED (redditinc.com unfetchable today) | **RESTRICTED for a commercial SaaS** — license it or drop it from v2 | audience-question mining (questionable ROI vs its cost) |
| Commercial keyword tools (VidIQ/TubeBuddy/Ahrefs APIs) | Their APIs | paid / limited free | COMPLIANT (their ToS; no scraping on our side) | optional search-volume proxy — must be labeled third-party estimate, never presented as measured YouTube data |
| Scraping youtube.com / yt-dlp for research | none | — | **PROHIBITED** (III.E.6, III.I.14) | never in the v2 research lane |

### 1.4 Per-source notes (what each is good for)

- **Search alternatives are the whole game.** FACT: the docs steer recent-content pulls to `playlistItems.list` over `order=date` search (indexing delays). At 100 searches/day/project shared across tenants, `search.list` must be reserved for genuinely new query strings; competitor velocity, trend refresh, and stats collection ride the 10k-unit pool at 1 unit/call.
- **Competitor outlier logic is lawful and cheap.** `videos.list` `part=statistics` works for arbitrary public videos (verified today). Quota math: monitoring 10 competitor uploads-playlists daily = 10 units; pulling stats for 1,000 videos/day = 20–40 calls = 20–40 units (at 25–50 ids/call; cap UNVERIFIED — see 1.1). Even at 10× that, it is ~4% of the general pool. The saturation heuristic from `keyword-ranking-check-2026-09-27.md` ("tiny videos in top 10 = winnable slot") is reproducible via `search.list` + `videos.list` at ~2 calls per keyword, with `totalResults` demoted to a coarse hint (docs: approximation).
- **Audience questions.** `commentThreads.list` (1 unit/call) over the tenant's own top videos (or niche videos) → extract question-shaped comments. COMPLIANT for analysis; only display Authorized Data (own-channel comments) to the authorizing user (III.E.3.b).
- **Google Trends.** Three-legged: (a) official API alpha — gated, unpublished quota, 5-year window, consistently-scaled values (usable as *measured* once granted); (b) official RSS daily feed — free, fetched live today with approx-traffic strings and news links (treat `"20000+"` as a measured **lower bound**, quoted verbatim from the feed); (c) pytrends — unofficial, breakage-prone; keep out of the critical path, label every value "proxy."
- **Reddit** is the only source in the table that is commercially gated for a paid platform. RECOMMENDATION: cut it from v2 launch; revisit under a paid data agreement if audience-question mining proves out via comments + autocomplete first.

---

## 2. Topic scoring — transparent, non-fabricated

### 2.1 The scorecard (RECOMMENDATION — weights tunable per niche)

Every signal is computed by a deterministic function with a declared **provenance class**:

- **MEASURED** — value came from an API/feed response; stored with source + fetch timestamp.
- **PROXY** — measured on an unofficial/indirect surface (pytrends, autocomplete); always labeled.
- **HEURISTIC** — computed by our formula from measured inputs; formula version recorded.

| # | Signal | Class | How computed | Weight |
|---|---|---|---|---|
| 1 | Niche relevance | HEURISTIC | embedding similarity (text-embedding-3-small, per RAG audit §3.2) of topic vs channel niche keywords/brand kit | 20% |
| 2 | Search interest | MEASURED or PROXY | Trends API alpha curve (measured); pytrends (proxy); RSS approx_traffic (measured lower bound); own `terms-*.json` viewer search terms (measured, tenant-scoped) | 15% |
| 3 | Competition / saturation | HEURISTIC | share of top-10 ranking videos with <500 views (open-slot rule from `keyword-ranking-check`); `totalResults` only as coarse hint (docs: approximation) | 15% |
| 4 | Own-channel performance | MEASURED | YouTube Analytics API once connected (`yt-analytics.readonly` — verified scope today); before connection: trend of tenant's own views via `videos.list` on own uploads (measured) | 15% |
| 5 | Evergreen potential | HEURISTIC | flatness of the 5-year Trends curve (API: "consistently scaled" values make this computable — verified); fallback heuristic: query shape (rule-based vs news-anchored) | 10% |
| 6 | Recency | MEASURED | density of matching videos/news in the last N days (publishedAfter counts; GDELT/GNews hit dates) | 10% |
| 7 | Source quality + sufficiency | HEURISTIC over MEASURED inputs | count of independent authoritative sources (GDELT/GNews/Wikipedia/primary domains) for the topic's central claims; gate: ≥3 independent, ≥1 primary | 10% |
| 8 | Production difficulty | MEASURED (config) | scene count, asset types required, template availability in the tenant's kit — deterministic from the template system | 5% (inverse) |
| 9 | Copyright/policy risk | HEURISTIC gate | keyword + source-type scan (lyrics, news footage, medical/financial/political anchors); gated topics excluded rather than down-weighted | 5% (inverse) + hard gates |
| 10 | Freshness tier fit | MEASURED | tier of the underlying trend (§3) vs tenant cadence | bonus/penalty |

**Hard gates (score-independent exclusions/flags):** duplicate risk (semantic gate per RAG audit Phase 2), unsourced medical/financial core claims, disclosure-required assets without user acknowledgment, source sufficiency < threshold.

### 2.2 The explanation contract (why this topic was recommended)

Every recommendation record stores a `signals[]` array, one entry per computed signal:

```json
{ "key": "competition", "label": "Open slot in top-10",
  "value": 0.6, "display": "6 of top-10 ranking videos under 500 views",
  "provenance": "measured+heuristic", "sources": ["youtube-api:videos.list", "search 2026-10-24T09:12Z"],
  "formula_version": "saturation@1", "weight": 0.15, "contribution": 0.09 }
```

**RECOMMENDATION:** the UI renders "Why this topic" as the top 3 contributing signals with their display strings and provenance chips (MEASURED / PROXY / HEURISTIC / ESTIMATE). A recommendation without a complete signal array must not be shown — this is the non-fabrication enforcement point.

### 2.3 Measured vs estimated — the labeling rule

**FACT (policy hook):** Dev Policy III.E.4.h already requires derived metrics to be clearly disclosed as not-from-YouTube when shown alongside API Data. Our rule generalizes it:
1. Every number in the UI and in script metadata carries a provenance tag and, where measured, its source + fetch date ("41,203 views — YouTube API, fetched 2026-10-24").
2. LLM-generated numbers (in hooks, narration drafts, trend summaries) may only survive into a reviewable record if they trace to a source record; otherwise they are dropped or labeled "estimate — unverified," and estimates are **never** displayed in metric-styled UI (no view-count-styled formatting for estimates).
3. `totalResults` and keyword-tool volumes are always labeled heuristic/third-party respectively (docs + vendor terms make both non-measured).

---

## 3. Trend freshness tiers — refresh, caching, quota math

### 3.1 Tier model (RECOMMENDATION)

| Tier | Examples | Half-life | Refresh | Data source (quota) | Cache TTL |
|---|---|---|---|---|---|
| 0 — Breaking news | elections, disasters, market shocks | hours | 15–60 min | Google Trends RSS + GDELT (15-min cadence) + GNews; **zero search.list cost** | 30–60 min |
| 1 — Short-lived trends | meme formats, one-week controversies | days | 1–2×/day | `search.list` (own bucket) + `videos.list` stats (1 unit) | 12–24 h |
| 2 — Seasonal | holidays, tax season, New Year discipline | weeks-months, cyclical | weekly | Trends API/RSS + own search history + calendar dates | 7 d |
| 3 — Evergreen | rules, habits, explainers | years | monthly | autocomplete (gray, labeled) + Trends 5-year curve + keyword tools (third-party) | 30 d — deliberately matching the API storage cap (III.E.4.d) so snapshots never stale |

### 3.2 Quota math (verified numbers; the real budget killer named)

- **FACT:** search.list has its own **100 calls/day/project** bucket. The assignment's premise ("10k units = 100 searches/day") described the pre-Dec-2025 model; today's docs give search its own bucket, so search does **not** eat the 10k pool — but the bucket is **per project, shared by every tenant** of the platform.
- Budget allocator (RECOMMENDATION): a daily search budget per tenant with priority queue. Example at 40 active tenants: 2 new-seed searches/day each = 80 calls — fits, with 20 calls of retry headroom. Past ~50 tenants, new-query discovery must batch (autocomplete → dedupe → one search per merged cluster) or move to additional audited GCP projects (each new project inherits the read quotas but uploads stay private-locked until audit — per `youtube-upload-quota-research-2026-09.md`).
- **Everything else rides the 10k pool:** competitor playlist monitoring (10 channels = 10 units), trending chart scans (2 regions = 2 units), stats batches (1,000 videos = 20–40 units), comment mining (10 units). Even a 10× activity day stays under ~10% of the pool.
- **Tier 0 costs nothing on the YouTube API** — RSS + GDELT + GNews carry breaking news; search is only spent when a Tier-0 item graduates to a candidate topic.

### 3.3 `trends-<slug>.json` vs DB (evaluated against the verified code)

**FACT (repo, read today):** `trend-research.mjs` does one search per refresh — loops seed variants × ("explained"/"rules"/"habits" templates) until ≥3 results, then `videos.list` for stats, writes `yt-mcp/trends-<slug>.json` (top-10 videos with views, hotKeywords, viralChannels) with a 1-day file cache; Studio reads it from disk or GitHub raw (`studio/lib/data.mjs:95-97`).

| Aspect | trends-<slug>.json (today) | DB table (v2) |
|---|---|---|
| Multi-tenant | per-slug file, fine at 5 channels | one table, tenant-scoped rows |
| History | **none — overwritten daily** (no trend curve, no scoring evidence trail) | append snapshots → interest curves + audit trail for the explanation contract |
| Provenance | seed + timestamp only | per-signal provenance (§2.2), fetch timestamps, formula versions |
| 30-day ToS cycle | implicit (overwritten daily) | explicit TTL sweep deleting/refreshing raw API payloads |
| Calendar lane (C) | no calendar concept | `topic_candidates` + `calendar_items` with review state |
| Verdict | keep as the CI-side export format | **make Postgres/Neon the source of truth**; JSON becomes an export the pipelines already consume (zero pipeline churn) |

---

## 4. Structured script representation

### 4.1 Field inventory — v1 essential vs later (RECOMMENDATION)

| Field | v1 | Later | Notes |
|---|---|---|---|
| `topic_id`, `origin` (`trend` \| `user` \| `calendar`), `created_at` | ✓ | | links script → recommendation record → signals |
| `working_title`, `final_title`, `suggested_titles[]` | ✓ | | 5-formula variants per SEO research §4 |
| `audience`, `learning_objective`, `format` (documentary/listicle/short), `target_duration_s`, `language` | ✓ | | |
| `brand_kit_ref` | ✓ | | pointer into kit/registry (no-static-maps directive) |
| `hook`, `intro`, `cta`, `ending` | ✓ | | first-class fields (hook is the #1 retention lever per growth playbook) |
| `scenes[]` | ✓ | | `{ id, purpose: hook|introduction|section|transition|ending, narration, visual_instructions, on_screen_text, duration_target_s, transition, source_ids[] }` |
| `sources[]` | ✓ | | `{ id, url, title, publisher, access_date, quote_or_note, reliability }` — citation preservation lives HERE, in the record, not in prose |
| `claims[]` | ✓ | | `{ id, text, span, source_ids[], status: unverified|verified|conflicting|flagged, checked_at, checker }` |
| `fact_check_status`, `review_status`, `risk_flags[]`, `disclosure` (`synthetic_media_required`, `reason`, `categories[]`) | ✓ | | §5 |
| `description`, `thumbnail_text`, `tags[]`, `chapters[]` | ✓ | | SEO pack |
| `srt`/caption track ref | | ✓ | free SEO win (SEO research §2) |
| `variant_sets[]` (A/B thumbnails/titles) | | ✓ | |
| `translations[]` | | ✓ | auto-dubbing lane |

### 4.2 Representation verdict: JSON + JSON Schema (draft 2020-12)

- **JSON + Schema** — machine-validatable; typed `claims[]`/`sources[]` are the factual-safeguards backbone; scene objects embed cleanly into pgvector (RAG audit §3.2) and Studio forms; diffable; **compiles to the render format the repo already runs**.
- **Markdown + frontmatter** — great for the human research corpus, wrong for scripts: claims/citations need structure and span offsets; frontmatter cannot express scenes cleanly.
- **Block list** — under-typed; loses schema enforcement.
- **FACT (repo, read today):** the render-side target already exists — `explainer/public/lf-*.json` uses `{ title, theme, brand, beats[]: { layout, kicker, headline, sub, text, photo, ms, startMs, audio, words[] } }`. The script JSON is the **upstream authoring contract**; a compiler step maps `scenes[].narration` → TTS (`audio` + `words[]` timings) and `scenes[].purpose + visual_instructions` → `beats[].layout/kicker/headline/sub`. Template-system specifics stay on the template side; the script side only promises the field contract above (per assignment: template researcher owns the other half).

---

## 5. Factual safeguards

### 5.1 Pipeline (RECOMMENDATION)

1. **Source collection:** per topic, pull GDELT/GNews/Wikipedia + tenant-authorized YouTube context; store `{url, publisher, access_date, excerpt}`.
2. **Citation preservation:** every claim references `source_ids`; quotes and access dates persist in the script record through research → script → review → publish (§5.6).
3. **Claim extraction:** split narration into atomic claims with span offsets (LLM step; deterministic post-processing).
4. **Verification:** layered — see 5.2–5.5.
5. **Gate:** review requirements computed from claim statuses + risk flags (§6).

### 5.2 LLM-as-judge — the honest limits

**FACT (research consensus, secondary sources):** LLM judges are the de facto evaluation standard but carry systematic biases requiring statistical correction (arXiv, Jan 2026, "How to Correctly Report LLM-as-a-Judge Evaluations"); OpenAI-class models show ~85% agreement with human evaluators (secondary; anecdotal precision); judges **cannot reliably verify facts against external ground truth** without retrieval. **Therefore: an LLM-as-judge pass is a TRIAGE and consistency check only. It CANNOT guarantee factual accuracy and must never be presented to users as "fact-checked."** Status vocabulary is deliberately limited to `verified|conflicting|flagged|unverified` — never "true."

### 5.3 Grounding layers that do move accuracy

- **Retrieval grounding (pgvector RAG — already decided in the RAG audit):** each claim is checked against the topic's source-corpus chunks (embeddings + tsvector hybrid per audit §3.2). A claim with no supporting chunk above threshold → `unverified` → review.
- **Conflicting-evidence detection:** require ≥2 independent sources for contested claims; disagreement → `conflicting` → review (and usually rewrite or drop the claim).
- **Date-sensitive claim flagging:** claims with time anchors ("currently," years, prices, statistics) get `expires_at`; a staleness sweep at publish time re-checks or downgrades them. Wikipedia current-events portal + GDELT dates provide cheap freshness anchors.
- **Hallucination heuristics (and their limits):** unsupported-numeric detector (numbers without source_ids — deterministic), named-entity mismatch vs source excerpts (deterministic-ish), multi-sample self-consistency (probabilistic). All probabilistic signals; none guarantees correctness; treat as review-queue priorities, not verdicts.

### 5.4 Plagiarism / similarity

- **RECOMMENDATION (primary, $0):** embedding-similarity vs own corpus on the already-planned Neon pgvector (RAG audit §3.2) — catches paraphrase-of-own-content and cross-tenant template drift; plus n-gram overlap vs the topic's source excerpts to detect over-quoting (copy-paste risk).
- **External options:** Copyleaks has a developer API; its per-scan pricing ~$0.28/scan at the personal tier is **UNVERIFIED (copyleaks.com 403 today; secondary sources)**. Originality.ai targets agency workflows (secondary). Turnitin is not publicly licensable for this use. Verdict: defer external APIs until a paying tenant demands certification; own-corpus similarity is the honest v1 answer.
- AI-detection services (GPTZero/Winston etc.) are a different product — do not conflate "plagiarism check" with "AI-detection"; the July 2025 inauthentic-content monetization risk is handled by originality of the final script + review, not by detector scores (growth playbook Part 4).

### 5.5 Copyright-risk flags (RECOMMENDATION)

Rule-based pre-flags at script and asset level: quoted lyrics (never — flag hard), long verbatim quotations from articles (summarize instead), news-footage visuals (require licensed/free sources per `free-video-clips-research-2026-09.md`), "AI music as the main focus" (triggers disclosure category 4 — official policy fetched today). These flags feed both the review UI and the disclosure checklist.

### 5.6 Medical / financial / political gates (official policy anchors)

- **FACT (fetched today, support.google.com/youtube/answer/13813322):** YouTube's medical misinformation policy "prohibits: (a) content that discourages others from seeking vaccination or medical treatment," "(b) content promoting harmful treatments or cures," and "(c) content denying the existence or efficacy of vaccines or other medical treatments" — aligned with Local Health Authority guidance; exceptions exist for EDSO/public-interest, personal experiences, and counter-speech; violations risk "warning → strike system → termination" and "YouTube may terminate or suspend channels after a single case of severe abuse of the platform, or after repeated strikes." Applies to video descriptions and "any content displayed in a video, including… audio, thumbnails, descriptions, or comments" — i.e., our narration and metadata are in scope.
- **Financial claims:** not a formal YouTube misinformation category (do not invent one) — the gate is self-imposed YMYL standard: sourced claims + mandatory review + "estimate" labeling, justified by accuracy/monetization risk (inauthentic-content policy, July 2025) and tenant trust, per `long-video-fast-monetization-research-2026-09.md`.
- **Political/historical accuracy:** election misinformation is a formal YouTube policy area (misinformation overview: support.google.com/youtube/answer/10834785); historical claims get the 2-source rule + Wikipedia cross-check; contested historical topics → `conflicting` path and review.

### 5.7 Synthetic-media disclosure touchpoints (official policy fetched today, support.google.com/youtube/answer/14328491)

**FACT — the four disclosure categories (quoted today):** creators must disclose realistic AI content that "Makes a real person appear to say or do something they didn't do," "Alters footage of a real event or place," "Generates a realistic scene that didn't actually occur," or "Creates music that's the main focus of the video." **Exempt today, quoted:** "Clearly unrealistic" content, beauty/color filters, captions, and — directly relevant to us — "AI help with outlines, scripts, thumbnails, titles, or infographics" and "Cloning one's own voice to create voice overs or dubs." Consequences of non-disclosure: "manual application of a label, or penalties from YouTube," up to "removal of content or suspension from the YouTube Partner Program"; disclosure itself "won't limit a video's audience or impact its eligibility to earn money."

**RECOMMENDATION — where the pipeline must surface the checkbox:** every generated/ingested **asset** (image, b-roll clip, music track, voice track) carries an `ai_generated` + `realistic` provenance flag at creation. When any scene's assets satisfy a disclosure category, the script record sets `disclosure.synthetic_media_required=true` with the category list, the review UI shows the checklist in the official four-category wording, and the upload step requires the user to confirm the AI-use setting in Studio before publish. Standard-TTS narration of our own script with animated-diagram/typography visuals (clearly unrealistic) does **not** trigger disclosure; a photorealistic AI still of "the Lehman trading floor" does.

### 5.8 Preserving sources end-to-end (research → script → review → description)

One `sources[]` array, referenced by ID from claims, scenes, and the description builder; the description builder emits a "Sources" block with URLs + access dates; the review UI joins claims to sources side-by-side; the published record keeps the full source list so any later dispute traces back. Nothing in the chain may re-derive a citation from memory — citations only move by reference.

---

## 6. Review workflow

### 6.1 When human review is REQUIRED vs optional (RECOMMENDATION)

**Required (hard gates — publish blocked until cleared):**
1. Any medical/health topic or claim touching the medical misinformation categories (policy scope quoted in §5.6).
2. Any `conflicting` or `flagged` claim; any `unverified` numeric claim in a gated niche (finance/health/legal).
3. `disclosure.synthetic_media_required=true` (user must check the disclosure box per §5.7).
4. First N videos of a new tenant channel (N=5 default; trust-ramp rationale per `youtube-upload-quota-research-2026-09.md` — new channels face tighter spam filtering and monetization review).
5. Copyright-risk flags above threshold (lyrics, news footage, long quotations).
6. New source domain not on the tenant's allowlist.

**Optional (tenant opt-in):** evergreen, low-risk scripts with all claims `verified`, 2+ sources, no disclosure — tenant can enable "auto-schedule after QA pass" for lane (C) calendar automation.

### 6.2 What the review UI must show

- **Script + sources side-by-side:** scene text left; the joined `sources[]` right, with claim↔source links highlighted on hover/selection.
- **Flagged-claims panel:** every non-`verified` claim with its status, why (no supporting chunk / conflicting sources / date-stale / numeric-unsourced), and a one-click accept-edit-or-drop action.
- **Provenance chips on every number** (MEASURED / PROXY / HEURISTIC / ESTIMATE + fetch date) per §2.3.
- **Disclosure checklist** in the official four-category wording (§5.7) with the asset provenance that triggered it.
- **Diff vs previous revision** (script records are versioned; claims/sources change over revisions).
- **Final gate checkboxes:** sources verified · disclosure set correctly in Studio · copyright cleared · measured/estimate labels intact.
- **For lane (C) calendar:** a queue view (date, topic, score, tier, risk flags, review state) so scheduled research produces a reviewable content calendar rather than auto-publish.

---

## 7. Risks / gaps (honest)

1. **The search bucket is per project.** FACT-verified constraint; at platform scale, new-query discovery saturates first. Mitigations (batching via autocomplete dedupe, tier discipline, additional audited projects) are RECOMMENDATIONS with real engineering cost.
2. **Aggregation ban shapes the architecture** (III.E.2.a): no cross-tenant "what's hot overall" product built from API Data — tempting product idea, legally unavailable without per-owner grouping.
3. **30-day refresh-or-delete** for all raw API payloads (III.E.4.d) means the DB design must separate raw snapshots (TTL) from derived records (persistent). Getting this wrong is a compliance bug, not just hygiene.
4. **Google Trends API alpha is gated** with unpublished quota/pricing; access timing uncontrolled (applicants reported waiting as of Nov 2025 — anecdotal). pytrends/RSS fallbacks are proxy/lower-bound data and must stay labeled as such.
5. **Reddit is commercially restricted** (free tier non-commercial; exact clause text UNVERIFIED — primary page unfetchable today). Using it in a paid platform without an agreement is a licensing risk, not a gray area.
6. **NewsAPI free tier is dev-only** — a production deployment on it violates their FAQ terms outright.
7. **LLM verification ceiling:** no configuration of judges guarantees factual accuracy; the defense is retrieval + 2-source rules + honest status labels + human gates. Claims of "AI fact-checked" in marketing would be a trust violation — say "source-linked" instead.
8. **videos.list id-list cap (50/call) not stated on today's docs fetch** — verify empirically before finalizing batch sizes (budget math above already hedges).
9. **GDELT terms-of-use text unverified** (project site unfetchable today); corroborated only as free + 1 req/5s via third parties and live 429. Confirm terms before production reliance.
10. **Copyleaks pricing unverified** (403 today) — external plagiarism APIs remain a defer decision, not a plan input.

## 8. Open questions

1. Apply for the Trends API alpha now? (Free; decides whether `search_interest` is MEASURED or PROXY at v1 launch.)
2. Reddit: license (cost unknown — unpublished) or drop for v2? Comments + autocomplete may cover the audience-question use case at $0.
3. Multi-GCP read-project strategy for >50 tenants: acceptable posture, or audit the main project for a higher bucket? (Audit grants are discretionary; timeline weeks–months per prior quota research.)
4. Template-system contract owner alignment: confirm the `scenes[]` → beats compiler split (this doc defines only the script-side contract).
5. GNews paid-tier pricing (docs page carries limits but no prices) — pull the pricing page before any budget commitment.
6. Analytics API default daily quota number not published on the docs pages fetched today (cost is per-query, server-evaluated) — verify in the tenant GCP console at connect time.

## Sources (fetched 2026-10-24 unless noted)

1. https://developers.google.com/youtube/terms/developer-policies — exact policy clauses: 30-day storage (III.E.4), aggregation ban (III.E.2.a), derived-metrics rule (III.E.4.h), scraping ban (III.E.6/III.I.14), search-results handling (III.C.5), attribution (III.F.2), selling ban (III.G.1), 7-day deletion duties (III.D.2.c.1/III.E.4.g).
2. https://developers.google.com/youtube/v3/determine_quota_cost — bucket structure: 100 search.list calls/day + 100 videos.insert/day own buckets; 10,000 units/day everything else; per-method costs.
3. https://developers.google.com/youtube/v3/docs/search/list — search parameters; 100-calls/day bucket quote; `totalResults` approximation; playlistItems recommendation for recent videos; 500-video channelId cap.
4. https://developers.google.com/youtube/v3/docs/videos/list — `chart=mostPopular`, `regionCode`/`videoCategoryId` chart-only, `statistics` part, 1-unit cost, maxResults 1–50.
5. https://developers.google.com/search/apis/trends + https://developers.google.com/search/blog/2025/07/trends-api (announced Jul 2025, via search snippets) — official Trends API alpha: gated, 5-year window, consistently-scaled values, daily granularity.
6. https://trends.google.com/trending/rss?geo=US — live fetch today: RSS works; 9 items; `ht:approx_traffic` ("20000+"); linked news items.
7. https://github.com/GeneralMills/pytrends — "Pseudo API for Google Trends… only good until Google changes things" (unofficial status; fetched via search snippets; reliability anecdotes from 2025–2026 secondary sources).
8. https://newsapi.org/pricing — free tier: 100 req/day, 24h delay, localhost CORS; FAQ: dev-environment-only; paid $449/mo+.
9. https://docs.gnews.io/ — free plan: 100 req/day, 10 articles/req, 30-day archive, 12-hour delay, truncated content.
10. https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/ (site unfetchable today; corroborated via search snippets) + https://www.drkblake.com (1-per-5s rate limit quote) + live 429 from api.gdeltproject.org — GDELT free full-text news API, 15-min global cadence.
11. https://support.reddithelp.com/hc/en-us/articles/16160228947852-Reddit-Data-API-Wiki (403 today; May-2026-dated content via snippets) + https://www.redditinc.com/policies/data-api-terms (unfetchable today — exact text UNVERIFIED) — free tier 100 QPM with OAuth, non-commercial; commercial = paid agreement; Responsible Builder Policy.
12. https://support.google.com/youtube/answer/14328491 — AI/synthetic content disclosure: four categories quoted; exemptions (scripts/thumbnails/voice cloning) quoted; consequences; disclosure does not limit reach.
13. https://support.google.com/youtube/answer/13813322 (via web reader today) — medical misinformation policy: three prohibition categories aligned to Local Health Authority guidance; EDSO/personal-experience/counter-speech exceptions; strike consequences; scope includes descriptions/thumbnails/comments.
14. https://support.google.com/youtube/answer/10834785 — misinformation policies overview (election misinformation is a formal policy area; via search snippet).
15. https://en.wikipedia.org/wiki/Portal:Current_events — live fetch today: daily structure, topic sections, inline citations; CC BY-SA.
16. https://developers.google.com/youtube/analytics/reference + /getting-started — `yt-analytics.readonly` scope verified; per-query quota server-evaluated; owner-only authorization.
17. Repo files read today (FACTS, not external): `trend-research.mjs` (search-loop + 1-day JSON cache, verified lines 11–91), `studio/lib/data.mjs:95-97` (JSON consumption), `explainer/public/lf-investors-compass.json` (beats render contract), and prior research docs: `python-rag-audit-2026-10-17.md`, `youtube-upload-quota-research-2026-09.md`, `youtube-seo-2026-research.md`, `keyword-ranking-check-2026-09-27.md`, `long-video-fast-monetization-research-2026-09.md`, `youtube-growth-playbook-2026-09.md` (July 2025 inauthentic-content context).
18. arXiv (Jan 2026) "How to Correctly Report LLM-as-a-Judge Evaluations" + Databricks LLM-judge pitfalls post (via search snippets) — judge-bias/limitations grounding for §5.2.
