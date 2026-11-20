# Owner Feedback — Quarry Studio

**How this works**
1. Write anything here — a bug, an idea, something you don't like, a question. Plain words are perfect; screenshots can be pasted as file paths.
2. Add it under **📝 New feedback** as a new bullet (newest at the top). Put the date if you like.
3. Tell Claude "read my feedback" (or just start a session) — Claude reads this file, replies under **💬 Claude's decisions**, and moves each item through the status board.
4. Nothing gets built from here without your OK — Claude proposes, you approve.

Status labels: 🆕 new · 🔍 looking into it · 💡 proposal ready (needs your OK) · 🛠️ approved, building · ✅ done & live · ⏸️ parked · ❌ won't do (with reason)

---

## 📝 New feedback
- such as when add new channel like yt-bot so want to select its thubmails so already build in thubmails templates are not showing there
- remove all extra detail form dashboard all extra boxes and cards 
- and on every page breadcump should be shown
- warning alert are showing on alot of pages and on alot of ways please remove them from unnessary ways
- currently when i move to channel page so it showing me active channels but also on each showing some waring also
- when click on some of manage option 1st one is schedule so when i click on it so it oepn drawer which is not best UI and also not scrollable and on every heading showing description also i wnat less text
- autopilot start time where daily corn will be run is not fully understandalbe how i will koow best timing i wnat AI should show me best times and also avalibe slots whcih are not using other channels so we can pick that.
- then on template drawer totaly bad UI/UX when template showing jsut text not its demos so how we will know hwich template is best also as you know i were added two option story based and chapers based true false so that option should show there 
- when click on open channel button so its oepn new page i wnat it should show me same drwaer for it also where 

---

## 💬 Claude's decisions
<!-- Claude replies here, newest first, one block per feedback item:
### <short title> — <status label>
- **You said:** …
- **What I found:** …
- **My recommendation:** …
- **Your decision needed:** yes/no — …
-->

### I. Live website test — 115 problems found, 5 fix batches — ✅ done & live (2026-11-20)
- **You said:** test the real website like a normal user, every small feature and edge case.
- **What I found:** 5 testers, desktop + phone, on the live site. 115 problems: about 15 serious, ~45 medium and the rest small. Full list with evidence: `research/live-e2e-test-2026-11-20.md`. The worst:
  - **Today is wrong about every channel.** It says "not run today" for channels that DID run, and Debt-Free Doctrine's failed run this morning shows nowhere and raised no alert.
  - **"Things need you" is a different number on every page** (5 / 6 / 11), and several old alerts never close.
  - **Debt-Free Doctrine shows the wrong upload times** in the panel. The real times are fine.
  - **Sometimes the panel briefly shows all channels as "inactive".** Your automation was NOT affected; I checked.
  - **"Edit setup" on a real channel shows its times and tags empty** — pressing Save there would wipe them.
  - **Login link safety hole:** a crafted link could send you to a fake site right after you log in.
  - **36 templates share one name,** and preview videos are very slow and often never start.
  - **"Draft with AI" never works** (the AI service refuses).
  - **Phone layout:** the Inbox and Thumbnails pages are too wide on phones.
- **My recommendation:** fix in 5 batches, each tested live before the next:
  1. Safety & trust.
  2. A truthful Today page.
  3. Templates & media.
  4. Phone & everyday comfort.
  5. Small/cosmetic.
- **Your decision needed:** yes — "approve all batches", or name the batches you want (e.g. "approve 1 and 2").

### J. Found while fixing — 4 small decisions for you — ✅ J1–J3 done & live (2026-11-20) · J4 is yours
- **Daily Excel report has failed since Nov 17.** YT-BOT's YouTube key is stored in a format the report job can't read. Also, reports are only emailed/pushed, never saved where the panel looks (so the Reports card shows Sep 19). **Recommend:** fix the job's key reading and save each report to the repo.
- **Older Shorts lose their YouTube link in the Library.** The automation only remembers the newest video's link. **Recommend:** save each video's link when it uploads (small engine change).
- **5 leftover preview entries** from templates you already approved (nothing uses them). **Recommend:** delete them.
- **One real alert is still open:** an approved Money Rulebook video ("The Secret Fold…") was never published. **Recommend:** open it in Review and press Redispatch, or reject it.
- **Your decision needed:** yes — say which of these to do (e.g. "do J1-J3").

_2026-11-20 — A–H are all built and live (checked in a real browser on desktop + phone). Three small things for you to decide whenever you like:_
- **Thumbnail designs take turns only on channels whose video template asks for more than one thumbnail.** Want me to make that true for every channel?
- **The Inbox menu opens the Tasks page; the bell opens the Alerts page.** Want them merged into one Inbox page?
- **The Add Channel wizard now picks the upload time by the hour** (the exact-minute box is gone). OK, or bring minutes back?

_2026-11-19 — answers to your first 9 items. Reply "approve all" in chat (or tick the ones you want: e.g. "approve A, B, D") and I'll build them._

### A. Choose thumbnail designs when adding a channel (item 1) — ✅ done & live
- **You said:** when adding a channel like YT-BOT I want to pick its thumbnails, but the built-in thumbnail templates don't show.
- **What I found:** the automation ALREADY supports a per-channel list of chosen thumbnail designs (`thumbTemplates` — it rotates through them on uploads), but no screen lets you set it. The wizard's Thumbnails step only edits text.
- **My recommendation:** the Thumbnails step (and a "Thumbnails" drawer under Manage) shows every built-in design as a real rendered sample in your channel's colours; you tick the ones you like (2–5), they rotate automatically. Saved to the channel, used from the next upload.

### B. A much simpler dashboard (item 2) — ✅ done & live
- **You said:** remove all the extra boxes and cards from the dashboard.
- **What I found:** Today has 8 sections (verdict, channels today, 5 KPI tiles, chart, needs-attention, production table, researched topics, trend radar).
- **My recommendation:** keep only 3 things: **(1)** the one-line verdict ("All good" / "N things need you"), **(2)** one compact row per channel (made today? next slot), **(3)** the views chart. Move topics + trend radar to each channel's page and to Analytics; drop the KPI tiles (they're on Analytics) and the duplicate needs-attention card.

### C. Breadcrumb on every page (item 3) — ✅ done & live
- **What I found:** the breadcrumb is hidden on phones and only shows one level ("Channels"), never "Channels / Money Rulebook / Schedule".
- **My recommendation:** a full breadcrumb on every page incl. phones (e.g. `Channels › Money Rulebook`), each part clickable.

### D. Warnings shown in too many places (items 4 + 5) — ✅ done & live
- **What I found:** real problems currently appear in up to 6 places: bell, Inbox badge, home verdict, home needs-attention card, the phone bar, and a warning line on every channel card (that card line also shows "not run today" before a slot even happened).
- **My recommendation:** exactly **2 places**: the **bell** (with count) and the **Inbox page**. Home shows only the one-line verdict. Channel cards show a small red dot only when that channel has a real problem — no warning text on healthy channels.

### E. Better drawers: scrolling, less text (item 6) — ✅ done & live
- **You said:** the Schedule drawer isn't the best UI, doesn't scroll, and every heading has a description — you want less text.
- **My recommendation:** fix scrolling inside every drawer (I'll test it in a real browser on desktop + phone), remove the description lines under headings (keep one short line at the top only), tighter layout.

### F. AI best times + free slots (item 7) — ✅ done & live
- **You said:** I don't understand when the daily run happens or what the best time is; I want AI to suggest best times and show which slots other channels don't use.
- **My recommendation:** the schedule picker becomes a simple 24-hour timeline in YOUR time: slots other channels already use are greyed "taken", 3 suggested times are highlighted ("⭐ best — your audience is most active", based on your real YouTube Analytics where available, else the niche default), and you click to pick. The raw cron text disappears.

### G. Template drawer with real demos + Story/Chapters choice (item 8) — ✅ done & live
- **You said:** the template drawer is just text — no demos; and the Story-based vs Chapters option should be there.
- **My recommendation:** the channel's Templates drawer shows the same real preview cards as the Templates gallery (poster + video on hover), and each has a clear **Full story / Chapters** switch before you assign it.

### H. "Open channel" as a drawer (item 9) — ✅ done & live
- **You said:** clicking Open channel goes to a new page; you want a drawer instead.
- **My recommendation:** "Open channel" opens a large drawer with the channel's health, today, schedule and quick actions, without leaving the Channels list. (The full page stays reachable via a "full page ↗" link in the drawer.)

---

## 📋 Status board
| # | Item | Status | Notes / link |
|---|------|--------|--------------|
| 1 | Only real notifications (189 → 5) | ✅ done & live | quiet notes never badge or buzz the phone |
| 2 | Quote Quarry couldn't be turned back on | ✅ done & live | resumed + root cause fixed |
| 3 | Money Rulebook approved videos never published (Nov 14/17/18) | ✅ done & live | failed renders now alert; 45→75 min limit; voice-timing fallback; nightly "approved but never published" check; approvals can't cancel each other. The 3 videos were SKIPPED per your decision |
| 4 | A. Pick thumbnail designs per channel | ✅ done & live | real rendered samples in the Add Channel wizard + new Manage → Thumbnails drawer; tick 2–5, they take turns on new uploads (95b880a + 750c2ab, live 2026-11-20) |
| 5 | B. Simpler dashboard (3 sections) | ✅ done & live | Today = status line + one row per channel + views chart; totals, topics and trend radar moved to Analytics (95b880a + 750c2ab, live 2026-11-20) |
| 6 | C. Full breadcrumb on every page | ✅ done & live | clickable path on every page incl. phones, e.g. Channels › Money Rulebook (95b880a + 750c2ab, live 2026-11-20) |
| 7 | D. Warnings only in bell + Inbox | ✅ done & live | no Inbox menu badge, no phone-bar alert count; channel cards show a small red dot only for a real problem (95b880a + 750c2ab, live 2026-11-20) |
| 8 | E. Drawers scroll, less text | ✅ done & live | root cause: page fade-in animation trapped drawers at page height; fixed for every drawer; explanation lines removed (95b880a + 750c2ab, live 2026-11-20) |
| 9 | F. AI best times + free slots timeline | ✅ done & live | 24-hour grid in your time; hours used by other channels greyed "taken"; 3 starred times with the reason; schedule code hidden under Advanced (95b880a + 750c2ab, live 2026-11-20) |
| 10 | G. Template drawer with real demos + Story/Chapters | ✅ done & live | real poster + video previews; Story shape switch (Template default / Full story / Chapters) at the top (95b880a + 750c2ab, live 2026-11-20) |
| 11 | H. Open channel in a drawer | ✅ done & live | opens a large drawer on the Channels list; "Full page ↗" link kept (95b880a + 750c2ab, live 2026-11-20) |
| 12 | I. Live website test fixes (5 batches) | ✅ done & live | all 5 batches live 2026-11-20 (ae4495b, badffc1, 45a4d5e, 1a22f9e), each re-checked on the live site; final crawl: 27 pages × desktop+phone, 0 page errors, 0 sideways scroll, 0 broken text |
| 13 | J. Report job, Library links, leftover previews, one open alert | ✅ J1–J3 done & live (c092e6f) | J1: report job green again for all 5 channels (proof run 44797937419); Analytics › Reports lists every daily report with Download · J2: new Shorts keep their YouTube link in Library · J3: 5 leftover previews deleted · J4 (Secret Fold) still yours in Review |
