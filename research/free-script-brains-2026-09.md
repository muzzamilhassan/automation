# Free Script-Generation Research — unlimited AI brains at $0 (2026-09-07)

Problem: our script brain (Gemini free tier) runs out mid-day (20 req/day on
the current model), and the HF Llama fallback truncates long episode JSON.
We need ~16 Shorts scripts + 4 episode scripts per day, reliable JSON, $0.

## Findings

| Provider | Free limit | JSON mode | Signup | Verdict |
|---|---|---|---|---|
| **Groq** | **~14,400 req/day**, 30/min — no credit card | ✅ JSON mode + structured outputs | console.groq.com (1 min, free) | 🏆 **Best volume.** Llama 3.3 70B — faster and smarter than our current HF 8B fallback. 16 scripts/day = 0.1% of the limit. |
| **Gemini (existing)** | Slashed Dec 2025: current model ≈ 20/day; Gemini 3 Flash tier = ~1,500/day | ✅ | already have | Best quality when fresh; limits change without notice. Keep as Layer 1 (cron runs at quota reset). |
| **GitHub Models** | Free with EXISTING GitHub account/PAT — frontier models (GPT-4o class), per-tier daily token caps | ✅ OpenAI-compatible | none (we have the PAT) | 🥈 Zero-signup fallback. |
| **Ollama (open source, local)** | **UNLIMITED** — runs on their PC | ✅✅ **Structured outputs (JSON schema) — truncation becomes impossible** | ollama.com installer + ~5GB model | 🥉 Best for the long episodes (the exact thing that keeps failing). Needs ~8GB RAM. |
| OpenRouter | 50/day free (1,000/day after one $10 top-up) | ✅ | openrouter.ai | Optional; the 402 flakiness we hit suggests skipping. |
| HF Llama (current fallback) | generous but flaky for long JSON | ❌ truncates | have it | Demote to last-resort. |
| Cerebras / Mistral free | generous, fast | ✅ | signup | Alternates if Groq ever throttles. |
| Pollinations | flaky 402s | ❌ | none | Drop. |

No provider is truly "unlimited" — the winning strategy is a **fallback chain
of free tiers** + **local Ollama** as the unlimited floor.

## Recommended 4-layer brain (all $0)

1. **Gemini** (existing key) — cron runs 09:35 UTC right after its midnight-PT
   reset, so the day's first scripts use the smartest model.
2. **Groq Llama-3.3-70B** (new key) — 14,400/day covers ~900 days of our
   volume; JSON mode; extremely fast.
3. **Ollama local, JSON-schema mode** (open source) — unlimited, offline,
   truncation-proof for the long episodes.
4. **HF Llama** (existing) — final fallback before a safe skip.

## What each option needs
- Groq: user creates free account → paste GROQ_API_KEY (1 min).
- Ollama: I install it + pull llama3.1:8b (~5GB download, one time).
- GitHub Models: nothing — PAT already in .env.

## UPDATE 2026-09-08 — implemented + deeper findings
- SWITCHED both engines to `gemini-3.5-flash-lite` — that tier has **~1,000 requests/day free** vs ~20/day on 3.5-flash. Verified live (on-niche Buffett script, source: gemini). This alone solves the daily quota problem.
- Groq key live (gpt-oss-120b — the Llama models were retired from Groq's lineup; current lineup: gpt-oss-120b/20b, qwen3.x-27b, compound). Note: Groq free tier also caps tokens/min (~6k) — long episode JSON (4-6k tokens) = pace 1 req/min; burst retries trip 429s.
- Cerebras free tier: 1M tokens/day, no card, GPT-OSS-120B available, free-tier context capped 8,192 tokens (fits our prompts). Best next signup.
- Mistral Experiment tier: ~1B tokens/month free, needs phone verification + data-training opt-in. Biggest raw volume.
- SambaNova: free tier being folded into Developer tier (needs payment method) — skip.
- GitHub Models: in retirement brownout (410) — dead.
- Pollinations: 402 on authenticated-style calls — dead for us.
- Final chain now live in code: Gemini flash-lite → Groq gpt-oss-120b → HF. Optional adds: Cerebras key, Mistral key.
