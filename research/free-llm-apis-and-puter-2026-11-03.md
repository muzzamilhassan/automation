# Free LLM API sources vs our pipeline — awesome-free-llm-apis + Puter.js — 2026-11-03

Read-only research round, owner request: "review these two sites and tell me how we can use them, totally free." No code changed. Facts fetched from both sites 2026-11-03 via direct read; repo facts from the 2026-11-03 reconnaissance (see `chatgpt-python-first-stack-review-2026-11-03.md` §2).

---

## 0. TL;DR verdicts

| # | Question | Verdict | One line |
|---|---|---|---|
| 1 | awesome-free-llm-apis — useful to us? | **YES — high value, zero-code fit** | It is a curated list of permanent-free, OpenAI-compatible LLM APIs — exactly the kind of data our Phase-2 provider catalog + BYOK routing already ingests. 3 of our 5 current chain lanes are ON this list (Gemini, Groq, Mistral). |
| 2 | Which new providers should we adopt? | **2–3 adds, as data rows** | NVIDIA NIM (10,000 req/day — the standout), Z AI GLM-4.7-Flash (international endpoint), Cloudflare Workers AI (10k neurons/day). Insert after Mistral, before the disqualified HF lane. |
| 3 | Which to skip, and why? | Cohere (non-commercial-only trial = unusable for monetized channels), ModelScope + SiliconFlow (mainland-China identity verification), OpenRouter free tier (50 req/day is too thin to be a lane). | |
| 4 | Puter.js — useful to us? | **NOT for the pipeline; park it** | It is a browser SDK with a "User-Pays" model: no human user signs in during a GitHub Actions job, so its free credits can't be tapped headlessly. Only niche use: owner-logged-in Studio AI features. |
| 5 | Do we need to build anything to use the good parts? | **NO** | Provider adds are catalog/vault data + a test-on-save probe — the exact mechanism Phase 2 shipped (#104). Per the no-static-maps directive, providers are data, never code. |

---

## 1. What the pipeline actually needs from free LLM APIs (ground truth)

- **Script generation** is the only LLM-consuming lane: ~16–30 produce runs/day at 16–30 channels × 1–3 calls (generation + retry walk) ≈ **30–90 calls/day** — tiny against every rate limit below. The brain (`/context`, `/dedupe`, embeddings) is local-model + SQL: no LLM API. TTS is Python/Kokoro/edge-tts: no LLM API.
- **Current chain (5 lanes, `lib/ai-adapter.mjs` + `studio/lib/provider-catalog.js`):** Gemini → Groq → Cerebras (trial credits, "opportunistic") → Mistral → HF router (**disqualified as a free lane 2026-10-28**, kept only for byte-identical ordering). That means the effective deep chain is 3–4 lanes; depth restoration is genuinely valuable — one rate-limit storm on Gemini+Groq currently leaves little behind it.
- **Mechanism that ingests new providers already exists** (Phase 2, #104): `providers` capability matrix as data, `provider_configs` in the BYOK vault (masked keys, test-on-save, per-capability priority + fallback order), universal OpenAI-compatible adapter, `usage_events` ledger. Adding a provider = **data rows + key, zero code**.

## 2. awesome-free-llm-apis (github.com/mnfst/awesome-free-llm-apis)

**What it is:** a maintained list of **permanent** free-tier LLM APIs (trial credits and promos deliberately excluded), nearly all **OpenAI SDK-compatible** — meaning our universal adapter can call every one of them without code changes. Each entry ships base URL, models, context, modality, and rate limits with dated footnotes.

**Already in our chain and on the list:** Gemini (free tier, 1M-context Flash family), Groq (30 RPM / 1,000 RPD on gpt-oss-120b), Mistral (free mode, ~1 RPS / 500K TPM). Also listed and worth noting: Cerebras is **absent** — consistent with our catalog's own note that Cerebras free tier is trial credits, not permanent. This validates treating Cerebras as opportunistic-only.

### Adopt candidates (ranked)

| Provider | Free allowance | Why it fits | Caveat to record in catalog |
|---|---|---|---|
| **NVIDIA NIM** (`integrate.api.nvidia.com/v1`) | **40 RPM, 10,000 RPD**, 100+ models (gpt-oss-20b, Gemma 4, nemotron-3-ultra 550B w/ 1M ctx) | The deepest safety net on the list — 10k/day is 100× our worst-case day. Free with a (free) NVIDIA Developer Program membership | Per-model rate limits; trial-use logging condition quoted by NVIDIA ("use is logged… to improve NVIDIA products") — same class as Gemini free tier, acceptable for script text, never for secrets |
| **Z AI GLM-4.7-Flash** (`api.z.ai/api/paas/v4`, international endpoint) | Free, 1 concurrent request, 200K ctx, reasoning | Big 128K max-output reasoning model, permanent-free, works from Pakistan (no China-only verification for chat API) | GLM-4.5-Flash retirement shows model churn — pin GLM-4.7-Flash; single-concurrency is fine for our serial pipeline |
| **Cloudflare Workers AI** (`/ai/run`) | 10,000 Neurons/day shared, 60+ models incl. gpt-oss-120b, llama-4-scout, deepseek-r1-distill | Strong diversity hedge; overage fails rather than billing | Neuron accounting is opaque (shared bucket); 7 flagship models excluded from free; endpoint is per-account, slightly non-standard path but still OpenAI-shaped |
| Kilo Code (`api.kilo.ai/api/gateway`) | **No API key at all**, 200 req/hr | Zero-setup emergency lane | Free pool rotates without notice; docs warn routing "may log prompts and outputs"; catalog lags reality. Emergency-only, lowest priority |
| LLM7.io (`api.llm7.io/v1`) | Free token: 60 RPM, 250 req/hr, 100k tokens/24h | Anonymous/one-key simplicity | Catalog rotates frequently; quota can drop without notice. Backup-only |

### Skip (with reasons — keep these in the catalog notes so nobody re-adds them)

| Provider | Why skip |
|---|---|
| Cohere trial | **1,000 calls/month AND non-commercial only** — our channels are monetized; unusable |
| ModelScope (Qwen) | Requires Alibaba Cloud binding + **real-name verification**; untestable outside mainland China |
| SiliconFlow | Free models require **mainland-Chinese identity verification** (since May 2026) |
| OpenRouter `:free` pool | 20 RPM but only **50 req/day** across all free models (1,000 RPD needs ≥10 credits bought) — too thin to be a lane; and our 5th lane slot is already a gateway (HF) with the same logging caveats |
| Aion Labs | Roleplay/storytelling specialist, 20K tokens/day — wrong shape for script-gen volume; keep on the radar only if we ever do narrative longform experiments |
| Gonka Broker | Phone-verified, ~1M tokens/mo shared, rotating governance lineup — fine but redundant once NIM/Z-AI/CF are in |

### Known risks to encode (all manageable, all already our style)

1. **Prompt logging/training on free tiers** — Gemini free (Google may use prompts), Mistral free mode (opt-out available), NVIDIA/Kilo/OpenRouter free (logging). Our policy already covers this: brand kits and scripts are non-sensitive; **no key material, no credentials in prompts** (unchanged).
2. **Model churn** — GLM-4.5-Flash retired, LLM7 rotates, Kilo pool shifts, Gemini publishes no per-model free limits anymore. Mitigation already exists: `provider-catalog.js` carries **dated facts per provider** and test-on-save probes at key-add time; master-plan constraint 8 says re-verify at implementation.
3. **Per-key concentration** — all limits are per key/account; one key per provider, and the fallback order handles exhaustion. `usage_events` will show which lane actually carried each script.
4. **ToS** — every adopted provider must permit commercial use of output; all three adopt-candidates do (NVIDIA dev program, Z AI, Cloudflare Workers free). Cohere's non-commercial clause is exactly why it's skipped.

## 3. Puter.js (developer.puter.com)

**What it is:** a serverless, **keyless** JavaScript SDK for browser apps: AI gateway (500+ models — OpenAI/Claude/Gemini/Grok/DeepSeek), auth, storage, NoSQL DB, hosting. Its "free" is the **User-Pays model**: the developer pays $0 because each **signed-in end user** spends their **own** allocated Puter credits (and pays Puter directly for overage).

**Why it does not fit our production pipeline:**

1. **No human user exists in the loop.** Our LLM calls happen inside headless GitHub Actions jobs. Puter's credits unlock after *a user signs in to Puter* — there is no browser and no signed-in user in CI. Its free model simply cannot be tapped by our pipeline as designed.
2. **It is a frontend SDK** ("brings cloud and AI capabilities directly to the frontend code"). Our pipeline is Node-on-Actions + a tiny FastAPI sidecar; wiring a browser SDK into CI would be fighting its architecture.
3. **Limits for headless/automation use are not published** — the generous numbers are per-user app allocations, not automation quotas. Routing monetized-channel production through it would hang the pipeline off an unofficial pattern — against our reliability principles (dated facts, test-on-save, fail-open policies).
4. **Self-hosting Puter doesn't help** — a self-hosted gateway still needs upstream model keys, i.e. it adds a component without adding free capacity.

**Where it could have a niche later (park, don't build):** a Studio feature where the **owner is logged in anyway** (e.g., an AI-thumbnail-background tool, a strategy chat, a "create video" wizard) could ride the owner's own Puter credits at $0 platform cost — same shape as the User-Pays model intends. Even then it competes with our existing AGNES key and BYOK vault, which already do this with auditable `usage_events`. Verdict: **park**; revisit only if a Studio-side AI feature wants zero-key prototyping in the browser.

## 4. How we would actually use the free APIs (the concrete path — needs owner approval before any change)

Planning-first: nothing below runs without an approved spec. The shape, when approved:

1. **Spec a small Phase-2-style slice** — "restore chain depth with permanent-free lanes." EARS criteria: new lanes activate only in fallback order; every call lands in `usage_events` with provider/model; a dead lane is skipped in <timeout and logged; MR pilots first (owner directive: pilot on money-rulebook).
2. **Add data rows to `providers`** (capability `script-gen`, dated facts from this research + fresh verification at implementation per constraint 8) and **keys to the BYOK vault** (owner creates: NVIDIA Developer Program key, Z AI key, Cloudflare Workers AI key — all free, no credit card).
3. **Set fallback order** in provider routing: Gemini → Groq → Cerebras (if alive) → Mistral → **NVIDIA NIM** → **Z AI GLM-4.7-Flash** → **Cloudflare Workers AI** → Kilo (emergency) → HF (ordering-compat only). Per-channel override lets MR pilot a new lane explicitly.
4. **Pilot protocol (MR-first):** force one MR produce with a per-channel override onto the new lane → verify script quality + dedupe gate + publish; then let natural fallback exercise it for 2–3 days; watch `usage_events`.
5. **Catalog hygiene:** record skip-reasons (§2 table) in the catalog notes so dead ends aren't re-explored; re-verify the three adopt candidates' limits on implementation day.

**Cost after all of this: $0.** Every adopted lane is a permanent free tier with no credit card; the only spend is minutes of owner setup time creating three free keys.

## 5. Source register

- https://github.com/mnfst/awesome-free-llm-apis (full list + footnotes, fetched 2026-11-03) — all rate-limit figures above come from its tables/footnotes dated 2026-08→10.
- https://developer.puter.com/ (fetched 2026-11-03) — User-Pays model, keyless SDK positioning, 500+ model gateway.
- Repo: `studio/lib/provider-catalog.js` + `provider-routing.js` (Phase-2 dated provider facts + routing), `lib/ai-adapter.mjs` (universal OpenAI-compatible adapter + fallback chain + usage_events), HF-router disqualification 2026-10-28 (chain state), `chatgpt-python-first-stack-review-2026-11-03.md` §2 (pipeline ground truth).

## 6. Residual uncertainties

- Cerebras lane's current aliveness (trial credits) — check `provider-catalog.js` dated facts at implementation.
- NVIDIA NIM membership approval time for the Developer Program (usually instant, unverified today).
- Cloudflare Neurons-per-request accounting per model (opaque; measure via a test call if adopted).
- Whether Z AI international endpoint rate-limits differ from the CN platform's "1 concurrent" figure (footnote-derived; probe at key-add).
