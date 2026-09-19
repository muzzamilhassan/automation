# Premium Look + Audio Deep-Dive — Code Audit & Free-Tools Research (2026-09-20)

Question asked: *what would make our videos more animated, more premium, more realistic — for free? What do top channels use, and what are the free versions? What audio are we missing?*

Method: full read-only audit of both repos (`youtube-automation` + `quarry-render`), three parallel web-research tracks (top-channel production stacks, free audio, free visuals). All recommendations checked for: **commercial-use license** (channels are monetized — NonCommercial = DO NOT USE), **GitHub Actions CI compatible** (no GPU locally, no editing apps), **$0**.

---

## Executive summary (the short version)

1. **The top channels we compete with (MagnatesMedia, How Money Works, Modern MBA, Vox-style) pay roughly $160–280/month** for Premiere + After Effects, Storyblocks stock, Epidemic/Artlist music, ElevenLabs voice. **Every one of those tools has a free, license-clean, automatable replacement** — we already own most of the engine (Remotion + ffmpeg + Pexels/Pixabay + Kokoro TTS).
2. **What actually separates premium from cheap is not tools — it is 4 techniques**: (a) sound effects at cuts, (b) music that ducks and breathes under the voice + videos mastered to YouTube's loudness target, (c) nothing on screen is ever static (motion on every photo, cut or change every 2–4s), (d) one unified film look (grain + grade). **We currently have zero of (a), zero of (b), and (c)/(d) only partially.**
3. **Audit found 3 real bugs, all verified by hand** — one makes long-form scenes render as near-blank screens daily; one kills FB thumbnail frame extraction on every short; one leaves every deep-dive chapter on a flat gray background. Details in Part A.
4. **Traps found (DO NOT USE):** ElevenLabs free tier (non-commercial), Suno free (non-commercial), Meta MusicGen weights (NC), BBC Sound Effects (NC), Google Earth Studio (no commercial license), Fish Speech/OpenAudio TTS (NC), RMBG-2.0 cutout model (NC), Jamendo API (ToS is non-commercial; CC-BY-NC tracks in catalog).

---

# PART A — Code audit: what our videos have / are missing

All refs: `A\…` = youtube-automation, `Q\…` = quarry-render.

## A.1 What PREMIUM features already exist (don't re-buy/re-build these)

**Shorts (`A\youtube-engine.mjs`, `A\yt-daily.mjs`)**
- 4K Pixabay footage per topic (Gemini builds the search query, width ≥ 3500 filter, no-repeat ledger) — `A\youtube-clips.mjs:24-88`; vetted per-brand fallback pool `A\cinematic-engine.mjs:68-74`.
- Light color lift on footage `eq=saturation=1.04:contrast=1.06` — `A\youtube-engine.mjs:409,714`; vertical scrim gradient for text legibility `:390-394`.
- **Hormozi karaoke captions are genuinely good**: ALL-CAPS Anton 110px, 1–3 words/cue, longest word yellow, pop-in scale animation, word-exact timing from whisper alignment, black outline — `A\youtube-engine.mjs:50-52,149-193`.
- Hook builder with 4 rotating styles + brand-color accent word — `:198-234`.
- Music engine: full incompetech catalog, feel-whitelist, per-brand moods, no-repeat, auto CC BY credit — `A\music-engine.mjs:15-136`.
- TTS chain with word timestamps: OpenAI `gpt-4o-mini-tts` (onyx 0.95x) → Kokoro-82M ONNX (brand voices) → Edge fallback — `A\youtube-flow\narrate.py:19-144`; per-brand voices `A\yt-brands\brands.mjs`.
- Thumbnail: 1280×720 Anton headline + brand accent + blurred shadow — `A\youtube-engine.mjs:321-360`. Doc thumbnails: user-approved editorial cutout style `A\thumbnails\gen-doc-thumbnail.py`.

**Long-form DocV2 (`Q\longvideo\make-longform.mjs` + `Q\explainer\remotion\longscenes2.tsx`)**
- Remotion, 1080p/24fps; 3 themes (`investing` dark-navy+gold, `vox` cream+serif **with film grain**, `poster` black) — `longscenes2.tsx:26-54`.
- Spring pop-ins on hero/split/chapter/end scenes, giant outlined chapter numbers — `longscenes2.tsx:189-309`.
- Karaoke captions "style 2" (4-word window, active-word accent box) — `:311-348`. Paper grain via `feTurbulence` on vox theme `:140-147`. Photo cards with rounded corners + shadow `:149-157`.

**TechVideo / Teacher explainers (richest in-house motion library)**
- TechVideo: glowing terminal windows, char-by-char typing, ticking counters, self-drawing SVG flow lines, animated bars, staggered grids, dark karaoke — `Q\explainer\remotion\tech-video.tsx` (9 scene templates `Q\longvideo\make-tech-video.mjs:33-64`).
- Teacher: paper+grain, doodle confetti, **12 self-drawing doodle icons**, rubber-stamp thump, word-by-word headline pop, **cutout photo cards with Ken Burns (only Ken Burns in the whole codebase)** `Q\explainer\remotion\teacher.tsx:187-205`, grease-pencil circles/arrows, whiteboard count-up $, persona quote card.
- Reels composition: stock-video backdrop per beat, count-up stat, progress bar, outlined giant number — `A\explainer\remotion\reels.tsx`; scored b-roll fetcher `A\explainer\broll-fetch.mjs:87-128`.

## A.2 MISSING matrix (the gap = the plan)

| Feature | Shorts | Deep-dive | DocV2 long-form | Tech/Teacher |
|---|---|---|---|---|
| Sound effects (SFX) | ✗ zero (grep = 0 hits both repos) | ✗ | ✗ | ✗ |
| Music ducking (breathes under voice) | ✗ flat 0.13–0.14 | ✗ flat 0.09 | ✗ flat 0.15 | ✗ flat 0.12–0.15 |
| Loudness normalization (master volume rules) | ✗ | ✗ | ✗ | ✗ |
| Real transitions (whip/mask/crossfade) | ✗ hard cuts + 0.35s fade | ✗ concat copy | ✗ 5-frame dip only | ✗ 5-frame fade |
| Motion on photos (Ken Burns/parallax) | n/a (video clips) | drift pan written but DEAD (bug #2) | **✗ photos are static `<Img>`** (`longscenes2.tsx:149-157`) | Ken Burns in Teacher only |
| Film grain / vignette / unified grade | lift only, no grain | none | grain on vox theme only | grain in Teacher only |
| B-roll VIDEO in long-form | yes | intended, dead (bug #2) | **✗ stills only** (`make-longform.mjs:128-155`) | stills only |
| Voice processing (EQ/compress/de-ess) | ✗ raw TTS | ✗ | ✗ (Edge batch) | ✗ |
| Ambience beds (rain/office/city) | ✗ | ✗ | ✗ | ✗ |
| Music bed at all | — | — | — | Reels comp has NO music (`A\explainer\build-reel.mjs`) |

## A.3 Bugs found (3 verified by hand, 10 more minor)

**BUG 1 — CONFIRMED — DocV2 stat scenes render as near-blank screens (in DAILY videos).**
`Q\longvideo\make-longform.mjs:122` pushes stat beats with `headline`/`text` fields, but `StatLayout` renders `b.big` and `b.label` (`Q\explainer\remotion\longscenes2.tsx:240-251`) — both undefined. Every "stat" beat shows a giant empty number + empty label for its full duration (~4-8s of blank screen per stat). The legacy storyboard (`A\longvideo\storyboard.mjs:191-210`) computed `big` values; the field was lost when the port happened.

**BUG 2 — CONFIRMED — FB thumbnail frames never extracted.**
`A\yt-daily.mjs:178` calls `execFileSync(...)` but line 9 only imports `spawnSync` — throws `ReferenceError` every run, silently swallowed by the catch at `:189`. FB/IG poster frames fall back to other paths.

**BUG 3 — CONFIRMED — every deep-dive chapter renders on a flat gray background.**
`A\yt-deepdive.mjs:224` calls `getTopicClip(page(), ...)` — no `page` function exists in the file. Always throws → `clip = null` → chapters render on `color=c=0x0c0c0e` (`:185`) and the "slow cinematic drift" 4K pan (`:178-190`) is dead code.

**Minor findings:**
4. Ghost env var: `yt-deepdive.mjs:167` sets `YT_TTS_EDGE_VOICE`, but `narrate.py:19-20` reads `YT_TTS_VOICE`/`YT_KOKORO_VOICE` — silently ignored.
5. `yt-deepdive.mjs:250` `amix` omits `normalize=0` (all other mixes set it) — deep-dive loudness behaves differently.
6. `music-engine.mjs` byte-identical duplicated in both repos — every edit must be made twice.
7. Whole longvideo pipeline duplicated in `A\longvideo\` and `Q\longvideo\` (make-longform, teacher, tech-video, generate-longscript, approved-music.json, gen-doc-thumbnail.py, edge_batch.py …) — drift already started (`longform-upload.mjs` differs by a line; `Root.tsx` diverged: automation registers `TechExplain` which doesn't exist in quarry-render).
8. Mid-file re-import `node:path` at `A\youtube-engine.mjs:451`.
9. Two parallel music systems: yt-daily wires the incompetech engine, but `youtube-engine.mjs:423` has a hardcoded `image-tools/audio/awakening-dew.mp3` default preset.
10. Duplicate Pixabay API call per clip (`A\cinematic-engine.mjs:106-116`).
11. `broll-fetch.mjs:87-98` pre-bakes 150s of looping video per clip regardless of need — CI minutes wasted.
12. `quotequarry` defines `longSlot` twice; `'14:30'` shadows `'20:30'` (`A\yt-brands\brands.mjs:29-30`).
13. Cinematic-engine music-only volume is 0.85 while everything else sits 0.09–0.16 — no master loudness target anywhere, so perceived volume varies per video.

## A.4 Key media constants (for reference)

| Pipeline | Res/fps | Music vol | TTS |
|---|---|---|---|
| Shorts (script/quote) | 1080×1920 / 30 | 0.13–0.14 narrated | OpenAI→Kokoro→Edge, brand voices |
| Cinematic reels | 1080×1920 / 30 | 0.85 music-only | none |
| Deep-dive | 1080p / 30 | 0.09 | chain |
| DocV2 long-form | 1080p / **24** | 0.15 flat | Edge batch, Andrew/Guy, -2% rate |
| Teacher | 1080p / 30 | 0.15 | Edge +8% |
| Fonts | Anton, Oswald, Archivo Black, Inter, Playfair Display, JetBrains Mono, Cinzel (thumbs) | | |

---

# PART B — How top channels actually make videos (and the free replacements)

## B.1 Confirmed/typical stacks of the channels we compete with

| Channel | What's known | Source basis |
|---|---|---|
| **How Money Works** | **Storyblocks stock explicitly named** as the production-time lever; editing outsourced; narrates himself — audience revolted when a substitute narrator was tried ("We need to hear you") | [Rational Reminder Ep. 276](https://rationalreminder.ca/podcast/276) [Confirmed] |
| **MagnatesMedia** | After Effects motion-graphics documentary style (an entire "Edit Like Magnates Media" tutorial genre exists); small editor team | [motionstreet.thinkingtales.com](https://motionstreet.thinkingtales.com), Fiverr "magnatesmedia style" listings [Inferred AE] |
| **Modern MBA** | Solo creator, **2–4 weeks and hundreds of hours per video**, all roles | [Patreon About](https://www.patreon.com/modernmba) [Confirmed workflow] |
| **Logically Answered** | Dedicated pro editing team; team upgrade credited with breaking a 100K-views plateau | [CreatorsBoost case study](https://www.creatorsboost.com/case-study/logically-answered) |
| **ColdFusion** | Historically fully solo, Premiere-era audio chain; own ambient music (he's also a musician); now added editors | Wikitubia + r/premiere analysis threads |
| **Vox / Johnny Harris** | In-house motion design; Johnny Harris = **Premiere + After Effects + GEOlayers 3 animated maps**; technique = vividly treated stills (Ken Burns on steroids), match cuts on text, mask reveals | his own tutorials + [Motion Array](https://motionarray.com), [PremiumBeat](https://www.premiumbeat.com) [Confirmed] |
| **Faceless AI shorts tier** | Standard 2026 stack: LLM script → **ElevenLabs** voice → Midjourney/stock → template video API (json2video/Creatomate) → auto-captions → upload API, orchestrated in n8n | [n8n templates](https://n8n.io), [Creatomate](https://creatomate.com) |

**Takeaway:** the top tier is not separated by tools — it's separated by (1) one consistent voice identity, (2) b-roll density + unified color treatment, (3) layered sound design, (4) a repeatable motion language. **All four are reproducible in code.** Also noted: ColdFusion made a June 2026 video about YouTube's "$117M AI slop problem" — YouTube's July 2025 "inauthentic content" policy punishes undifferentiated AI output; the premium techniques in this doc are exactly what the policy rewards.

## B.2 Premium tool → free CI-automatable replacement

| Premium tool (2026 price/mo) | Free replacement | License | Fits our CI? |
|---|---|---|---|
| Premiere Pro ($23) + After Effects ($23) | **Remotion + ffmpeg** (already own) | Remotion free ≤3 employees | ✅ already the engine |
| Storyblocks ($21–35) | **Pexels API + Pixabay API + Mixkit + Coverr** | commercial, no attribution | ✅ (Pexels/Pixabay keys in use) |
| Artgrid cinematic look | free **.cube LUTs** via ffmpeg `lut3d` (one grade = the "cinematic" cohesion paid stock sells) | per-pack, commercial packs listed in Part D | ✅ |
| Epidemic Sound ($10–18) / Artlist ($32) / Musicbed ($30–100) | **incompetech (CC BY, keep)** + **Pixabay Music** (vendored, no attribution) + **Mixkit music** + YT Audio Library (manual dump) + archive.org FreePD/PD mirrors | all commercial OK | ✅ |
| ElevenLabs free tier | **DO NOT USE — free tier is explicitly non-commercial + attribution required.** Keep **Kokoro-82M (Apache 2.0)**; pilot **Chatterbox Nano (MIT, 3× realtime on CPU)** for a signature voice | Kokoro Apache 2.0 | ✅ |
| Midjourney ($10+) | **Pollinations/FLUX.1-schnell** (Apache 2.0) — already the engine | commercial OK | ✅ |
| Hormozi caption tools / CapCut Pro | **faster-whisper + @remotion/captions** (`createTikTokStyleCaptions()`) — we already have word timings | MIT | ✅ |
| Canva Pro | thumbnails already rendered in code (Remotion still / PIL) | — | ✅ |
| GEOlayers/Earth Studio maps | **DO NOT USE Earth Studio (no commercial license, ever).** Natural Earth/OSM GeoJSON + Remotion SVG paths + MapLibre = the animated-map look, clean licensing | PD/ODbL | ✅ (later) |
| Envato Elements ($16.50) | Wikimedia Commons + Openverse + NASA (public domain) — perfect for finance-history photos | PD/CC | ✅ (Teacher already uses this chain) |
| AI music (Suno free) | **DO NOT USE — non-commercial.** MusicGen weights CC-BY-NC — DO NOT USE. Stable Audio Open = only clean path but needs registration | — | skip |
| **Total avoided** | **≈ $160–280/month** | | |

---

# PART C — AUDIO deep-dive (the biggest missing layer)

## C.1 Priority order (max premium-feel per effort)

1. **Master loudness normalization — two-pass `loudnorm` on every final mix.** Target: YouTube's own playback level `I=-14, TP=-1.0, LRA=11`, `linear=true`. We normalize nothing today → videos vary in perceived loudness and YouTube turns us down at playback. *The single biggest perceived-quality jump in the whole stack.* Recipe:
```bash
# pass 1 (measure): ffmpeg -i mix.wav -af loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json -f null -
# pass 2 (apply with measured_* values, linear=true) → encode AAC 256k 48kHz
```
2. **Voice processing chain (ffmpeg, before mixing):**
```bash
highpass=f=75, lowpass=f=12000, deesser=i=0.3:m=0.5:f=0.5,
acompressor=threshold=-18dB:ratio=3:attack=8:release=120:makeup=1.6
```
   = "radio" polish on Kokoro/Edge; hides TTS micro-dynamics. Optional warmth: +1.5dB at 200Hz and 3.5kHz.
3. **SFX starter kit — the single largest gap. Zero sound effects anywhere.** Vendor ~24 CC0/free sounds into `assets/sfx/<category>/`, wire the top 8 first (click, pop, whoosh, riser, impact, cha-ching, coin, success chime) at **volume 0.12–0.2**, 80–250ms, timed to cuts/stat-reveals:

| Sound | Use | Free source |
|---|---|---|
| UI click / notification pop | counters, number appears | **Kenney.nl UI + Interface packs (CC0)** |
| Whoosh short/long | transitions, section changes | Mixkit SFX / Pixabay SFX |
| Cinematic riser 2–4s | build-up before reveal | Pixabay/Mixkit |
| Deep boom / impact | crash stat, shocking number | Kenney Impact Sounds (CC0) |
| Cash register / coins / money counting | profit beats, totals | Pixabay SFX |
| Paper rustle / camera shutter | document reveals | Freesound CC0 / Mixkit |
| Error buzz / success chime | red/green numbers | Kenney (CC0) |
| Clock tick / heartbeat loops | deadline/debt tension | Pixabay |
| Ambience loops 30–60s (office/rain/city/crowd) | documentary beds at 0.05–0.08 | Pixabay/Freesound CC0 |
| Rocket rumble / mission beeps | big-moment stingers | NASA audio (public domain) |

   Sources ranked: **Kenney.nl (CC0, stable ZIPs)** > **Mixkit SFX (free license, no attribution)** > **Pixabay SFX (no audio API — vendor manually)** > **Freesound API (CC0 filter; previews download with plain token, originals need OAuth2)**. **BBC Sound Effects = DO NOT USE (RemArc license is non-commercial).** Zapsplat = pilot only (mandatory credit).
4. **Music ducking — `sidechaincompress`** so the bed dips under voice and breathes between sentences (music stops being flat wallpaper):
```bash
[0:a]asplit=2[sc][v]; [1:a]volume=0.25,afade=t=in:st=0:d=2[m];
[m][sc]sidechaincompress=threshold=0.03:ratio=6:attack=150:release=900[mduck];
[v][mduck]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.97[out]
```
   Slow attack/release = "breathing" broadcast duck. Bed pre-duck volume ≈ 0.25 → ducked floor lands ~0.10. (Gotcha: `amix normalize=0` required since ffmpeg 4.4.)
5. **Sentence-pause TTS pacing:** synth per sentence, concat with `anullsrc` gaps — 0.25–0.45s (shorts) / 0.5–0.7s (docs); or global `atempo=0.97` calm-down.
6. **Music pool expansion (vendored):** curate 10–15 Pixabay cinematic + phonk tracks per brand mood (trend-safe, attribution-free). **FreePD.com confirmed permanently closed (2008–2025)** — its PD catalog survives on archive.org mirrors (automatable). Remove any freepd.com references. Jamendo = pilot-with-caution only (API ToS non-commercial + CC-BY-NC tracks mixed in). Uppbeat = skip (3 downloads/mo, per-download credit codes, no API).
7. **Signature voice pilot:** keep Kokoro as backbone (still best CPU TTS in 2026, Apache 2.0); A/B **Chatterbox Nano (MIT, voice cloning, ~3× realtime on 8-core CPU)** vs best Kokoro voice on one real script. NeuTTS Air (Apache 2.0) = alternative. **Fish Speech/OpenAudio = DO NOT USE (CC-BY-NC-SA).** ElevenLabs free = non-commercial, skip. Cloud TTS free tiers are all either NC, attribution-required, or one-time — our OpenAI→Kokoro→Edge chain stays the right architecture.
8. **Freesound CC0 API pipeline** (token search + preview-MP3 downloads) — only after 1–5, to grow the SFX kit automatically.

## C.2 Chain order (authoritative)

```
voice:   EQ → deesser → acompressor → level
music:   volume → afade in/out → sidechain-duck against voice
sfx:     spot-timed adelay, volume 0.12–0.2
ambience: loop, volume 0.05–0.08, ducked too
ALL → amix (normalize=0) → master loudnorm (I=-14 TP=-1 LRA=11, two-pass) → AAC 256k 48kHz
```
Node: skip wrapper libs; `ffmpeg-static` + `execFile` with array args; parse loudnorm JSON from stderr.

---

# PART D — VISUAL deep-dive (animated / premium / realistic for $0)

## D.1 Priority order

1. **Stock VIDEO b-roll in long-form (stills→motion = biggest realism jump).** Pexels video API uses the **same key as photos** (`/videos/search`, 4K via `size=large`, 200 req/hr, commercial no-attribution). Pixabay video API also available (~100 req/60s). Coverr = tertiary (attribution required). Mixkit = hand-pick + vendor (no API). We already have a scored b-roll fetcher (`A\explainer\broll-fetch.mjs`) to reuse. ⚠️ Note: Pexels docs now point to base `https://api.pexels.com/v1/videos/` — verify our client's path.
2. **Universal film-finish pass on every render:** `noise=alls=10:allf=t` (temporal grain — never static) + `vignette=PI/5` + optional halation `split→gblur=sigma=20→blend=all_mode=screen:all_opacity=0.3`. Near-zero CPU. This one step kills the "slideshow" look.
3. **Ken Burns 2.0 on all stills (DocV2 photos are static today).** Rules so it never looks cheap: ease both ends (`Easing.inOut(Easing.sin)` / `spring()` — never linear), 5–15% scale total, **alternate direction between consecutive stills**, never reveal edges (baseline scale ≥1.05), + tiny constant drift so shots breathe.
4. **Caption upgrade to the 2025/26 standard:** keep karaoke timing, add **color-pop keywords** + **per-word spring pop-in** + **number emphasis** (dollar/% figures pop + accent color — the finance retention hook). `@remotion/captions` + `createTikTokStyleCaptions()`; our whisper word-timings already exist. Reference implementation: github.com/vshukla7/remotion-captions-themes.
5. **One committed LUT = the channel look.** Free commercial-safe packs: IWLTBAP 10 free packs, RocketStock/Pond5 "35 Free LUTs", PremiumBeat 180+, Juan Melara print-film emulations. Apply `lut3d=look.cube`. "Premium finance doc" recipe if we build our own: lifted blacks ~5–8 IRE, soft S-curve, subtle teal shadows / warm highlights, saturation ~90%, then grain+vignette finish.
6. **Ambient overlay layer:** Pexels/Pixabay dust/light-leak/bokeh loops (7k–14k clips each) at `mix-blend-mode: screen`, 20–40% opacity, over stills and charts = instant life.
7. **2.5D parallax hero treatment (1–2 stills per video):** `rembg` (MIT) + U²-Net model (Apache 2.0), `u2netp` ≈ 0.5–2s/image on CI CPU — cutout subject drifts at a different rate than background. Cache the auto-downloaded model dir (`~/.u2net/`) in Actions. Fallback: MiDaS-small depth map (MIT, ~1–3s/img) for displacement parallax. **RMBG-2.0/Bria = DO NOT USE (NC).**
8. **Lottie micro-animations** via `@remotion/lottie` (official, CPU-safe): hand-pick ~20–40 finance animations (arrows, coins, charts, checkmarks) from LottieFiles (Simple License = commercial OK, no attribution; daily download caps → vendor once). unDraw/OpenPeeps re-verified commercial-safe.
9. **Typography refresh (cheapest premium signal):** add **Fraunces** (display serif, "money magazine" personality) + Inter (already have); **Space Grotesk + IBM Plex Mono** for figures/tickers. All Google Fonts OFL, embeddable via `@fontsource/*`. Shorts captions stay Anton/Archivo Black.
10. **Transitions:** whip-pan (directional blur + hard translate, 6–10 frames), mask wipes (animated `clip-path`), zoom-punch on beat/number (`spring` damping 12–20, scale →1.03). Tiny spring shake (2–6px, 0.2–0.4°) on impacts — felt, not seen.

## D.2 AI video free tiers — verdict: specials only, no CI path

Kling (~66 credits/day), PixVerse (most daily credits), Google Flow/Veo 3.1 (~50 credits/day) = the only daily-refreshing free tiers — all web-only, watermarked, murky commercial terms on free. Runway/Pika/Luma/LTX = one-time credits. HuggingFace ZeroGPU ≈ minutes/day, UI-first — not for CI. **Use: 1–2 manually-generated hero shots per special video, downloaded and committed as assets. Never build CI automation on them.** No new free keyless image APIs in 2026 — Pollinations stays the stills engine (⚠️ smoke-test keyless access; mixed signals about API keys now being required).

## D.3 Skip list (GPU / not-$0 / NC)

Local AI video (SVD/Wan/Hunyuan/LTX local) — no GPU. Stable Video Diffusion original weights — research-restricted. fal.ai/Stability APIs — no permanent free tier. RIFE frame interpolation at scale — CI minutes not worth it. Videvo bulk — mixed per-clip licenses + caps.

---

# PART E — THE PLAN (numbered, $0, CI-safe — awaiting "go")

**Group 1 — Bug fixes (highest urgency, touches daily videos):**
1. Fix DocV2 stat beats (compute `big`/`label` like the legacy storyboard did) — stops blank scenes in tomorrow's uploads.
2. Fix `execFileSync` import in yt-daily.mjs (FB frames).
3. Fix/remove dead `page()` in yt-deepdive.mjs so chapters actually use 4K b-roll + drift pan (or retire deep-dive path — decide).
4. Add `normalize=0` to deep-dive amix; remove ghost `YT_TTS_EDGE_VOICE`; fix quotequarry `longSlot` shadow.

**Group 2 — Audio premium layer (biggest perceived-quality jump, pure ffmpeg):**
5. Master `loudnorm` (-14 LUFS) on all pipelines.
6. Voice chain (EQ→de-ess→compress) on TTS output.
7. SFX kit: vendor ~24 Kenney/Mixkit/Pixabay sounds; wire top 8 into shorts + doc templates at cuts/stat reveals.
8. Sidechain music ducking everywhere; bed volume 0.25 pre-duck.
9. Sentence-pause pacing for TTS.

**Group 3 — Visual premium layer:**
10. Pexels VIDEO b-roll in DocV2 long-form (reuse broll-fetch scoring).
11. Ken Burns 2.0 on all DocV2 stills (eased, alternating, no edges).
12. Universal finish: temporal grain + vignette (+ optional halation) on all renders.
13. Caption upgrade: color-pop keywords + word pop-in + number emphasis (shorts + docs).
14. One LUT look committed + applied; typography refresh (Fraunces/Space Grotesk).
15. Later/optional: parallax heroes (rembg), Lottie pack, ambient overlay layer, map graphics, Chatterbox Nano voice pilot, dedupe the duplicated longvideo pipeline across repos.

Groups 1–2 are the recommendation for the first "go": bug fixes + the audio layer alone move perceived quality more than anything else per hour of work, and everything in them is small, testable, and reversible.

---

*Research docs feeding this file: top-channel stacks + free mapping (agent B), free audio deep-dive (agent C), free visual deep-dive (agent D) — full agent reports retained in conversation; every external claim above carries its source link inline.*
