# "Creator City" (TubeGuruji): what's in it and what Quarry Studio should take from it

_Research, 2026-11-23. Read-only: no code was changed. Written for the owner._

## Sources (all checked directly)

| Source | What I used it for |
|---|---|
| Video `0RmM6ckWFeM`, "Full Stack AI Agent City for Content Creators using NextJs, Claude Code \| Full Course 2026", TubeGuruji, 2026-11-18, 2 h 45 m | The full English transcript (4,409 caption lines), read chapter by chapter |
| The video description and its 20 chapters | Tech stack and links |
| 21 frames pulled from the demo parts of the video | Every screen: City, Artifacts, Post, Calendar, Agents, Accounts, Settings, cloud computer, building popover |
| Live demo `ai-agent-city-for-content-creator.vercel.app` | The landing page and the sign-in page. `/dashboard` sends you to `/sign-in`. **I did not create an account** on a third-party site without asking you. The video frames show the whole dashboard anyway. |
| Public repo `github.com/rrs301/ai-agent-city` (starter) | The city drawing code (one 40 KB canvas file, not three.js) and its docs. **No LICENSE file**, so we must not copy its code. We can learn from it and build our own. |
| Public repo `github.com/rrs301/ai-agent-city-for-content-creator-strapi-admin` | The real data model: 14 Strapi collections, plus the shared-memory MCP tools |

The full app source is behind a tubeguruji.com course page. It wasn't needed, because the two public repos and the video show everything that matters.

---

## 1. What he built, in plain words

You type **one request** to a "Headquarters" chat, for example *"find a trending topic on Google, write a 45-second script, make the voiceover"*. HQ splits it into steps and hands each step to a specialist "agent". Each agent is drawn as a **building in a small isometric city**:

Research → Script Writer → Voice → Media (images) → Video Editor → Publishing

- A **progress strip** at the top shows the steps (Research ● Script ● Media ● Review ● Publish). You can **Stop** at any time or **queue** another request.
- Clicking a building opens a **popover**: status (Working, 22%), what it's doing right now ("Waiting for the computer, the Video Editor is using it"), and buttons for **View cloud computer · AI settings · Customize · Delete**.
- Everything the agents make lands in **Artifacts**: docs, images, audio and video, with filters by type and by agent.
- The **Publishing** agent writes the caption and hashtags and saves a **draft post**. You edit it, then **Publish now** or drag it onto the **Calendar**.
- Agents share a **memory**: research saved by one agent is read by the next, so nothing gets copied and pasted between them.
- **"Cloud computer"**: some agents control a real Linux desktop with Chrome (Google Trends, ClipGenie). You can watch it live, or click "Take control" to type a login or solve a captcha yourself.

**Stack:** Next.js 16 + Strapi CMS as the database and admin panel, **OpenAI Agents SDK** for the agents (despite the title, Claude Code was only the tool he coded with), ImageKit for images, Cloudhike.dev for background jobs, the scheduler and the cloud computer, and **Composio** for connecting Instagram, YouTube, X and other accounts.

## 2. Every screen (the "routes")

| Route | What's on it | Good UX idea in it |
|---|---|---|
| `/city` | 4 number tiles (Content created 45 "19 docs · 19 images", Posts published 1 "1 this week", Scheduled 0 "Nothing scheduled", Followers 42 "Instagram 42"), then the city map, then on the right the work-progress strip and the HQ chat | **One place to ask, one place to watch.** Each tile has a small line under the number that says what it means. Empty states say what to do ("Connect an account"). The chat box teaches by example: *"e.g. Create a 60-second video about AI note-taking apps"* |
| `/artifacts` | A left rail with **Library** (All files 47 · Documents 19 · Images 19 · Audio 4 · Video 5) and **Agents** (Research 3 · Script Writer 8 …), and a grid of **real previews**. Search, grid/list switch, Upload button | Two filters, *what kind* and *who made it*, each with counts. Real thumbnails instead of file names |
| `/post` | Tabs **Drafts 5 · Scheduled 0 · Published 1**. Post cards with image, platform, "suggested Wed Nov 18 8:00 AM, by Publishing agent", and **Schedule / Publish / ✎** buttons. A yellow banner when scheduling is turned off | Tabs with counts. The suggested time is shown on the card. An honest banner when a feature can't work |
| `/calendar` | Month and Agenda views. Checkboxes for **Posts · Drafts · Agent work**. A **Drafts** column on the right: drag a draft onto a day to schedule it | Published posts, unscheduled drafts and agent work all on one calendar |
| `/agents` | Tiles: **7 Agents · 0 Working · 0 Need you · 0 Failed**. One card per agent: picture, role, one-line job, tool tags (Shared memory, Web search, Cloud computer), Model, Limits (12 turns · 300 s), Recent runs, Last run. Under that, an **Activity** list: every request with who ran it, when and the result. You open a row to see its plan, tool calls and output | "Need you" as a top number. Every run can be opened to see what happened inside it |
| `/accounts` | A **Connected** list (Instagram @…: Connected · All agents · Can post · asks you first) with Manage / pause / refresh / remove. Then **Add an account**: category chips and cards with a "Needs setup" or "Connected" chip | One short line answers who can use the account, what it can do, and whether it asks first |
| `/settings` | Time zone ("Use this browser's zone"), **New agent defaults** (model, reasoning effort, max turns, time limit), **Publishing approval** as two big choice cards (**Ask before posting** / **Auto-publish**, each with what happens), and the Headquarters look with a live preview | Big policy choices are shown as two cards, each saying what will happen |
| Building popover / cloud computer | Status, % progress, current activity, View / AI settings / Customize / Delete. The cloud-computer window has **Watch · Take control · Files · Shut down** | When an agent needs a person, it asks on the building itself ("Sign in to ClipGenie") |

## 3. How it works underneath (from the Strapi repo)

These are the 14 collections, and they're the useful part to learn from:

- **headquarter**: the workspace. Includes `publishingApproval: ask|auto`, `timeZone` and `agentDefaults`
- **agent**: name, instructions, `role` (research/script/voice/media/editor/publisher/custom), model, tools, `status` (idle/working/waiting/completed/failed), progress, activity, plus the building's look and its x/y position on the map
- **agent-task**: title, input, status (queued/running/completed/failed/cancelled), progress, activity, output, **plan**, **usage** (tokens), `parent` task (HQ's task → the agents' sub-tasks), `cancelRequested`, `paused`
- **task-event**: started / tool_call / tool_output / delegated / progress / completed / failed. This is the step-by-step story of a run
- **agent-request**: **the agent asking a human**. Kinds: login, captcha, action, **choice** (with options), **confirm**, connect. Status pending/resolved/cancelled/**expired**
- **artifact**: type (document/image/audio/video), category (script/research/topics/voiceover/publication…), linked to the agent and task that made it
- **memory**: kind, title, content, tags. Read and written by agents through 4 MCP tools (`memory_save` …). Every tool is locked to one HQ by a signed header
- **social-post**: draft/scheduled/publishing/published/failed, `publishAt`, linked to an account, an agent and an artifact
- **connected-account**: permission (read/publish), `agentAccess all|selected`, `requireApproval`, status (active/expired/revoked)
- **computer-session**, **external-wait**: who holds the cloud computer, and "check this page every N seconds until it's ready"
- **conversation**, **chat-message**, **media-asset**

What he showed going wrong in the video is useful too:
- **Agents showed "completed" left over from an old task.** He had to add "reset every agent's status when a new task starts". That's the same kind of bug as our old "not run today" one.
- The browser agent **got stuck** on Google Trends and had to be stopped by hand.
- The publish-to-Instagram flow **failed the first time** (missing fields) and the account had to be reconnected.
- The draft post went to Artifacts but **not to the Post page** until he fixed it.

## 4. Where we stand against it

| Their feature | Quarry Studio today | Verdict |
|---|---|---|
| Fixed chain of specialists | **We already have one**: topic → script → your approval → voice → render → thumbnail → upload, on schedule, for each channel. It's more reliable than theirs (deterministic, has a 7/7 ready gate, alerts) | We're ahead on the engine. They're ahead on **showing** it |
| Progress strip for each request | `/runs` shows a whole GitHub run as one row and links out to the GitHub log | **Gap.** We can't see which station a run is at, or where it failed, inside the panel |
| Artifacts (every in-between file) | `/videos` (Library) shows only finished videos | **Gap.** Research, scripts, voice files and thumbnails for each run aren't browsable |
| Calendar with drafts | A per-channel schedule timeline. No calendar across channels | **Gap** |
| Agent requests (choice/confirm/login) | Inbox has script approvals and alerts | **Half.** We have approve/reject, but no "pick one of these 3" or "retry with backup voice / skip?" questions. The Money Rulebook silent-loss problem was exactly a moment when the system should have asked you |
| Agents page with run history | Settings are spread around: Voice drawer, Templates drawer, AI services page | **Gap in clarity.** There's no single "this station: its settings and what it did" view |
| Accounts page | YouTube OAuth for each channel, FB/IG cross-posts, and the token problems sit in alerts | **Gap in clarity.** Nowhere shows "which account is healthy, what it can do, whether it asks first" |
| Publishing approval Ask/Auto | review_hold for each channel, plus the 7/7 gate | We have this. It just isn't shown as a clear choice |
| HQ chat ("make me X") | Create page: a Short from a prompt | **Gap**, and the biggest one. But it's also the riskiest, see §6 |
| Cloud computer, Composio, Strapi, 3D buildings you can drag | — | **Don't copy**, see §6 |

## 5. What I recommend we take, best value first

All of this follows the existing rules: pilot on **Money Rulebook** first, real data only, keep Today as simple as you asked, a spec before any code, and your OK before building.

### Phase 1: show what's already happening (screens only, using data we already have)

1. **A station strip on each channel row of Today.** Seven small dots: Topic · Script · You approve · Voice · Render · Thumbnail · Upload. Green = done, pulsing = running, amber = waiting for you, red = failed **at that station**. Every new run starts with a clean strip (the lesson from his stale-"completed" bug). This is one row, not a new card, so Today keeps its 3 sections.
2. **Run detail drawer on `/runs`.** Click a run to see a timeline of what each station did, how long it took, what it produced (script title, voice length, video link) and the exact failure line, all in plain words. The GitHub log stays as a small "raw log ↗" link. This is his `task-event` idea. Our runs already print these steps; we just need to save them as rows instead of only as log text.
3. **Calendar** (`/calendar`, a new menu item between Inbox and Channels). Month / Week / Agenda. All channels, one colour each. Shows ✓ published, ⏰ scheduled, 📝 approved-and-waiting, and greyed **free slots**. Click a day to open the drawer. Read-only to start.
4. **Accounts tab in Settings.** One row per connected account: ● Connected / ● Needs re-login / ● Expired, which channel uses it, what it can do (upload / read analytics / cross-post), and "asks you first: yes/no". The fleet OAuth 401 problem would show up here plainly instead of being buried in alerts.

### Phase 2: deeper (needs small data changes)

5. **Library becomes "everything made".** Keep `/videos`, add tabs: **Videos · Scripts · Voice · Thumbnails · Research**. A left rail by **channel** and **station**, real previews, a play button for audio, copy/download. This needs each run to save its in-between files somewhere the panel can read. *Not decided yet: where they're stored and how long we keep them. I'll check how big they are before I write the spec.*
6. **Inbox gets "questions", not just approvals.** A typed ask with buttons, for example: *"Voice timing failed for 'Why banks love debt'. [Retry with backup voice] [Skip today] [Open script]"* or *"3 topics ready for Money Rulebook, pick one"*. Every question expires (his `expired` status), so nothing hangs forever. The matching station dot turns amber. This directly prevents the silent-loss case we found on Nov 14–18.
7. **Station drawer** ("AI settings" for each station). Click a station (on Today's strip or on the channel page) to open one drawer with that station's settings for the channel (Voice → voice/mood/speed, Script → model and length, Thumbnail → chosen designs, Upload → times and Ask/Auto) plus its last 5 results. These settings already exist; this puts each one in one obvious place.
8. **Factory floor view** (optional, your taste call). A **Floor** view switch on `/runs` (List | Floor). It draws our 7 stations as a small illustrated production line, each channel's current video moving along it, live. This is the "city" feeling without a new menu item, and without making Today busy. It's our own SVG drawing (we can't use his code: no license). It needs a phone-friendly fallback, and on phones the strip from #1 is enough.

### Phase 3: "Ask the factory" (only after 1–7 work)

9. **One request box** (on Create): *"Make a Money Rulebook video about credit-card float for Friday 6 pm"*. The panel shows a **plan first**: "Topic: given · Script: write · You approve · Voice · Render · Upload Fri 18:00". You press **Start**, and it runs our **existing** pipeline with those inputs. The AI only turns your sentence into a plan using **our fixed list of steps**. It never gets free rein over a browser or accounts. It can use the free Groq model we already use for kit autofill. Stop and queue work like his.

## 6. What I recommend we **don't** copy

- **Cloud computer / browser agents.** In his own video it got stuck, needed captchas and needed manual logins. It costs money per hour, and automated browsing of Google/YouTube risks breaking their terms. Our pipeline doesn't need it. **Park.**
- **Composio.** A paid third party would hold our YouTube tokens. We already connect to YouTube directly. Only worth revisiting if we add TikTok or LinkedIn posting.
- **Strapi CMS.** Neon + our panel already do this job.
- **Per-agent chat.** He had to add "clear the chat for every new task" because the agents got confused. One request box (#9) is enough.
- **A 3D city as the home page, dragging buildings, colouring buildings.** It looks nice in a demo, but it takes half the screen for decoration, fights your "simpler dashboard" decision (item B), and doesn't work on a phone. At most it becomes the optional Floor view (#8).
- **OpenAI's "free daily tokens" trick.** It works by letting OpenAI train on everything you send. Not for our scripts.

## 7. UI/UX rules to take from his app

1. **One place to ask, one place to watch, one place for results.** For us that's Create (ask), Today + Runs (watch), Library (results).
2. **Fixed status words everywhere:** Waiting · Running · Needs you · Done · Failed. Reset them at the start of every run.
3. **Every number gets a meaning line:** "3 published · this week", "0 scheduled · nothing booked".
4. **Filters with counts:** a left rail for *type* and *who made it*. Tabs with counts (Drafts 5 · Scheduled 0).
5. **Real previews, never file names:** this already worked for templates and thumbnails.
6. **Honest banners when something can't work** ("Scheduling is off because …"), instead of quietly doing nothing.
7. **Important choices as two big cards** that say what will happen (Ask before posting / Auto-publish).
8. **Teach by example in empty states and inputs:** a placeholder like *"e.g. Make a 60-second Money Rulebook video about…"*.
9. **Page anatomy:** title, one-line description, then one main button top-right (as on his Post, Artifacts and Accounts pages).
10. **Where his app is weaker than ours, keep ours.** Ours has drawers that scroll, phone mode, breadcrumbs, and alerts only in the bell + Inbox. His dialogs opened in the wrong corner, and his map needs a mouse.

### Proposed menu (net +1 item)

```
Cockpit   Today        verdict · channel rows WITH station strip · views chart
          Inbox        approvals + questions (typed asks) + alerts
          Calendar  ★  all channels: published · scheduled · waiting · free slots
          Channels     (station drawer reachable from each channel)
          Runs         List | Floor ★ · each run opens a step-by-step drawer ★
          Library      Videos · Scripts · Voice · Thumbnails · Research ★
          Analytics
Make      Create       + "Ask the factory" request box (phase 3) ★
System    Settings     + Accounts tab ★
```

## 8. Decisions I need from you

1. **Which phases to approve?** My advice: approve **Phase 1** (items 1–4) now. It's pure screens on data we already have, low risk, and fixes "what is the machine doing right now?". Then Phase 2, then Phase 3.
2. **Factory floor (#8):** an illustrated production line (closer to his city), or skip it and keep only the station strip?
3. **Calendar:** its own menu item (my advice), or a tab inside Channels?
4. **Ask the factory (#9):** OK to use the free Groq model only to turn your sentence into a plan, always with a Start button that you press?
