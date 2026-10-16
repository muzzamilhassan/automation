# Video Creation Functionality & Competitive Intelligence Audit

**Date**: 2026-10-17  
**Scope**: End-to-end audit of video creation, niche & sub-niche selection, script generation, language readability, SEO metadata, competitor teardown, workflow bugs, and optimization tickets.

---

## 1. How Videos Are Created

The video generation engine operates via [**`youtube-engine.mjs`**](file:///c:/Users/Revnix/Documents/youtube-automation/youtube-engine.mjs) and [**`channel-pipeline.mjs`**](file:///c:/Users/Revnix/Documents/youtube-automation/channel-pipeline.mjs).

```
[Trend Signals / Sub-Niche] 
         │
         ▼
[Script Generation: Hook + 4-5 Points + Closing]
         │
         ▼
[Voice Narration (TTS) + Whisper Word Timestamps]
         │
         ▼
[Stock Footage (Pixabay 4K / Pool) + Scrim Vignette]
         │
         ▼
[Hormozi ASS Subtitle Burn (Anton, Pop-in, Yellow Keyword)]
         │
         ▼
[Brand Vector Overlay (Eyebrow + Accent + Hook SVG)]
         │
         ▼
[FFmpeg Audio Mix (Speech + Ducked Music Track at 13% vol)]
         │
         ▼
[1080x1920 MP4 Video Output & Scheduled YouTube Upload]
```

### Video Rendering Steps:
1. **Multi-Brain Scriptwriting**: The LLM writes a 4–5 point micro-script structured for audio delivery.
2. **Audio & Word Alignment**:
   * Generates audio via OpenAI TTS (`gpt-4o-mini-tts`) or Edge-TTS (`edge-tts`).
   * Passes the audio through **Whisper** to extract exact word-level timestamp offsets (`{ word, start, duration }`).
3. **Footage Matching**:
   * Gemini analyzes the hook and queries Pixabay for vertical 4K footage.
   * If Pixabay quota is exceeded, falls back to pre-cached footage in `pixabay-pool/`.
4. **Hormozi Subtitle Engine**:
   * Formats subtitles into Advanced SubStation Alpha (`.ass`) syntax.
   * Groups words into 1–3 word bursts.
   * Highlights the highest-impact keyword in yellow (`#FFD93D`) with a pop-in scale transform (`\t(0,90,\fscx114\fscy114)`).
5. **Brand Overlays**:
   * Sharp compiles a high-DPI SVG overlay containing the channel's custom eyebrow header, hook typography, and brand accent color.
6. **FFmpeg Compilation**:
   * Assembles video segments with smooth video crossfades (`fade=t=in/out`).
   * Burns ASS subtitles with `libass`.
   * Mixes narration and background music (music ducked to 13% volume during speech).
   * Validates duration with `ffprobe` (hard gate: rejects videos under 20 seconds).

---

## 2. Niche & Sub-Niche Selection Logic

### Channel Niche Assignment
Defined in [**`yt-brands/brands.mjs`**](file:///c:/Users/Revnix/Documents/youtube-automation/yt-brands/brands.mjs) and [**`lib/brands.json`**](file:///c:/Users/Revnix/Documents/youtube-automation/lib/brands.json):
* **QuoteQuarry**: Stoic philosophy, self-mastery, dark psychology defense.
* **Investor's Compass**: High-CPM ($30–$50) finance, Warren Buffett mental models, market psychology.
* **The Money Rulebook**: Personal wealth building, frugality, financial freedom.
* **Debt-Free Doctrine**: Debt payoff, budgeting, frugal living.

### Dynamic Sub-Niche Rotation
In [**`trend-research.mjs`**](file:///c:/Users/Revnix/Documents/youtube-automation/trend-research.mjs#L21-L37):
* Sub-niches are not static. The system calculates:
  $$\text{startIdx} = \left\lfloor \frac{\text{Date.now()}}{86,400,000} \right\rfloor \pmod{\text{subNiches.length}}$$
* QuoteQuarry cycles through 6 distinct content pillars:
  1. *Human psychology & respect*
  2. *Power of silence & solitude*
  3. *Dark psychology defense*
  4. *Samurai mindset & Musashi*
  5. *Emotional detachment*
  6. *Stoic rules for modern life*
* This guarantees each day's content explores a fresh angle, preventing audience fatigue.

---

## 3. How Research Works

In [**`trend-research.mjs`**](file:///c:/Users/Revnix/Documents/youtube-automation/trend-research.mjs#L40-L75):
1. Takes the day's active sub-niche (e.g., *"power of silence"*).
2. Generates viral search variants: `${sn}`, `${sn} explained`, `${sn} rules`, `${sn} habits`.
3. Calls YouTube Data API `search.list`:
   * Region: `US`
   * Time window: Published within the last 14 days
   * Ordering: `viewCount`
4. Extracts the top 10 viral videos in the niche and strips common stop words (`STOP` set).
5. Aggregates a **Keyword Frequency Matrix** to produce `hotKeywords` (the exact search phrases driving traffic right now).
6. Injects those viral signals directly into the LLM prompt for the day's script.

---

## 4. Scriptwriting: Language, Vocabulary & Tone

### Reading Level & Tone
* **Readability**: Aimed at a **5th to 7th grade reading level** (Flesch Reading Ease score of ~75–85).
* **Vocabulary Rules**:
  * Uses direct, visceral spoken words: *"walk away"*, *"protect your peace"*, *"cheap talk"*, *"quiet leverage"*.
  * Avoids academic or Latinate vocabulary (*"subconscious cognitive divergence"* is disallowed).
* **Hook Constraints**:
  * First 2 seconds are critical: Hook must be $\le 10$ words.
  * Must open with a curiosity gap, a shocking number, or high personal stakes.
  * **Banned**: Greetings (*"Hello everyone"*), definitions (*"Stoicism is..."*), or list announcements (*"Here are 5 tips..."*).
* **Pacing & Length**:
  * Strictly 4–5 points.
  * Each point is capped at 9–12 words.
  * Closing is a mic-drop punchline ($\le 10$ words) designed to encourage re-watches or debate in the comments.

---

## 5. SEO Metadata Generation

In [**`youtube-engine.mjs#buildScriptMeta`**](file:///c:/Users/Revnix/Documents/youtube-automation/youtube-engine.mjs#L767-L785):
* **Title Pattern**: `${Thumbnail Headline} | ${Authority}` (max 95 characters).
  * Example: `7 Rules That Quietly Set You Apart | Money Psychology`
* **Description Pattern**:
  * Hook line $\to$ Numbered bullet points $\to$ Mic-drop takeaway $\to$ Call to Action $\to$ 3 visible hashtags $\to$ Background music attribution.
* **Tag Selection**:
  * Combines `hotKeywords` from live YouTube research + channel tags + evergreen tags (`life lessons`), capped at 12 ranking tags.

---

## 6. Competitor Teardown & Benchmarking

| Feature | Top Competitors (`thestoicmode`, `LegacyMindset`) | Our System (`youtube-automation`) | Competitive Assessment |
| :--- | :--- | :--- | :--- |
| **Topic Selection** | Manual curation / recycled old quotes | Live 14-day US viral trend search & keyword extraction | **We Win**: Data-backed, rides real-time viral trends. |
| **Distribution** | Single YouTube channel | 4 YouTube channels + FB Reels + IG + Threads + Pinterest + TikTok | **We Win**: Massive multi-channel leverage. |
| **Pacing / Duration** | Ultra-dense 15–22s loops (>100% APV) | 30–42s scripts | **Competitor Wins**: Shorter duration yields higher algorithm retention. |
| **Audio Pauses** | Zero dead air; instant loop transition | 0.8s trailing padding per section | **Competitor Wins**: Extra 4–5s dead air risks viewer swipe-away. |
| **Voice Realism** | ElevenLabs neural voice models | Edge-TTS with OpenAI fallback | **Competitor Wins**: Premium TTS sounds more organic. |

---

## 7. Concrete Workflow Bugs Discovered

1. **Bug 1: Invalid Model Name in `youtube-engine.mjs#L546`**:
   * Endpoint uses `gemini-3.5-flash-lite`, which returns HTTP 404.
   * *Impact*: Primary Gemini brain fails on every call, cascading to slower fallbacks.
2. **Bug 2: Audio Padding Dead Air in `youtube-engine.mjs#L707`**:
   * `dur = Math.max(3.5, Math.min(20, Math.round((lastW.s + lastW.d + 0.8) * 10) / 10))`
   * Adding `0.8s` after every sentence adds ~4 seconds of silence across a 5-point short, depressing YouTube Shorts retention.
3. **Bug 3: Title Case Mangles Acronyms & Currency**:
   * `titleCase("7 AI TOOLS THAT EARN $10K")` becomes `"7 Ai Tools That Earn $10k"`.
   * *Impact*: Looks unpolished in YouTube feed; lowers CTR.
4. **Bug 4: Hardcoded FB IDs in Fallback Scripts**:
   * `FALLBACK_SCRIPTS` uses legacy numeric Facebook page IDs instead of channel slugs (`quotequarry`, `investors-compass`).
