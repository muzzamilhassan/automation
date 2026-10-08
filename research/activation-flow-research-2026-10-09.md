# Research — Activation Flow: Connect ≠ Publish (How Competitors Handle Auto-Start)

**Date:** 2026-10-09 · **Type:** research + design (plan awaits "go")
**Ask:** "The auto-setup should be FALSE if a user just logs in — logging in doesn't mean automation automatically starts on their page. Research competitors + how we handle it."

---

## 1. The headline finding: your instinct is a YouTube API RULE

**YouTube API Developer Policies (binding on our app once we serve customers):**
> clients "must not automate or trigger views, **uploads**… without the user's prior **specific and express consent**"; users "must expressly consent to those actions **prior to their actual execution**"; users "must have final control over the data that will be published."

So: connecting a channel and silently starting daily auto-publishing **without an explicit opt-in step is not just bad UX — it risks an API-policy violation** for our Google app. Default-OFF Autopilot is compliance. ([YouTube API Developer Policies](https://developers.google.com/youtube/terms/developer-policies))

Also relevant: the July 15, 2025 **"inauthentic content"** policy demonetizes "mass-produced, template-made or interchangeable" AI videos — a daily fully-unreviewed template pipeline is the textbook profile. ([YouTube monetization policies](https://support.google.com/youtube/answer/1311392)) · AI disclosure at upload for realistic synthetic content ([YouTube Help](https://support.google.com/youtube/answer/14328491)).

## 2. Competitor scan — every product separates connect from start

| Product | Auto-start after connect? | Activation artifact | Pause switch |
|---|---|---|---|
| AutoShorts.ai | ❌ No | "Create a Series" (topic + schedule + channel) | ❌ edit cadence or delete |
| faceless.video | ❌ No | Create Series + **choose autopilot vs review** ("if you give the permission") | ❌ edit frequency |
| Revid.ai | ❌ No | Enable "Auto-Mode worker"; publishing optional — "human review is advisable" | ❌ not documented |
| Zebracat | ❌ No | Approve video → scheduled | unverified |
| Blotato | ❌ No | Every post explicitly initiated | n/a |
| Taja AI | ❌ No | Enable "Auto Sync" feature | unverified |
| Buffer | ❌ No | Queue + schedule posts | Pause queue |
| Hootsuite | ❌ No | Compose + schedule per post | org-wide suspend |
| **Ours today** | ⚠️ **YES — connect + niche = produces tonight.** The exact gap. | none | ✅ we have the best pause (built Oct 8) |

Sources: agent research Oct 9 — [AutoShorts blog/FAQ](https://autoshorts.ai/blog/how-to-start-a-faceless-video-channel) · [faceless.video](https://faceless.video) + r/NewTubers thread ("automatically post a short daily **if you give the permission**") · [Revid features](https://www.revid.ai/features/automate-video-creation) · [Zebracat](https://www.zebracat.ai) · [Blotato help](https://help.blotato.com/start-with-an-ai-agent/agents) · [Taja Auto Sync](https://www.taja.ai/features/auto-kick-off) · [Buffer help](https://support.buffer.com/articles/connecting-your-channels-to-buffer-HvWLgAJvL9) · [Hootsuite publishing](https://www.hootsuite.com/platform/publishing).

**Three industry patterns:**
1. **Connect is never the trigger** — automation starts when the user explicitly creates/activates a named unit ("Series", "worker").
2. **Review-first is the safe default** — multiple products offer "review each draft OR let them post automatically".
3. **The pause switch is the industry's biggest gap** — almost nobody has one-click pause. We already built it (Oct 8). It's now a marketing point: "Nothing posts without your OK."

## 3. The design — "Connect → Review → Enable"

1. **Connect (wizard Step 1–2):** channel links, niche/template/schedule chosen, brand kit drafted. Registry saves with **`autopilot: false` explicitly** — the nightly Autopilot skips it. The wizard says plainly: "Nothing publishes until you start the Autopilot."
2. **Step 3 — Review & Start:** summary screen (niche · template · slot · episode day · AI-disclosure) + the big **"Start Autopilot"** button. Pressing it records **consent** in the registry: `consentedAt` date + settings snapshot — the "specific and express consent" YouTube's API policy demands, and your refund/chargeback defense ("you approved publishing on [date]").
3. **Optional review-first toggle at activation:** "Video #1 waits for my approval" (topic approval via Topic Desk already exists) vs "publish automatically from #1".
4. **Control after:** the existing Pause/Resume switch per channel + the network Master switch (already live) + Disconnect.

**Engine changes needed: zero** — the Oct-8 flow-control guards already respect `autopilot: false` everywhere (discovery, sweeper, direct runs).

## 4. Implementation on "go" (~half session)
1. `oauth/callback`: registry entries save `autopilot: false` explicitly (today it defaults ON by omission).
2. Wizard: Step 3 review screen + **"Start Autopilot"** → profile route sets `autopilot: true` + `consentedAt` + settings snapshot.
3. Channels page: wizard cards show **"AUTOPILOT OFF — ready"** state with a Start button (flow PATCH on=true).
4. Fajr of Qur'an: stays paused (already off) until you decide the niche/plan — one click to start when ready.

## 5. Sources
- [YouTube API Developer Policies — automated uploads require express consent](https://developers.google.com/youtube/terms/developer-policies)
- [YouTube — inauthentic content policy (Jul 15, 2025)](https://support.google.com/youtube/answer/1311392) · [AI disclosure](https://support.google.com/youtube/answer/14328491)
- Competitor flows: AutoShorts · faceless.video (+ Reddit r/NewTubers) · Revid ("human review advisable") · Zebracat · Blotato · Taja · [Buffer help](https://support.buffer.com/articles/connecting-your-channels-to-buffer-HvWLgAJvL9) · [Hootsuite](https://www.hootsuite.com/platform/publishing)
- UX: [NN/g confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog) · Zapier connect-≠-run model ([teardown](https://www.useronboard.com/how-zapier-onboards-new-users)) · defaults research ([UX Magazine](https://uxmag.medium.com/the-psychology-of-defaults-how-pre-selected-options-influence-behavior-1280b1f404b4))
