# OpenRouter deep-dive — free lane for script-gen — 2026-11-03

Read-only research round, owner request: "research OpenRouter and tell me what things should need." No code changed. External facts fetched from OpenRouter primary docs 2026-11-03 (§7); repo facts verified in the working tree the same day. Builds on `platform-byok-providers-2026-10-24.md` (provider matrix row) and `free-llm-apis-and-puter-2026-11-03.md` (where OpenRouter was skipped as "50 RPD too thin" — **that verdict is revised here**).

---

## 0. TL;DR verdicts

| # | Question | Verdict | One line |
|---|---|---|---|
| 1 | Should OpenRouter get a lane slot? | **ADOPT — replace the dead HF-router lane** | HF is disqualified since 2026-10-28; OpenRouter is the natural gateway replacement and is already wired in (catalog row + vault key + adapter). |
| 2 | Is the free tier actually usable? | **YES — but only in the ≥$10 mode** | 50 RPD (no-spend) is DOA for 30–90 calls/day; a **one-time $10 credit purchase unlocks 1,000 RPD** — verified on the official limits doc. Nothing changed in 2026; this rule has been stable. |
| 3 | Does it need to cost anything? | **$10.80 once ($10 + $0.80 card fee floor), never recurring** | Credits stay spendable on paid models (1-year expiry right — spend them down as emergency overflow). |
| 4 | Can it carry the whole pipeline alone? | **Yes in the ≥$10 mode** | Worst case with retries ≈ 150–300 requests/day = 15–30% of the 1,000 ceiling; 20 RPM covers bursts. Only free lane in the chain that can say this. |
| 5 | Where in the chain? | **Researcher lean: #2 behind Gemini. Cautious path: HF's slot (#5), A/B on MR first, promote on quality evidence** | Both keep Gemini direct-lane #1 as the SPOF guard. MR-pilot directive decides the sequencing, not the research. |
| 6 | Biggest gotchas | **Training toggle, model churn, `:free`-only slugs, failed requests count against the cap** | All four are handled by settings + data-row pins + the existing ledger. |

## 1. What OpenRouter is (and why it fits this repo)

One OpenAI-compatible endpoint (`https://openrouter.ai/api/v1`) → 400+ models from every major lab behind one API key. Inference is pure passthrough (no markup). **This repo is already wired for it**: `provider-catalog.js` has an `openrouter` row (capability `script-gen`, base URL, `OPENROUTER_API_KEY`), `keys-vault.js` has the key entry with test-on-save (`GET /api/v1/models`, #28), and `ai-adapter.mjs` includes it in the OpenAI-compatible adapter set. Adding it as a live lane is a **data + settings task, zero code** — the no-static-maps shape.

The dead HF-router lane (disqualified 2026-10-28, "Phase-2 removal candidate") leaves exactly the gateway slot OpenRouter fills. The catalog's Oct-28 note ("LAST RESORT — today's free lineup has no frontier-class writer") is now **outdated**: the 2026 free pool has 550B-class and 1M-context models (§3).

## 2. The money fact that changes the verdict (verified 2026-11-03)

Official limits doc structure:

| All-time credits purchased | RPM | Free-model RPD |
|---|---|---|
| < $10 | 20 | 50 |
| ≥ $10 (buffer triggers at $9) | 20 | **1,000** |

- FAQ verbatim: "If you have purchased at least 10 credits, your free model rate limit will be 1000 requests per day."
- **One-time, not a subscription.** Credits remain spendable on paid models; OpenRouter reserves the right to expire unused credits after 1 year → use them as emergency paid overflow within 12 months.
- Fees: card 5.5% (min $0.80) → $10 top-up costs **$10.80**; crypto 5.0% flat. Min top-up $5 (secondary-sourced, unverified on primary page).
- **Why this matters at our scale:** $0 mode = 50 RPD < one busy day (a 90-call day with retries ≈ 150–300 counted requests — failures count too). ≥$10 mode = 1,000 RPD ≥ 3–6× worst day. The earlier "skip OpenRouter" verdict was right about the wrong tier.
- Anti-multi-account: limits are governed globally; extra keys don't help.
- Billing guardrails that make this safe: **auto top-up OFF**; accidental paid spend only happens if a non-`:free` slug enters the model fallback array — keep `:free`-only arrays and any `402` pages the owner.

## 3. The free pool today (Nov 2026) — and the pins

~15–19 `:free` text models, median listing age ~75 days; the 2025 staples (DeepSeek R1:free, Qwen3-coder:free) are **withdrawn** — churn is real, so model IDs live as **data rows** with a monthly audit, never code.

Pins for long-form structured English scripts (quality = class/scale judgment; **A/B against Gemini on MR before trusting**):

| Pin | Context | Data-policy class |
|---|---|---|
| `thinkingmachines/inkling:free` | 1.05M | May-train host — needs free-training toggle ON |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 1M | May-train host |
| `google/gemma-4-31b-it:free` | 262K | No-train host — the workhorse if owner keeps training OFF |

Alternate: `qwen/qwen3.8-27b:free` (zero-retention host). **Never** use `openrouter/free` (random router — random schema compliance + mixed data policies) or bare slugs without `:free`.

## 4. Privacy, commercial use, reliability — the honest notes

- **Logging:** OpenRouter stores metadata only unless opted in; two opt-ins (private I/O logging, 1%-discount data use) stay OFF.
- **Training:** separate paid/free toggles. Keeping paid-training OFF always is free. Free-model training ON unlocks 9 of ~19 pool models (the two best pins); OFF shrinks the pool to ~10 (Gemma/Qwen class). Scripts are public YouTube content → researcher lean: ON, owner's call.
- **Commercial use:** ToS permits commercial, for-profit use; output ownership defers to upstream model terms; no free-tier prohibition. Warranty disclaimer for customer-facing use is standard, not a prohibition.
- **Reliability:** platform status operational; worst incidents Feb 17/19 2026 (sub-hour, remediated — infra failures now 503 not misleading 401). Free tier brownouts (peak-hour 429s, one endpoint per model, no intra-model fallback) are more frequent than platform outages. **Mitigation = Gemini stays direct lane #1; a lane failure must never be terminal** (our chain already fail-continues).
- **Stripe acquired OpenRouter (Aug 2026, ~$7–8B)** — low shutdown risk, but terms/fees can drift with little notice → the monthly audit habit covers this too.

## 5. What you actually need (the owner checklist — for the future spec, NOT executed now)

| # | Thing | Detail |
|---|---|---|
| 1 | OpenRouter account | openrouter.ai signup, no credit card required to create |
| 2 | One-time $10 top-up | Card; expect $10.80 charged; **auto top-up OFF** |
| 3 | Privacy settings | Paid-training OFF; free-training ON (owner decision); prompt-publish OFF; private logging OFF; 1%-discount OFF; ZDR OFF (kills most of the pool) |
| 4 | Dedicated API key | Create at openrouter.ai/keys → store in the existing encrypted BYOK vault (masked, test-on-save already implemented) |
| 5 | Catalog data updates | `freeTier` row → two-tier `{rpd: '50/<$10, 1000/≥$10', rpm: 20}`; `models: []` → the three pins (as data); retire the stale "no frontier-class writer" note |
| 6 | Chain position | HF lane slot (replace) or #2 — per the A/B outcome; MR pilots first per the standing directive |
| 7 | Request discipline | `:free`-only model arrays; `response_format` json_schema with json_object fallback (verify per pinned model); optional `HTTP-Referer`/`X-Title` headers |
| 8 | Error handling | 429 → honor `Retry-After`, advance after 2 strikes; 502/503/504 → advance; **check body `error` even on HTTP 200** (and SSE `finish_reason:"error"`) |
| 9 | Usage probe | `GET /api/v1/key` → `free_model_daily_requests.used/limit/remaining` → log to `usage_events`; alert at 80% of the daily cap |
| 10 | Monthly audit | Pinned IDs still live in `/api/v1/models`; replace withdrawn ones from the free collection page; re-check fees/terms post-Stripe |

**Total cost: $10.80 once. Everything else $0.**

## 6. Open questions for the owner (to settle at spec time)

1. Free-model training-sharing ON (best models reachable) vs OFF (strict no-train, smaller pool)?
2. A/B the OpenRouter lane against Gemini for one week on MR before choosing its position?
3. Keep the $10 balance reserved as emergency paid overflow (researcher lean: yes), or treat as untouchable?

## 7. Source register (fetched 2026-11-03)

- openrouter.ai/docs/api-reference/limits — RPM/RPD table, $10 rule, $9 buffer, key-usage probe, failed-requests-count behavior
- openrouter.ai/docs/faq — verbatim 50/1,000 rule, credit 1-year expiry right, payments, passthrough pricing, "not suitable for production" advisory
- openrouter.ai/blog/announcements/simplifying-our-platform-feee — 5.5%/$0.80 card fee, 5% crypto, BYOK-subscription plan (updated 2026-06-11)
- openrouter.ai/collections/free-models + truefoundry.com (2026-10-05 pool census) + costgoat.com (2026-11-02 cross-check) — pool size, churn stats, data-policy split, single-endpoint-per-model finding (costgoat's "200 RPD per model" claim conflicts with the official doc — official wins)
- openrouter.ai/docs/guides/privacy/provider-logging + /data-collection + /features/zdr — logging defaults, training toggles (paid/free separate), ZDR self-serve
- openrouter.ai/terms — commercial use, output ownership, warranty disclaimer
- openrouter.ai/docs/api-reference/overview + /errors + /features/provider-routing + /guides/routing/model-fallbacks — base URL, headers, `:free` syntax, error semantics, paid-fallback billing verbatim ("list only `:free` models to keep a request free")
- stripe.com/newsroom + Forbes (Aug 2026) — acquisition
- openrouter.ai/blog (outages Feb 2026; auto-router; Auto Exacto; Free Models Router)
- Repo-internal: `studio/lib/provider-catalog.js:77-86` (openrouter row, stale Oct-28 note), `studio/lib/keys-vault.js:17,148-150` (vault key + test probe), `lib/ai-adapter.mjs:44` (OpenAI-compatible set), `research/platform-byok-providers-2026-10-24.md` §1.1 (matrix row: 20 RPM / 50/1,000 RPD, commercial-yes, BYOK 5%)

## 8. Residual uncertainties

- Inkling / Nemotron-3 / Gemma-4 script-writing quality — no credible 2026 benchmarks found; the A/B week on MR is the designed answer.
- $5 minimum top-up — secondary-sourced only; primary page not directly fetched.
- Whether the free-model training toggle's 9-model reachability figure drifts as the pool rotates (re-check at monthly audit).
