# Modal free GPU tier: credits, card rule, spend limits, cost fit (research, 2026-11-23)

Read-only research. Every price below was read from modal.com on **2026-11-23**. "Not stated" means the official page does not say. **UNVERIFIED** means only community sources, or none, support the point.

---

## Plain-English summary (for the owner)

1. **Without a card, Modal gives you a $1 trial and no GPUs.** Modal's own GPU docs say "Using a GPU requires having a valid payment method on file." So the error you hit is the official rule, not a bug. Modal does not say why. Your dashboard's "$1 now, $29 after a card" text is the only first-party source for the $1/$29 split. Modal's public pages only advertise "$30 / month".
2. **With a card, you get $30 of compute each month on the free "Starter" plan, with no monthly fee.** That $30 covers GPU, CPU and memory. No GPU type is excluded. Modal does not say whether unused credit rolls over. Assume it does not.
3. **You can make the card effectively uncatchable.** On the **Usage & Billing** page, set the **Workspace budget (shown as "usage limit") to $30**. The **spend limit** then defaults to $30 minus $30 of credits, which is **$0**. When the spend limit is reached, Modal says it "stops workloads that would incur additional out-of-pocket charges". That is a hard stop, not just an email. A job that is running when the limit hits may be cut off part-way.
4. **Our narration job fits easily.** 10 min of T4 per video costs about **$0.10**. That is about **$3/month** for 1 video a day and about **$12/month** for 4 a day, before overheads. With generous overheads (model loading, 60 s idle tail, CPU and RAM), it is about **$5/month** and **$21/month**. T4 and L4 both stay under $30 at 4 a day. A10 can go over $30 at 4 a day with overheads.
5. **Storing the voice model (3–6 GB) is free** inside the included 1 TiB of Volume storage.
6. **Risks:** the terms do not ban automated YouTube content. They do ban crypto mining, copyright-infringing content and illegal content, and Modal can suspend accounts. The terms do not cover credit revocation. A community site reports a one-time **$0.50 card check** (UNVERIFIED).
7. **Best no-card alternative: Kaggle**, which we already use (about 30 free GPU hours a week). Hugging Face ZeroGPU is free but small (5 GPU-min/day) and limited to Gradio apps. Colab free forbids the kind of headless automation we need. Salad, Beam and Replicate have no free GPU tier.

**Recommendation:** add the card, then **immediately** set the usage limit to $30 (spend limit $0) before running anything. Use T4 (or L4 if speed matters) and keep `scaledown_window` short. Keep Kaggle as the no-card fallback.

---

## Sub-questions

1. What does the Starter/free plan give, with and without a card?
2. Is the GPU card requirement an official rule, and what runs without a card?
3. With a card, are T4, L4 and A10 fully covered by the $30?
4. What spend protection exists, where is the setting, and what happens at the limit?
5. Billing mechanics: per-second billing, minimums, idle time, image builds, Volumes.
6. Cost estimate for 1 and 4 videos a day.
7. Risks: terms, verification, credit revocation.
8. Alternatives with a no-card free GPU tier.

---

## 1. Free plan structure

| Question | Official answer | Source |
|---|---|---|
| Plan name and fee | Starter: "$0 + compute / month" | [1] |
| Credit amount | "Starter has no monthly fee and includes $30 of compute (GPUs, CPUs, Memory) per month." | [1] |
| Monthly or one-off? | Monthly. Signup page: "Get started with $30 free monthly compute!" | [1], [5] |
| Card needed for the $30? | Not stated on pricing or signup pages. Billing docs: "Note that you must have a payment method on file in order to use Modal." Owner's dashboard (first-party, observed): "$1 free to use now. Add a payment method any time in settings to unlock the remaining $29." | [3], owner screenshot |
| Is the $1 before a card one-off or monthly? | **Not stated** officially. **UNVERIFIED.** Community: an X post says "Only $1 credit if no card. $30/month in credits, refills every month" [C1]. Older community guides say "$5 per month upon sign up, which increases to $30 per month when you add a payment method" [C2], so this amount appears to have changed over time. | [C1], [C2] |
| Does the $30 renew monthly? | Yes. "per month" [1], "$30/month of credits" [4] | [1], [4] |
| Does unused credit roll over? | **Not stated** on any official page checked. **UNVERIFIED** that it does not. Treat it as use-it-or-lose-it. | [1] |
| One-time card verification fee | **UNVERIFIED** (community only): "You will be charged $0.50 one-time fee to add a valid payment method." | [C3] |

Other Starter limits, from [1]: 3 seats, "100 containers + 10 GPU concurrency", 1-day log retention, 5 deployed crons, 200 deployed apps, 1 TiB/month egress.

## 2. Why GPUs are blocked without a card

- **This is an official rule.** The Modal GPU guide says: **"Using a GPU requires having a valid payment method on file."** [2] The same sentence appears in Modal's llms-full.txt doc dump [4].
- **Modal's stated reason:** none on the GPU page. The abuse or crypto-mining rationale is **not stated by Modal** (UNVERIFIED). The terms do prohibit using the service to "conduct cryptocurrency mining or related blockchain related activities" (§1.5(b)) [6]. Card gates against mining abuse are a known industry pattern, for example GitLab [C4], but that is context, not Modal's statement. The only payment-method rationale Modal states is on its startup-credits FAQ: "We require a payment method so that your Modal apps don't get interrupted after your credits run out." [7]
- **What runs on the $1 without a card:** **not stated** officially. The billing docs even say a payment method is needed "to use Modal" at all [3], which conflicts with the dashboard's $1 offer. The error the owner hit names GPUs only, which suggests CPU-only Functions (and maybe Volumes) run on the $1. This is **UNVERIFIED**. Test with a CPU-only `modal run` if it matters.

## 3. After adding a card: GPUs within the $30

- Included usage covers "compute: Functions and Sandboxes, billed by the second for CPU, memory, and GPU" [1]. **No GPU type is listed as excluded** [1].
- **Not covered:** Model API tokens. "Token usage is always billed, starting from your first request" (effective 2026-09-01) [1]. This is irrelevant to us as long as we run our own TTS model on a GPU and do not call Modal's shared LLM endpoints.
- **Billing past the credit:** "You're billed when you exceed that, or when you use something the included compute doesn't cover." [1] So nothing is charged while compute stays under $30, tokens are not used, and egress and Volumes stay inside their free allowances (1 TiB each [1], [8]).
- **Concurrency cap:** 10 GPUs at once on Starter [1]. That is irrelevant for 1–4 jobs a day.

GPU prices (as of 2026-11-23, per second, from [1]):

| GPU | $/sec | $/hour (= $/sec × 3600, computed) |
|---|---|---|
| T4 | 0.000164 | 0.5904 |
| L4 | 0.000222 | 0.7992 |
| A10 | 0.000306 | 1.1016 |
| L40S | 0.000542 | 1.9512 |
| A100 40 GB | 0.000583 | 2.0988 |
| H100 | 0.001097 | 3.9492 |

CPU costs $0.0000131 per physical core per second, and memory costs $0.00000222 per GiB per second [1].

## 4. Spend protection

Official source: Budgets guide [9], plus the changelog entry "Improved usage limits in the dashboard" (Aug 27, 2026) [10].

| Setting | What it is | Where | What happens when hit |
|---|---|---|---|
| **Workspace budget** (labelled **"usage limit"** in the dashboard) | Monthly cap on **total usage, before credits**: "the hard outer cap for the entire Workspace" | **Usage & Billing** page (Owners/Managers only) | Described as a hard cap. Exact behaviour for running containers is **not stated** |
| **Spend limit** | Monthly cap on **net charges after credits**. Default = usage limit − credits (Modal's example: $100 limit − $30 credits = $70) | **Usage & Billing** page | "When the spend limit is reached, Modal stops workloads that would incur additional out-of-pocket charges." Credit-covered work can continue up to the usage limit |
| Environment budget | Per-environment compute cap | Workspace Management → Environments | **Team/Enterprise only** [1], [9] |

**How to get "card never charged":** set the **usage limit = $30**. The default spend limit then becomes $30 − $30 = **$0**. For a $5 buffer, set the usage limit to $35 (spend limit $5). This is derived from the documented default formula [9]. Whether the UI accepts an explicit $0 spend limit is **not stated**.

Caveats, all from [9] unless noted:
- Alerts or emails at thresholds: **not stated**.
- Whether the spend limit also covers storage, egress or tokens: **not stated**. Environment budgets explicitly exclude storage, reservations and egress.
- "The maximum budget you can set depends on prior successful charges" limits how **high** you can go, not how low.
- Billing docs: "you will be auto-charged for incremental usage the first time you exceed certain thresholds" [3]. Threshold amounts are not stated.
- Modal says a stopped workload is stopped, but does not say whether it ends gracefully. Our pipeline must treat a killed TTS job as a failure and alert. It must not silently skip, as the MR silent-loss bug did.

## 5. Billing mechanics

| Item | Official fact | Source |
|---|---|---|
| Granularity | Per second. "there are no minimum usage-time increments" | [1], [3] |
| What is billed | "application load time and … the time your container is processing inputs" | [1] |
| Minimum resource request | "Each container has a minimum request of 128 MiB of memory and 0.125 CPU cores"; you pay max(request, actual) | [1] |
| Idle tail (scaledown window) | Default 60 s, "which we also bill for". Configurable "between two seconds and twenty minutes". Idle time in the window is billed | [1], [11] |
| Scale to zero | "Once your application has scaled down to zero containers you no longer get charged." | [1] |
| `min_containers` (warm pool) | Increases resources consumed. Rate is not separately stated. **Do not use it for a daily batch job** | [11] |
| Image build time | **Not stated** on the pricing, images or billing pages. **UNVERIFIED** whether builds are billed. Builds are cached per layer, and an unchanged image "will be pulled from the cache" | [12] |
| GPU during build | Possible (`gpu=` on a build step). If builds are billed, a GPU build step would cost GPU rates. **UNVERIFIED** | [12] |
| Volumes | $0.09/GiB/month with **1 TiB/month included**. A 3–6 GB model cache costs **$0** | [1] |
| Volume metering | "We calculate usage by snapshotting your total storage once a day." Deleted data may be billed up to 4 days | [13] |
| Egress | $0.04/GiB beyond 1 TiB/month (Starter). Charged from 2026-10-01. Volume reads and writes are not egress | [8] |

Practical advice: keep weights in a Volume, which is Modal's recommended pattern [14], rather than downloading them on each run. Also set `scaledown_window` to a few seconds for a batch job.

## 6. Cost estimate (arithmetic, prices as of 2026-11-23 from [1])

Assumptions: 30 days a month, and 10 min = 600 s of GPU per video.

**A. GPU time only (600 s per video)**

| GPU | Per video | 1/day × 30 | 4/day × 30 (120 videos) | Fits $30? |
|---|---|---|---|---|
| T4 | 600 × 0.000164 = **$0.0984** | **$2.95** | **$11.81** | Yes / Yes |
| L4 | 600 × 0.000222 = **$0.1332** | **$4.00** | **$15.98** | Yes / Yes |
| A10 | 600 × 0.000306 = **$0.1836** | **$5.51** | **$22.03** | Yes / Yes |

**B. Conservative: 600 s work + 120 s model load + 60 s default idle tail = 780 s, plus 2 physical cores + 16 GiB RAM**

Assumed overheads: the 120 s load time is our assumption. The 60 s idle tail is Modal's default. CPU+RAM rate = 2 × 0.0000131 + 16 × 0.00000222 = 0.00006172 $/s, so 780 s comes to **$0.0481 per video** for CPU and RAM.

| GPU | GPU per video (780 s) | Total per video | 1/day × 30 | 4/day × 120 | Fits $30? |
|---|---|---|---|---|---|
| T4 | 780 × 0.000164 = $0.1279 | $0.1761 | **$5.28** | **$21.13** | Yes / Yes |
| L4 | 780 × 0.000222 = $0.1732 | $0.2213 | **$6.64** | **$26.56** | Yes / Yes (tight) |
| A10 | 780 × 0.000306 = $0.2387 | $0.2868 | **$8.60** | **$34.42** | Yes / **No** |

Sanity check of the rates: Modal's own FAQ example ("daily one-hour job, 0.5 core, 256 MiB ≈ $0.77/30 days") reproduces exactly with these numbers: 0.5 × 0.0000131 × 3600 + 0.25 × 0.00000222 × 3600 = $0.02558/day, × 30 = $0.767 [1].

**Verdict:** T4 at 4 videos a day uses about 40–70% of the $30, and 1 a day uses about 10–18%. Volumes add $0. The real risks are unexpected overhead, such as a slow cold start, a GPU build step, or retries in a loop. The $0 spend limit is what guards against those.

## 7. Risks

| Risk | Evidence | Severity |
|---|---|---|
| Terms ban automated YouTube content? | **No such clause found.** Terms (effective May 2026) prohibit illegal content (§1.4(a)), content that "violates any third party's intellectual property rights, including … copyrights" (§1.4(b)), and crypto mining (§1.5(b)). Spam and automated content are not named | Low. Keep voice references and scripts rights-clean [6] |
| Free-use terms differ | §1.2: "No-Fee Use may be subject to certain additional restrictions, limitations and differing terms", provided as-is with no warranty or support | Medium [6] |
| Suspension | §1.6: Modal "may suspend Customer's access", normally with notice. Termination for material breach §3.2(a). Account deleted within 60 days after termination §3.3 | Medium [6] |
| Credits revocable? | **Not stated** in the terms. Startup credits "last 1 year and cannot be reinstated if they expire" (a different program) [7]. Monthly Starter credit could be changed at any time (UNVERIFIED either way). The no-card amount already appears to have dropped from $5 to $1 [C2] vs dashboard | Medium |
| Account verification | No official verification step found beyond the payment method. $0.50 card check is UNVERIFIED [C3]. A community review reports international card verification failures (UNVERIFIED) | Low–Medium |
| Job killed at the spend limit | Spend limit "stops workloads" [9]. A render could die mid-run | Medium: pipeline must fail loudly |
| Starter cron cap | 5 deployed crons [1]. Trigger from GitHub Actions via `modal run` instead, or use 1 cron | Low |
| 1-day log retention | [1]. Copy logs into our run logs | Low |
| Unknown image-build billing | Not stated (§5) | Low–Medium |

## 8. Alternatives with a free GPU and no card (Nov 2026)

| Platform | Free GPU? | Card needed? | Automation-friendly? | Evidence |
|---|---|---|---|---|
| **Kaggle Notebooks** | Yes. About 30 GPU-h/week (stated by Modal's comparison page, Sept 2026; Kaggle's own docs could not be fetched this session, so UNVERIFIED from the primary source) | No (phone verification historically required: UNVERIFIED this session) | **Yes.** `kaggle kernels push` via API, already wired in this repo (commit 868daa8) | [15] |
| **Hugging Face ZeroGPU** | Yes, but free accounts get **5 min/day**, and hosting needs an account older than 30 days with verified email (max 2 Spaces) | No | **Partial.** Gradio-only, 60 s default per call, 5 min/day too small for 10–40 min of TTS a day | [16] |
| **Google Colab (free)** | Yes, but "heavily restricted" with no guarantees | No | **No.** Free tier disallows "remote control such as SSH shells" and "bypassing the notebook UI", and runtimes "may be terminated at any time" | [17] |
| **Lightning AI** | Free credits exist, but per trackers they became a **one-time** grant in Sept 2026: "5 on registration, 25 for adding a card" (UNVERIFIED; official page returned 403) | Card unlocks most of it (UNVERIFIED) | Yes (jobs/API), credit-limited | [C5] |
| **SaladCloud** | **No.** "Is there a free trial? No." | Not stated | Yes (paid) | [18] |
| **Beam** | **No** free tier shown. Developer plan is $20/month with $20 credits | Not stated | Yes (paid) | [19] |
| **Replicate** | **No** free tier shown. T4 costs $0.000225/s ($0.81/h), dearer than Modal's T4 | Not stated | Yes (paid) | [20] |

**Comparison:** Modal with a card and a $0 spend limit is the most automation-friendly free option. It has an API and SDK, per-second billing and Volumes, and covers 4 videos a day on T4. Kaggle is the only real no-card option that can carry our volume (about 4.7 h/week at 4×10 min/day, against about 30 h/week), but it is a notebook queue, not serverless.

---

## Gaps and open questions

1. Is the no-card $1 monthly or one-off? (Dashboard only. Ask Modal support or watch the next billing cycle.)
2. Does unused Starter credit roll over? (Not stated. Assume no.)
3. Are image builds billed, and at what rate? (Not stated. Check `modal billing summary` after the first build. The CLI is documented in SDK release notes [21].)
4. Does the UI accept an explicit $0 spend limit, and does the spend limit cover Volumes and egress? (Not stated.)
5. Are there alerts or emails before the limit? (Not stated.)
6. Is the $0.50 card-verification charge real? (Community only.)
7. Do CPU-only Functions run on the $1 with no card? (Inferred from the error text. Untested.)

---

## Sources

Official (Modal):
1. https://modal.com/pricing: Starter $0 + $30/month compute, GPU/CPU/memory per-second prices, Volumes 1 TiB free + $0.09/GiB, egress, FAQ (billable time, 60 s idle billed, min request, tokens billed from 2026-09-01, what included usage covers, Starter limits, budgets).
2. https://modal.com/docs/guide/gpu: "Using a GPU requires having a valid payment method on file."; GPU count limits.
3. https://modal.com/docs/guide/billing: "you must have a payment method on file in order to use Modal"; monthly billing; threshold auto-charges; no minimum usage-time increments.
4. https://modal.com/llms-full.txt: repeats the GPU payment-method sentence; "$30/month of credits".
5. https://modal.com/signup: "Get started with $30 free monthly compute!"
6. https://modal.com/legal/terms: effective May 2026; §1.2 No-Fee Use, §1.4 prohibited content, §1.5(b) crypto mining, §1.6 suspension, §3.2–3.3 termination and deletion.
7. https://modal.com/startups: payment-method rationale ("so that your Modal apps don't get interrupted"); credits expire after 1 year.
8. https://modal.com/docs/guide/network-egress-billing: egress charged from 2026-10-01, Starter 1 TiB, $0.04/GiB, Volume I/O excluded.
9. https://modal.com/docs/guide/budgets: Workspace budget (usage limit), spend limit default formula, "stops workloads", Usage & Billing page, max budget depends on prior charges, Environment budgets Team/Enterprise.
10. https://modal.com/changelog/improved-usage-limits-in-the-dashboard: Aug 27, 2026 usage-limits UI refresh in Usage and Billing settings.
11. https://modal.com/docs/guide/cold-start: scaledown default 60 s, range 2 s–20 min, idle billed, min_containers increases consumption.
12. https://modal.com/docs/guide/images: layer caching, gpu= on build steps, weights download at build; no billing statement.
13. https://modal.com/docs/guide/volumes: daily storage snapshots for metering; v2 recommended.
14. https://modal.com/docs/guide/model-weights: Volumes recommended for model weights (via search snippet).
15. https://modal.com/resources/best-free-cloud-gpu-tiers: Modal's Sept 2026 comparison (Kaggle about 30 GPU-h/week, ZeroGPU minutes, Lightning, Colab); secondary for non-Modal facts.
21. https://modal.com/docs/reference/changelog: SDK 1.5.3 `modal billing summary` (via search snippet).

Official (alternatives):

16. https://huggingface.co/docs/hub/spaces-zerogpu: ZeroGPU quotas (free 5 min/day), hosting rules, Gradio-only.
17. https://research.google.com/colaboratory/faq.html: Colab free-tier disallowed activities and limits.
18. https://salad.com/pricing: "Is there a free trial? No."
19. https://www.beam.cloud/pricing: Developer $20/month with $20 credits; no free tier shown.
20. https://replicate.com/pricing: T4 $0.000225/s; no free tier shown.

Community (secondary, **not** authoritative):

- C1. https://x.com/pseudokid/status/2082280210117128263: "Only $1 credit if no card… $30/month in credits, refills every month" (via search snippet; page returned 402).
- C2. https://www.mintlify.com/cheahjs/free-llm-api-resources/providers/trial/modal: older "$5 per month… increases to $30" (via search snippet; page now 410 Gone).
- C3. https://resourify.com/resources/modal: "$1 when signup and remaining $29…", "$0.50 one-time fee".
- C4. https://portswigger.net/daily-swig/gitlab-tackles-crypto-mining-abuse-with-payment-card-checks-for-free-accounts: industry pattern of card checks against mining abuse (context only).
- C5. https://www.usagepricing.com/blueprint/activity/lightning-ai-2026-09-21-gpu-rate-card-reprice: Lightning free tier became a one-time 5+25 credit grant (via search snippet).
