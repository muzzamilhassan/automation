# Tech-Stack Evaluation — October 2026

**Scope:** Node runtime, TypeScript strategy, monorepo tooling, rendering engines, scheduling/queue, database/ORM, Python voice stack, dependency health — evaluated against primary sources (official docs, release notes, license texts) for the `youtube-automation` monorepo and its multi-tenant SaaS direction (Studio: clients own channels).

**Method:** Repo facts verified by direct inspection (root/studio/explainer `package.json`, `.github/workflows/*.yml`, `docker-compose.yml`, `youtube-flow/narrate.py`, `studio/tsconfig.json`). All external claims cite the primary source fetched on 2026-10-17. Facts I could not confirm from a primary source are explicitly marked **unverified**.

---

## TL;DR — Verdict Table

| # | Question | Verdict | One-line summary |
|---|---|---|---|
| 1 | Node runtime | **MIGRATE** (Node 20 → 24); **WATCH** Bun | Node 20 is EOL and already removed from Actions runners; Node 24 is the LTS to pin. Bun adds nothing for a cron batch pipeline. |
| 2 | TypeScript | **MIGRATE** (incremental) | Node now runs `.ts` natively (stable, no flags); TS 7 GA'd July 2026 but has no JS API yet — stay on TS 6 for tooling, adopt strict gradually in Studio. |
| 3 | Monorepo | **ADOPT** npm workspaces; **WATCH** Turborepo | A `workspaces` field in root `package.json` links `studio/` for free; Turborepo (MIT, any package manager) only when build times hurt. |
| 4 | Rendering | **KEEP** all 4 engines; **WATCH** Remotion license trigger | Free Remotion license covers ≤3-person orgs; paid = $0.01/render min $100/mo when that threshold breaks. Cloud Run renderer is Alpha/"not actively being developed". FFmpeg 8.1 current. |
| 5 | Scheduling | **KEEP** GHA cron for now; **ADOPT** Cloud Run Jobs at SaaS inflection; **WATCH** Temporal | Public repo ⇒ Actions minutes are free; the 60-day-disable and high-load-drop caveats are the real limits. Client-owned channels cannot run inside your repo — that's the trigger to move. |
| 6 | Database/ORM | **KEEP** postgres.js; **ADOPT** Drizzle when schema grows | Neon officially documents both; Drizzle needs the non-pooled URL for migrations (same pattern Prisma's `DIRECT_URL` formalizes). |
| 7 | Python voice stack | **KEEP** | Kokoro is Apache-2.0 (commercial-safe); faster-whisper is the de-facto standard (MIT); edge-tts is an unofficial Microsoft service client — fallback only. |
| 8 | Dependency health | **WATCH** | js-yaml 5.0.0 (2026-06-20) "flat named exports" rewrite is exactly the breakage this repo hit; googleapis ships near-daily release-please batches with per-service majors. |

---

## 1. Node runtime — **MIGRATE Node 20 → Node 24; WATCH Bun**

### Evidence

**Node release lifecycle** (nodejs/release README, fetched 2026-10-17):

| Line | Status | Key dates |
|---|---|---|
| Node 20 "Iron" | **End-of-Life** | EOL **2026-04-30** (already past) |
| Node 22 "Jod" | Maintenance LTS | maintenance since 2025-10-21, EOL **2027-04-30** |
| Node 24 "Krypton" | **Active LTS** | Active since 2025-10-28, maintenance starts **2026-10-20**, EOL **2028-04-30** |
| Node 26 | Current | Active LTS begins **2026-10-28**, EOL 2029-04-30 |

Source: https://github.com/nodejs/release/blob/main/README.md ("Dates are subject to change.")

**GitHub Actions runners:** GitHub announced deprecation of Node 20 on Actions runners (changelog, 2025-09-19): "Beginning on June 16th, 2026, runners will begin using Node24 by default" and Node20 is removed on **September 23rd, 2026** (the `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` escape hatch expired with it). Node 24 is incompatible with macOS ≤13.4; ARM32 self-hosted runners lose support. Source: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/

This matches the Node-20 deprecation warnings already appearing in this repo's runner logs: as of today (2026-10-17), the removal has already happened.

**Repo state:** 17 of 20 workflows pin `node-version: 20`; 3 pin 22; all `runs-on: ubuntu-latest`. Verified in e.g. `.github/workflows/channel-autopilot.yml:84`, `.github/workflows/longform-daily.yml:40`.

**Bun:** Current as of Bun 1.4.x; the 1.3 release (2025-10-10) is pitched as a full-stack runtime with heavy `child_process`/`spawnSync`/`execFile` fixes and 800 additional Node-test-suite tests passing per commit. Windows support (this dev machine) is real but the least-mature platform. Source: https://bun.com/blog/bun-v1.3 . sharp officially lists Bun as a supported install path (`bun add sharp`) and requires a Node-API v9 runtime (Node ≥ 20.9.0): https://sharp.pixelplumbing.com/install

**Bun compatibility with `googleapis`/`undici`/`libsodium-wrappers` under Bun: unverified** — I found no first-party compatibility statement; treat any Bun adoption of this pipeline as requiring its own test pass.

### Verdict for this repo

- **MIGRATE:** bump all 17 `node-version: 20` pins to `24` (Node 24 is LTS, its maintenance window starts 2026-10-20, EOL 2028-04-30). Optionally target Node 22 → 24 as well since 22 goes maintenance-only in 2027-04.
- **WATCH Bun, don't adopt:** this workload is ffmpeg spawning + Google API clients + sharp on CI cron — all fully served by Node, and the pipeline's value is reliability, not startup latency. Bun's benefit case (fast TS, single-file executables) doesn't apply to GHA-hosted cron jobs, and googleapis-on-Bun compatibility is unverified.

---

## 2. TypeScript — **MIGRATE incrementally; no big-bang rewrite**

### Evidence

**Node runs TypeScript natively now.** Per the official Node docs (fetched 2026-10-17, "Stability: 2 - Stable" as of v26 docs): type stripping is enabled **by default** since v23.6.0/v22.18.0, emits no experimental warning since v24.3.0/v22.18.0, and is **stable** since v25.2.0/v24.12.0. Constraints: erasable syntax only (no `enum`, no runtime `namespace`, no parameter properties), no `tsconfig` paths resolution, `.tsx` unsupported, explicit `.ts` extensions required in imports, `import type` required for type-only imports. Source: https://nodejs.org/api/typescript.html

**TypeScript 7 (native Go port) shipped July 8, 2026** — "a 10x faster native port of TypeScript", 8–12x faster full builds, lower memory, rebuilt watch mode. Caveats: "it does not ship with an API. We expect TypeScript 7.1 to ship with a new (and different) API" — so typescript-eslint, Vue/Astro tooling, and Next.js's custom checker stay on 6.x for now; Microsoft ships `@typescript/typescript6` so both can coexist. TS 6.x itself introduced breaking defaults: `strict: true`, `module: esnext` by default, `node/node10` module resolution and `baseUrl` removed, `target: es5` removed. Sources: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ , https://devblogs.microsoft.com/typescript/typescript-native-port/

**Next.js official guidance** (docs page lastUpdated 2026-08-25): Next.js is "TypeScript-first" — `next build` **fails** on type errors unless `typescript.ignoreBuildErrors` is set; TS is optional and JS files coexist (the docs literally show the JSDoc path for JS `next.config.js` with `// @ts-check` + `/** @type {...} */`); TypeScript 7 can be opted into with `typescript@^7`; typed routes/PageProps helpers are generated for TS projects. Source: https://nextjs.org/docs/app/api-reference/config/typescript

**tsx** remains the recommended escape hatch when non-erasable syntax is needed (`node --import=tsx your-file.ts` is shown in the Node docs themselves). Project is active (12.2k stars). Source: https://github.com/privatenumber/tsx

**Repo state:** root is plain-JS ESM (~40 `.mjs` at root); `studio/` is plain JS with a `tsconfig.json` (`strict: false`, `allowJs: true`) and `typescript ^6.0.3` in devDependencies — i.e., the TS toolchain exists but types nothing yet.

### Verdict for this repo

- **Pipeline scripts (`.mjs`):** Migrate incrementally, not wholesale. The cheapest correct path: keep `.mjs` files and add **JSDoc + `tsc --checkJs`/`@ts-check`** on `lib/` shared modules first (this is the pattern Next.js itself shows for JS files). For scripts rewritten in the future, plain `.ts` with erasable syntax runs natively on Node 24 with zero build step and no `tsx` dependency — but every relative import needs the explicit `.ts` extension, so it is a *rename plus import-path fix*, not a free conversion.
- **Studio:** it already has TS 6 installed and `next build` will fail on TS errors once files are `.ts` — enable `strict: true` and convert the data layer (`studio/lib/db.mjs`, registry/auth modules) first, where typing pays for itself; convert UI components opportunistically. Do **not** jump to `typescript@^7` yet: the repo has no Vue/Astro constraints, but typescript-eslint and Next's custom checker still target the 6.x API.

---

## 3. Monorepo — **ADOPT npm workspaces; WATCH Turborepo**

### Evidence

- **npm workspaces** (official docs): declaring a `workspaces` array in root `package.json` symlinks each package into root `node_modules` at install; per-workspace scripts via `npm run <script> -w <name>`; inter-package deps are symlinked locally. Source: https://docs.npmjs.com/cli/v11/using-npm/workspaces
- **pnpm workspaces**: requires `pnpm-workspace.yaml`; since pnpm v12.7.0 a repo with only npm/Yarn-style `workspaces` gets a generated `pnpm-workspace.yaml` on first `pnpm install`. The `workspace:` protocol is the deterministic way to reference local packages ("will refuse to resolve to anything other than a local workspace package"). Source: https://pnpm.io/workspaces
- **Turborepo**: MIT-licensed Rust build system (caching + task scheduling), "use it with any package manager", incremental adoption via one `turbo.json` reusing existing `package.json` scripts; remote cache is the paid/hosted piece (Vercel). Sources: https://turborepo.dev/docs , https://github.com/vercel/turborepo
- **Nx**: "The Monorepo Platform"; joined the Linux Foundation / Agentic AI Foundation (blog post Feb 25, 2026); Nx Cloud is the commercial tier; works on top of npm/pnpm workspaces. Source: https://nx.dev/blog

### Verdict for this repo

The repo's real shape is: one Next app (`studio/`), one Remotion package (`explainer/`, own `package.json`), ~40 root pipeline scripts, and `lib/` — i.e., **1 app + a few script packages**, not a many-package library monorepo.

- **ADOPT npm workspaces**: add `"workspaces": ["studio", "explainer"]` to root `package.json`. Zero new tools, zero CI changes across the 20 workflows, dedupes the `sharp`/`libsodium-wrappers`/`react` installs. This is the lowest-friction structure and needs nothing else today.
- **WATCH Turborepo**: adopt only if a real bottleneck appears (e.g., CI building studio + rendering previews on every push). Its remote cache on Vercel is the paid part; local caching is free.
- **Not pnpm/Nx for now:** pnpm requires changing every workflow's setup step and adds a global tool dependency for a solo-operator repo; Nx (even post-Linux-Foundation) is platform-weight for a repo with effectively two packages. Revisit pnpm if dependency-disk or phantom-dependency pain becomes real.

---

## 4. Rendering — **KEEP all 4 engines; WATCH the Remotion license trigger; do not consolidate onto one engine**

### Evidence

**Remotion license** (LICENSE.md in remotion-dev/remotion, fetched 2026-10-17): source-available custom license; Free License covers "an individual", "a for-profit organization with up to 3 employees", non-profits, and evaluators; anyone else needs a Company License. The restriction is not a general SaaS ban — it prohibits copying/modifying Remotion code "for the purpose of selling, renting, licensing" a derivative. Note: "In Remotion 5.0, the license will slightly change." Source: https://github.com/remotion-dev/remotion/blob/main/LICENSE.md

**Remotion pricing** (License FAQ, fetched 2026-10-17): **Remotion for Creators — $25/month per person who writes Remotion code** (organizations producing videos without automation); **Remotion for Automators — $0.01 per render with a $100/month minimum** (organizations building automations); Enterprise minimum $500/month. Eligible free-tier users "never pay per render or need a license, even for automations." A "render" = one successful generation of a video/audio/GIF/still/PDF. Source: https://www.remotion.dev/docs/license/faq

**Remotion Lambda:** serverless distributed rendering on AWS; "You only pay while you are rendering"; "Most of our users render multiple minutes of video for just a few pennies" (vendor estimate, no fixed per-render price); limits: best under ~80 min at Full HD, ~5GB output cap, 1,000 concurrent Lambdas default, no AV1. Companies needing a license that cloud-render must meter via **Cloud Rendering Units**. Source: https://www.remotion.dev/docs/lambda

**Remotion Cloud Run (GCP):** "Cloud Run is in Alpha status and not actively being developed." Max 32GB/8 vCPU/60-min timeout; costs are GCP pass-through plus possible Remotion license. Source: https://www.remotion.dev/docs/cloudrun — **this materially weakens Cloud Run as the scaling path; Lambda is the actively developed one.**

**FFmpeg:** current major is 8.x — 8.0 "Huffman" (2025-08-22), 8.1 "Hoare" (2026-03-16: Vulkan ProRes, D3D12 H.264/AV1 encode, new filters). Source: https://ffmpeg.org/index.html

**Repo state:** four engines exist and serve different jobs: (1) FFmpeg filter-graphs for shorts (`youtube-engine.mjs`) and longvideo (`longvideo/make3v2.mjs`), (2) Remotion 4.0.524 for explainers (`explainer/package.json` — explicitly documented as "used under its free individual license"), (3) HyperFrames HTML compositions (`hyperframes/`, in-house engine with its own skill system), (4) sharp/SVG thumbnails.

### Verdict for this repo

- **KEEP the FFmpeg cores.** Filter-graph rendering on free GHA Linux runners is the cheapest reliable path for the volume this repo runs; FFmpeg 8.1 is current and the ubuntu-latest images carry a recent build.
- **KEEP Remotion for the explainer** — the ≤3-employee free license legitimately covers a solo-operator company (the threshold is headcount, not revenue; a 20-person company pays even with one Remotion user, per the FAQ). **WATCH:** the moment headcount >3, the Automators plan ($0.01/render, $100/mo min) applies, and if you later cloud-render at that tier, CRU metering kicks in. The "Remotion 5.0 license will slightly change" note is a second reason to keep the dependency isolated to `explainer/`.
- **Consolidating all 4 engines onto Remotion is NOT realistic or desirable:** the shorts/longvideo FFmpeg graphs are already paid-for, debugged, and run at near-zero marginal cost; rewriting them into browser-rendered compositions would add Chromium-per-frame cost and license exposure for no quality gain. The realistic consolidation direction is the *browser-based pair*: HyperFrames compositions and Remotion projects share the same conceptual model (React/HTML + timeline), so new "template" work can standardize on one of them while FFmpeg remains the assembly/mux layer.
- For the SaaS direction: **Remotion Lambda is the natural client-render primitive** (per-use AWS billing, self-contained), with Cloud Run as a weaker option given the Alpha/not-actively-developed status of Remotion's Cloud Run support.

---

## 5. Scheduling / queue — **KEEP GHA cron today; ADOPT Cloud Run Jobs at the SaaS inflection; WATCH Temporal**

### Evidence

**GitHub Actions scheduled workflows** (official docs): minimum interval once every 5 minutes; schedules "can be delayed during periods of high loads of GitHub Actions workflow runs" (start-of-hour is busiest, heavily queued jobs may be dropped); "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days"; runs default to UTC, with optional IANA timezone. Source: https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#scheduled-events

**Actions billing:** "GitHub Actions usage is free for self-hosted runners and for public repositories that use standard GitHub-hosted runners"; larger runners are always billed. Private-repo overage is per-minute (Linux 2-core $0.006/min, Windows $0.010/min, macOS $0.062/min). Source: https://docs.github.com/en/billing/concepts/product-billing/github-actions — **and this repo is public** (verified: `muzzamilhassan/automation`, `"visibility": "PUBLIC"`), so today's ~20 cron workflows cost $0 in minutes.

**Self-hosted runners:** free to use but "you are responsible for updating the operating system and all other software", they "Don't need to have a clean instance for every job execution" (state persists — a security consideration), and ARM32 is lost with the Node 24 migration. Source: https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners

**Cloud Run Jobs:** billed only for CPU+memory during task execution (no request fee). The pricing page is JS-rendered and did not yield quotable figures in this fetch; the widely-published Tier-1 rates are ~$0.000024/vCPU-s and ~$0.0000025/GiB-s with a monthly free tier — **treat these as approximate and re-verify against https://cloud.google.com/run/pricing before committing** (flagged uncertain).

**AWS Lambda:** $0.20 per 1M requests, $0.0000166667/GB-s, free tier 1M requests + 400,000 GB-s/month. Video rendering on Lambda is memory-bound and the 15-min execution cap makes long renders a chunking problem — Remotion Lambda exists precisely for that. Source: https://aws.amazon.com/lambda/pricing/

**Temporal:** Cloud is per-action ("$50 per million actions" starting, volume discounts to $25/M, active storage $0.042/GB-hr, $150 free credits, no minimums); self-hosting means running "your own production level Temporal Service" (the cluster needs a persistence backend + the workflow/history/matching/worker services — the docs defer to the self-hosted guide; operational burden is on you). Local dev is a single binary (`temporal server start-dev`). Sources: https://temporal.io/pricing , https://docs.temporal.io/production-deployment

**Repo state:** 20 workflows, all `ubuntu-latest`, staggered crons (e.g., 2:33, 2:53, 3:47, 3:21 UTC) — deliberately spread off the hour. `docker-compose.yml` runs n8n + Postiz (which bundles its own Temporal scheduler) + faster-whisper — **that Temporal belongs to Postiz, not to this repo's pipeline; nothing currently depends on adopting Temporal.**

### Verdict for this repo

- **KEEP GHA cron** as the scheduler while the repo is public and single-operator: it is literally free minutes, and the observed failure modes (high-load delay, 60-day inactivity auto-disable) are managed operationally — the 60-day rule is the one to put a watch on, since a quiet quarter could silently disable the whole production scheduler. A trivial "keepalive" commit or a periodic repo activity source solves it.
- **ADOPT Cloud Run Jobs when Studio goes multi-tenant.** The decisive architectural fact: client-owned channels cannot run inside *your* public repo — that would require putting client secrets in your repo and your scheduler being subject to GitHub's queue and quota. The shape that scales is: Studio (Next) enqueues a job → Cloud Run Job per render (ffmpeg image, per-second billing, no request fee) → writes to object storage → Studio reads status. n8n remains useful for content curation, not as the production scheduler.
- **WATCH Temporal; don't adopt it now.** The docker-compose Temporal is Postiz's. Building your pipeline on durable workflows means either operating a production Temporal cluster (4+ services plus persistence) or Temporal Cloud at $50/M actions. At the current job volume (~dozens of renders/day), Cloud Run Jobs + Neon-state (a `jobs` table, status machine in SQL) gives the same guarantees for a fraction of the complexity. Revisit Temporal if you need human-in-the-loop multi-day workflows with signal/query semantics.

---

## 6. Database / ORM — **KEEP postgres.js; ADOPT Drizzle when the schema grows**

### Evidence

- **Neon + postgres.js:** Neon's official Drizzle guide lists postgres.js among the supported Node drivers, described as "a modern and lightweight Postgres client for Node.js", alongside the Neon serverless HTTP driver, the Neon WebSocket driver, and `pg`. Source: https://neon.com/docs/guides/drizzle
- **Neon + Drizzle:** dedicated official guide; migration tooling is `drizzle-kit` (`generate`, `migrate`, `push`, `studio`); pooled (`-pooler` host) connection for runtime, **"using a pooled connection string for migrations can lead to errors — Use a direct (non-pooled) connection when running Drizzle Kit migrations."** Source: https://neon.com/docs/guides/drizzle
- **Drizzle:** "headless TypeScript ORM"; "If you know SQL, you know Drizzle"; "always outputs exactly 1 SQL query"; "exactly 0 dependencies"; relational query API; Postgres/MySQL/SQLite/etc. dialects. Source: https://orm.drizzle.team/docs/overview
- **Neon + Prisma:** official guide; driver adapters GA since Prisma ORM **v6.16.0** (`@prisma/adapter-neon` shown at 6.19.3) for HTTP/WebSockets instead of TCP; `prisma.config.ts` carries `DIRECT_URL` for CLI/migrations; Neon scale-to-zero cold starts can raise `P1001` — mitigate with `connect_timeout`/`pool_timeout`. Source: https://www.prisma.io/docs/orm/overview/databases/neon

**Repo state:** Studio queries Neon with raw `postgres.js` (`"postgres": "^3.4.7"`, `studio/lib/db.mjs`); no ORM present; `tsconfig` has `strict: false`.

### Verdict for this repo

- **KEEP postgres.js today.** It is officially supported by Neon, already integrated, and raw SQL is the right tool while the schema is small and the developer is the author of every query.
- **ADOPT Drizzle at the schema-growth inflection** — specifically when (a) the schema exceeds what you can hold in your head, (b) you want typed query results in the Studio UI, or (c) multi-tenant row isolation needs systematic `tenant_id` handling and migrations you can review. Drizzle fits this repo's plain-JS/ESM style better than Prisma (no codegen engine, 0 dependencies, SQL-shaped) and gives a real migration tool (`drizzle-kit`) the flat-JSON-state era never had. Remember the pooled vs. direct URL split for migrations.
- **Prisma only if** you end up wanting its Studio/migrate UX and team conventions; its Neon adapter is solid (GA since 6.16.0) but the engine/codegen model is heavier than this repo needs.

---

## 7. Python voice stack — **KEEP the chain; edge-tts is fallback-only**

### Evidence

**edge-tts** (rany2/edge-tts): tagline is "Use Microsoft Edge's online text-to-speech service from Python **without needing Microsoft Edge**" — i.e., an unofficial client of a vendor service; licensed **GPL-3.0**; actively developed (12.3k stars, 320 commits, 3 open issues). The README's only service-side restriction note: "Microsoft prevents the use of any SSML that could not be generated by Microsoft Edge itself" (why custom SSML support was removed). **The README contains no legality/ToS grant and no rate-limit discussion** — the 403/`SecMSGEvidenceTokenExpired` breakages of 2024 are widely reported but I did not re-verify them from a primary source today (**unverified**). Legality is unresolved by the project itself: it proxies a free consumer service; the provider's ToS is the governing document, and Microsoft blocking non-Edge SSML shows the service is actively constrained. Source: https://github.com/rany2/edge-tts

**Kokoro-82M** (hexgrad/Kokoro-82M model card): **Apache-2.0** weights — "With Apache-licensed weights, Kokoro can be deployed anywhere from production environments to personal projects" and "deployed in numerous projects and commercial APIs"; 82M params, StyleTTS 2/iSTFTNet decoder-only, trained exclusively on permissive/public-domain audio (~$1k, 1,000 A100-hours). Source: https://huggingface.co/hexgrad/Kokoro-82M

**faster-whisper** (SYSTRAN): MIT-licensed CTranslate2 reimplementation of Whisper, "up to 4 times faster than openai/whisper for the same accuracy while using less memory", int8 quantization on CPU/GPU; ecosystem positioning is de-facto-standard — WhisperX, WhisperLive, speaches (OpenAI-compatible server) are built on it, and the Whisper-Streaming project calls it "the most recommended back-end". Source: https://github.com/SYSTRAN/faster-whisper

**Repo state (verified):** `youtube-flow/narrate.py` implements exactly this reasoning as a chain: OpenAI `gpt-4o-mini-tts` (voice `onyx` + narrator instructions) with `whisper-1` word-timestamp alignment → Kokoro-82M (Apache 2.0, `$0`, default voice `am_michael`, estimated timings) → Edge TTS with native WordBoundary events. `docker-compose.yml` runs a faster-whisper server for local transcription; `explainer/edge_batch.py` and `hf-proof/make-voice.py` use edge-tts directly.

### Verdict for this repo

- **KEEP.** The chain is already correctly ordered by license risk and quality: paid API first, Apache-licensed local model second, unofficial service last. Kokoro is production-safe (commercial OK); faster-whisper is the right local alignment/transcription tool and is already deployed in the compose stack.
- **Treat edge-tts as a fallback with an expiry date.** It works, it's GPL-3.0 (fine when invoked as a subprocess, not linked into a distributed product), but there is no license to the underlying service and Microsoft demonstrably constrains non-Edge usage. For the SaaS product, client-facing voice should never route through edge-tts; the OpenAI path (or Kokoro for the free tier) is the defensible default.

---

## 8. Dependency health & other material findings — **WATCH**

**js-yaml v5 — the breakage this repo already hit, confirmed from the changelog:** v5.0.0 (2026-06-20) "Rewritten in TypeScript and **reorganized the public API around flat named exports**" — this is precisely why `yaml.load` disappeared from the default import and `lib/workflow-validator.mjs` needed the `yamlMod.default || yamlMod` guard (documented in `research/bug-audit-2026-10-17.md`, where the pre-refactor validator falsely flagged all 20 workflows as broken). Other v5 breaks worth grepping for: `load()` now **throws on empty input** (was `undefined`), `load` defaults to `CORE_SCHEMA` **without `!!merge`**, `Schema.extend()` → `Schema.withTags()`, and the loader options `onWarning`/`legacy`/`listener` plus several dumper options were removed. (v4.0.0, 2021-01-03, had removed the `safe*` functions.) Source: https://github.com/nodeca/js-yaml/blob/master/CHANGELOG.md — the repo is on `js-yaml ^5.4.1`, so it's past this migration, but the caret range means future minors arrive automatically; any v6 will need the same audit.

**googleapis release cadence:** releases are automated by release-please and batch near-daily; the ten most recent releases all landed 2026-10-14, including a **breaking** storage v27.0.0 and youtube v40.0.1. There is **no single major version** — each API is versioned independently inside the monorepo, while the umbrella `googleapis` package this repo pins (`^176.0.0`) increments continuously. Practical rule: the caret range auto-pulls non-breaking service updates, but a storage-class breaking change (like the one that shipped Oct 14) can still surface — smoke-test upload paths after umbrella bumps. Source: https://github.com/googleapis/google-api-nodejs-client/releases

**Storage layer (architectural, not doc-cited):** GitHub Releases as the media archive works at current volume but is tag-bound, not queryable, and has no published SLA — at the SaaS inflection, per-tenant object storage (S3/GCS) is the required destination; this is a design observation rather than a cited fact.

---

## Recommended stack, 2026 → 2027 (multi-tenant SaaS direction)

| Layer | Today (keep) | Next 12 months | Trigger to move | Primary-source basis |
|---|---|---|---|---|
| Runtime | Node 20 in 17 workflows | **Node 24 LTS** everywhere (EOL 2028-04-30); consider 26 after Oct 28 LTS date | Now — Node 20 removed from runners Sept 23, 2026 | nodejs/release; github.blog changelog |
| Language | Plain JS `.mjs`; Studio JS w/ `strict:false` | JSDoc + `tsc --checkJs` on `lib/`; Studio `strict:true`, convert data layer to `.ts` (Node runs it natively); TS 6 toolchain | As modules stabilize; TS 7 only when 7.1's API lands for typescript-eslint/Next | nodejs.org/api/typescript; TS7 devblog; Next docs |
| Monorepo | Ad-hoc root + `studio/` + `explainer/` | `"workspaces": ["studio", "explainer"]` in root `package.json` | Add Turborepo only if CI build times hurt | docs.npmjs.com; turborepo.dev; pnpm.io |
| Rendering | 4 engines: FFmpeg graphs (shorts/longvideo), Remotion (explainer), HyperFrames, sharp thumbs | Standardize new templates on one browser engine (HyperFrames or Remotion); FFmpeg stays assembly/mux | >3 employees ⇒ Remotion Automators plan ($0.01/render, $100/mo min); client renders ⇒ Remotion Lambda | remotion.dev LICENSE.md + FAQ + /lambda + /cloudrun; ffmpeg.org |
| Scheduling | 20 GHA cron workflows (public repo ⇒ $0 minutes) | GHA stays CI + internal cron; **Cloud Run Jobs** for tenant renders; a `jobs` table in Neon as queue state | First client-owned channel (can't run in your repo); watch the 60-day inactivity auto-disable | docs.github.com (events + billing + self-hosted); temporal.io/pricing |
| Temporal | Present only inside Postiz's compose stack | Not adopted | Only if multi-day human-in-the-loop workflows with signals appear; Cloud is $50/M actions | docs.temporal.io; temporal.io/pricing |
| Database | Neon via raw postgres.js | postgres.js until schema grows; then **Drizzle** + drizzle-kit migrations (pooled runtime URL, direct migration URL) | Schema > mental capacity, typed queries wanted, multi-tenant `tenant_id`/RLS | neon.com/docs/guides/drizzle; orm.drizzle.team; prisma.io Neon guide |
| Voice | OpenAI gpt-4o-mini-tts → Kokoro → edge-tts; faster-whisper local | Keep chain; edge-tts never client-facing in the SaaS | edge-tts breakage (historically 403s — unverified today); Kokoro is the safe free tier | huggingface.co/hexgrad; github.com/rany2/edge-tts; github.com/SYSTRAN/faster-whisper |
| Dependencies | js-yaml ^5.4.1; googleapis ^176 | Audit majors on upgrade (v5 flat-exports pattern); smoke-test upload paths after googleapis bumps | Any v6 of js-yaml; googleapis storage-class breaking releases | js-yaml CHANGELOG; googleapis releases |

### Immediate action list (cheap, high-value)

1. Bump the 17 `node-version: 20` workflow pins to `24` (the deprecation is not a warning anymore — Node 20 was removed from runners on Sept 23, 2026).
2. Add a repo-activity keepalive for the 60-day public-repo scheduled-workflow auto-disable.
3. Add `"workspaces"` to root `package.json` (studio, explainer).
4. Turn on `strict` in `studio/tsconfig.json` and convert `studio/lib/db.mjs` first.
5. Keep the Remotion dependency confined to `explainer/` so a future license change (5.0 "slightly changes" terms) is a one-package decision.

### Explicit uncertainties

- **Cloud Run Jobs dollar figures** — the pricing page is JS-rendered; rates quoted above are widely-published but not captured from the live page in this session. Re-verify at https://cloud.google.com/run/pricing.
- **Bun compatibility with googleapis/undici** — no first-party statement found; unverified.
- **edge-tts 2024-era 403/SecMSGEvidence breakages** — widely reported, not re-verified from a primary source in this session; the project's own README documents only the SSML restriction.
- **Remotion Lambda cost** — vendor's "pennies" claim only; no fixed per-render price exists (AWS-metered, region/parallelization-dependent).
- **GitHub Releases as archive limits** — no published hard quota cited; the objection is architectural, not a documented limit.
