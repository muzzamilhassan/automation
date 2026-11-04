# Template factory + catalog cleanup — phased plan (2026-11-04)

Owner asks: (1) remove the cloned 10–15s short-clip templates, keep only the
main ones; (2) research how templates are made here + on other platforms;
(3) a phased spec for producing templates at scale ("run a lot of bots").

## 1. Current inventory (ground truth: studio/lib/templates-catalog.js)

**18 families** total (the gallery's "100+ modular engines" subtitle is stale
copy — fix it). By category:

- documentary (5): documentary-frames, editorial-headlines, timeline-history,
  map-journeys, photo-stories
- typography (3): kinetic-typography, beat-synced-type, quote-cards-premium
- tech (3): code-product-demos, explainer-diagrams, browser-chrome
- finance (3): finance-explainers, stats-counters, chart-animations
- podcasts (1): podcast-audio · shorts (1): vertical-safe-zones ·
  effects (2): retro-vhs, transitions-pack

## 2. Cleanup proposal — NEEDS OWNER GO (registry bindings migrate first)

KEEP (the main lanes): the 5 documentary families + finance-explainers +
**the coming storybook doc family** (research/storybook-doc-template-2026-11-04.md).

REMOVE (the cloned 10–15s pack, 12 families): kinetic-typography,
beat-synced-type, quote-cards-premium, code-product-demos, explainer-diagrams,
browser-chrome, stats-counters, chart-animations, podcast-audio,
vertical-safe-zones, retro-vhs, transitions-pack.

⚠️ Removal order matters (breaking dependencies):
1. Migrate the 10 registry templates OFF the doomed families first — today
   myth-vs-money + red-flags-explained bind `beat-synced-type`, and
   quote-cards-premium binds its own family. red-flags-explained re-binds to
   the storybook family when it lands; myth-vs-money re-binds or retires
   (owner call).
2. Then delete the families from templates-catalog.js + explainer/remotion/
   families/ + the gallery stale copy.
3. Registry validator re-run + full suite (the pin tests reference some).
Estimate: half a day, mostly test untangling. Execute ONLY on owner GO.

## 3. How templates are made TODAY (this repo)

One template = code family (Remotion components in explainer/remotion/
families/<id>/) + catalog entry (templates-catalog.js: label/category/aspect/
design tokens) + registry meta (template-registry.data.js: niches/formats/
variation_rules/safety/thresholds) + QA rows. Hand-built: ~1–2 days each.
The Phase 5 v2 shift already moved half the way: registry templates are now
DATA (story_structure + beats + thumb tokens) on SHARED families — e.g.
red-flags-explained cost zero renderer code.

## 4. How other platforms do templates (survey)

- **Remotion ecosystem (TweetFrames/Bulletproof/etc.)**: parametric scene
  components + JSON props; "templates" are data files rendering one engine.
- **Canva/CapCut template stores**: fixed layouts + slot-filling (text/image/
  color tokens); creators author DATA, the engine renders identically-styled
  variants; preview auto-generated per template.
- **Motion Array / Envato**: reusable comps + preset data + mandatory
  auto-preview; marketplace metadata (niche, duration, aspect) drives search.
- **Faceless-channel tools (AutoShorts/Crayo etc.)**: a handful of hardcoded
  layouts + LLM copy — the layout is the moat, the copy is commodity.

Common pattern everywhere: **ONE strong parametric engine + N data files +
auto-preview + review gate.** Nobody hand-builds 18 engines per style.

## 5. Phased spec — the template factory (bots at scale)

**Phase A — parametrize the engines (data-only templates).** Generalize the
v2 shift: every kept family exposes a layout DSL in DATA (slots: kicker/
headline/photo-card/numeral/footer + tokens: palette/fonts/spacing). A
"template" becomes a pure DATA file. Exit: a new template ships with ZERO
code, like red-flags-explained did.

**Phase B — the generator bot.** An LLM bot authors template DATA files
(style brief → tokens → validator → auto-preview render → review-queue row).
The owner approves in the panel (reuse the Phase 4 review queue for
templates). Exit: 1 template ≈ minutes of bot time + 1 owner click.

**Phase C — auto-preview for every template.** Generalize demo-video.yml:
each template auto-renders a 10–15s sample + cover frame on registry write;
the gallery shows REAL previews (kills the stale "100+" copy problem).
Exit: what you see in the panel is what channels get.

**Phase D — batch production.** N bots per niche brief (e.g. "10 storybook
finance templates, distinct palettes/kickers"), QA gates: validator + visual
harness + dedupe (brain similarity, no near-duplicate styles) + owner panel
tour. Exit: catalog grows to 30+ REAL templates in days, not months.

Sequencing: storybook lane first (the owner's wanted look, research/
storybook-doc-template-2026-11-04.md) → A → cleanup removal → B → C → D.
Estimates: A ~2–3 days, B ~2 days, C ~1 day, D ongoing; cleanup half a day.
