# How templates get assigned to channels — and the plan to make it easy

*Written 2026-11-20 for the owner. Part A explains how it works today. Part B is the improvement plan, which
needs your OK before any code changes.*

---

## Part A — How it works today

### The rule in one line
**Each channel has exactly ONE active template.** On a doc day, the channel's long video is made in that
template's look. A channel with no template gets the old default look.

### What happens when you click "Assign"
1. **You pick a channel and a template** in Studio.
2. **The panel checks the match** (`validateAssignment`). It blocks the assign and says why if:
   - **niche mismatch:** the template's niches don't overlap the channel's niches. This is the one you will
     see most;
   - **format mismatch:** the template is long-only and the channel has no long slot (or the reverse);
   - **deprecated:** the template is retired;
   - **capability or renderer missing:** something the template needs is not set up.
3. **If it fits, it is saved** in Neon (`channel_template_assignments`) with your email and the time
   (audit log). **It REPLACES the channel's current template**; there is no stacking.
4. **On the next doc day**, the GitHub autopilot reads the channel's one active template. It renders in that
   look, with the channel's own name, colours, voice and music from its kit. Nothing is uploaded until the
   script is approved (Drafts/Inbox).
5. **If the template's render fails**, the episode falls back to the storybook look and you get a phone
   alert. The slot still ships.

### Where you can assign (3 places, same check behind all of them)
| Place | Click path | Best for |
|---|---|---|
| **Template gallery** | Create → Templates → click a card → *Assign to a channel* | "I like this look; which channel gets it?" |
| **Channel's Templates drawer** | Channels → a channel → *Templates* | "What should this channel use?" Matching templates are starred ★ and listed first |
| **Add-channel wizard** | Channels → Add → step *Template* | New channels |

### Who can take the three new templates right now (real check, today)
| Template | Look | Can assign to | Blocked (why) |
|---|---|---|---|
| **Money Flow Diagram** | dark tiles, money flows between boxes | Money Rulebook, Investor's Compass, Debt-Free Doctrine | Quote Quarry, YT-BOT (niche) |
| **Systems Diagram** | neon diagram on a dark grid | none yet | all 5 (no channel has a tech/AI niche) |
| **Lecture Notes Paper** | white lesson page, teaching widgets | none yet | all 5 (no channel has a tech/AI niche) |

**Current assignments:** only **Money Rulebook → Red Flags Explained**. The other channels have no template
(default look). Assigning Money Flow Diagram to Money Rulebook would **replace** Red Flags Explained.

**For your AI channel (YT-BOT):** when it is ready, it gets the niche **"AI & future tech"**. Systems
Diagram and Lecture Notes Paper both list that niche, so both unlock for it at once. Nothing is set now
(your call: "not ready yet").

### Fixed today (2026-11-20)
- **Names:** the three new templates were listed as "Documentary Master Frames" (their base family's name)
  in the channel drawer and the wizard. Every template now shows its own name (41 templates, 41 unique
  names).
- **Descriptions:** Money Flow and Systems Diagram carried an old storybook description. Each now describes
  its own look.
- **Lecture Notes in the real pipeline:** the doc lane rejected every Lecture Notes plan, so it would always
  have fallen back to storybook. Fixed, and a short final beat that comes back without movement is now
  repaired instead of failing the video.

---

## Part B — Improvement plan (needs your approval)

Problems found while tracing the flow:

1. **No way to change an existing channel's niche.** The block message says "set a matching sub-niche in the
   channel's settings", but no such setting exists for existing channels; only the add-channel wizard sets
   niches. This is why Systems Diagram and Lecture Notes Paper can't be assigned anywhere.
2. **You only learn it doesn't fit AFTER clicking.** The drawer stars matches, but non-matching cards look
   clickable until you get the error.
3. **A swap is silent.** Assigning replaces the current template without saying so first.
4. **No "try it before it goes live".** Seeing a template on a channel means waiting for a real doc day.
   The cloud dry run exists, but only from GitHub.

Proposed steps, small and one at a time, each verified on the live panel:

| # | Step | What you get | Size |
|---|---|---|---|
| **B1** | **Niches editor** in the channel's drawer (pick from the same niche list the wizard uses) | You can open Systems / Lecture Notes for a channel yourself, no code | S |
| **B2** | **Fit badge on every card before you click:** green "Fits" / grey "Needs niche: AI & future tech" (the real validator, run in advance) | No surprise errors; you see what to change | S |
| **B3** | **Swap confirm:** "This replaces *Red Flags Explained* on Money Rulebook. Continue?" | No accidental replacement | XS |
| **B4** | **"Test on this channel" button:** starts the cloud dry run (no upload) with the channel's kit and voice; a 2-4 min sample video appears on the card in about 40 min | See the template in YOUR channel's look before assigning | M |
| **B5** | **"Assigned to" chips on gallery cards:** e.g. "Money Rulebook" on Red Flags Explained | One glance shows who uses what | XS |

Suggested order: **B3 → B1 → B2 → B5 → B4**. B3 is the smallest safety fix; B1 unlocks the new templates;
B4 is the biggest.

**Not proposed:** several templates per channel, or auto-assigning by niche. Both break the "one channel = one
look" rule the autopilot and review gate rely on (a channel with two active templates is held as ambiguous).

### Decisions for you
1. Approve B1-B5 (all, some, or a different order)?
2. Money Rulebook: keep **Red Flags Explained**, or switch to **Money Flow Diagram** after you watch its
   cloud test video?
3. Investor's Compass / Debt-Free Doctrine (no template today): give them **Money Flow Diagram**?
