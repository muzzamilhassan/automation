# Research: API Keys Architecture, Competitor Benchmarks, and Multi-Modal BYOK

**Date:** 2026-10-17 · **Status:** Complete · **Category:** Primary Source Research & Architecture Audit

---

## Executive Summary

This investigation audits how API keys operate across this codebase, benchmarks how industry competitors (OpenRouter, AutoShorts, InVideo, Dify, LibreChat, and Blotato) configure multi-tenant BYOK (Bring Your Own Key) for video, scripts, and thumbnails, and provides an actionable roadmap for expanding our system to support any custom key (OpenRouter, ElevenLabs, Replicate/Fal.ai, Midjourney, Anthropic) per channel and user.

---

## 1. Inventory of All API Keys in This Codebase

The system currently interacts with 18 distinct API keys and environment credentials across 6 operational domains:

| Category | Key / Variable Name | Primary Usage in Code | Free Tier / Cost Model |
|---|---|---|---|
| **Script Brains (LLM)** | `GEMINI_API_KEY` | Primary script generator (`youtube-engine.mjs`) | 250 RPD (Flash), 1,000 RPD (Flash-Lite) |
| | `GROQ_API_KEY` | Fallback brain #1 (gpt-oss-120b, llama-3.3-70b) | Free ~1K RPD / 100K–200K TPD |
| | `CEREBRAS_API_KEY` | Fallback brain #2 (high-speed inference) | Free 1M tokens/day (5 RPM burst limit) |
| | `MISTRAL_API_KEY` | Fallback brain #3 (Mistral Large/Small) | Free Experiment ~1B tokens/month |
| | `HF_TOKEN` | Hugging Face Router inference fallback | Pay-per-token ($0 free credits) |
| | `OPENAI_API_KEY` | Script generation & transcription fallback | Paid (gpt-4o-mini / gpt-5-mini) |
| | *(Pollinations.ai)* | Zero-key fallback script brain | 100% Free, no API key required |
| **Voice / TTS** | `OPENAI_API_KEY` | `tts-1` / `gpt-4o-mini-tts` narration | Paid ($15 / 1M characters) |
| | *(Edge-TTS)* | Microsoft Cloud neural voiceover (`narrate.py`) | 100% Free, no API key required |
| | *(Kokoro-82M)* | Local ONNX neural TTS engine (`narrate.py`) | 100% Free, local inference |
| **Visual Assets** | `PIXABAY_API_KEY` | 4K stock video footage and photos | Free 100 req/60s (requires 24h cache) |
| | `PEXELS_API_KEY` | Documentary B-roll photos & video clips | Free 200 req/hour, 20,000 req/month |
| **Thumbnails & Art** | `AGNES_API_KEY` | AI background image generation for thumbnails | Free / Beta gateway (10 RPM) |
| **Publishing & Social**| `YOUTUBE_CLIENT_ID` / `_SECRET` | YouTube Data API v3 OAuth & uploads | ~100 uploads/day bucket + 10K pool |
| | `FB_PAGE_TOKEN` | Facebook Page Reels and image crossposting | Free via Meta Graph API |
| | `THREADS_ACCESS_TOKEN` | Threads daily automated publishing | Free via Threads API |
| | `ZERNIO_API_KEY` | TikTok auto-publishing rail | First 2 accounts free, then $3–$6/mo |
| | `PINTEREST_ACCESS_TOKEN` | Pinterest automated pin publisher | Free via Pinterest API v5 |
| **Alerts & CI/CD** | `NTFY_TOPIC` | Instant push notifications on failed runs | Free (250 msgs/day, no key) |
| | `GITHUB_TOKEN` / `_PAT` | Actions secrets management & repo state sync | Free via GitHub API |
| | `DATABASE_URL` | Neon Postgres serverless connection string | Free Tier Postgres |
| | `STUDIO_PASSWORD` | Master encryption & JWT cookie auth | Self-hosted secret |

---

## 2. How BYOK Currently Works in Our Codebase

### 2.1 The Vault Architecture
- **Files:** `studio/lib/keys-vault.js` (Studio web app) and `lib/channel-keys.mjs` (CI runner).
- **Encryption:** AES-256-GCM. The key is derived deterministically via:
  `crypto.createHash('sha256').update('quarry-channel-keys-v1|' + YOUTUBE_CLIENT_SECRET).digest()`
  *Advantage:* Because both the Vercel Studio and every GitHub Actions runner already hold `YOUTUBE_CLIENT_SECRET`, no extra master key secret had to be provisioned.
- **Validation on Save:** When a key is pasted in Studio (`/keys`), `validateKey(provider, key)` executes a live HTTP ping against the provider (e.g. `gemini.models.list`, `api.groq.com/v1/models`, `pixabay.com/api/?q=morning`). If rejected or expired, it refuses to save.
- **Storage:** Saved in `yt-mcp/channel-keys.json`. Git history provides an immutable audit trail.
- **Runtime Injection in CI (`channel-pipeline.mjs`):**
  When a channel pipeline executes, `applyChannelKeys(slug)` decrypts the channel's custom keys and overrides `process.env`.
  - Runs `checkChannelKeys(slug)` live.
  - If a key fails (e.g., quota exceeded or revoked), it **drops that key from `process.env` so the shared default key automatically takes over**, and posts a high-priority alert to `ntfy.sh`.

---

## 3. How Competitors Implement BYOK (Industry Benchmarks)

### 3.1 OpenRouter Pattern (The Golden Standard for AI Brains)
- **What they do:** One API key gives unified access to 200+ models (Claude 3.5 Sonnet, DeepSeek V3/R1, Llama 3.3, OpenAI GPT-4o, Mistral Large).
- **BYOK Feature:** OpenRouter allows users to input their own provider keys (e.g. Anthropic key) under OpenRouter settings. When routed, OpenRouter swaps auth and bills directly to the user's Anthropic account with 0% markup.
- **Lesson for Us:** Adding `openrouter` as a provider in our vault eliminates the need to maintain separate integrations for every new LLM. A user can paste one OpenRouter key and select any model.

### 3.2 InVideo AI & AutoShorts.ai (Video Generation SaaS)
- **Voice / TTS:** Offer both stock voices (ElevenLabs / Azure) and a BYOK field for **ElevenLabs API Key**. When a user adds their ElevenLabs key, their cloned voices and custom voice library populate automatically in the video style dropdown.
- **Image Generation:** Integrate with **Replicate** or **Fal.ai** (Flux.1 Schnell/Dev) using BYOK, allowing creators to generate custom thumbnail art and B-roll visuals without SaaS credit limits.

### 3.3 Dify & LibreChat (Multi-Tenant Workspace BYOK)
- **Two-Tier Key Hierarchy:**
  1. *Workspace/User Level:* Default keys used across all the user's projects.
  2. *Project/Channel Level:* Overrides specifically for one client or channel.
  *Benefit:* A creator managing 10 channels doesn't have to re-enter their Pixabay or Gemini key 10 times.

---

## 4. Key Gaps & Missing Features in Our System

1. **Missing Modern AI Providers:**
   - No **OpenRouter** (`OPENROUTER_API_KEY`): Misses out on DeepSeek V3, Claude 3.5, and unified LLMs.
   - No **ElevenLabs** (`ELEVENLABS_API_KEY`): Users cannot use premium cloned voices.
   - No **Fal.ai / Replicate** (`FAL_KEY` / `REPLICATE_API_TOKEN`): Thumbnail AI is locked to Agnes AI.
2. **Disconnection Between Studio Features and Channel BYOK:**
   - In `studio/app/api/thumbs/ai-bg/route.js`, thumbnail generation uses `process.env.AGNES_API_KEY` directly from the server, completely ignoring the channel's custom keys!
   - In `studio/app/api/create-video/route.js`, video creation runs only through shared server GitHub Actions.
3. **No User-Level Default Keys:**
   - If a creator owns 15 channels, they must configure keys on each channel individually.
4. **No Health / Quota Badges on UI:**
   - The `/keys` dashboard shows `saved ••••1234` but does not indicate whether the key currently has remaining quota or is encountering 429 rate limits.
