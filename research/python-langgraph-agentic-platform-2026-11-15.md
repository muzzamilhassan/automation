# Python + LangChain/LangGraph agentic platform, multi-platform: research — 2026-11-15

This is a read-only research round. No code was changed. The owner asked for this in his own words: *"Today everything is Node .mjs scripts + cron jobs. I want to move to Python, LangChain, LangGraph and agentic AI — it's mandatory for me. I will scale the project, restructure it, add a lot more, and move to other platforms too (TikTok, Instagram, Facebook, Threads, Pinterest, X, LinkedIn, podcasts...)."*

**Builds on (read first):** `python-rag-audit-2026-10-17.md`, `chatgpt-python-first-stack-review-2026-11-03.md`, `openrouter-deep-dive-2026-11-03.md`, `free-llm-apis-and-puter-2026-11-03.md`, `docs/superpowers/plans/2026-10-29-phase3-rag-brain.md`, `deep-audit-2026-11-13.md`, `youtube-24-7-loop-live-streaming-2026-11-10.md`, plus the code in `services/ai/`. External facts were fetched 2026-11-15 and are listed in §11. Where a source conflicted or could not be verified, the text says so.

---

## 0. TL;DR verdict

| # | Question | Verdict | One line |
|---|---|---|---|
| 1 | Move to Python + LangGraph + agentic AI? | **GO, as a strangler-fig migration, not a rewrite** | The owner's mandate changes the destination. Python/LangGraph becomes the **control plane** (content graph, agents, scheduling, platform adapters). Node shrinks to **render services + Studio**. Every phase ships on its own, pilots on money-rulebook and can be rolled back with a flag. |
| 2 | Is LangGraph already in the repo? | **YES. The Nov-03 "DEFER" verdict is already reversed in practice** | `services/ai/requirements.txt` pins `langgraph==1.2.20` + `langchain-openai==1.7.4`. `services/ai/bot/graph.py` is a working draft→review→repair→shape StateGraph (Phase B template bot, Groq `gpt-oss-120b`). It has **no checkpointer and no interrupts yet**. That gap is where to start. |
| 3 | Which framework? | **LangGraph (OSS, MIT) as the orchestration spine. LangChain only for model integrations and structured output. No LangSmith Deployment.** | LangGraph gives durable checkpoints in Postgres (Neon), `interrupt()` human-in-the-loop (which maps 1:1 to our review desk), per-node `RetryPolicy` and subgraphs. Agent Server/self-hosting is Enterprise-only or $39/seat, so we run the plain library inside our own FastAPI/worker. |
| 4 | What must stay deterministic? | **Uploads, quota, idempotency, scheduling, rendering, token refresh, media QC** | These become **tools/nodes with deterministic code** that the graph calls, never LLM decisions. LangGraph replays a whole node on resume, so every side-effecting node must be idempotent through the existing `upload_intents` mutex pattern, generalized to `publish_intents`. |
| 5 | What can never move to Python? | **Studio (Next.js) and the render lanes (Remotion, HyperFrames, sharp+FFmpeg)** | Remotion's engine is Node-only. Its pip package only *triggers Lambda renders*. Renderers become a **render service** the Python graph calls (GHA `workflow_dispatch` today, VPS subprocess later). |
| 6 | Hosting | **Phase 1–2: GitHub Actions (as today, $0). Phase 3 decision: one small VPS (~€6–12/mo) as the always-on control plane** | The graph checkpoints to Neon, so a GHA job can pause at a review interrupt and a *later* job can resume it. No always-on box is needed until the scheduler moves off GitHub cron. The deep audit found that cron is unreliable (3–5 of 48 heartbeats/day). |
| 7 | Multi-platform | **Platform-adapter interface + `platform_accounts` / `publish_intents` / `platform_limits` as data** | Meta (FB Reels, IG Reels, Threads) costs $0 and shares one Graph API app, so it goes first. TikTok needs a **Content Posting API audit** (posts are private-only until then), so file it early. X is **paid per post** ($0.015, **$0.20 with a URL**). LinkedIn is self-serve for a personal profile but pages are gated. Podcasts go through **RSS**, which needs no API. |
| 8 | Cost delta | **$0 through Phase 2. About +€6–12/mo from Phase 3 (VPS). X optional and paid per post.** | LLM calls stay on the free provider chain. Agent loops multiply calls 3–5×, which still fits Groq (1,000 RPD), NVIDIA NIM (10,000 RPD) and OpenRouter (1,000 RPD after a one-time $10). |

**Bottom line:** the owner's goal is achievable without a big-bang rewrite, and the repo is better placed for it than it looks. Python is already the AI layer (RAG brain since #105), LangGraph is already pinned and running (template bot), and Neon already holds the job and step state machine the graph can mirror. The work is to **(1)** give the existing graph a Postgres checkpointer and a real review interrupt, **(2)** move script generation for money-rulebook into a LangGraph "content graph" behind a flag, and **(3)** add the platform-adapter layer and its data model before any new social platform is turned on. The renderers and Studio stay Node permanently. Uploads stay deterministic forever, whatever language they are written in.

---

## 1. What exists today (verified in the working tree, 2026-11-15)

| Area | What runs | Files / evidence |
|---|---|---|
| Orchestration | `channel-pipeline.mjs` (1,011 lines) runs per-channel lanes. GHA `channel-autopilot.yml` is the clock: `cron: '5,35 * * * *'` heartbeat on `ubuntu-slim`, produce job on `ubuntu-latest`. An external cron-job.org heartbeat was added in 6092d3b. | `channel-pipeline.mjs`, `.github/workflows/channel-autopilot.yml:25,62,129` |
| Lanes | Docs `yt-deepdive.mjs` (1,202 lines, Remotion), Shorts `yt-daily.mjs`/`youtube-engine.mjs` (778/1,350 lines, sharp+FFmpeg), clips `longvideo/shorts-clips.mjs` (673 lines), `cinematic-engine.mjs`, `music-engine.mjs` | repo root, `longvideo/` |
| Deterministic core (Node) | `lib/upload-intents.mjs` (1,068 lines: resumable upload + idempotency mutex), `lib/job-store.mjs` (jobs/job_steps/job_artifacts, `--resume`), `lib/review-gate.mjs`, `lib/quota-ledger.mjs`, `lib/schedule-slot.mjs`, `lib/brand-resolve.mjs`, `lib/media-qc.mjs` (new, untracked), `lib/ai-adapter.mjs` (615 lines: 5-provider free chain) | `lib/` (~40 modules) |
| Python sidecar | FastAPI `services/ai/app.py`: `/health`, `/context`, `/dedupe`, `/embed` (keyless, fastembed `all-MiniLM-L6-v2` 384-dim, Neon pgvector), plus **`POST /bot/draft`** (LangGraph template bot, key-gated on `GROQ_API_KEY`). Spawned **inside** each produce job at `127.0.0.1:8000`. Node fails open when it is down. | `services/ai/app.py:184-199`, `channel-autopilot.yml:168-181` |
| LangGraph usage today | `build_graph(model)` → `StateGraph(BotState)`: `draft → review → (repair) → shape → END`, compiled with **no checkpointer** and no `interrupt()`. The LLM supplies only creative content. Deterministic pools and validators normalize the output, and the Node side runs the real registry validator. This is the right pattern to generalize. | `services/ai/bot/graph.py:88-217`, `scripts/template-bot.mjs`, `template-bot.yml` |
| Tests | Python 102 pass / 3 skip (deep audit). Root `npm test` 1,113 pass, but `tests.yml` was red at audit time. | `services/ai/tests/`, deep-audit §5 |
| Neon tables (ensure-on-write) | `jobs`, `job_steps`, `job_artifacts`, `upload_intents`, `scripts`, `script_sources`, `script_claims`, `script_memory` (pgvector), `dedupe_verdicts`, `warnings`, `usage_events`, `provider_routes`, `provider_route_audit`, `youtube_quota_models`, `analytics_snapshots`, `analytics_probe_log`, `template_*`, `channel_template_assignments` | `grep CREATE TABLE` over `lib/`, `studio/lib/`, `services/ai/brain/` |
| Studio | Next.js on Vercel Hobby. Review desk (`/review`), registry, BYOK vault, Drafts Inbox. Approve triggers a re-dispatch with `resume=<job_id>`. | `studio/` |
| Cross-platform (paused) | `fb-crosspost.mjs`, `fb-images.mjs`, `fb-variant.mjs`, `ig-crosspost.mjs`, `threads-publisher.mjs`/`threads-daily.mjs`, `pinterest-publisher.mjs`, `longvideo/tiktok-clips.mjs`, `tiktok-brand-kit.mjs`, `tiktok-app-site/` | The deep audit flags Graph API v20 as retired, the Threads token expired 10-29, and Pinterest Trial pins as invisible |

**Known open defects that the migration must not inherit or hide (deep audit 2026-11-13):** CI red; `channel-pipeline.mjs` always exits 0; GH cron heartbeat delivers about 8% of ticks; brand-resolve overwrites the kit voice and slot; the upload-intent ECONNRESET double-upload path; no media QC on the upload path; BYOK key split (MASTER_KEY v1 in CI, v2 in Studio, sec-07); Actions spend about $8–17.5/mo against a $12 allowance that **blocks** instead of billing.

---

## 2. Prior decisions, and what the new goal changes

| Prior decision (where recorded) | Status after the owner's mandate | Why |
|---|---|---|
| "No full Python rewrite; Python as AI sidecar" (Oct-17 §0, Nov-03 #1) | **AMENDED.** Still no *rewrite*. The destination changes from "sidecar forever" to "Python is the control plane; Node keeps only renderers + Studio". | The owner explicitly wants to restructure around Python/LangGraph and expand beyond YouTube. A strangler-fig keeps the Oct-17 risk argument intact: nothing is ported until a Python replacement passes parity on money-rulebook. |
| "LangGraph + LangChain: NO / DEFER" (Nov-03 #3) | **REVERSED, and already reversed in code** (`langgraph==1.2.20` in Phase B) | The owner made it mandatory. The CVE concern is addressable (§3.4). The "linear pipeline" argument still holds for the *publish* half, which is why that half stays deterministic nodes rather than agents. |
| "LangGraph Postgres checkpointer: SKIP, Phase-4 jobs/job_steps already do recovery" (Nov-03 table) | **REVERSED, with a boundary.** Checkpointer for **in-graph** resume and HITL interrupts. `jobs`/`job_steps` stay the **system of record** that Studio reads. | Checkpoints are what make `interrupt()` and cross-process resume work. Two ledgers are acceptable only if one is authoritative: graph nodes write `job_steps` through a wrapper, and checkpoints are pruned after the job closes. |
| "Celery + Redis: NO" (Nov-03 #2) | **STANDS** | Nothing in the new goal needs a broker. A queue, if one is ever needed, is Postgres-native (`SELECT … FOR UPDATE SKIP LOCKED`, DBOS queues, or Hatchet's Postgres-only mode). |
| "RAG: plain Python + pgvector, no framework" (Oct-17 §3.4) | **STANDS.** The brain stays plain Python. LangGraph *calls* `/context` and `/dedupe` as tools. | Rewriting a working retrieval layer into LangChain retrievers adds churn and no capability. |
| "Python calls no LLM APIs; Node owns the provider chain" (Nov-03 §2) | **CHANGES.** The provider chain is ported to Python as **data-driven routing** (reads `provider_routes`, same BYOK vault). | Agents need the model client in-process. It is already half-true: the template bot calls Groq via `langchain-openai`. **Prerequisite:** fix the MASTER_KEY v1/v2 split (sec-07) so Python decrypts the same vault. |
| "Own-30, no SaaS / no tenancy" (scope pivot 10-25) | **STANDS** | Multi-*platform* is not multi-*tenant*. The data model adds `brand → platform_accounts`, not workspaces or RBAC. |
| "Channels scale with zero code changes" (no-static-maps) | **STANDS and is extended to platforms** | A new platform account is a data row. A new *platform* needs one adapter class, the only acceptable code change. |
| "Social lanes paused; build `lib/meta-graph.mjs` + Neon crosspost queue before un-pausing" (deep audit "Later") | **REPLACED in direction:** build the Meta adapter in **Python** with `publish_intents` as the queue | Same intent (one Graph client, a durable queue, target Graph API v25), new language. The owner decides when (§9). |
| "Pilot on money-rulebook first; planning-first; EARS spec + QA file per feature" | **STANDS, and every phase below follows it** | — |

---

## 3. LangGraph today: what it actually gives us

### 3.1 Capabilities that matter for this workload
- **Persistence and durable execution.** Compiling with a checkpointer persists state per `thread_id`. `PostgresSaver` (package `langgraph-checkpoint-postgres`) is the production backend, and `checkpointer.setup()` creates its tables once. In-memory savers lose everything on restart. There are three **durability modes**: `exit` (write only at the end), `async` (write during the next step; a hard crash can lose the latest checkpoint) and `sync` (write before the next step starts). The mode is set per invocation (`graph.stream(..., durability="sync")`). Sources disagree on the default (one official KB says `async`). **Set it explicitly.** Use `sync` for any graph with external side effects.
- **Human-in-the-loop.** `interrupt(payload)` inside a node saves state and *waits indefinitely*. Resume with `graph.invoke(Command(resume=value), config={"configurable": {"thread_id": ...}})`. The resume value becomes the return value of `interrupt()`. Typed resume schemas need `langgraph>=1.2.12` (we pin 1.2.20). **Gotcha:** the interrupted node **re-runs from the top** on resume, so code before `interrupt()` must be idempotent or cheap.
- **Retries.** `add_node(..., retry_policy=RetryPolicy(max_attempts=3, retry_on=...))`. `set_node_defaults` sets a graph-wide default. After retries are exhausted the error is raised, so route failures with explicit conditional edges.
- **Subgraphs.** A compiled graph can be a node. This is how the content graph composes per-platform sub-flows.
- **Replay granularity.** Checkpoints are **per node**. "Put four tool calls in one node, and the restart runs all four again." So keep one side effect per node, and make it idempotent.

### 3.2 LangGraph Platform / LangSmith: what we do **not** need
- "LangGraph Platform" is now **LangSmith Deployment / Agent Server**. Developer is $0 (1 seat, 5k traces/mo). Plus is **$39/seat/mo** (includes 1 small serverless Agent Server). **Self-hosted and hybrid are Enterprise (custom pricing)**. Usage is metered (e.g. $0.0675/vCPU-hr runtime, $0.177/vCPU-hr DB).
- **Verdict:** run the **OSS `langgraph` library** inside our own FastAPI/worker process with `PostgresSaver` on Neon. That costs $0. The LangSmith **Developer** tier (5k traces/mo) or Langfuse Cloud's free tier (prior research) is optional tracing. Neither is required.

### 3.3 LangChain vs LangGraph: how much of each
- **Use:** `langchain-core` message types, `langchain-openai` `ChatOpenAI(base_url=…)` (every provider in our chain is OpenAI-compatible), `.with_structured_output(PydanticModel)`, `.with_fallbacks([...])` for the provider chain.
- **Avoid:** legacy chains, LangChain retrievers/vector stores over our working brain, and auto "agents" that hide the control flow. Keep the explicit StateGraph style `bot/graph.py` already uses: the LLM writes content, and deterministic code validates and shapes it.

### 3.4 Security and storage concerns from Nov-03, re-checked
- **CVEs.** CVE-2025-67644 (SQLite checkpointer SQLi, fixed 3.0.1) + **CVE-2026-28277** (core `langgraph` msgpack deserialization, **fixed in 1.0.10**) chain to RCE. **CVE-2026-27022** is the **JS Redis** checkpointer (fixed 1.0.2), not Python. (The Nov-03 note listed 27022 as a Python checkpoint CVE. That attribution was imprecise.) CSA: Postgres users are not hit by the SQLite chain, but everyone must run `langgraph>=1.0.10` and `langgraph-checkpoint>=3.0.0`. **We pin 1.2.20.** Mitigations: pin `langgraph-checkpoint-postgres` explicitly, never expose `get_state_history()` or checkpoint filters to untrusted callers (the sidecar binds to 127.0.0.1 / a private VPS port), and never use SQLite or Redis savers.
- **Checkpoint growth.** `checkpoint_blobs` grows with both the *number* and the *size* of checkpoints. The OSS `PostgresSaver.prune(thread_ids, strategy="keep_latest")` bounds the count. TTL is an Agent-Server-only feature. The Nov-03 "~6.79× overhead" issue (#7714) could not be re-located today. Treat the overhead as plausible and design around it: **state holds references (artifact hashes, Blob URLs, script ids), never media or full transcripts.** Prune on job close. Watch the Neon Free 1 GB/project ceiling (deep audit §6).

### 3.5 Where an agent framework helps, and where deterministic code must stay

| Step | Agentic (LLM in a LangGraph node / tool loop) | Deterministic (plain code node or tool) |
|---|---|---|
| Trend / topic research | **Yes.** Tool-using research agent (YouTube search bucket, trends files, `/context` performance rows), with a budget cap on tool calls | Quota accounting for `search.list` (its own 100/day bucket) |
| Outline → script → critic → repair | **Yes.** The `bot/graph.py` pattern, plus a claim/source check for YMYL (money-rulebook) | JSON schema validation, length/beat contracts, banned-phrase lists, `/dedupe` verdict thresholds |
| Titles, descriptions, tags, hooks, thumbnail text, per-platform captions | **Yes**, with structured output | Character limits per platform (data), hashtag caps, disclosure strings |
| QA judge (LLM-as-judge on script/brand fit) | **Yes, advisory.** Writes a score into the review desk | **Media QC** (black/silence/codec/duration via ffprobe) stays deterministic and **blocking** |
| Comment replies / community | **Yes, behind review** (interrupt) at first | `commentThreads.insert` quota (50 units) and rate caps |
| Review gate | `interrupt()` *is* the gate. The human decides. | Which templates require review (`review_required` data) |
| TTS, music, render | No | Python TTS (exists), Node render service |
| Upload / publish / cross-post | **No. Never.** | `publish_intents` mutex, resumable-upload probe, platform limits, token refresh, `invalid_grant` parking |
| Scheduling / slots / quota | No | `schedule-slot`, per-bucket quota ledger, platform rate windows |
| Analytics ingest | No (ingest). Yes (a "what worked" summarizer feeding the planner) | API pulls, snapshots, pruning |

---

## 4. Framework comparison (for THIS workload)

| Option | License / cost | Durability | HITL | Fits our infra? | Verdict |
|---|---|---|---|---|---|
| **LangGraph (OSS)** | MIT, $0 | Postgres checkpointer (Neon), node-granular replay, 3 durability modes | First-class `interrupt()`/`Command(resume)` | **Yes.** Library only, Neon we already run, already pinned in repo | **ADOPT as the spine** (owner mandate + best HITL fit) |
| LangChain 1.x | MIT, $0 | n/a | n/a | Model clients already used | **USE narrowly** (model integrations, structured output, fallbacks) |
| LangSmith Deployment (Agent Server) | Plus $39/seat; self-host = Enterprise | Managed | Managed | Adds a vendor + bill | **SKIP** |
| Pydantic AI | MIT, $0 | Via DBOS / Temporal / Prefect integrations | Tool approval | Good typed outputs | **OPTIONAL inside nodes** if `with_structured_output` proves weak. Not a second orchestrator. |
| OpenAI Agents SDK | MIT, $0 | Weak (sessions) | Basic | Non-OpenAI models via LiteLLM extra | **SKIP.** Handoff-style agents are not our shape |
| CrewAI | MIT core, $0 | Weak | Basic | Role-play multi-agent, less control | **SKIP** |
| DBOS (Python) | Open source library; Postgres-backed; no server | Step output committed in your DB transaction | Manual | **Yes** (Neon). Strong for deterministic publish workflows | **WATCH.** Strongest alternative if LangGraph's node-replay semantics bite the publish half. Avoid running two durability systems at once. |
| Temporal | OSS self-host (cluster) or Cloud (pricing in flux, PAYG reported Sep-2026) | Gold standard event-history replay | Signals | Heavy ops; determinism rules constrain agent code | **SKIP** (overkill for a solo operator) |
| Prefect 3 / Dagster | OSS + cloud tiers | Task-level | Pause/resume | Data-pipeline orchestrators; need a server or cloud | **SKIP** |
| Inngest | Hobby $0 = 50k executions/mo, pauses when exhausted | Step memoization | waitForEvent | Hosted; step data leaves our network | **SKIP** |
| Hatchet | OSS (MIT/Apache, sources differ), **Postgres-only mode**; cloud tiers unverified | Durable tasks + queue | Yes | Self-host on a VPS against Neon | **WATCH** if a real multi-worker queue is ever needed (Phase 6+) |
| Celery + Redis | — | — | — | No Windows support; broker | **REJECTED** (stands) |

---

## 5. Python media stack and platform APIs

### 5.1 Media
- **FFmpeg:** call it through `subprocess` with explicit arg lists, the same work as Node's `lib/ffmpeg.mjs`. PyAV is fine for probing and frame access. `ffmpeg-python` (unmaintained) and MoviePy (re-encodes via numpy, slower) remain **not recommended** (Oct-17 §2.2 stands).
- **Remotion:** **no Python runtime.** `remotion-lambda` on PyPI only *triggers* AWS Lambda renders, and the docs say to pin it to the npm version. We do not use Lambda. **Keep Remotion, HyperFrames and sharp+FFmpeg as a Node "render service"** with one contract: `render(job_id, template, props_ref) → artifact_hash`. It is invoked by GHA `workflow_dispatch` (now) or a local subprocess/HTTP call on the VPS (later).
- **TTS** is already Python (edge-tts, kokoro), so it moves into the graph as a node.
- **YouTube:** `google-api-python-client` + `google-auth` support `MediaFileUpload(resumable=True)`. Do **not** port `lib/upload-intents.mjs` until a parity suite exists (§7, Phase 5). Until then the graph calls the Node uploader as a tool.

### 5.2 Platform posting APIs: 2026 constraints that shape the adapter design

| Platform | Publish path | Hard constraints (2026) | Cost | Design implication |
|---|---|---|---|---|
| **YouTube** | Data API v3 resumable upload | `videos.insert` and `search.list` each have their own **100 calls/day** bucket (since 2026-06-01). Upload ≈100 units. OAuth "Testing" apps get 7-day refresh tokens (deep audit) | $0 | The insert bucket is the first wall at 30 channels. Per-bucket quota ledger as data. |
| **Facebook Pages (Reels)** | `POST /{page_id}/video_reels` (upload session → publish) | **30 API-published reels per 24h moving window**. Meta recommends the app enforce it. Graph API v20 retired; target **v25** | $0 | Rate window in `platform_limits`. One Meta app shared with IG and Threads. |
| **Instagram (Reels)** | Container → `media_publish` | **100 API-published posts / 24h moving** (some Meta pages still say 50; read the live `content_publishing_limit`). Business/Creator account required | $0 | Query the live limit endpoint before publishing. Never hardcode. |
| **Threads** | Container → publish | **250 posts / 24h moving** (`threads_publishing_limit`). Long-lived tokens last 60 days and refresh only while valid | $0 | Token-refresh node + expiry alarm (the deep audit found the token expired 10-29). |
| **TikTok** | Content Posting API Direct Post (`video.publish` scope) | **Unaudited clients: all posts private (SELF_ONLY).** Public posting requires passing an audit (third-party estimates 2–6 weeks; a 5-user/24h cap for unaudited clients is unconfirmed) | $0 | **Owner action: file the audit early**, using `tiktok-app-site/`, which already exists. Until then the adapter's `capabilities()` returns `private_only`. |
| **Pinterest** | v5: `POST /v5/media` (video) → poll → `POST /v5/pins` | **Trial access: pins visible only to you, ~1,000 requests/day.** Standard access needed for public pins (reportedly requires a demo video) | $0 | Apply for Standard before enabling. Poll media status before creating the pin. |
| **X** | `POST /2/tweets` + media upload | **Pay-per-use** since Feb-2026 for new developers: **$0.015/post, $0.20/post with a URL**, $0.010 summoned reply (docs.x.com; prices "can change") | **Paid** | 30 brands × 1 plain post/day ≈ **$13.50/mo**. With links ≈ **$180/mo**. Default: no-link posts, or skip X. Owner decision. |
| **LinkedIn** | Posts API + Videos API (initialize → upload chunks → finalize) | `w_member_social` (personal profile) is self-serve. **Company pages need `w_organization_social` + Community Management API approval** | $0 | Personal first. Pages only if approved. |
| **Podcasts** | **RSS feed** (we host the XML + audio) | Spotify ingests RSS. Its new Distribution API is for 5 partner hosts only. YouTube accepts RSS submission in Studio (2024 report) | $0 | The podcast "adapter" is a **feed generator**, not an API client. Docs lane audio becomes episodes. |

---

## 6. Target architecture: multi-platform content OS

### 6.1 Shape

```mermaid
flowchart LR
  subgraph Studio["Studio (Next.js, Vercel) — stays Node"]
    UI[Registry / Review desk / Drafts / Analytics]
  end
  subgraph CP["Python control plane (services/ai → services/core)"]
    API[FastAPI: /graphs/*, /context, /dedupe, /embed]
    SCHED[Scheduler: GHA dispatch → later VPS timer]
    subgraph CG["LangGraph content graph (thread_id = job_id)"]
      PLAN[plan_topic agent] --> RES[research agent + tools]
      RES --> SCRIPT[script subgraph: draft→critic→repair]
      SCRIPT --> GATE[deterministic gates: schema, /dedupe, claims]
      GATE --> ASSETS[assets: TTS, music pick, thumb text]
      ASSETS --> RENDER[[render tool → Node render service]]
      RENDER --> QC[media QC (deterministic, blocking)]
      QC --> REVIEW{{interrupt(): owner review}}
      REVIEW --> PUB[publish subgraph]
      PUB --> XPOST[cross-post subgraph: per-platform variants]
      XPOST --> LEARN[analytics ingest + learn → brain]
    end
    ADP[Platform adapters: youtube, meta_fb, meta_ig, threads, tiktok, pinterest, x, linkedin, podcast_rss]
    BRAIN[Brain: pgvector RAG, plain Python]
  end
  subgraph Render["Render service — stays Node"]
    REM[Remotion docs]
    HF[HyperFrames]
    SH[sharp + FFmpeg Shorts]
  end
  subgraph Neon["Neon Postgres"]
    REG[(brands, platform_accounts, platform_limits)]
    JOBS[(jobs, job_steps, job_artifacts)]
    PI[(publish_intents ⊇ upload_intents)]
    LG[(lg.* checkpoints)]
    VEC[(script_memory, dedupe_verdicts)]
    AN[(analytics_snapshots + platform)]
  end
  UI -- approve / reject --> API
  SCHED --> API
  API --> CG
  RES & SCRIPT & GATE --> BRAIN
  RENDER --> Render
  PUB & XPOST --> ADP
  ADP --> PI
  CG <--> LG
  CG --> JOBS
  BRAIN <--> VEC
  LEARN --> AN
```

### 6.2 The platform-adapter interface (deterministic, one class per platform)

```python
class PlatformAdapter(Protocol):
    platform: str                                   # 'youtube' | 'meta_ig' | ...
    def capabilities(self, account) -> Caps: ...    # formats, max duration, aspect, private_only, link_cost
    def validate(self, variant, account) -> list[Issue]: ...   # pure; spec + limits from platform_limits rows
    def publish(self, intent: PublishIntent) -> PublishResult: ...  # idempotent by intent.key; probe-before-retry
    def status(self, external_id, account) -> Status: ...
    def analytics(self, external_id, account, window) -> Metrics: ...
    def refresh_credentials(self, account) -> AccountStatus: ...    # invalid_grant → reconnect_required, never throw
```

- **Idempotency contract:** `publish()` first claims a `publish_intents` row (`UNIQUE(platform, account_id, content_id, variant_id)`). If a row is already `published`, it returns the stored `external_id`. On an ambiguous network error it **probes** before retrying (the lesson of the ECONNRESET double-upload bug). The LangGraph publish node calls exactly one `publish()`, so a node replay is safe.
- **Limits as data:** `platform_limits(platform, scope, window_sec, max_count, cost_usd, source_url, verified_at)`, e.g. `('meta_fb','reels_publish',86400,30,0,…)` and `('x','post_with_url',null,null,0.20,…)`. A monthly audit job re-verifies the rows against the docs. No limit is ever hardcoded.

### 6.3 Data-model changes in Neon (additive, ensure-on-write, matching today's style)

| Table | Purpose | Notes |
|---|---|---|
| `brands` | The unit of identity (kit, voice, niche, disclosure) | Today's channel registry row becomes a brand. A YouTube channel is one account of a brand. |
| `platform_accounts` | `(brand_id, platform, handle, external_id, token_enc, scopes, status, cadence jsonb)` | Replaces per-platform token JSON files (`threads-oauth-tokens.json`, `youtube-oauth-tokens.json`). Same AES-GCM vault (MASTER_KEY v2 only). |
| `platform_limits` | Rate windows, specs, costs per platform (see above) | Data, verified monthly |
| `content_items` / `variants` | One master content → many renditions (16:9 doc, 9:16 clip ≤90 s, pin, thread text, podcast episode) | `variants.render_ref` → `job_artifacts` hash |
| `publish_intents` | Generalizes `upload_intents` with a `platform` column | Migrate YouTube rows in place via a view/backfill. Keep `upload_intents` until Phase 5 parity. |
| `analytics_snapshots` | + `platform` column | The learning loop reads across platforms |
| `lg.*` | LangGraph checkpoint tables in a **separate schema** | Created by `PostgresSaver.setup()`. Pruned on job close. |

---

## 7. Migration plan (strangler-fig; every phase shippable, flag-gated, MR first)

Every phase follows the AGENTS.md rules: EARS spec, then a plain-English QA file, then test-first code, then a live money-rulebook proof, then owner sign-off before the next phase. **Phase 0 gates everything:** a migration cannot be verified while CI is red and the pipeline always exits 0.

| Phase | What moves | Lowest-risk/highest-value why | Effort | Added $/mo | Rollback | Owner decision point |
|---|---|---|---|---|---|---|
| **0. Ground truth** | Nothing moves. Finish deep-audit "this week" items #3 (CI green), #7 (truthful exit codes), sec-07 (single MASTER_KEY v2), #13/#14 (media QC + upload probe). Add `services/ai` packaging (pinned `langgraph-checkpoint-postgres`, `pyproject` or keep `requirements.txt`) and a **Node↔Python JSON contract test** pattern. | You cannot prove a strangler step on a red, always-green-exit pipeline | S–M (mostly already queued) | $0 | n/a | Approve Phase 0 as the migration's entry gate |
| **1. Content graph v1: script generation for MR docs** | New `services/ai/graphs/content/` StateGraph: `plan → research(tools: /context, trends) → draft → critic → repair → gates(schema, /dedupe, claims) → package(title/desc/tags)`. `PostgresSaver` on Neon (`lg` schema), `thread_id = job_id`. Python provider router reads `provider_routes` (Gemini → Groq → NIM → OpenRouter `:free`…) via `ChatOpenAI(base_url)` + `with_fallbacks`. `yt-deepdive.mjs` calls `POST /graphs/content/runs` behind `CONTENT_GRAPH=1` **for money-rulebook only**. Runs in **shadow mode** first (both paths generate, Node's ships, diffs land in the review desk), then flips. | Highest value (agentic research + critic loop is exactly where LLM frameworks pay off). Lowest risk (pure generation, no side effects, the existing fail-open seam already exists) | M | $0 (+~1 GHA min/run) | Unset flag | Approve spec. After 1–2 weeks of shadow, approve the flip on MR |
| **2. Review as `interrupt()`** | The review-gate hold becomes `interrupt({script, sources, dedupe, qa_judge})` inside the graph. The GHA job ends at the interrupt (state in Neon). Studio approve/reject calls `workflow_dispatch(resume=job_id, decision=…)`, and the new job resumes with `Command(resume=decision)`. Add an LLM QA-judge node (advisory score on the review desk). | Maps 1:1 to today's review desk and `--resume`. Proves durable cross-process resume on free infra | M | $0 | Flag back to `lib/review-gate.mjs` | Approve. Decide whether QA-judge scores may ever auto-approve (recommend: never for YMYL) |
| **3. Control plane gets a home** | Option A ($0): Cloudflare Worker cron → `workflow_dispatch` (deep-audit #10), graph stays in GHA. **Option B (recommended at ≥10 active channels): one small VPS** (Hetzner 2 vCPU class, ~€6–12/mo after the June-2026 price rise) running FastAPI + a Postgres-backed job poller + systemd timers. Renders stay on GHA via `workflow_dispatch` (render-as-a-service). The GH cron heartbeat stays as a backup. | Fixes the measured cron unreliability and removes sidecar cold-start per job. Can co-host the 24/7 live-loop pilot if the sizes fit (live-loop note: CPX12 €11.99 for 16 `-c copy` streams) | M | €0 (A) / €6–12 (B) | DNS/dispatch back to GHA cron | **A vs B, and whether to share the box with the live loop** |
| **4. Platform layer + Meta first** | `PlatformAdapter` + `platform_accounts`/`platform_limits`/`content_items`/`variants`/`publish_intents`. Adapters: `meta_fb` (Reels), `meta_ig` (Reels), `threads` on **Graph API v25**. Cross-post subgraph: MR clips → 9:16 variants → per-platform caption agent → deterministic `validate()` → `publish()`. Token-refresh node with expiry alarms. | One Meta app, $0, the paused Node publishers show demand. Replaces the deep audit's `lib/meta-graph.mjs` plan | L | $0 | Accounts `status=paused` (data) | Approve un-pausing social. Which brands get FB/IG/Threads accounts |
| **5. YouTube publish moves to Python** | Port `upload-intents` semantics to the `youtube` adapter **only after** a parity suite replays the Node test cases (ECONNRESET probe, 308 loop bound, quota buckets, `invalid_grant` parking). Until then the publish node shells out to the Node uploader as a tool. | Riskiest code in the repo, so it moves last, behind tests | M–L | $0 | Tool path stays available | Approve the port, or keep Node uploader permanently (acceptable) |
| **6. More platforms + learning loop** | TikTok (after the audit passes), Pinterest (after Standard access), LinkedIn (personal), podcast RSS generator (docs → episodes), X (if approved). Nightly analytics ingest per platform → `analytics_snapshots(platform)` → brain → planner agent uses cross-platform performance. | Each is one adapter + data rows. The learning loop is where "agentic" compounds | M per platform | $0 (+ X per-post) | Per-account pause | Per platform: approve + owner actions (audits, app reviews) |
| **7. Retire Node orchestrators** | Shorts lane (`yt-daily`/`youtube-engine` orchestration), clips lane, then `channel-pipeline.mjs` become graphs. Render code stays Node. | Only once every lane has a graph with parity | L | $0 | Lane flag per channel | Approve per lane |

**Never moves:** Studio (Next.js); Remotion/HyperFrames/sharp render code; and the *deterministic nature* of uploads, quota and idempotency, in whichever language they live.

---

## 8. Costs

| Item | Today | After Phase 1–2 | After Phase 3B | Notes |
|---|---|---|---|---|
| GitHub Actions | ~$8–17.5/mo of compute vs $12 included; **blocks** when exceeded (no payment method) | +~1 min per graph run (Python setup is cached; sidecar already spawns) | Lower (no sidecar boot per job; renders only) | Add a payment method or GitHub Pro ($4/mo, 3,000 min) as a guard. Owner decision. |
| VPS | €0 | €0 | **€6–12/mo** (Hetzner 2 vCPU class; Cost-Optimized plans reported intermittently unorderable) | Shares with the live-loop pilot only if CPU/RAM allow |
| Neon | Free (1 GB, 100 CU-h) | + checkpoints (pruned) | + always-on poller CU-hours. **Watch.** | Free → Launch if the CU-hours wall hits. Measure in Phase 3. |
| LLM | Free chain | 3–5× calls per artifact (agent loops): ~100–450 calls/day at 30 channels | same | Fits Groq 1,000 RPD, NIM 10,000 RPD, OpenRouter 1,000 RPD after one-time $10.80 |
| Tracing | none | LangSmith Developer $0 (5k traces/mo) or Langfuse Cloud free | same | Optional |
| Platforms | $0 | $0 | $0 | **X:** ~$13.50/mo (30 plain posts/day) or ~$180/mo with links |
| **Total delta** | — | **≈ $0** | **≈ €6–12/mo** (+ X if chosen) | |

---

## 9. Risks (and mitigations)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Two ledgers drift (`job_steps` vs LangGraph checkpoints) | Med | Studio shows the wrong state | `job_steps` is authoritative. One node wrapper writes both. A test asserts parity per run. |
| Node replay re-executes a side effect (double publish) | Med | Duplicate posts, quota burn | One side effect per node. `publish_intents` mutex + probe. `durability="sync"` on publish graphs. |
| Checkpoint bloat on Neon Free (1 GB) | Med | Writes block | References only in state. `prune(keep_latest)` on job close. Size alarm. |
| LangGraph CVE / API churn | Low–Med | Security, upgrade toil | Pin all three packages explicitly. Private binding. No SQLite/Redis savers. Monthly upgrade with tests. |
| Agent loops multiply LLM calls and hit free-tier caps | Med | Stalled runs | Per-graph call budgets in state. Fail-continue provider chain. Deterministic fallback path (today's Node generator) kept behind the flag. |
| Templated sameness / YPP "inauthentic content" | **High** (already flagged on MR) | Channel-wide demonetization | Agents must *increase* variety: brand voice from kit data, critic node checks sameness against the brain, claims/sources required for YMYL. More automation ≠ more volume. |
| Platform policy (TikTok audit refused, Pinterest Trial, LinkedIn pages gated) | Med | Lane never goes public | `capabilities()` reports reality. Owner files audits early. No scraping/unofficial APIs. |
| Solo-operator ops load on a VPS | Med | Silent outages | Phase 3A ($0) is a valid permanent answer. Dead-man check from cron-job.org. systemd `Restart=always`. |
| Parallel-session edits in one tree | Med | Clobbered work | Each phase is its own branch or worktree. Named-file staging only (memory rule). |

### "Do NOT do" list
1. **No big-bang rewrite**, and no "port all .mjs to .py" milestone. Every move is one lane, behind a flag, piloted on MR.
2. **Never let an LLM decide or perform an upload, quota spend, retry or idempotency action.** Agents propose; deterministic nodes dispose.
3. Do not port `upload-intents` before a parity suite exists. Do not delete the Node uploader until Python has shipped ≥2 weeks clean on MR.
4. Do not adopt LangSmith Deployment / Agent Server, Celery/Redis, Temporal, or a second durable-execution engine alongside LangGraph.
5. Do not store media, transcripts or large blobs in graph state. Store hashes and URLs.
6. Do not expose checkpoint history or filter endpoints publicly, or use SQLite/Redis checkpointers.
7. Do not rewrite the RAG brain into LangChain retrievers.
8. Do not hardcode platform limits, specs, costs, account ids or brand data (no-static-maps).
9. Do not start the migration while CI is red or `channel-pipeline.mjs` exits 0 on failure.
10. Do not use unofficial or scraping posting APIs, and do not post X links at $0.20 each without an explicit budget.
11. Do not build SaaS tenancy as part of "multi-platform".

---

## 10. Open questions for the owner

1. **Entry gate:** do you accept that Phase 0 (CI green, truthful exits, MASTER_KEY v2 everywhere, media QC + upload probe) must land before Phase 1 starts?
2. **Destination:** is "Python control plane + Node render service + Next.js Studio" the end-state you want, or do you also want Studio rewritten (not recommended; no Python equivalent of the current app without a full UI rewrite)?
3. **Shadow-mode length** for the MR content graph before flipping: 1 week or 2?
4. **Phase 3:** $0 Cloudflare-cron-into-GHA (A), or a €6–12/mo VPS control plane (B)? If B, should it share a box with the 24/7 live-loop pilot?
5. **GitHub Actions overrun:** add a payment method / GitHub Pro ($4) so overruns bill rather than block?
6. **Platform order:** Meta trio first (recommended), then TikTok after the audit and Pinterest after Standard access. Is X in or out given per-post pricing?
7. **Owner actions to start now** (they have lead time): TikTok Content Posting API audit, Pinterest Standard access, Meta app on Graph API v25 with IG/Threads permissions, LinkedIn app (personal posting).
8. **Auto-approval policy:** may an LLM QA judge ever auto-approve a non-YMYL Short, or does every item keep the human `interrupt()`?
9. **YouTube uploader:** port to Python in Phase 5, or keep the Node uploader permanently as a tool (acceptable, lower risk)?
10. **Tracing:** LangSmith Developer (5k traces/mo) or Langfuse Cloud free, or none for now?

---

## 11. Sources (fetched 2026-11-15 unless noted)

**LangGraph / LangChain**
- Durable execution and durability modes (exit/async/sync): https://docs.langchain.com/oss/python/langgraph/durable-execution · default-mode note: https://kb.langchain.com/articles/6253531756-understanding-checkpointers-databases-api-memory-and-ttl
- Persistence / PostgresSaver / thread_id / pruning advice: https://docs.langchain.com/oss/python/langgraph/persistence (via the durable-execution page) · `PostgresSaver.prune`: https://reference.langchain.com/python/langgraph.checkpoint.postgres/PostgresSaver/prune · blob growth: https://forum.langchain.com/t/how-to-handle-growing-checkpoint-blob/4448 · TTL (Agent Server only): https://docs.langchain.com/langsmith/configure-ttl
- Interrupts / `Command(resume)` / node re-run gotcha / typed resume (≥1.2.12): https://docs.langchain.com/oss/python/langgraph/interrupts · https://docs.langchain.com/oss/python/langgraph/add-human-in-the-loop
- Retries (`RetryPolicy`, `set_node_defaults`): https://docs.langchain.com/oss/python/langgraph/fault-tolerance · https://docs.langchain.com/oss/python/langgraph/graph-api-nodes
- Releases (1.2.x line): https://pypi.org/project/langgraph · https://releasebot.io/updates/langchain-ai/langgraph
- LangSmith pricing / Agent Server / self-host = Enterprise: https://www.langchain.com/pricing
- LangChain/LangGraph 1.0 stability commitment (Oct-17 source): https://www.langchain.com/blog/langchain-langgraph-1dot0
- CVE chain: https://labs.cloudsecurityalliance.org/research/csa-research-note-langgraph-rce-chain-20260615-csa-styled/ · https://research.checkpoint.com/2026/from-sqli-to-rce-exploiting-langgraphs-checkpointer · https://www.action1.com/vulnerabilities/cve-2026-27022/ · https://www.action1.com/vulnerabilities/cve-2026-28277/
- Durable-execution comparison (LangGraph node-level replay, DBOS/Inngest/Temporal), Sep-2026: https://hackernoon.com/durable-execution-for-ai-agents-langgraph-dbos-inngest-and-temporal-compared

**Alternatives**
- DBOS (Postgres-backed library, workflows/steps/queues): https://docs.dbos.dev/ai/ai-quickstart · Pydantic AI + DBOS: https://ai.pydantic.dev/durable_execution/dbos · Neon guide: https://neon.com/guides/pydantic-ai-dbos-neon
- OpenAI Agents SDK non-OpenAI models via LiteLLM: https://openai.github.io/openai-agents-python/models/litellm
- Inngest pricing (Hobby 50k executions, pauses on exhaustion): https://www.inngest.com/pricing
- Temporal Cloud pricing (structure; 2026 PAYG change single-sourced): https://docs.temporal.io/cloud/pricing · https://www.usagepricing.com/blueprint/activity/temporal-2026-09-14-paygo-replaces-essentials
- Hatchet (Postgres-only mode; cloud tiers unverified): https://hatchet.run/pricing · https://hatchet.run/launch-week-01
- Framework landscape (secondary, opinion-level): https://www.speakeasy.com/blog/ai-agent-framework-comparison

**Media**
- Remotion Python = Lambda trigger only: https://www.remotion.dev/docs/lambda/python · Node-only renderer (Oct-17 source): https://www.remotion.dev/docs/ssr
- ffmpeg-python / MoviePy verdicts (Oct-17 sources): https://github.com/kkroening/ffmpeg-python · https://github.com/Zulko/moviepy

**Platforms**
- YouTube quota buckets / costs: https://developers.google.com/youtube/v3/determine_quota_cost · https://developers.google.com/youtube/v3/revision_history · resumable uploads: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- Facebook Reels publishing (30 / 24h moving): https://developers.facebook.com/docs/video-api/guides/reels-publishing
- Instagram content publishing (100 / 24h moving; `content_publishing_limit`): https://developers.facebook.com/docs/instagram-platform/content-publishing/
- Threads posts (250 / 24h): https://developers.facebook.com/docs/threads/posts/ · tokens: https://developers.facebook.com/docs/threads/get-started/long-lived-tokens/
- Graph API versions (v20 expired, v25 to 2028-07-29; deep-audit source): https://developers.facebook.com/docs/graph-api/changelog/versions
- TikTok Content Posting API (unaudited = private only; audit required): https://developers.tiktok.com/doc/content-posting-api-get-started · https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
- Pinterest rate limits / access tiers: https://developers.pinterest.com/docs/reference/ratelimits/ · https://developers.pinterest.com/docs/key-concepts/access-tiers/
- X API pricing (pay-per-use; $0.015 / $0.20 with URL): https://docs.x.com/x-api/getting-started/pricing
- LinkedIn Posts API / Videos API / scopes: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api · https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api
- Spotify Distribution API partners (RSS remains the general path): https://creators.spotify.com/tr/resources/news/expanding-video-partners-and-platforms · YouTube RSS podcast ingestion (2024 report): https://techcrunch.com/?p=2662754

**Hosting / cost**
- Hetzner price adjustment (effective 2026-06-15): https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ · availability of Cost-Optimized plans (secondary): https://www.bitdoze.com/hetzner-cloud-cost-optimized-plans/
- Modal Starter ($0 + $30/mo credits): https://modal.com/pricing
- GitHub Actions billing ($12 included; blocks without a payment method) and Neon/Vercel walls: see `deep-audit-2026-11-13.md` §6 sources
- Free LLM lanes and the OpenRouter $10 unlock: `free-llm-apis-and-puter-2026-11-03.md`, `openrouter-deep-dive-2026-11-03.md`

**Repo-internal evidence:** `services/ai/requirements.txt` (langgraph 1.2.20, langchain-openai 1.7.4) · `services/ai/bot/graph.py:88-217` (StateGraph, no checkpointer) · `services/ai/app.py:184-199` (`/bot/draft`, Groq via ChatOpenAI) · `.github/workflows/channel-autopilot.yml:25,168-181` · `lib/job-store.mjs` · `lib/upload-intents.mjs` · `studio/lib/provider-routing.js` · `deep-audit-2026-11-13.md` §1, §3, §6, §7 · `youtube-24-7-loop-live-streaming-2026-11-10.md` §VPS.

### Residual uncertainties
- LangGraph's default durability mode (official KB says `async`, a mirror says `sync`): set it explicitly.
- LangGraph checkpoint storage-overhead issue #7714 (cited Nov-03) could not be re-located. Growth is real, but its magnitude here is unmeasured.
- TikTok per-day caps for unaudited clients, the audit duration, and Pinterest's Standard-access demo requirement are third-party-sourced.
- Instagram's documented limit is inconsistent (100 vs 50) on Meta's own pages. Read the live endpoint.
- Hetzner post-June-2026 per-plan prices and availability, Hatchet cloud tiers, and Temporal Cloud's current minimum are secondary or conflicting.
