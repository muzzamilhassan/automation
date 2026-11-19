# 05 — Channel onboarding & channel management

**Lens:** onboarding / setup flows (Add Channel wizard, Network hub, Channels portfolio, AI Providers key vault, Quota ledger)
**Auditor stance:** 20+ years shipping Stripe-Connect / Shopify-setup / Zapier-connect style flows
**Evidence:** `C:\Users\Revnix\AppData\Local\Temp\studio-ui-audit\shots-full\` (page-channels-add / channels / network / providers / usage, all 3 viewports + popups), plus code read in full: `studio/app/channels/add/page.js` (1045 lines), `studio/app/channels/page.js`, `studio/app/network/page.js`, `studio/app/providers/page.js`, `studio/app/usage/page.js`, `studio/components/{ChannelKeysPanel,SchedulePanel,TemplateAssignPanel,ProviderRoutingPanel}.js`, `studio/app/api/channels/flow/route.js`, `studio/app/api/channels/profile/route.js`, `studio/lib/channels-registry.js`, `yt-mcp/studio-channels.json`.

Note: the screenshot crawler never completed a Google login, so the wizard's Step 2 / Done screens were judged from code (line numbers given), not pixels.

---

## 1. Plain-English summary for the owner

- **The wizard can't switch a new channel on.** It only has a "Save & review" button, and that button always saves with autopilot OFF. The "Autopilot started, consent recorded" message in the code can never appear. The only way to go live is the small ▶ icon on the Channels page, and that icon skips the consent record that YouTube's policy asks for. The "you're done" screen then points you to the wrong button: it says "pencil → Resume", but the pencil opens the edit form.
- **The green "key saved" badges aren't telling the truth.** Four of the five channels show "key saved" next to an empty `key:` line. YT-BOT also shows "key saved", while the Channels page says it must be re-connected and is "PAUSED · finish setup". One of your channels has two names: it's "Debt-Free Doctrine" in the wizard and "OLD MONEY CODE" on the Channels page, with the same `@debtfreedoctrine` handle.
- **Step 2 asks for everything on one screen:** about 19 fields, 2 different "template" pickers (one saves the moment you click it, the other only when you press Save), 7 voices, social IDs and a colour picker. Scheduling is split across three places in three formats: "UTC" times in the wizard, day toggles in a panel, and a raw cron box (`13 2 * * *`). People get stuck or quit here.
- **A channel card shows settings and subscriber counts, but not whether the channel is OK.** It doesn't show when the next video goes out, whether the last upload worked, or whether the Google connection is still alive. Six unlabelled icons do six different things. On a phone the cards are wider than the screen (the page draws at 538px on a 390px phone).
- **The AI Providers page reads like engineering notes:** 13 providers, each with paragraphs of internal notes, 2,800px tall, with "key not configured" repeated 11 times. The same usage page has three names: "Quota Ledger", "Quota & Costs" and "Usage & cost". It shows no money and no YouTube upload quota.

---

## 2. Findings table

| ID | Sev | Page / component | Evidence | Problem | Recommendation |
|---|---|---|---|---|---|
| C-01 | **P0** | Wizard → finish | `add/page.js:323` `saveProfile(start)`, `:824` only call is `saveProfile()` (no arg); `:869-881` "Autopilot started ✓ … consent recorded" branch is unreachable; `api/channels/flow/route.js:16-62` resumes with **no consent write** (consent only in `api/channels/profile/route.js:113-118`) | The wizard can't take a channel live, and the consent-capture path is dead code. The only way to go live (▶ on `/channels`) skips recording consent. The Done copy at `:880` says "pencil → Resume", but the pencil is *Edit* (`channels/page.js:138`) and Resume is the ▶ (`:103-109`). | Final wizard step is **Review & go live**: a consent checkbox ("I authorise Quarry Studio to upload to *<channel>* on my behalf") plus a primary **Start autopilot** button that calls `saveProfile(true)`, and a secondary **Save, keep paused**. ▶ on a channel with no `consentedAt` should open the same consent sheet, not toggle silently. Fix the Done copy to name the real control. |
| C-02 | **P1** | Wizard → "Connect another channel" | `add/page.js:897` reset object omits `subNiches`; `:326` `form.subNiches.split(',')` runs **before** the `try` at `:331`; `:522` also calls `.split` during render | After "Connect another channel", typing a custom niche and pressing Save throws an unhandled error. `saving` never resets, so the button sits on "Saving…" forever. Typing a niche that exactly matches a catalog name crashes the render. | Make the empty form a single `EMPTY_FORM` constant used at both `:68` and `:897`. Move all parsing inside `try`. Add a `finally { setSaving(false) }`. |
| C-03 | **P1** | Wizard → "Connected via Studio" | `page-channels-add--desktop.png` (4 rows show `key:` blank, chip green "key saved"); `add/page.js:923,929`; `yt-mcp/studio-channels.json`: 4 legacy entries `tokenSecret=undefined, tokenSecretSaved=true` | The green chip claims a key exists with no key name shown. YT-BOT is green "key saved" here but `/channels` says "re-connect once in Studio to show live stats" + PAUSED + "wizard channel — finish setup" (`page-channels--desktop.png`). Two health signals contradict each other. | Replace the chip with one computed **connection health** (see §3.2): `Connected` / `Re-connect needed` / `Key not stored in CI` / `Setup incomplete`. Never show `key:` with an empty value. Hide the secret name behind "Details". |
| C-04 | **P1** | Identity across pages | `page-channels-add--desktop.png` row "Debt-Free Doctrine @debtfreedoctrine" vs `page-channels--desktop.png` card "OLD MONEY CODE" whose YouTube row is `@debtfreedoctrine` and IG `@debtfreedoctrine.hq`; sidebar lists OLD MONEY CODE only | One channel, two names, and the owner can't tell which one is real. The wizard list also has 5 rows, while the sidebar has 5 *different* rows (no Debt-Free Doctrine, but OLD MONEY CODE). | Show the YouTube title + avatar pulled from the API as the identity everywhere, with the brand name as a secondary label. Fix the data mismatch (data task, not UI). The wizard list and `/channels` must render from one source. |
| C-05 | **P1** | Wizard Step 2 (wall of fields) | `add/page.js:456-860` — one Card: name, niche, 14 niche chips, sub-niches, 6 style cards, up to 20 production templates, voice input + 7 voices, accent, audience, slot, doc-day, AI autofill, eyebrow, tagline, tags, description, FB/IG/Threads/TikTok | About 19 inputs and 3 large pickers on one scroll, with no progress, no save-as-you-go and no sense of "how much is left". Classic abandonment point. | Split into 5 short steps with a stepper (§3.1). Save a draft to the server at every step (autopilot stays off). |
| C-06 | **P1** | Two (three) "template" concepts | `add/page.js:553-592` "Video template" (STYLE_CATALOG, saved on Save) vs `:597-656` "Production templates" (`assignTemplate` POSTs **immediately** on click, `:159-175`) vs channel card "Template registry … pin v… (major …)" `TemplateAssignPanel.js:240` | The owner has to understand "style", "production template" and "pinned major version". One picker commits instantly and the other waits for Save, so Discard can't undo it. | One picker called **Video style**, with cards that show a playable demo. The selection is held in the form and committed on the step's Continue. Version pinning moves to the template's own page as "Updates: automatic (recommended) / ask me". |
| C-07 | **P1** | Scheduling split in 3 places | Wizard `add/page.js:724-735` ("Short slot UTC" free text; weekly day limited to `Tue/Wed/Thu/Fri` `:12`); `SchedulePanel.js:159-195` (any doc days / shorts days + "Autopilot gate cron (UTC)" raw `13 2 * * *`); card "SLOTS UTC 22:35 + 14:30" `channels/page.js:185-193` | Three vocabularies, all in UTC. The owner has to do timezone maths and read cron. The wizard and the panel can disagree about which day the episode goes out. | One **Publishing schedule** component used in both the wizard and the card drawer: day chips, time pickers in **owner's local time** (store UTC, show "= 17:35 UTC" as hint), audience presets as one-tap chips, the live quota bar from `SchedulePanel.js:197-203`. Cron goes under "Advanced" with a human readback ("Daily at 02:13 UTC"). |
| C-08 | **P1** | Silent 503s on wizard | `_errors-by-page.md` (/channels/add 6×503); `api/template-previews/route.js:14,22` returns 503; `add/page.js:103-117` "degrade quietly" → `tplView` null → whole Production templates section disappears | When the database is down, the template section just isn't there. The owner never learns it exists or that something is broken. | Keep the section and show an inline state: "Template demos are offline right now — you can still pick a style; demos return when the database is reachable. [Retry]". |
| C-09 | **P1** | Generic error card | `add/page.js:383-397`: every error (kit generation `:219,252`, save `:367`, link `:289`) renders as **"Connect problem"** + a redirect_uri_mismatch tip | A failed AI-autofill or a validation error looks like a Google login failure, so the owner looks in the wrong place. | Put each error next to the field or step it belongs to. Use the top-of-page banner only for OAuth `?error=`, and map known Google errors to plain copy ("Google says this app isn't allowed to use this address yet. Fix: …"). |
| C-10 | **P1** | Mobile overflow `/channels`, `/network` | `page-channels--mobile.png` and `page-network--mobile.png` are **538px wide** in a 390px viewport (other pages are 390); cause `channels/page.js:100-141` — title + chip + 6 `ButtonUtility` in a non-wrapping `flex` | Sideways scroll on a phone. The right edge of every card is clipped. | Move the actions into the card footer/overflow menu (§3.2), add `flex-wrap min-w-0` to the header, and truncate the name. |
| C-11 | **P1** | Channel card actions | `page-channels--desktop.png` (6 bare icons per card); tooltips `channels/page.js:106,113,120,127,134` ("Provider routing — per-capability provider priority, channel override vs workspace default (#104)") | Six unlabelled icons. Pause is the first one, with no confirm, right next to the calendar. Tooltips include issue numbers and engineering terms. The pencil is a `<Link>` wrapping a `<button>` (nested interactive, `:138-140`). | One labelled primary action + one "⋯ Manage" menu (§3.2). Plain-English menu items. Pause asks "Pause *Quote Quarry*? Scheduled videos still publish. [Pause] [Cancel]". |
| C-12 | **P1** | Channel card content | `page-channels--desktop.png`: voice `am_michael`, mood chips, UTC slots, subs; no last/next upload, no token health, no failures. YT-BOT error text lives in the *handle* slot (`channels/page.js:157-158`) with "—" and **no button** | The card shows settings and vanity numbers, not health. The broken channel (YT-BOT) tells you to "re-connect once in Studio" and gives you no way to do it. | The health card in §3.2: health pill, *Next upload*, *Last upload*, *Connection*, and a single **next-action button** ("Re-connect Google" for YT-BOT). |
| C-13 | **P1** | AI Providers page | `page-providers--desktop.png` (2,792px tall, 13 equal-weight blocks, "key not configured" ×11 in `text-faint`); `providers/page.js:147` dumps `p.notes`; `:148-153` HF-only "kept in the projection only so Phase-1 vault-adds rulings stay byte-identical" | Engineering notes are shown to the owner. Nothing answers "is my pipeline OK?" There are 3 different key-entry UIs (Save & test with channel dropdown `:170-201`, Test only `:204-223`, local-no-key). You can't add a **shared** key for all channels: the dropdown forces one channel (`:172-181`), and shared keys only exist as env vars. | Top summary strip "What each job uses right now". Group providers into **In use / Ready to add / Not recommended** (collapsed). One "Add key" sheet with scope = *All channels* or *one channel*. Notes go behind "Details". |
| C-14 | **P1** | Routing panel failure state | `page-providers--desktop.png` amber "Routing store unavailable (provider routing: DATABASE_URL missing / db not ready — cannot construct routing layer)…"; `ProviderRoutingPanel.js:172-174`; the add-provider selects stay enabled below | Raw env-var jargon, and the controls stay active even though saving can't work. | Plain copy ("Routing can't be changed right now — the database isn't reachable. The pipeline is using the default order."), plus disable the controls, plus Retry. |
| C-15 | **P2** | Network hub chrome | `network/page.js:12` hard-coded `'Channels (16)'` vs "5 live channels" in the same screenshot (`page-network--desktop.png`); two stacked H1s ("Network & Infrastructure" then "Channels") because embedded pages render their own `PageHeader` | The count is stale and wrong, the header is duplicated, and there's about 150px of chrome before any content. | Count from live data (`useBrands`). When embedded, pages take an `embedded` prop that hides their `PageHeader` and moves their actions into the tab bar's right slot. |
| C-16 | **P2** | Three names for one page | `nav.js:61` "Quota Ledger" / "Token & cost spend"; `network/page.js:14` "Quota & Costs"; `usage/page.js:108` H1 "Usage & cost" | The page shows tokens only, with no dollars and no YouTube quota. The YouTube upload-quota meter is hidden inside the per-channel schedule panel (`SchedulePanel.js:146-148,197-203`). | Rename to **Usage**. Add a top row: *YouTube upload quota today (x / 10,000 units)*, *AI calls*, *Failed calls*, *Est. cost $*. |
| C-17 | **P2** | Usage failure state | `page-usage--desktop.png`: "Usage ledger unavailable / database not configured on this server" (mono), range and sort toggles still clickable; `usage/page.js:110-129` | Developer wording, and the controls do nothing. | Grey out the toggles. Copy: "Usage history isn't available on this copy of Studio (no database connected). It works on the live site." |
| C-18 | **P2** | Wizard Step 1 | `page-channels-add--desktop.png` 80-word paragraph before the button (`add/page.js:403-416`); `oauth/start/route.js:58` `prompt: 'consent select_account'` | The owner reads a wall of text, then gets sent to Google screens with no preview. A Google consent screen asking to "manage your YouTube account" is the scariest moment in the flow, and nothing prepares them for it. | Three thumbnails "What you'll see: 1 Pick Gmail → 2 Pick channel → 3 Allow", one sentence of reassurance, and a "Why does Studio need this?" disclosure listing the scopes in plain English. If the OAuth app is in Testing mode, say so and explain the "Google hasn't verified this app → Continue" screen. |
| C-19 | **P2** | Secret-write failure | `add/page.js:463-471` instructs `gh secret set {tokenSecret} < token.json` | Asks a non-developer to run a CLI command. | A **Retry saving key** button (re-runs the secret write server-side). Fallback copy: "Ask your developer to run …" inside "Details". |
| C-20 | **P2** | Disconnect & edit in wizard list | `add/page.js:930-954`: gear and red ✕ same size side by side, `window.confirm`; gear opens Step 2 at the **top** of the page with no scroll (`:933-938`); edit mode keeps H1 "Add Channel" and "Step 2 ·" (`:381,459`) | Destructive action one click from settings. Edit happens off-screen. Wrong title. | Remove management from the wizard page (it lives on `/channels`). Edit = `/channels/<slug>/settings` with tabs, title "*Quote Quarry* settings". Disconnect = danger zone + type-the-name confirm. |
| C-21 | **P2** | Voice picker | `add/page.js:660` free-text "any Kokoro voice id" above the list; card shows mono `am_michael` (`channels/page.js:175`) | Vendor IDs used as labels. | Voice cards: "Michael · US male · warm" + ▶ demo. Custom ID under "Advanced". The card shows the human label. |
| C-22 | **P2** | Theme breakage | Hard-coded `border-white/10`, `text-white/45`, `bg-sky-400/10`, `bg-black/20` in `add/page.js:668-689,743-775`, `providers/page.js:125,188`, `ChannelKeysPanel.js:93,109`, `SchedulePanel.js:27,29,188` (`#2b6cb0`, `#1a1d24`) | These panels look broken in the light theme (white-on-white borders, sky text). | Swap to tokens (`--line`, `--surface-2`, `--accent`, `--info`) from `globals.css`. |
| C-23 | **P2** | Static map | `channels/page.js:92` `MUSIC_MOODS[c.slug]` from `lib/site-data.js:112` | A per-slug hard-coded map breaks the owner's "no static maps" rule. A newly connected channel always shows "—" (see YT-BOT). | Read mood from the brand kit (`kit.mood`, which the autofill already returns at `add/page.js:233`). |
| C-24 | **P2** | Destinations jargon | `add/page.js:797-821` "Facebook page ID (numeric … or the new UC… form) — the page must be linked to the FB token" | Raw IDs, and the owner has no idea where to find them. | Optional step "Also post to…" with platform toggles; FB via a page picker (from the FB token's pages); handles with an inline "@" prefix. |
| C-25 | **P3** | Empty parked panel | `page-channels--desktop.png` "Parked brands" card about 230px tall showing only "No parked brands" (`channels/page.js:206-234`) | Wasted space for a section that's always empty. | Hide when empty. If kept, show a single line "No parked brands · Park a channel from its ⋯ menu". |
| C-26 | **P3** | Breadcrumb | `page-channels--desktop.png`, `page-channels-add--desktop.png`, `page-providers--desktop.png`, `page-usage--desktop.png` show "Quarry Studio / **Quarry Studio**" while sidebar highlights *Network* | Breadcrumb doesn't say where you are. | "Network / Channels / Add channel". |

---

## 3. Redesign proposals

### 3.1 The Add Channel wizard (before → after)

**Before:** one long page. Step 1 card → (after OAuth) one giant Step 2 card → Done card, with the "Connected via Studio" management list and the "One-time Google setup" troubleshooting card always underneath (`add/page.js:379-1043`).

**After:** a focused, full-height flow (no management list on the same page) with a left stepper on desktop and a top progress bar on mobile. A server draft is saved at every Continue with autopilot always OFF until Step 6. If the user leaves halfway, `/channels` shows the card as "Setup incomplete · Continue setup →".

```
STEPS
 0  Before you start        (first run only, skippable)
 1  Connect YouTube         Google login → confirm the channel
 2  What it's about         name · niche · content pillars · audience
 3  Look & sound            video style · voice · accent colour
 4  When to publish         days · times (your local time) · quota bar
 5  Brand kit & sharing     AI-drafted titles/tags/description · other platforms (optional)
 6  Review & go live        summary · consent · Start autopilot / Save paused
```

**Step 1 — Connect YouTube**
```
┌───────────────────────────────────────────────────────────────┐
│ ● 1 Connect   ○ 2 About   ○ 3 Look   ○ 4 Schedule   ○ 5 Kit   ○ 6 Go live │
├───────────────────────────────────────────────────────────────┤
│  Connect a YouTube channel                                    │
│  You'll sign in on Google's own page. Studio never sees       │
│  your password.                                               │
│                                                               │
│  What you'll see                                              │
│  [img] 1 Choose Gmail   [img] 2 Choose channel   [img] 3 Allow │
│                                                               │
│  [ G  Continue with Google ]   (primary, 44px tall)          │
│                                                               │
│  ▸ Connecting from another device or browser?  (disclosure)   │
│  ▸ Why does Studio need these permissions?     (disclosure)   │
│  ▸ Google says "redirect_uri_mismatch"?        (disclosure)   │
└───────────────────────────────────────────────────────────────┘
```
After the OAuth return, the same step shows a **confirmation card** before moving on, like Stripe's "Is this your business?":
```
┌───────────────────────────────────────────────────────────────┐
│ ✓ Connected                                                   │
│ [avatar]  Quote Quarry   @quotequarry302   219 subscribers    │
│ Is this the right channel?  [ Yes, continue → ] [ Pick another ] │
│ ⚠ (only if secret write failed) Key couldn't be stored for    │
│   the cloud runner.  [ Retry ]                                │
└───────────────────────────────────────────────────────────────┘
```
Copy changes: the 80-word "Multiple Gmails" paragraph (`:407-412`) becomes one line under the button: "Have channels on several Gmail accounts? Connect them one at a time. Each connect is its own login."

**Step 2 — What it's about**
```
 Channel name     [ Quote Quarry                    ]
 Niche            (Stoicism) (Money) (Psychology) (History) … (+ Type my own)
 Content pillars  ✓ power of silence  ✓ emotional detachment  + boundary setting  + …
                  "Daily research rotates across these."         [✨ Suggest more]
 Main audience    (US & Canada) (UK & Ireland) (Gulf) (South Asia) (Global)
                                                     [ Back ] [ Continue → ]
```
Pillars are chips, not a comma textarea (`:511-517`). Audience moves here because it drives Step 4's presets.

**Step 3 — Look & sound**
```
 Video style        ┌────────┐ ┌────────┐ ┌────────┐
 (one picker)       │ ▶ demo │ │ ▶ demo │ │ ▶ demo │   ★ Recommended for Stoicism
                    │Cinematic│ │Editorial│ │Diagram │   tap = preview, Select = choose
                    └────────┘ └────────┘ └────────┘
                    "Demos offline — pick by description" (when 503)
 Voice              ( ▶ ) Michael · US male · warm      ◉
                    ( ▶ ) George · UK male · calm       ○   …
 Accent colour      ● ● ● ● ●  + custom
```
This merges STYLE_CATALOG + registry templates into one list (C-06). Nothing commits until Continue.

**Step 4 — When to publish**
```
 Suggested for US & Canada:  [ Use: Shorts 6:35 pm, episode Tue 7:30 pm ]
 Shorts         Mon Tue Wed Thu Fri Sat [Sun]   at [ 6:35 pm ▾ ]  your time (Asia/Karachi)
 Long episode   Mon [Tue] Wed Thu Fri Sat Sun   at [ 7:30 pm ▾ ]           = 14:30 UTC
 Shorts come from  (● Generated daily) (○ Clips from long episodes)
 Daily YouTube quota  ███████░░░  6,800 / 10,000 units on your busiest day   ✓ fits
 ▸ Advanced (gate cron, custom slots)
```
The same component is reused inside the channel's "Schedule" drawer (replacing `SchedulePanel` + the wizard slot fields).

**Step 5 — Brand kit & sharing**
```
 [ ✨ Draft my brand kit with AI ]   ← primary on this step
 Tagline        [ Wealth whispers.            ]  AI: "Quiet money, loud results"  [Use]
 Eyebrow        [ OLD MONEY HABITS            ]  …                                [Use]
 Description    [ …                           ]
 Tags           (old money ×) (quiet luxury ×) (+ add)
 ─ Also post to (optional) ─
 [ ] Facebook page  [ pick a page ▾ ]   [ ] Instagram @[      ]  [ ] Threads  [ ] TikTok
                                          [ Back ] [ Skip ] [ Continue → ]
```
The AI draft stays per-field and reviewable (the owner's #113 rule), but the suggestion sits **inline next to each field** instead of in a separate sky-blue box (`:742-776`).

**Step 6 — Review & go live**
```
 ┌ Summary ───────────────────────────────────────────── edit links ┐
 │ Quote Quarry · Stoicism · Cinematic · Michael (US male)          │
 │ Shorts Mon–Sat 6:35 pm · Episode Tue 7:30 pm (your time)         │
 │ First video: tomorrow, 18 Nov, 6:35 pm                            │
 └──────────────────────────────────────────────────────────────────┘
 [✓] I allow Quarry Studio to publish videos to "Quote Quarry"
     automatically. I can pause at any time.        (required for Start)
 [ ▶ Start autopilot ]   [ Save, keep paused ]
```
Done screen: "Quote Quarry is live. First Short: tomorrow 6:35 pm. [Go to channel] [Connect another]". This fixes C-01.

### 3.2 The channel card pattern: health at a glance, one next action

**Before:** `page-channels--desktop.png`. Name + ACTIVE chip + 6 unlabeled icons + subs; platform rows; Voice / Music mood / Slots UTC tiles; panels expand inline inside the card and stretch the 2-column grid.

**After:**
```
┌──────────────────────────────────────────────────────────────┐
│ [QU] Quote Quarry                       ● Healthy        ⋯   │
│      Stoicism · @quotequarry302                              │
│──────────────────────────────────────────────────────────────│
│  Next upload        Last upload           Google connection  │
│  Today 6:35 pm      ✓ Yesterday 6:35 pm   ✓ Connected        │
│  Short              "Silence is power"                       │
│──────────────────────────────────────────────────────────────│
│  219 subs · 81K views · YouTube ▸ Facebook 8.6K ▸ Instagram 2│
│                                       [ View channel → ]     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ [YT] YT-BOT                          ▲ Needs attention   ⋯   │
│      No niche yet                                            │
│──────────────────────────────────────────────────────────────│
│  ⚠ Google connection expired — nothing can upload.           │
│                                 [ Re-connect Google → ]      │  ← ONE action
└──────────────────────────────────────────────────────────────┘
```

**Health pill rules (single function, server-computed, reused by sidebar dot + bell):**

| State | Pill | Condition (first match wins) | The one next action |
|---|---|---|---|
| Broken | red `● Not uploading` | OAuth token invalid / `yt.error` present, or last 2 runs failed | **Re-connect Google** / **See error** |
| Setup incomplete | grey `◐ Setup incomplete` | registry entry with no niche/style, or no consent | **Continue setup** (resumes wizard at the first missing step) |
| Needs attention | amber `▲ Needs attention` | key not in CI (`tokenSecretSaved===false`), quota > 90 %, last run failed once | **Fix key** / **Adjust schedule** / **Retry run** |
| Paused | slate `❚❚ Paused` | `flowPaused` | **Resume** (opens consent sheet if no `consentedAt`) |
| Healthy | green `● Healthy` | otherwise | none; show "View channel" as a quiet link |

**The ⋯ menu** (replaces the 6 icons, `channels/page.js:103-140`) opens a right-hand `SlideoutDrawer` (already in the kit) with tabs instead of expanding inline:
`Overview · Schedule · Video style · Voice & brand · AI keys · Advanced (routing) · Danger zone (Pause / Disconnect)`.
Settings stop being something you set up once and become a place you come back to. Edit mode stops reusing the "Add Channel" wizard (C-20).

**Layout tokens:** card padding 20px; header row `flex-wrap min-w-0` with the name truncated (fixes C-10); 3-up stat row `grid-cols-3` → `grid-cols-1` under 480px; the health pill uses the `Chip` component with the `dot` variant and tones `bad|warn|plain|ok`. Voice/music/slot tiles move into the drawer's Overview tab.

**Portfolio header:** above the grid, a summary strip: "5 channels · 4 healthy · 1 needs attention · Next upload 6:35 pm (Quote Quarry)", with a filter `All | Needs attention | Paused`. With ~30 channels in the plan, that strip and filter matter more than the cards do.

### 3.3 AI Providers → "AI services"

```
 What your videos use right now
 Script writing   Groq ✓ → Gemini ✓ → (local fallback)      [Change order]
 Voice            Edge TTS (built-in) ✓                     [Change]
 Captions         Whisper (built-in) ✓
 Images           — not set up                               [Add a service]

 In use (2)       Groq · shared key ••••a91f · tested 2 h ago        [Replace] [Remove]
                  Gemini · Quote Quarry only ••••77c0                 [Replace] [Remove]
 Ready to add (6) Mistral · Cerebras · OpenRouter · ElevenLabs …     [Add key]
 ▸ Not recommended (2)  Hugging Face (no free tier) · OpenAI (paid)
```
**Add key** opens one sheet: Provider → paste key → **Use for: (● All channels) (○ Only: [channel ▾])** → [Test & save]. All provider `notes` move behind a "Details" disclosure. Remove the HF engineering banner (`providers/page.js:148-153`) entirely.

### 3.4 Usage
Rename to **Usage** in nav, tab and H1. Top row of 4 StatCards: *YouTube quota today*, *AI calls (30 d)*, *Failed calls*, *Est. AI cost $*. The YouTube quota is the first limit the owner will hit (memory: "search bucket first wall"), so it belongs here and not only inside a hidden per-channel panel.

---

## 4. Quick wins (each ≤ 1 day)

1. **C-01:** add a "Start autopilot" button + consent checkbox to the wizard end (`saveProfile(true)`), and fix the "pencil → Resume" copy (`add/page.js:880`).
2. **C-02:** `EMPTY_FORM` constant + move `.split` inside `try` + `finally setSaving(false)`.
3. **C-03:** chip logic. Show "key saved" only when `tokenSecret` is non-empty *and* `tokenSecretSaved`. Show `Re-connect needed` when `/api/overview` reports `yt.error`. Hide the empty `key:`.
4. **C-10:** `flex-wrap min-w-0` on the card header (`channels/page.js:100`). That alone removes the 538px phone overflow.
5. **C-12:** for YT-BOT-style errors, render a "Re-connect Google" button linking to `/channels/add?edit=<slug>` instead of the error text in the handle slot.
6. **C-15:** remove the hard-coded "(16)" (`network/page.js:12`); hide the embedded page's own `PageHeader`.
7. **C-16:** one name ("Usage") across `nav.js:61`, `network/page.js:14` and `usage/page.js:108`.
8. **C-08 / C-14 / C-17:** plain-English unavailable states + disabled controls + Retry.
9. **C-09:** per-context error messages instead of the universal "Connect problem".
10. **C-11:** rewrite the 5 tooltips in plain English, drop issue numbers, add a confirm on Pause.
11. **C-25:** hide the Parked brands card when empty.
12. **C-22:** replace hard-coded `white/` / `black/` / hex colours with tokens in the 4 panels.

## 5. Bigger bets (multi-day, high impact)

1. **Stepped wizard with server drafts** (§3.1): 6 steps, resumable "Setup incomplete" state, consent at go-live. About 3–4 days. Biggest single drop in owner confusion.
2. **Channel health model + health card** (§3.2): one server-side `channelHealth(slug)` feeding the card pill, sidebar dots, bell and home alerts, plus the ⋯ → SlideoutDrawer settings. About 3 days. It's what lets the owner run ~30 channels without opening each one.
3. **Unified Publishing schedule component** (C-07): local-time pickers, audience presets, live quota bar, Advanced cron. Replaces the wizard fields and `SchedulePanel`. About 2 days.
4. **One "Video style" model in the UI** (C-06): merge the style catalog and registry templates into one picker; move version pinning to an "Updates" setting. About 2 days, plus a product decision from the owner.
5. **AI services rework** (§3.3): "what's in use" summary, grouped catalog, single Add-key sheet with *all channels / one channel* scope (needs a shared-key vault slot server-side). About 2–3 days.
6. **Identity source of truth** (C-04): every surface shows the YouTube title + avatar from the API with the brand name secondary, and the wizard list and `/channels` render from the same registry projection. About 1–2 days, plus fixing the Debt-Free Doctrine / Old Money Code data.
