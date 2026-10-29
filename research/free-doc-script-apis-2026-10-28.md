# Free doc-script API platforms — output-token research 2026-10-28

**Scope:** which FREE API platforms can write ONE complete documentary script per channel per day for 15 faceless channels (one Gmail per channel → one free key per channel per platform), in a SINGLE call, without truncating the long script JSON. Tonight's failure: Groq cut the JSON mid-array at ~2,700–6,977 chars; Gemini returned empty. Owner constraint: NO chunked/split generation in the main flow — single-call completion is the requirement; chunking only as last-resort fallback. Builds on `free-script-brains-2026-09.md` and `platform-byok-providers-2026-10-24.md` §1; every time-sensitive number re-verified against official pages **fetched 2026-10-28** unless dated otherwise. Unverifiable numbers are marked **unverified**, never guessed.

---

## 0. TL;DR verdict table

| Rank | Platform | Max output/response | Daily quota per key | Clears the ≥8,192 bar? | Verdict |
|---|---|---|---|---|---|
| 1 | **Google Gemini API (free tier)** — `gemini-3.8-flash` | **65,536** | Per-**project**; last published: 250 RPD (flash) / 1,000 RPD (flash-lite), Dec-2025 archive | ✅ | **PRIMARY.** Biggest output cap of any free platform; 15 Gmails = 15 projects = ×15 quota. **Trains on free-tier prompts.** |
| 2 | **Groq** — `openai/gpt-oss-120b` | **65,536** (hard cap; code currently caps itself at 6,000) | 1,000 RPD / 200K TPD / 8K TPM (Developer base) | ✅ | **FALLBACK #1.** 8K TPM forces ~1 call/2 min pacing — fine for 1 doc/channel/day. Must raise `max_tokens` + set `reasoning_effort: "low"`. |
| 3 | **Cloudflare Workers AI** — `@cf/openai/gpt-oss-120b` | undocumented ceiling; **default `max_tokens` is 256** — must be set explicitly | 10,000 neurons/day ≈ **20–45 doc scripts** | ✅ (with explicit max_tokens) | **FALLBACK #2 (NEW in chain).** OpenAI-compatible endpoint; no card; cheap per script in neurons. |
| 4 | **Mistral La Plateforme** (free mode) | unverified (console-only) | "Included monthly usage" — numbers moved into per-account console | unverified | **FALLBACK #3.** Free tier confirmed to exist; exact quotas no longer published. |
| 5 | **Cerebras** (Free Trial) | unverified on page | $5 credits **expiring in 30 days**; 1M TPD while credits last | ✅ while credits last | **Opportunistic only.** No longer a durable free tier. |
| — | OpenRouter `:free` | per-model, unlisted | 50 RPD (1,000 RPD after $10 lifetime credits); 20 RPM | per-model, unlisted | **Last resort only.** 2026 free lineup has no frontier-class writer (small/exotic models). Explicitly blocks limit-boosting via extra accounts. |
| — | NVIDIA NIM | unverified | free credits for Developer Program members; ~40 RPM (community) | unverified | Marginal; numbers unofficial. |
| — | Together.ai — Ternary Bonsai 27B | unverified | limits unpublished | unverified | Marginal; 27B quality tier too weak for 1,500-word structured doc JSON. |
| ❌ | Cohere trial key | — | 1,000 calls/month, 20/min | n/a | **DISQUALIFIED — trial keys "may not be used for production or commercial purposes."** |
| ❌ | Hugging Face Inference Providers | — | **Free users get NO monthly credits** (verified today) | n/a | **DISQUALIFIED as free lane.** Remove from chain; Llama-3.1-8B was quality-inadequate anyway (Sep file). |
| ❌ | GitHub Models | — | **Retired 2026-07-30** ("playground, model catalog, inference API, and BYOK … no longer available") | n/a | **DEAD** — confirms Sep finding. |
| ❌ | SambaNova Cloud | — | pricing page shows paid per-token only | n/a | **No free tier.** |

**Recommended chain for `yt-deepdive.mjs`:** Gemini `gemini-3.8-flash` (maxOutputTokens 16384) → Gemini `gemini-3.5-flash-lite` → Groq `gpt-oss-120b` (max_tokens 16000, reasoning_effort low) → Cloudflare `@cf/openai/gpt-oss-120b` (max_tokens 8000) → Mistral → OpenRouter `:free` (last resort). HF: remove. With 15 Gmail keys per platform: **>100 doc scripts/day per channel of quota headroom — quota stops being the constraint; the constraint was output-cap misconfiguration + a retired model name.**

---

## 1. Sizing math (from the actual code, not estimates)

### 1.1 What `yt-deepdive.mjs` actually asks for

The prompt (yt-deepdive.mjs lines 91–96) requires exactly:

```json
{"title":"<=60 chars","intro":"2 sentence cold-open",
 "chapters":[{"title":"<=40 chars","text":"120-150 words"}],   // EXACTLY 8 chapters
 "outro":"2 sentences with a natural subscribe push"}
```

| Component | Words | Tokens (×1.3–1.5/word) |
|---|---|---|
| 8 chapters × 120–150 words narration | 960–1,200 | 1,250–1,800 |
| intro (2 sent.) + outro (2 sent.) | ~30–70 | 40–105 |
| episode title + 8 chapter titles | ~50–76 | 65–115 |
| JSON scaffolding (`{"title": "…", "text": "…"}` keys, braces, commas ×9 objects) | — | ~110–150 |
| **Total visible completion (current shape)** | **~1,040–1,350** | **~1,465–2,170** |
| Owner's bigger target (1,800-word narration) | ~1,900 | ~2,600–3,300 |

### 1.2 Why tonight truncated anyway (the real failure analysis)

1. **Gemini layer: the model is GONE from the catalog.** `yt-deepdive.mjs` line 54 calls `gemini-3.5-flash`. The models page fetched today lists `gemini-3.8-flash`, `3.6-flash`, `3.5-flash-lite`, `3.1-flash-lite` — **`gemini-3.5-flash` is no longer listed**. An unlisted/retired model id → empty/missing candidates → the observed "Gemini returned empty". (Secondary suspect: `responseMimeType: application/json` + safety refusal.)
2. **Groq layer: the code starves a reasoning model.** gpt-oss-120b emits hidden reasoning before the answer, and Groq's docs warn the default budget "may be too low for complex reasoning — consider increasing" (console.groq.com/docs/reasoning, fetched today). With `max_tokens: 6000` (line 69), ~4,000+ reasoning tokens leave <2,000 visible tokens ≈ 6–8k characters — **exactly the observed 2,700–6,977-char mid-array truncation**. (Exact reasoning-vs-completion accounting not spelled out in docs — mechanism marked unverified, observed behavior consistent.)
3. **HF layer:** Llama-3.1-8B at `max_tokens: 4000` was already flagged as a long-JSON truncator in Sep, and HF free monthly credits are now **zero** (verified today) — the layer is doubly dead.

### 1.3 The threshold

- Hard minimum for the platform's max-output cap: **≥4,000** (current shape + JSON-repair retry headroom) — the code's own HF setting.
- **Comfort bar: ≥8,192** (covers the owner's 1,800-word scale-up, reasoning-model overhead, and a full re-write retry without touching the cap).
- Recommended `max_tokens` to SEND: **16,000** (Groq/Gemini), **8,000** (Cloudflare/Mistral, ceilings undocumented).
- **Chunking verdict: unnecessary.** Every qualifying platform's cap (65,536) exceeds the worst-case requirement (≈3,300) by >15×. The owner's no-chunking constraint is safe to honor permanently.

---

## 2. The big comparison table (all numbers fetched 2026-10-28)

| Platform | Max output tokens/response (the #1 column) | Free daily/monthly quota | Free models (long-JSON quality tier) | JSON mode | Card? | Trains on your prompts? | 15 keys possible? |
|---|---|---|---|---|---|---|---|
| **Gemini API** | **65,536** (3.8-flash & 3.5-flash-lite, both verified on model pages) | Per **project**; RPD unpublished since Dec-2025 ("limits … viewed in AI Studio"); last published: flash 250 RPD, flash-lite 1,000 RPD | 3.8-flash **A-**, 3.6-flash A-, 3.5-flash-lite **B+** — all free-tier | ✅ JSON mime + responseSchema | No | **YES — free tier "Used to improve our products"** (paid: No) | ✅ one Google account (Gmail) per channel → one project each → per-project quota ×15 |
| **Groq** | **65,536** (gpt-oss-120b & 20b; production models table) | Developer base: 30 RPM / **1,000 RPD** / 8K TPM / 200K TPD; Free-plan table not rendered in console fetch (**unverified**) | gpt-oss-120b **A−** (strong writer, but reasoning model), qwen3.8-27b B (preview, 16,384 cap) | ✅ JSON mode + structured outputs (Sep verification) | No | No by default (Services Agreement, cited in 10-24 file) | ✅ one Groq account (org) per Gmail → org-scoped quotas ×15 |
| **Cloudflare Workers AI** | Ceiling undocumented on model page; **default max_tokens = 256** — must send explicitly | **10,000 neurons/day**, reset 00:00 UTC | `@cf/openai/gpt-oss-120b` **A−**, `@cf/meta/llama-3.3-70b-instruct-fp8-fast` **B+** (no reasoning overhead) | ✅ via prompt + response_format (OpenAI-compatible) | No | unverified | ✅ one CF account per Gmail → per-account daily allocation ×15 |
| **Mistral La Plateforme** | unverified (mistral-small-latest historically ~32k — not re-verified) | "Free mode … included monthly usage within the limits shown on the Limits page" — numbers now console-only per account (**unverified**; community: ~1B tokens/mo, ~1 RPS) | mistral-small-latest **B** | ✅ (Sep verification) | No | Opt-in historically required (**unverified today**) | ✅ one account per Gmail → per-org limits ×15 |
| **Cerebras** | not published on overview page (**unverified**; model pages hold specs) | Free Trial: 5 RPM / 30K uncached TPM / 90K total TPM / **1M TPD** — **$5 credits expire after 30 days** | gpt-oss-120b **A−** (free context 65k), qwen-3.8-27b B | ✅ OpenAI-compatible (Sep) | unverified | unverified | ✅ per-account, but 30-day expiry makes ×15 moot for a durable chain |
| **OpenRouter `:free`** | per-model, not listed on free-models page (**unverified**) | 20 RPM; **50 RPD**, or **1,000 RPD** with ≥$10 lifetime credits | Today's free lineup: Recursive Flint (40B MoE, 2.5B active), Baseten Mammoth 27B, Elephant 9B — **quality tier C for documentary prose** | ✅ OpenAI format | No | per routed provider | ❌ **anti-multi-account**: "extra accounts or API keys won't raise these limits" (governed globally) |
| **NVIDIA NIM** | per-model, unverified | free hosted endpoints for Developer Program members; ~40 RPM default, credits-expiry notices (forums/community — **unverified officially**) | frontier catalog (Llama/DeepSeek/Nemotron) | ✅ OpenAI-style | No | unverified | ✅ per account (NVIDIA account per Gmail) |
| **Together.ai** | unverified | Ternary Bonsai 27B at **$0.00/$0.00**; rate/output limits not published | Ternary Bonsai 27B **C** — too weak for this job | unverified | No | unverified | ✅ per account |
| **Cohere** | unverified (Command A family) | trial: **1,000 calls/month**, 20/min | Command A **A−** — but… | ✅ | No | **No** — enterprise data commitments cover trial keys ("prompts and generations will not be used to train") | ✅ per account — **but see disqualification** |
| **HF Inference Providers** | per routed provider | **Free users: "None"** monthly credits (verified today); PRO $2/mo → $2 credits | whatever the provider hosts | via provider | No (credits purchase required for free users) | per provider | n/a |
| **GitHub Models** | — | **RETIRED 2026-07-30** | — | — | — | — | — |
| **SambaNova** | — | none shown on pricing page | — | — | — | — | — |

---

## 3. Per-platform detail (evidence + caveats)

### 3.1 Google Gemini API — PRIMARY
- Output cap **65,536** per response on both `gemini-3.8-flash` and `gemini-3.5-flash-lite` (model pages, fetched today); context 1,048,576 both.
- Free tier confirmed for both models on the pricing page ("Standard tier marked Free of charge"), with **"Content used to improve our products" = Yes on free tier, No on paid** — surface this to the owner; scripts are original prose so exposure is niche/topic-level, not secret data.
- RPD: **no longer published** — "rate limits are applied per project, not per API key", "viewed in AI Studio", RPD resets midnight PT (rate-limits page, fetched today). Last published table (Dec-2025 archive, via 10-24 file): 2.5-flash 250 RPD, flash-lite 1,000 RPD — treat as orientation only.
- **Key strategy:** one key per Google account; the owner's one-Gmail-per-channel setup yields 15 independent projects → 15 × per-project RPD. No card. Note Google's May-2026 "auth keys" shift (unrestricted keys rejected) from the 10-24 file when validating keys.
- **Quality note:** 3.8-flash is the strongest free writer in this table; flash-lite is faster/larger-RPD but visibly weaker at long structured storytelling — use 3.8 first, lite as the same-adapter fallback.

### 3.2 Groq — FALLBACK #1 (fixable tonight)
- **65,536 max completion tokens** for gpt-oss-120b/20b (production models table, fetched today) — the platform cap is NOT the problem; the code's `max_tokens: 6000` + default reasoning effort is.
- Developer-plan base limits (published table): gpt-oss-120b 30 RPM / **1,000 RPD** / **8K TPM** / 200K TPD. A doc call ≈ 0.7K in + 2.5–6K out → fits in one 8K TPM bucket; **pace ≥1 call per 2 minutes** or retries 429. 200K TPD ÷ ~3,300 ≈ **60 scripts/day per key** (token-bound, not request-bound). ×15 Gmail-org keys → ~900/day fleet-wide.
- Fix in code: `max_tokens: 16000`, `reasoning_effort: "low"` (supported for GPT-OSS per docs), keep 3-attempt loop. Groq's reasoning docs warn defaults "may be too low for complex reasoning".
- Free-plan console numbers didn't render in either today's fetch or the 10-24 fetch — published Developer base is the safe floor. No card (Sep verification).

### 3.3 Cloudflare Workers AI — FALLBACK #2 (NEW in chain)
- **10,000 neurons/day free**, reset 00:00 UTC (pricing page, fetched today). Cost per doc script: gpt-oss-120b at 68,182 neurons/M output ≈ 170 neurons per 2,500 visible tokens + 16 for 500 input → **~200–450 neurons/script incl. reasoning** → **~22–45 scripts/day per account**. `llama-3.3-70b-fp8-fast` (204,805 neurons/M out) ≈ 512/script → ~19/day — viable non-reasoning alternative.
- Models: `@cf/openai/gpt-oss-120b` (128k context), llama-3.3-70b-fp8-fast. **`max_tokens` defaults to 256** on the model page — sending it explicitly is mandatory (this is exactly the class of silent truncation that hit Groq tonight); ceiling undocumented → set 8,000 and confirm.
- OpenAI-compatible endpoint `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions` with CF API token as bearer — corroborated by community threads + cloudflare-docs repo; **the official docs page 404'd from this environment (fetch failed) — endpoint shape unverified-direct**.
- Data-training policy: **unverified**. One CF account per Gmail → ×15. No card for the free daily allocation.

### 3.4 Mistral La Plateforme — FALLBACK #3
- Free mode confirmed: "Free mode lets you create API keys and use included monthly usage within the limits shown on the Limits page" (docs, fetched today). **All numeric quotas moved into the per-account console** — the old "~1B tokens/month Experiment tier" (Sep file) is community-level now, **unverified**. mistral-small-latest max output cap not re-verified today.
- Keep as mid-chain fallback; the existing `mistral-small-latest` adapter in `youtube-engine.mjs` (line 431) is reusable.

### 3.5 Cerebras — opportunistic only
- Free tier renamed **Free Trial** with **"$5 in free credits" that "expire 30 days after being granted"** (rate-limits page, fetched today) — this is a DOWNGRADE from the Sep reading (durable 1M TPD). 5 RPM / 30K uncached TPM / 90K total TPM / 1M TPD while credits last. Free context: gpt-oss-120b 65k, qwen-3.8-27b 64k (overview page). Max output not published on the overview — per-model pages hold specs (**unverified**).
- Verdict: fine as a 30-day booster after each (re)signup; do NOT build the chain's reliability on it.

### 3.6 The disqualified lane (why each was cut)
- **Cohere:** trial keys are free and Command A is strong, but the pricing page states trial keys **"may not be used for production or commercial purposes"** — monetized channels are out of bounds regardless of the 1,000 calls/month. (Data commitments do say trial-key prompts are not trained on — irrelevant given the license bar.)
- **Hugging Face:** free users now get **"None"** monthly credits (pricing doc, fetched today). The old free lane is a pay-per-token router now. Also Llama-3.1-8B was the known long-JSON truncator. Remove `HF_TOKEN` from `llmScript`.
- **GitHub Models:** "As of July 30, 2026, GitHub Models has been fully retired… playground, model catalog, inference API, and BYOK are no longer available to any customer."
- **SambaNova:** pricing page lists per-token prices only; no free tier shown — matches the Sep finding (free folded into a payment-method Developer tier).
- **OpenRouter `:free`:** mechanically alive (20 RPM, 50/1,000 RPD) but the free model list today is Flint/Mammoth/Elephant-class — no frontier writer for 1,500-word structured doc JSON; per-model output caps unlisted. Keep ONLY as an emergency last slot. OpenRouter also states extra accounts/keys won't raise limits (globally governed) — the ×15 key strategy does NOT apply to OpenRouter.
- **NVIDIA NIM / Together:** free-ish access exists (NIM for Developer Program members, ~40 RPM community-reported; Together's Ternary Bonsai 27B at $0.00) but output caps are unverified and 27B-class models are below the quality bar for documentary narration. Watchlist, not chain.

---

## 4. Recommended chain + key strategy for `yt-deepdive.mjs`

### 4.1 Chain (longest-output first; drop-in unless noted)

| Slot | Provider/model | Call settings | Code change needed |
|---|---|---|---|
| 1 | **Gemini `gemini-3.8-flash`** | keep `responseMimeType: 'application/json'`; **add `maxOutputTokens: 16384`** (and `thinkingConfig.thinkingBudget: 0` — pattern already used in `hyperframes/gen-pack.mjs` line 51) | model id swap + 2 config keys (same fetch shape, line 54) |
| 2 | **Gemini `gemini-3.5-flash-lite`** | same call, same key or per-channel key | second Gemini attempt — zero new adapter code |
| 3 | **Groq `openai/gpt-oss-120b`** | `max_tokens: 16000`, `reasoning_effort: 'low'`, keep JSON-only retry prompt | 2 param changes (line 69) |
| 4 | **Cloudflare `@cf/openai/gpt-oss-120b`** | `max_tokens: 8000` explicit; OpenAI-compatible POST | new 10-line block cloning the Groq block with CF base URL (after `GROQ_API_KEY` block, before HF slot) |
| 5 | **Mistral `mistral-small-latest`** | `max_tokens: 8000` | copy the adapter from `youtube-engine.mjs` line 431 |
| 6 | OpenRouter `:free` (best available that day) | `max_tokens` per model page | optional; OPENROUTER_API_KEY already in `PROVIDER_ENV` |
| — | **HF Llama-3.1-8B** | — | **REMOVE** (no free credits; known truncator) |

Expected per-channel scripts/day after the fix: **quota ceiling >100/channel/day via Gemini alone** (even at a conservative 100–250 RPD/key), Groq adds ~60/key/day token-bound, CF ~20–45/account/day — against an actual demand of **1 doc/channel/day** (and the code's current doc cadence is *weekly* per channel, Tue/Fri in the clips-first lane, `yt-deepdive.mjs` lines 206–215). Failure of all free slots simultaneously is the only skip scenario; a paid OpenAI key would slot in as slot 0 with zero architectural change (`OPENAI_API_KEY` is already wired through `PROVIDER_ENV` in `lib/channel-keys.mjs`).

### 4.2 Key strategy (15 keys × 3 durable platforms)

- **Mechanism already exists:** `lib/channel-keys.mjs` `PROVIDER_ENV` covers `gemini`, `groq`, `cerebras`, `mistral`, `hf`, `openai`, `openrouter` (+ media providers); per-slug encrypted keys live in `yt-mcp/channel-keys.json` (AES-256-GCM), applied via `applyChannelKeys(slug)` — already called by `channel-pipeline.mjs:53` and `sweeper.mjs:120`, with dead-key drop + shared-key restore (#39).
- **Gap:** `yt-deepdive.mjs` itself does not call `applyChannelKeys(slug)` — it reads raw `process.env.GEMINI_API_KEY/GROQ_API_KEY`. One line at the top of the script (after `resolveBrand`) wires per-channel doc keys into the existing vault pattern. Small, contained change.
- **Creation rules per platform:** Gemini — one API key per **Google project**; one project per Gmail (owner's existing 15 Gmails) → quota multiplies by project, and Google explicitly applies limits "per project, not per API key" (multiple keys inside ONE project do NOT multiply quota — this is the trap to avoid). Groq — one account (org) per Gmail; org-scoped limits. Cloudflare — one account per Gmail; daily neuron allocation is per account. Mistral/Cerebras — same per-account pattern.
- **Rotation discipline:** Google may shut down per-project limits without notice (they already unpublished RPD); log per-slot provider attribution (the `provider:` field returned by `llmScript` today) so drift is visible in state logs.

---

## 5. Risks, gaps, open questions

1. **Root-cause fix is config, not platform-hunting:** the retired `gemini-3.5-flash` id and Groq's `max_tokens: 6000`-on-a-reasoning-model caused tonight's failure. Any platform swap WITHOUT fixing these two lines will reproduce the truncation on the new platform. Highest-confidence, lowest-cost change in this whole report.
2. **Gemini free tier trains on prompts** (verified today, pricing page). Documentary scripts are original prose, but topic seeds and niche strategy flow through the prompt. Paid tier stops this; OpenAI paid tier never trains on API data (per 10-24 file). Owner-visible caveat.
3. **Unpublished quotas are the new normal:** Google (RPD), Groq (free-plan table), Mistral (all numbers), Cerebras (output cap), Cloudflare (output ceiling) — none publish complete numbers publicly anymore. Every per-key capacity number above has an orientation-grade error bar; the chain design tolerates 10× quota drift because demand (1 doc/channel/day) is 100× below capacity.
4. **Reasoning-token accounting on Groq is observed, not documented** — the docs imply reasoning consumes the completion budget but never state it outright. Mitigation is the same regardless: raise `max_tokens`, set `reasoning_effort: 'low'`, and validate output shape with the existing `validEpisode` gate.
5. **Cloudflare endpoint + output ceiling are unverified-direct** (official docs page 404'd from this environment; community-corroborated). Verify with one live 1-token call before wiring the fallback slot.
6. **Trial/expiry drift:** Cerebras credits now expire in 30 days; OpenRouter's free lineup churns (frontier free models vanished since Sep); HeyGen free TTS removal notice observed on OpenRouter — free lanes rot quarterly. Re-run this audit in ~90 days or on the next truncation.
7. **Paid OpenAI future (owner's mention):** no free tier exists ("No free API tier exists", OpenAI pricing, via 10-24 file). A paid key adds: best-in-class JSON discipline, no training on API data, and ~$0.01–0.03 per doc script at current list prices (gpt-4o-mini $0.15/$0.60 per M → ~$0.0006/script; gpt-6.1-sol $2/$10 → ~$0.026/script; output prices per 10-24 file). At 15 docs/day that is $0.01–0.40/day — cheap insurance, zero code change (`OPENAI_API_KEY` slot already exists).
8. **Open question for the owner:** should the doc script prompt grow toward the 1,800-word target (5–10 min at ~150 wpm is already met by 1,000–1,200 words + intro/outro)? If yes, the 65,536-cap platforms absorb it with no further changes; only Cloudflare/Mistral ceilings would need live verification first.

---

## Sources

Fetched 2026-10-28 unless noted:

1. Gemini models catalog (3.8-flash/3.6-flash/3.5-flash-lite/3.1-flash-lite listed; `gemini-3.5-flash` ABSENT; 4-Argon 1M-out) — https://ai.google.dev/gemini-api/docs/models — supported: retired-model root cause.
2. Gemini 3.8-flash model page (output 65,536; input 1,048,576) — https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash — supported: output cap.
3. Gemini 3.5-flash-lite model page (output 65,536; input 1,048,576) — https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite — supported: output cap.
4. Gemini pricing (free tier contents; "Content used to improve our products" Yes-free/No-paid; flash prices) — https://ai.google.dev/gemini-api/docs/pricing — supported: free-tier scope + training policy.
5. Gemini rate limits ("applied per project, not per API key"; unpublished, view in AI Studio; midnight-PT reset) — https://ai.google.dev/gemini-api/docs/rate-limits — supported: per-project key strategy; RPD unpublished.
6. Groq production models (gpt-oss-120b/20b max completion 65,536, ctx 131,072; qwen3.8-27b preview 16,384) — https://console.groq.com/docs/models — supported: output cap.
7. Groq rate limits (Developer base gpt-oss-120b 30 RPM / 1K RPD / 8K TPM / 200K TPD; free-plan tab not rendered) — https://console.groq.com/docs/rate-limits — supported: daily/token quotas.
8. Groq reasoning docs (`reasoning_effort` low/medium/high; "Default may be too low for complex reasoning — consider increasing") — https://console.groq.com/docs/reasoning — supported: truncation mechanism + fix.
9. Cerebras rate limits (Free Trial 5 RPM / 30K uncached TPM / 90K total TPM / 1M TPD; "$5 in free credits" expiring 30 days) — https://inference-docs.cerebras.ai/support/rate-limits — supported: trial-tier demotion.
10. Cerebras models overview (gpt-oss-120b 65k free context; qwen-3.8-27b 64k) — https://inference-docs.cerebras.ai/models/overview — supported: context split by tier; output caps not on page.
11. Mistral usage & limits docs (Free mode with console-only limits; no published numbers) — https://docs.mistral.ai/admin/billing-usage/usage-limits — supported: free-tier existence; numbers unverified.
12. HF Inference Providers pricing (Free users: monthly credits "None"; PRO $2/mo) — https://huggingface.co/docs/inference-providers/pricing — supported: HF disqualification.
13. OpenRouter limits (20 RPM; 50 RPD / 1,000 RPD at ≥$10 lifetime; extra accounts don't raise limits) — https://openrouter.ai/docs/api/reference/limits — supported: free rules + anti-multi-account.
14. OpenRouter free models listing (Flint/Mammoth/Elephant free lineup; no output caps listed) — https://openrouter.ai/models?max_price=0 — supported: free-lineup quality assessment.
15. GitHub Models retirement notice ("fully retired" July 30, 2026) — https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models — supported: dead platform.
16. Cloudflare Workers AI pricing (10,000 neurons/day free; per-model neuron rates incl. gpt-oss-120b 68,182/M out, llama-3.3-70b 204,805/M out) — https://developers.cloudflare.com/workers-ai/platform/pricing/ — supported: daily capacity math.
17. Cloudflare `@cf/openai/gpt-oss-120b` model page (128k context; `max_tokens` default 256, ceiling undocumented) — https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/ — supported: explicit-max_tokens requirement.
18. Cloudflare OpenAI-compat endpoint (base `…/ai/v1`, chat/completions; official page 404 from this environment; corroborated via cloudflare-docs repo PR #23057 + community threads) — https://developers.cloudflare.com/workers-ai/configuration/openai-compatibility/ — supported: drop-in compat (unverified-direct).
19. Cohere rate limits (trial 1,000 calls/month; 20/min chat) — https://docs.cohere.com/docs/rate-limits — supported: trial quotas.
20. Cohere pricing (trial keys "may not be used for production or commercial purposes") + enterprise data commitments (trial-key prompts not used to train) — https://cohere.com/pricing , https://cohere.com/enterprise-data-commitments — supported: disqualification + training policy (via search snippets of official pages).
21. NVIDIA NIM free tier (~40 RPM default, Developer Program free endpoints, credits-expiry reports) — https://forums.developer.nvidia.com/t/nvidia-nim-faq/300317 + rate-limit threads — supported: watchlist status (community-grade, unverified).
22. Together.ai pricing (Ternary Bonsai 27B $0.00/$0.00; limits unpublished) — https://www.together.ai/pricing — supported: marginal status.
23. SambaNova pricing (paid per-token only; no free tier shown) — https://cloud.sambanova.ai/pricing — supported: skip.
24. Repo code (read, not fetched): `yt-deepdive.mjs` lines 42–96 (chain, prompt JSON, caps), `lib/channel-keys.mjs` (PROVIDER_ENV, vault, per-channel apply), `channel-pipeline.mjs:53`, `sweeper.mjs:120`, `PLAN.md:14` (shorts chain), `tests/channel-keys-vault.test.mjs` — supported: sizing math, key strategy, code-change list.
25. Prior research continuity: `research/free-script-brains-2026-09.md` (Sep quotas, Groq TPM pacing finding, HF truncation finding), `research/platform-byok-providers-2026-10-24.md` §1 (archived Gemini RPD table, Groq/Cerebras Developer-tier floors, OpenAI "no free tier", paid output prices).
