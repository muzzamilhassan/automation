# Thumbnail Template Research 2026 — Quarry Studio Expansion (3 → 20+ templates)

Compiled 2026-10-11. Research agent output for the Quarry Studio faceless-YouTube SaaS thumbnail engine (1280x720 SVG→JPEG, vector text, soft shadows, accent-color words, chips/eyebrows, background photo from Pexels/Wikipedia/upload/AI).
Every claim carries a source URL. Numbers that are industry claims rather than measured data are marked **[estimate]** or **[claim]**.

---

## SECTION 1 — 2026 THUMBNAIL DESIGN TRENDS + MASTER STYLE CATALOG

### 1.1 Macro trends shaping 2026 thumbnails (from design-industry trend reports)

| Trend report | What it says | Relevance to thumbnails |
|---|---|---|
| **Canva "Imperfect by Design" (Dec 10, 2025)** | 10 trends; searches for "clean layout," "serif," "simple branding" up **54% YoY** (45M+ impressions); "liminal" and "uncanny" up **220% YoY** (2M+ views); serif revival; handcrafted imperfect touches (scribbles, broken grid, mixed fonts) alongside AI. Sources: [Canva Newsroom](https://www.canva.com/newsroom/news/visual-design-trends-2026/), [Creative Bloq coverage](https://www.creativebloq.com) | Serif display type + clean layout for premium/documentary looks; hand-drawn annotation accents; moody liminal backgrounds |
| **Envato Graphic Design Trends 2026 (Nov 2025)** | 8 styles: AI evolution, **retro futurism** (metallic textures, muted 60s neons, film grain, halftones), **chaos packaging** (maximalist anti-design), **neo-minimalism** (warm textures, serif + neutral grotesk, "deep chocolate, sage or slate" instead of beige), **saturation revival** (jewel tones, neon dashes, single-hue brand dominance), **organic flow**, **multi-dimensional interactivity** (2D/3D collage depth), **dual aesthetics** (maximalism + minimalism). Source: [Envato Elements](https://elements.envato.com/learn/graphic-design-trends) | Feeds: dark-luxury minimal, retro VHS/grain, magazine-editorial, 3D-render, collage styles |
| **Adobe 2026 Creative Trends report** | 23-page report; "renewed focus on human connection" as the cultural signal. Source: [Adobe business blog](https://business.adobe.com) (report landing page) | Authentic/emotional imagery over sterile stock |
| **Behance Design Trends 2026 (Dec 2025)** | "2026 is bold with color again": dynamic palettes, **gradient layering, duotones, reactive color schemes**. Source: [Behance](https://www.behance.net) | Duotone background treatment (cheap to do in SVG pipeline via CSS filters/masks) |
| **Thumby "YouTube Thumbnail Trends 2026" (May 2026)** | The 9 click rules and 7 algorithm-demoted looks — see 1.2 below. Source: [Thumby blog](https://thumby.app/en/blog/youtube-thumbnail-trends-2026) | The most thumbnail-specific 2026 dataset found |
| **Illustration trends 2026 (GetIllustrations)** | **Neo-brutalism, hand-drawn revival**, AI-resistant styles. Source: [getillustrations.com](https://getillustrations.com) | Big-type brutalist, hand-sketched arrow/underline accents |
| **Glassmorphism is back (2026)** | Driven by Apple's Liquid Glass (macOS/iOS Tahoe 26): frosted blur, translucent layers. Sources: [Orizon](https://www.orizon.co), [Apple](https://www.apple.com) | Frosted-glass panel for text zones — directly buildable in SVG (blur + translucency) |

### 1.2 The 9 rules + 7 demoted anti-patterns (Thumby, May 2026) — the strongest thumbnail-specific 2026 source

Source: [thumby.app/en/blog/youtube-thumbnail-trends-2026](https://thumby.app/en/blog/youtube-thumbnail-trends-2026)

**Winning rules:**
1. One focal subject at 30–50% of frame
2. Three words max on-image text (drifting toward 1–2 words; zero-text often wins)
3. Closed-mouth determined expression beats wide-eyed shock by **15–20% CTR [claim]**
4. Hybrid faces (real photo + AI background) beat fully-AI thumbnails by **18–22% [claim]**
5. **Sticker-effect lighting** — warm key ~3500K, cool background ~6000K, cyan/magenta rim, 2–4px stroke, teal-orange grade: "the dominant 2026 look" (MrBeast, Yes Theory, MKBHD, Joshua Weissman)
6. Contrast in BOTH luminance and hue — complementary pairs blue/orange, cyan/magenta, yellow/violet, red/cyan
7. Mobile-first readable at 120 px (63% of watch time is mobile)
8. Keep the right-edge overlay zone clear
9. Vary one strategic axis per A/B variant (emotion vs hero-object vs number/stakes)

**Demoted anti-patterns (avoid in new templates):** generic centered stock composition; 3+ small competing faces; rubbery hyper-polished AI face; wide-eyed shock default; tiny text; text in bottom-right (duration-badge zone); 5+ words.

### 1.3 MASTER TABLE OF STYLES

Legend — **Buildable**: "photo+overlay" = works with Quarry Studio's background-photo + vector-text pipeline (no cutout characters/montage compositing needed). "AI-art" = background should come from AI image generation, not stock. "Composite" = needs cutouts/montage (deprioritize).

| # | Style | Description | Psychology (why it works) | Example channels / niches | Buildable? | AI-prompt / Pexels idea |
|---|---|---|---|---|---|---|
| 1 | **Single hero object + big text** | One unmistakable subject (coin, statue head, burning card, locked door) large in frame, 3–4 word all-caps headline, one accent-colored word; lower two-thirds or one side kept dark for text | Object = instant topic read; emptiness = fast parsing at 120px | Treza faceless guide formula (Rule A/B); finance, stoicism, tech [Trezalabs](https://www.trezalabs.com) | **Yes — photo+overlay**; template = dark vignette + centered/left subject zone | "single [OBJECT] centered, dramatic rim light, dark charcoal backdrop, left third plain dark negative space, cinematic" / Pexels: "gold bar black background" |
| 2 | **Emotion close-up (statue/silhouette variant for faceless)** | Extreme close-up of a face — for faceless channels substitute marble statue, hooded figure, or silhouette; strong single emotion | Faces/sentiment drive clicks — sentiment analysis of 16,215 YouTube covers found strong sentiment → more views [Cui 2024, ScienceDirect](https://www.sciencedirect.com); expressive faces claimed +20–45% CTR **[claim]** ([thumbnailcreator.com](https://www.thumbnailcreator.com)) | Stoicism niche: Greek busts are iconic; motivation, self-improvement | **Yes — photo+overlay (AI-art)** | "marble statue of Roman philosopher, extreme close-up, dramatic side lighting, dark stormy sky, gold rim light" / Pexels: "greek statue close up dark" |
| 3 | **Giant equation "X = Y"** | Huge typographic equation (e.g., "$1 = 100 Views", "SLEEP = WEALTH") filling one half | Equation = unresolved math the brain wants to close (curiosity gap); ultra-legible pure type | Finance/education explainer channels; [thumbs.ai math-thumbnail templates](https://www.thumbs.ai/math-thumbnail); How-Money-Works-adjacent | **Yes — photo+overlay, zero background dependency** | Any moody background (trading floor bokeh); text IS the design — vector type renders it perfectly |
| 4 | **Giant number listicle "7 RULES"** | Massive outlined/stroked number (often yellow with black stroke) + short title | Number promises finite, digestible payoff; numbers are pre-attentively processed | Self-improvement, listicle docs; [1of10 font/number guidance](https://1of10.com/blog/youtube-thumbnail-design); [ygen.app color data](https://ygen.app) (yellow/orange = urgency) | **Yes — photo+overlay**; pure vector text + stroke = our native strength | Dark moody backdrop (storm, city at night); number as overlay |
| 5 | **Burning question** | Question-mark framed headline ("Why Is NOBODY Talking About This?") with visual of the mystery subject | Open loop / information-gap theory | VIDIQ lists it among top styles [VIDIQ](https://vidiq.com/Blog); commentary, finance, true crime | **Yes — photo+overlay** | Subject photo + serif italic question + accent "?" |
| 6 | **Before/After split** | Vertical split: left "before" (desaturated/dark), right "after" (bright/saturated), thin divider, two small labels | Transformation narrative = outcome proof; contrast does the attention work | VIDIQ "Before-and-After Transformations" style; glow-up, investing, renovation niches | **Yes — photo+overlay** (two stacked background images + divider + labels — all SVG-native) | Two Pexels/AI images: "cluttered desk" vs "minimal luxury office" |
| 7 | **VS comparison** | Split screen with two contenders + big "VS" medallion center | Competition framing triggers tribal pick-a-side engagement | VIDIQ "Versus" style; sports, finance ("CASH vs CREDIT"), tech | **Yes — photo+overlay** | Two images + center chip; VS badge is pure vector |
| 8 | **Facts/stats / data-viz hero** | One giant stat "$0 → $1M" or a simple 2-bar chart; minimal else | Concrete numbers = credibility + stakes; specificity is clickable | VIDIQ "Facts and Stats"; becomeviral faceless guide lists data-viz as emotional-trigger substitute [becomeviral.com](https://becomeviral.com/blog/faceless-youtube-thumbnail-guide) | **Yes — photo+overlay** (SVG charts trivially) | Dark blurred cityscape background; chart as vector overlay |
| 9 | **Dark luxury minimal / "old money"** | Near-monochrome dark bg, single warm accent (gold/amber), elegant serif headline, generous negative space, marble/watch/car subject | Quiet-luxury aesthetic trend; scarcity+aspiration signaling; restraint reads premium and stands out in a loud feed | Old-money/luxury niche ($12–18 CPM [faceless.my](https://faceless.my/Faceless%20Niche%20Guides)); [ContentStudio old-money guide](https://contentstudio.io) | **Yes — photo+overlay (AI-art)** | "wristwatch on dark silk, single amber rim light, deep shadows, editorial product photography" / Pexels: "luxury watch dark" |
| 10 | **Documentary collage / editorial montage** | 2–4 layered photos, halftone/paper texture, torn edges, headline bar — "print investigation" look | Density signals depth/effort (documentary authority); differentiates from clean stock feed | Vox, Johnny Harris, James Jani family of doc channels [shashankpandey.com](https://www.shashankpandey.com/2023/04/documentary-thumbnail-design-vox-johnny.html); true crime | **Partial — photo+overlay possible** (2-3 images + SVG collage layout), full collage requires care | Pexels pairs: archival + modern of same subject; overlay halftone texture + slab-serif headline bar |
| 11 | **Retro newspaper / vintage print** | Aged-paper texture, serif masthead, dateline chip, black-and-white duotone photo, headline rules | Novelty via nostalgia; "printed press" = seriousness/trust; pattern-interrupts modern-gloss feed | Video essays, conspiracy/true-crime, history; Canva news-style templates; vintage print templates trending ([BrandPacks](https://www.brandpacks.com) via search) | **Yes — photo+overlay**; duotone + paper texture + all-serif type are SVG/filter-native | Pexels: "vintage newspaper"; AI: "aged newspaper front page texture, halftone" |
| 12 | **Magazine cover** | Masthead top, cover lines down one side, barcode gag, single portrait/object | Familiar editorial grammar = premium, "this is a story about something big" | Business/wealth docs, profile-style video essays | **Yes — photo+overlay** | AI/Pexels portrait or object, vector masthead + cover lines |
| 13 | **Map / strategy diagram** | Dark world map, glowing route lines, arrows, target markers, 1–3 labels | Spatial reasoning = "this is analysis," arrows imply causality; geopolitics niche staple | RealLifeLore-style geography/geopolitics, business-strategy docs (Modern MBA adjacent) | **Yes — photo+overlay (AI-art for map)** | "dark world map, glowing cyan route lines, city markers, top-down" (AI) or public-domain map + SVG overlay |
| 14 | **Timeline / roadmap** | Horizontal timeline with 3–4 milestone nodes, era labels | Promise of structured journey ("how X got here") | Company-history docs (Company Man, MagnatesMedia-adjacent), finance eras | **Yes — photo+overlay** | Any dark backdrop; timeline is pure SVG |
| 15 | **Sticker-effect subject** | Subject cut out with crisp rim light + 2–4px stroke floating over contrast background — "dominant 2026 look" per Thumby | Figure/ground separation = pops in feed at any size | MrBeast, Yes Theory, MKBHD, Joshua Weissman [thumby.app](https://thumby.app/en/blog/youtube-thumbnail-trends-2026) | **Partial** — needs background removal (doable: AI image of subject on plain dark bg + luminance-key, or accept "lit-from-within" pseudo-sticker via glow) | "single [OBJECT], glowing cyan-magenta rim light, isolated on pure black background, sticker style, 4px outline" |
| 16 | **Retro futurism / VHS-grain** | Film grain, halftone, scanlines, muted 60s-neon palette, CRT vignette | Nostalgia + tactile warmth (Envato trend); grain hides AI/stock glossiness | Tech-history, documentary, synthwave-adjacent niches [Envato](https://elements.envato.com/learn/graphic-design-trends) | **Yes — photo+overlay** (grain/scanline = SVG filter layer) | "retro 1960s space age illustration, film grain, halftone, muted neon" (AI) / Pexels: "vintage computer" |
| 17 | **Brutalist big-type** | Huge condensed type as the image; harsh black/white + one acid accent; tilted baseline | Type-as-image is maximal contrast; neo-brutalism is a named 2026 illustration trend | Commentary, media-criticism, edgy finance ("BROKE.") [getillustrations.com](https://getillustrations.com) | **Yes — photo+overlay (overlay IS the design)** | Texture/blur background only; all type |
| 18 | **Glassmorphism panel** | Frosted translucent panel holding the headline over vivid background; thin light border | Apple Liquid Glass mainstreaming; panel guarantees text contrast on any busy background | Tech/SaaS explainers, productivity | **Yes — photo+overlay** (SVG blur + translucency) | Vivid colorful background (aurora gradient, city bokeh); panel is vector |
| 19 | **Aurora duotone gradient** | Background photo mapped to 2-color duotone (e.g., molten teal + coral) + soft glow | Duotone/gradient layering is a named 2026 trend (Behance); unifies mismatched stock into branded look; text contrast guaranteed | Stoicism, music, motivation faceless channels | **Yes — photo+overlay** (SVG duotone via feComponentTransfer/filter) | Any Pexels photo + duotone filter; type in white + accent |
| 20 | **Manga/anime illustrated panel** | AI-generated anime-style scene or character reacting; speed lines, bold ink | Anime aesthetic = massive youth reach; illustrated = differentiates from photo feed | Anime recap, gaming, story channels | **Yes — AI-art background + overlay** | "anime style, dramatic panel, speed lines, [scene], bold ink shading, no text" (Agnes/Ideogram) |
| 21 | **Soft 3D render object** | Glossy soft-3D coin/brain/chart floating, studio light, pastel or dark stage | 3D/soft-icon demand rising (Envato icon trends); dimensional = tactile + premium | Fintech, AI/tech explainers | **Yes — AI-art background + overlay** | "soft 3D render, glossy [object], studio lighting, dark backdrop, octane style" (Agnes) |
| 22 | **Liminal / eerie atmosphere** | Empty liminal space (empty mall, fog, endless corridor), desaturated, single subject small in frame | "Liminal/uncanny" searches +220% YoY (Canva); unease = curiosity | Mystery, space, psychology, "what happened to X" docs | **Yes — photo+overlay (AI-art)** | "liminal space, empty endless corridor, fluorescent hum, fog, desaturated, unsettling" (AI) / Pexels: "abandoned mall fog" |
| 23 | **POV first-person hands** | First-person view: hands holding phone/keys/money, subject looming ahead | Immersion — viewer IS the protagonist; body-cam familiarity | Tech unboxing style, finance ("checking my portfolio"), survival | **Yes — AI-art background + overlay** (hard to find exact POV on Pexels; AI nails it) | "POV first person view, hands holding [object], looking at [scene], cinematic" (AI) |
| 24 | **Isometric strategy** | Isometric city/factory/flow diagram with labels | Reads as "system explained"; satisfying completeness | Tech/business explainers, crypto/infra docs | **Yes — AI-art + overlay** (isometric photo rare; AI strong) | "isometric 3D illustration of [system], clean dark background, labeled nodes" (AI; Recraft/FLUX strong here) |
| 25 | **Hand-drawn annotation** | Photo + hand-drawn arrows, circles, underlines, chalk-style notes | Hand-drawn revival + "Imperfect by Design" (Canva); sketch marks = human analysis, guide the eye | Education, finance markups, sports analysis | **Yes — photo+overlay** (SVG hand-drawn-style strokes + marker font) | Any photo; arrows/underlines as vector strokes with rough filter |
| 26 | **Blurred-speed motion** | Horizontal motion blur / zoom burst on subject, speed streaks | Motion = urgency; streaks imply "this is moving fast" | Finance ("crash"), sports, cars, drama niches | **Yes — photo+overlay** (motion blur = SVG filter on bg or pre-blurred photo) | Pexels: "speed blur night city"; AI: "long exposure motion blur, [subject] streaking" |
| 27 | **Vignette portrait silhouette** | Backlit silhouette (lone figure) against bright source, heavy vignette, one accent word | Silhouette = universal self-projection (works faceless); vignette focuses eye center | Stoicism, motivation, drama channels | **Yes — photo+overlay** | Pexels: "silhouette man against sunset"; AI: "lone figure silhouette, backlit, fog, vignette" |
| 28 | **Serif quote / soundbite** | Large elegant serif pull-quote in quotation marks, attributed chip | VIDIQ "Quotes or Sound Bites" style; authority-by-association (Warren Buffett etc.) | Finance, stoicism, interview clips | **Yes — photo+overlay (pure type)** | Subtle background (paper, marble, office bokeh); quote as hero text |
| 29 | **Shocked reaction + big contrast text** | Wide-eyed open-mouth face + 2-3 word all-caps text | Peak-arousal faces arrest attention; but 2026 data says **declining** — closed-mouth determined beats shock by 15–20% CTR [claim] ([thumby.app](https://thumby.app/en/blog/youtube-thumbnail-trends-2026)); YouTube now demotes the "shock default" anti-pattern | Commentary/drama (MrBeast-style); still works for his audience but stale as a default | **Composite for faces; faceless variant = statue/AI-character reaction** | Avoid as default; if used, AI-character with determined closed-mouth expression |
| 30 | **Red arrow + circle highlight** | Red arrow pointing at a circled detail | Points eye to the payoff; but heavily commoditized — now a pattern to *break* per the faceless "pattern-interrupt" rule [becomeviral.com](https://becomeviral.com/blog/faceless-youtube-thumbnail-guide); MrBeast's own style remains A/B-tested for him but reads dated in premium niches [artiphik MrBeast analysis](https://artiphik.com/Blog) | Kids/entertainment/challenge niches; increasingly parodied in finance/docs | **Yes — photo+overlay** | Keep ONE template with hand-drawn-style (not pure red) annotation for variety |

### 1.4 Recommended shortlist for 20+ Quarry Studio templates (researcher's synthesis — my mapping, marked as such)

Direct photo+overlay builds (highest fit with the SVG engine): #1 hero object, #2 statue close-up, #3 equation, #4 giant number, #5 burning question, #6 before/after, #7 VS, #8 stats, #9 dark luxury, #10 collage, #11 newspaper, #12 magazine, #13 map, #14 timeline, #17 brutalist, #18 glass panel, #19 duotone, #25 hand-drawn, #26 motion, #27 silhouette, #28 quote. AI-art-driven backgrounds add: #20 anime, #21 soft 3D, #22 liminal, #23 POV, #24 isometric. That is 26 distinct templates. Face-inclusive styles (#2 real-face, #29 shock, #15 sticker-face) are optional/deprecated for faceless channels.

---

## SECTION 2 — WHAT TOP FACELESS / DOCUMENTARY / FINANCE CHANNELS ACTUALLY USE

Note: most leaders do not publish design specs; descriptions combine citable analyses with direct visual observation of their current thumbnails (marked **[observation]**).

**Magnates Media** (business documentaries, multi-million subs)
- Formula **[observation + category shorthand]**: cinematic movie-poster composition; central illustrated/cutout subject or dramatic single photo; dark, desaturated period palettes with ONE saturated accent (usually amber/red); condensed serif/slab display type, 2–4 words, often with a small eyebrow chip ("The Man Who…"); heavy vignette. "James Jani style" + "Magnates Media style" are literal freelancer job-listing shorthand for this aesthetic (Upwork/Reddit job posts per search results).
- Cited as top faceless business-doc channel alongside Company Man, Modern MBA, Logically Answered — [faceless.my roundup](https://faceless.my)

**How Money Works**
- Flat minimalist illustration with limited palette, large sans-serif overlays, simple visual metaphors; deliberately anti-loud vs face-heavy finance channels (Graham Stephan style) — [search-surfaced consensus](https://www.blackhatworld.com) + freelance finance-thumbnail pattern listings (Fiverr "high CTR business and finance thumbnail" conventions: bold text, contrasting colors, curiosity framing)

**James Jani / Vox / Johnny Harris (documentary family)**
- "Strong text and striking images," high-contrast central hook image, short punchy text; each channel has distinct design elements — dedicated breakdown: [Documentary Thumbnail Design: Vox, Johnny Harris, and James Jani](https://www.shashankpandey.com/2023/04/documentary-thumbnail-design-vox-johnny.html) (the article confirms the styles but defers specifics to its gallery images)
- Johnny Harris signature **[observation]**: bold uppercase title text block + real photo + map/annotation motifs, warm film-grade color.

**Modern MBA**
- Minimalist, text-driven thumbnails; calm analytical narration; anthology business analysis positioning — [Patreon about](https://www.patreon.com), [faceless.my](https://faceless.my), Hacker News discussion

**Logically Answered**
- Stock-footage + research-led narration format; professionally designed thumbnails (hires via ytjobs.co) — [OutlierKit classification](https://outlierkit.com), [faceless.my](https://faceless.my)

**Moon (Moon Real)**
- Stylized typographic (non-face) thumbnails on long-form video essays on politics/films — [Wikitubia profile](https://youtube.fandom.com/wiki/Moon)

**The faceless meta-formula (synthesized from guides)**
- Overseeros formula: *viewer question + visual object + emotional contrast + simple background* — [overseeros.com](https://www.overseeros.com)
- Treza formula: single unmistakable subject + 3–4 word heavy-caps headline + ONE channel accent color + a fixed composition rule ("Subject centered, lower two thirds dark, headline across the bottom with one word in the accent colour" or "Subject hard left, headline stacked right") — [trezalabs.com](https://www.trezalabs.com)
- Becomeviral: thumbnail+title work as one curiosity-gap unit (title asks, thumbnail shows stakes); research top-10 competitor thumbnails then pattern-interrupt — [becomeviral.com](https://becomeviral.com/blog/faceless-youtube-thumbnail-guide)
- CTR benchmarks: <2% = failing; 2–5% average; 5–8% good; 8%+ excellent — [becomeviral.com](https://becomeviral.com/blog/faceless-youtube-thumbnail-guide); corroborated 3–4% average / 5–10% top by [VIDIQ](https://vidiq.com/Blog) and [Ampifire](https://ampifire.com)

**Niche CPM context (why these thumbnails matter)**
- Personal finance $15–25 CPM, luxury/wealth $12–18, investing sub-niches up to $20–40 **[estimate]** — [faceless.my](https://faceless.my/Faceless%20Niche%20Guides), [OutlierKit](https://outlierkit.com), [FlowShorts](https://flowshorts.app/faceless-youtube-channel-ideas)

---

## SECTION 3 — COMPOSITION ANGLES & PERSPECTIVES FOR BACKGROUND IMAGERY

Sources: [Adobe composition guides](https://www.adobe.com), [Digital Photography School](https://digital-photography-school.com), [Visual Education](https://visualeducation.com), [RMCAD](https://www.rmcad.edu) (focal placement on thirds guides attention fastest in crowded feeds).

| Angle / composition | What it looks like | Suits styles (#) | AI-prompt fragment / Pexels query |
|---|---|---|---|
| **Extreme close-up / macro** | Subject fills frame, texture visible | 2, 9, 15 | "extreme close-up macro of [object], shallow depth of field" / Pexels: "macro [object]" |
| **Low-angle hero shot** | Camera below subject looking up = power/dominance | 1, 2, 15, 27 | "low angle shot of [subject] against dramatic sky, heroic perspective" / Pexels: "low angle building" |
| **Bird's-eye / flat-lay** | Directly overhead, arranged objects | 9, 12, 25 | "flat lay of [objects] on dark surface, top down" / Pexels: "flat lay" |
| **Over-the-shoulder POV** | Viewer behind a figure facing the subject | 23 | "over the shoulder view, person facing [scene], cinematic" / Pexels: "over the shoulder" |
| **Dutch angle (tilt)** | 10–30° tilted horizon = tension/instability | 17, 26, drama | "dutch angle tilted horizon [scene], unsettling" |
| **Symmetrical centered one-point perspective** | Corridor/road vanishing to center; subject centered | 22, 13, 27 | "one point perspective, symmetrical corridor/road, vanishing point" / Pexels: "symmetry architecture" |
| **Silhouette against light** | Dark figure against bright sky/sun/window | 27, 2, 9 | "silhouette against bright backlight, sunset, fog" / Pexels: "silhouette sunset" |
| **Rule-of-thirds subject** | Subject on an intersection; other third kept clean for text | ALL — the default for overlay templates | add "subject positioned on right third, left side plain negative space" |
| **Leading lines** | Roads, rails, architecture drawing eye to subject | 1, 13, 26 | "leading lines converging on [subject], perspective" / Pexels: "leading lines" |
| **Negative space for text** | ≥1/3 of frame empty sky/wall/bokeh | ALL photo+overlay templates | "subject on right, large empty [sky/wall] on left for text placement" |
| **Fisheye / wide distortion** | Bulging wide-angle, exaggerated foreground | 26, gaming, cars | "fisheye lens distortion, [subject] looming, exaggerated perspective" |
| **Drone / aerial** | High-altitude landscape, tiny subject | 13, 22, documentaries | "aerial drone shot, [landscape], tiny lone figure" / Pexels: "aerial view" |

Practical notes for the engine:
- AI models handle literal "negative space" instructions poorly; describe the occupied area instead — "subject positioned on the right, left side is plain dark sky for text placement" — or outpaint empty space afterward ([TitanXT](https://titanxt.io), [Pippit](https://www.pippit.ai)).
- Because Quarry Studio composites text AFTER image generation, prefer prompts that end with a composition clause + "no text, no words, no watermark" negative terms ([VisionToPrompt](https://visiontoprompt.com), [Prodia](https://blog.prodia.com)).

---

## SECTION 4 — AI IMAGE GENERATION VIA API FOR BACKGROUNDS (2026 landscape)

| Provider / model | OpenAI-style API? | Price per image | Quality for thumbnail backgrounds | Speed / notes | Free tier | Reserved-space prompting |
|---|---|---|---|---|---|---|
| **Agnes AI gateway** (apihub.agnes-ai.com) — owner's existing free gateway | **Yes** — "compatible with OpenAI-style interfaces," migration = change base URL + key + model name. Base URL `https://apihub.agnes-ai.com/v1`, Bearer token. Sources: [Agnes docs](https://agnes-ai.com/doc/overview), [HN discussion](https://news.ycombinator.com), [openclawlaunch.com signup guide](https://openclawlaunch.com) | **Free** — community/HN sources describe an "indefinite free API"; official overview page does not state pricing (verify terms) **[unverified pricing terms]** | Image models offered (text-to-image, editing, stylizing) per docs; owner reports premium 2K art in ~15s with `agnes-image-2.5-flash` **[owner-reported]** | ~15s/image **[owner-reported]** | Yes (free API) | Standard prompt adherence; use composition clauses (Section 3) |
| **OpenAI gpt-image-1** | Yes (native) | 1024x1024: low ~$0.01–0.02, medium ~$0.04–0.07, high ~$0.17–0.19; text $5/M tok, image-in $10/M, image-out $40/M tok. Sources: [pricepertoken.com](https://pricepertoken.com), [OpenAI community pricing thread](https://community.openai.com) | Very good; strong prompt-following incl. layout instructions | ~10–60s; strong inpainting/outpainting (useful for making text zones) | None (pay per use) | **Good** — honors "subject right, empty left" instructions; outpainting fallback |
| **Google Imagen 4** (Vertex/Gemini API) | Yes | Fast $0.02, Standard $0.04, Ultra $0.06 — [magichour.ai guide](https://magichour.ai), [fal.ai](https://fal.ai) | Excellent photorealism | Fast (Fast tier seconds) | Limited trial credits | Good composition adherence |
| **Google Gemini image "Nano Banana Pro" (Gemini 3 Pro Image)** | Yes (Gemini API) | Output $30/1M tokens standard ($15/M batch); 1K image ≈ 1290 tokens → ~$0.04/image **[estimate]** — [Gemini API pricing](https://ai.google.dev) | Best-in-class **text rendered inside the image** + up to 4K; "precision text rendering" — [Google blog](https://blog.google), [AI Studio](https://aistudio.google.com/models/nano-banana), [DeepMind](https://deepmind.google/models/gemini-image/pro); thumbnail-tool reviews: "text rendering genuinely better… cleaner letter shapes" ([thumbfa.st](https://thumbfa.st/posts)) | Fast; 4K upscale | Limited free in Gemini app; API paid | **Best for baked-in text/multilingual**, though Quarry overlays its own vector text |
| **FLUX.1 family via fal.ai** | Yes (fal REST; also Replicate) | schnell ~$0.003, dev ~$0.025, 1.1 pro $0.04, pro ultra $0.06 (4MP) — [fal.ai pricing](https://fal.ai) | Pro/ultra = excellent cinematic realism; dev = great value | Ultra-fast (schnell ~1–4s) | None | Dev/pro follow layout clauses reasonably; Treza guide recommends FLUX.2 Pro "when the artwork must contain set type" ([trezalabs.com](https://www.trezalabs.com)) |
| **Recraft v3** | Yes (Recraft API + fal.ai + Replicate) | ~$0.04/image flat; SVG generation may cost more — [fal.ai](https://fal.ai), [recraft.ai](https://www.recraft.ai) | **Design/vector strength** — the pick for isometric/flat-illustration backgrounds and brand-consistent art | Fast | Limited free credits on web app | Good; strong at clean layouts |
| **Ideogram 3.0** | Yes (own API + aggregators) | Turbo ~$0.0175 (Kie.ai), Balanced ~$0.035–0.075, Quality ~$0.05–0.08; Together ~$0.06/MP — [Kie.ai](https://kie.ai), [Segmind](https://www.segmind.com), search-corroborated | **Best-in-class text inside images** (posters/signs) — [ideogram.ai](https://ideogram.ai) | Fast (turbo) | Free tier on web app (limited credits) | Good composition control; use when a template NEEDS legible type inside the art |
| **Stable Diffusion (self-host)** | OpenAI-ish via local servers (A1111/Comfy) | $0 compute cost (GPU time only) | Variable by checkpoint/LoRA | Slowest unless GPU | Free | Full control (ControlNet inpainting for exact text zones) |
| **Pollinations** | URL-based, OpenAI-ish gen endpoint | **Free** basic tier, historically no API key; new unified `gen.pollinations.ai`; tiers/referrer rules introduced 2024–2025, some models now need registration — [Pollinations GitHub](https://github.com/pollinations/pollinations) | Variable by model (flux/turbo backends); fine for drafts | Seconds | Yes (anonymous tier) | Basic prompt adherence |

**Recommendation logic for Quarry Studio (synthesis, marked as mine):** keep Agnes as the free default generator for all AI-art templates (anime, 3D, liminal, POV, isometric, luxury), add Pollinations as an anonymous fallback, and use paid gpt-image-1/Imagen 4/FLUX only as premium tiers per image. Ideogram/Nano Banana Pro are unnecessary for our pipeline since text is overlaid in SVG — reserve them only for baked-in-text experiments. See Section 3 for the reserved-space prompting pattern ("subject on right, plain left third").

---

## SECTION 5 — COLOR & TYPE TRENDS FOR 2026 THUMBNAILS

**Palettes**
- **Complementary pairs are the 2026 standard**: blue/orange, cyan/magenta ("the sticker combo"), yellow/violet, red/cyan; mono-tone fails mobile scanning — [thumby.app](https://thumby.app/en/blog/youtube-thumbnail-trends-2026)
- **Saturation revival**: deep jewel tones + neon dashes; unexpected pairs (milk-chocolate brown + sky blue, grey + acid orange); single-hue dominance for brand recognition — [Envato](https://elements.envato.com/learn/graphic-design-trends)
- **Neo-minimal palette shift**: deep chocolate, sage, slate replace beige; serif + neutral grotesk pairing — [Envato](https://elements.envato.com/learn/graphic-design-trends)
- **Duotones + gradient layering + aurora (warm-cool blend) gradients** trending — [Behance](https://www.behance.net), [Kittl](https://www.kittl.com) (via search)
- Serif comeback: "clean layout / serif / simple branding" searches +54% YoY — [Canva Newsroom](https://www.canva.com/newsroom/news/visual-design-trends-2026/)
- Yellow is the highest-urgency accent for numbers/CTA words **[claim]** — [ygen.app](https://ygen.app); white or yellow bold text on dark backgrounds is the instant-read combination — [BigNewsNetwork thumbnail color strategies, Jul 2025](https://www.bignewsnetwork.com) (via search)

**Text treatments**
- **Outline/stroke is the baseline**: thick black stroke 8–12px (or scaled to weight: ~1.7px for regular 400 text, ~3.7px for bold 700 — overly heavy stroke on light text reads grey) — [kapa99](https://kapa99.com), [moda.app](https://moda.app)
- **Outline + hard drop shadow** is the most common high-CTR combo; shadow alone blurs at small size — [artiphik MrBeast thumbnail analysis](https://artiphik.com/Blog), [1of10](https://1of10.com/blog/youtube-thumbnail-design)
- **Highlight box / color block** = guaranteed legibility fallback on busy backgrounds, at the cost of covering image — [1of10](https://1of10.com/blog/youtube-thumbnail-design)
- No public head-to-head dataset exists on outline vs shadow vs box; treat as A/B variables — [search consensus, TubeBuddy testing guides](https://support.google.com/youtube/answer/16391400)

**Arrows/circles and the "MrBeast style" question**
- The style still works for MrBeast (he famously A/B tests everything; his top thumbnails share 5 recurring patterns per a 50-thumbnail 2023–2026 analysis) — [artiphik](https://artiphik.com/Blog)
- But 2026 data shows the broader style fatigue: "wide-eyed shock" is now a demoted anti-pattern, closed-mouth determined beats shock by 15–20% CTR, and fully-AI-polished looks lose to hybrid/real by 18–22% — [thumby.app](https://thumby.app/en/blog/youtube-thumbnail-trends-2026)
- The faceless-guide playbook now explicitly says: research the dominant niche pattern, then break it — [becomeviral.com](https://becomeviral.com/blog/faceless-youtube-thumbnail-guide)
- MrBeast pulled his AI thumbnail generator after creator backlash (June 2025) — authenticity backlash is real — [BBC](https://www.bbc.com) (reported June 27, 2025)

**Emoji**
- YouTube official: "Limit ALL CAPS and emoji — use them carefully to emphasize emotion" — [YouTube Help](https://support.google.com/youtube/answer/12340300)
- No rigorous study isolates emoji CTR; the strongest adjacent evidence is the 16,215-cover sentiment study (emotion, not emoji, drives views) — [Cui 2024, ScienceDirect](https://www.sciencedirect.com); VIDIQ notes emoji can lift CTR contextually but can look spammy — [vidiq.com](https://vidiq.com)
- Verdict for Quarry Studio: offer emoji only as an optional chip accent; default off. **[synthesis]**

---

## SECTION 6 — SMALL-SIZE READABILITY

- **63% of YouTube watch time is on mobile** (2026 figures; TV now exceeds 1B hours/day and is shrinking mobile's share) — [The Social Shepherd](https://thesocialshepherd.com), [Hootsuite "40 YouTube stats 2026"](https://blog.hootsuite.com), [Global Media Insight](https://www.globalmediainsight.com) (via search corroboration)
- **The 120-pixel test**: thumbnails render at ~120–200px wide in mobile feeds; the single most destructive test — if text/subject dies at 120px, redesign — [thumby.app](https://thumby.app/en/blog/youtube-thumbnail-trends-2026), [1of10](https://1of10.com/blog/youtube-thumbnail-design), [ThumbMagic](https://www.thumbmagic.co)
- **Minimum type size**: primary text ≥72–108px tall on the 1280x720 canvas (≈60–80pt); 3–5 words max, 2026 trend is 3 max drifting to 1–2; never duplicate the title — [miraflow](https://miraflow.ai), [1of10](https://1of10.com/blog/youtube-thumbnail-design), [thumby.app](https://thumby.app/en/blog/youtube-thumbnail-trends-2026)
- **Safe zones**: keep the bottom-right clear (duration badge) and respect right-edge overlay on mobile shelf; Thumby's rule 8 recommends keeping eyes/key text in the left 2/3 — [thumby.app](https://thumby.app/en/blog/youtube-thumbnail-trends-2026)
- **Subject dominance**: one focal subject at 30–50% of frame; main subject ≥30% brighter or darker than background — [thumby.app](https://thumby.app/en/blog/youtube-thumbnail-trends-2026), [ClickyApps](https://clickyapps.com)
- **How top designers test**: render/screenshot at 120px width; YouTube's Test & Compare (up to 3 title/thumbnail combos, expanded late 2025; requires 1K+ subs) for live data; change ONE strategic axis per variant — [YouTube Help](https://support.google.com/youtube/answer/16391400), [thumby.app](https://thumby.app/en/blog/youtube-thumbnail-trends-2026), [becomeviral.com](https://becomeviral.com/blog/faceless-youtube-thumbnail-guide)
- CTR benchmark ladder: <2% fail / 2–5% average / 5–8% good / 8%+ excellent — [becomeviral.com](https://becomeviral.com/blog/faceless-youtube-thumbnail-guide); Google says judge CTR on Home+Suggested in the first 24h — [YouTube Help](https://support.google.com/youtube/answer/12340300)

---

## SOURCES

Primary trend reports & studies
- Canva Newsroom — The visual design trends set to define 2026: https://www.canva.com/newsroom/news/visual-design-trends-2026/
- Creative Bloq — Canva 2026 trend coverage: https://www.creativebloq.com
- Envato — Graphic design trends 2026 (8 styles): https://elements.envato.com/learn/graphic-design-trends
- Adobe 2026 Creative Trends report: https://business.adobe.com
- Behance Design Trends 2026: https://www.behance.net
- GetIllustrations — Illustration trends 2026: https://getillustrations.com
- Orizon / Apple — Glassmorphism & Liquid Glass 2026: https://www.orizon.co , https://www.apple.com
- Cui 2024 (ScienceDirect) — sentiment analysis of 16,215 YouTube covers: https://www.sciencedirect.com

Thumbnail-specific guides & data
- Thumby — YouTube Thumbnail Trends 2026 (9 rules / 7 demoted looks): https://thumby.app/en/blog/youtube-thumbnail-trends-2026
- VIDIQ — 12 best thumbnail styles / design tips: https://vidiq.com/Blog
- Miraflow — 10 viral AI thumbnail styles 2026 + word-count guidance: https://miraflow.ai
- Trezalabs — Faceless YouTube thumbnail guide: https://www.trezalabs.com
- BecomeViral — Faceless YouTube thumbnail guide (CTR ladder): https://becomeviral.com/blog/faceless-youtube-thumbnail-guide
- Overseeros — Faceless thumbnail formula: https://www.overseeros.com
- Artiphik — MrBeast thumbnail analysis (5 patterns): https://artiphik.com/Blog
- 1of10 — 9 tips for high-CTR thumbnails: https://1of10.com/blog/youtube-thumbnail-design
- Kapa99 (fonts/strokes): https://kapa99.com ; Moda (stroke-vs-weight): https://moda.app ; Unkoa (8 rules 2026): https://www.unkoa.com/youtube-thumbnail-design-tips ; ClickyApps (10 practices 2025): https://clickyapps.com ; Ygen (color urgency): https://ygen.app ; ThumbnailCreator case studies: https://www.thumbnailcreator.com ; Ampifire: https://ampifire.com ; ThumbMagic: https://www.thumbmagic.co
- Shashank Pandey — Documentary thumbnail design (Vox / Johnny Harris / James Jani): https://www.shashankpandey.com/2023/04/documentary-thumbnail-design-vox-johnny.html
- faceless.my — faceless channel roundup + niche CPM: https://faceless.my ; FlowShorts luxury/wealth ideas: https://flowshorts.app/faceless-youtube-channel-ideas ; OutlierKit: https://outlierkit.com
- Wikitubia — Moon profile: https://youtube.fandom.com/wiki/Moon
- BBC — MrBeast pulls AI thumbnail tool (June 2025): https://www.bbc.com
- Thumbs.ai — math/equation thumbnail templates: https://www.thumbs.ai/math-thumbnail
- ContentStudio — old-money aesthetic guide: https://contentstudio.io

AI image APIs
- Agnes AI docs (OpenAI-compatible, apihub.agnes-ai.com/v1): https://agnes-ai.com/doc/overview ; HN discussion: https://news.ycombinator.com
- Gemini API pricing: https://ai.google.dev ; Nano Banana Pro: https://blog.google , https://aistudio.google.com/models/nano-banana , https://deepmind.google/models/gemini-image/pro ; thumbfa.st review: https://thumbfa.st/posts
- fal.ai pricing (FLUX, Imagen, Recraft): https://fal.ai
- Recraft: https://www.recraft.ai ; Ideogram 3.0: https://ideogram.ai ; Kie.ai Ideogram pricing: https://kie.ai ; Segmind: https://www.segmind.com ; pricepertoken (gpt-image-1): https://pricepertoken.com ; OpenAI community: https://community.openai.com
- Pollinations: https://github.com/pollinations/pollinations
- Prompting for reserved space: TitanXT https://titanxt.io ; Pippit https://www.pippit.ai ; VisionToPrompt https://visiontoprompt.com ; Prodia https://blog.prodia.com

Mobile & platform stats
- YouTube Help — Thumbnail & title tips: https://support.google.com/youtube/answer/12340300
- YouTube Help — Test & compare (A/B): https://support.google.com/youtube/answer/16391400
- The Social Shepherd (63% mobile watch time): https://thesocialshepherd.com
- Hootsuite — 40 YouTube stats 2026: https://blog.hootsuite.com
- Global Media Insight — YouTube statistics 2026: https://www.globalmediainsight.com

Composition
- Adobe composition guides: https://www.adobe.com
- Digital Photography School: https://digital-photography-school.com
- Visual Education — rule of thirds: https://visualeducation.com
- RMCAD — composition and attention: https://www.rmcad.edu
