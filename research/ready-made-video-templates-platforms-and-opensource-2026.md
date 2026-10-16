# Ready-Made Video Templates: SaaS Platforms vs. Open-Source Ecosystem (2026)

**Research Scope:** Finding existing platforms, APIs, and open-source projects offering ready-made video templates for programmatic integration into Quarry Studio.  
**Objective:** Deliver broadcast-grade video design without building every animation from scratch.

---

## 1. Executive Summary & Verdict

You do **NOT** have to design every template from scratch.

There are two distinct paths available:
1. **Commercial Headless Video APIs (Creatomate, Shotstack, JSON2Video)**: They provide pre-designed drag-and-drop templates and REST APIs. However, they charge **$50 to $250+/month** with metered credits. For 10-minute long-form videos, API rendering fees quickly destroy SaaS profit margins.
2. **Open-Source Programmatic Engines (Remotion Ecosystem, Onda, MoneyPrinterTurbo, HyperFrames)**: **100% free, self-hosted, and unlimited**. Open-source repositories like `ali-abassi/remotion-templates` and Remotion's official component packs contain hundreds of pre-built, production-tested motion graphics, kinetic typography layouts, terminal windows, charts, and documentary scenes that can be directly imported into our codebase.

**Strategic Recommendation**:  
Adopt the **Open-Source Remotion + Pre-built Component Library** model. It gives you 100% design ownership, $0 render fees on GitHub Actions/VPS, and broadcast-grade visual quality that beats cheap AI generators.

---

## 2. Commercial SaaS Platforms (APIs with Pre-Made Templates)

If you want to rent existing cloud templates via API, these are the leading platforms:

### 2.1 Creatomate (`creatomate.com`)
* **What it is:** The leading visual-timeline template builder for programmatic video.
* **How it works:**
  - You browse their **Template Gallery** (hundreds of pre-made social media, listicle, news, and podcast templates).
  - You customize the template visually in their browser editor.
  - You trigger renders by sending dynamic JSON to `POST https://api.creatomate.com/v1/renders` with your script text, images, and voiceover.
* **Pros:** Beautiful visual timeline editor; responsive aspect ratios (16:9, 9:16, 1:1 automatically).
* **Cons & Pricing:** Metered credits. Plans start at **$41/mo (2,000 credits)** to **$129/mo (10,000 credits)**. A 10-minute 1080p video costs ~300 credits ($3.50–$5.00 per video). Producing 30 long videos per month would cost **$150–$250/mo** just in Creatomate API fees.

### 2.2 Shotstack (`shotstack.io`)
* **What it is:** Developer-first cloud video infrastructure with a **White-Label Video Editor SDK**.
* **How it works:**
  - Provides pre-built JSON timeline templates.
  - Provides an embeddable React/JS video editor component that you can put inside your SaaS dashboard so users can tweak clips.
* **Pros:** Highly scalable; raw frame control; white-label editor embed.
* **Cons & Pricing:** Pay-per-minute rendering ($0.05 to $0.15 per rendered minute). 10-minute videos cost **$0.50 to $1.50 per render**. If an automated pipeline renders 100 videos a month, bills reach $100–$150/mo.

### 2.3 JSON2Video (`json2video.com`)
* **What it is:** Lightweight JSON-to-video API with bundled ElevenLabs and Azure TTS.
* **How it works:** Pass a simple JSON array of scenes, text, and music.
* **Pros:** All-in-one narration included in credit pricing.
* **Cons:** Rigid styling; animations look basic; limited artistic direction for documentary-style videos.

---

## 3. Open-Source Projects & Template Libraries (100% Free & Self-Hosted)

These open-source ecosystems provide ready-made code templates that you can legally use, modify, and host inside your product with **zero monthly API fees**:

### 3.1 `ali-abassi/remotion-templates` (GitHub)
* **What it is:** A massive open-source library containing **hundreds of pre-built Remotion templates** and design families.
* **What it includes:**
  - Kinetic typography packs (Hormozi, MrBeast, clean serif, neon glow).
  - SaaS product showcase templates & terminal code walk-throughs.
  - Podcast audiogram visualizers with dynamic waveform bars.
  - Data infographic templates (bar charts, line graphs, percentage counters).
* **Why it matters:** You can copy entire pre-built component folders directly into our `explainer/remotion/` directory!

### 3.2 Official Remotion Component Packages (`remotion-dev`)
Remotion maintains official open-source packages and starters:
* **`template-code-hike`**: Gorgeous animated syntax-highlighted code typing (perfect for tech channels).
* **`template-tiktok` / Captions**: Auto-syncing word-by-word highlighted captions.
* **`template-audiogram`**: Dynamic audio-reactive waveforms and circular equalizer rings.
* **`remotion-three`**: 3D scene rendering using React Three Fiber (for 3D spinning statues or globe rotations).

### 3.3 Onda & RemotionUI Component Libraries
* **Onda** (`github.com/ondatv/onda`): Open-source UI toolkit for Remotion containing ready-made lower thirds, title cards, animated notification popups, progress bars, and split-screen layouts.
* **Remotion Bits**: Reusable snippets for camera pans, spring physics, transitions (wipe, slide, dissolve), and film grain filters.

### 3.4 `MoneyPrinterTurbo` & `ShortGPT` (GitHub Automation Repos)
* **MoneyPrinterTurbo** (15k+ stars, `harry0703/MoneyPrinterTurbo`): Complete open-source video generator with WebUI, automated Pexels/Pixabay b-roll matching, subtitle generators, and background music ducking.
* **ShortGPT** (6k+ stars, `RayVentura/ShortGPT`): Python engine containing pre-made templates for Reddit fact videos, countdowns, and news shorts.

### 3.5 HyperFrames Registry (Already in our workspace!)
Our repository has built-in integration with the **HyperFrames Registry** (`~/.gemini/skills/hyperframes-registry`):
* Contains **over 400 hosted, pre-built motion blocks and visual effects**:
  - CRT scanlines & glitch effects
  - 35mm film grain & dust overlays
  - Terminal windows & code frames
  - Animated financial charts & counters
  - Kinetic text wipe transitions
* These blocks can be searched and installed with a single command: `hyperframes add <block-name>`.

---

## 4. Side-by-Side Comparison: Which Path Should You Choose?

| Factor | Commercial SaaS API (Creatomate / Shotstack) | Open-Source (Remotion + Pre-built Blocks) |
| :--- | :--- | :--- |
| **Monthly Render Cost** | **$100 – $300+/month** (metered per-minute fees) | **$0 / month** (runs free on GitHub Actions / CPU) |
| **Ready-Made Templates** | Pre-built in their web dashboard. | Available on GitHub (`remotion-templates`, `Onda`). |
| **Customizability** | Constrained by what their API schema allows. | **100% full control** (pure React / CSS / Canvas). |
| **Render Scalability** | Dependent on third-party server uptime & limits. | Unlimited parallel renders on GitHub Actions or VPS. |
| **White-Label Branding** | May require expensive enterprise plan ($249+/mo). | Native to your SaaS; 100% your own brand. |
| **Time to Launch** | 1 to 2 days (API call integration). | 3 to 5 days (importing & wiring components). |

---

## 5. Implementation Roadmap for Quarry Studio

To get the best of both worlds (rapid launch + $0 render costs):

1. **Step 1: Import Pre-Built Remotion Components**:
   - Pull the open-source **kinetic typography** and **audiogram** components from `remotion-dev` and `ali-abassi/remotion-templates`.
   - Wire them into our modular Beat system (`explainer/remotion/`).
2. **Step 2: Connect Our Existing Working Templates**:
   - We already have **Dark Tech** working in `explainer/remotion/tech-explain.tsx`.
   - We already have **Vox Paper Collage** working in `explainer/remotion/vox-collage.tsx`.
3. **Step 3: Add HyperFrames Motion Blocks**:
   - Add film grain, vignette, and paper textures using ready-made HyperFrames registry blocks.
4. **Step 4: Expose Template Selection in Studio UI**:
   - In `studio/`, display 4 visual template cards with live preview badges:
     - 📜 **The Vox File** (Paper Collage Documentary)
     - ⚡ **Dark Tech Explainer** (Silicon Valley Code & Diagrams)
     - 🏛️ **Noir Prestige** (Cinematic Biography & History)
     - 📊 **Macro Ledger** (Clean Financial Infographics)
