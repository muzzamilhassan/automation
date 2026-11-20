# Spec + QA — Live fix wave C3 (2026-11-20)

Source: research/live-e2e-test-2026-11-20.md, items T3-07, T3-10, T3-16,
T3-17, T3-19, T3-21, T3-22, T3-23, T3-24, T3-26, the channel page's Resume
button, and T1-24 (client side). Evidence: studio-ui-audit/e2e/t3-channels
(`list-1440.png`, `list-390.png`, `s8.out`, `data/`).

Tests: `tests/wave-c3.test.mjs` (plus two updated pins in
`tests/channels-drawers.test.mjs`: the drawer label is now the display name).

## What was wrong

- **T3-07.** Each card's "Music mood" came from a hard-coded per-channel map
  in `site-data.js`. Debt-Free Doctrine showed "Driving · Hopeful", but its
  real data says calming + bright.
- **T3-10.** "Recent uploads" on the channel page used the 20-row log shared
  by all channels. It jumped from November to September and showed the same
  title twice with two different video ids.
- **T3-16.** The Schedule drawer showed an amber developer note ("Quota
  advisory … 17.0x cheaper … Edit the youtube_quota_models row …") on every
  channel.
- **T3-17.** "Goes public at …" showed only the Shorts time.
- **T3-19.** "Paste a key first." stayed after you started typing.
- **T3-21.** "Next upload Nov 21, 03:35" was local time with no label, next to
  "Shorts 22:35 UTC". Local times past midnight did not say so.
- **T3-22.** The header said "5 live channels" while YT-BOT was paused.
  YT-BOT's niche read "wizard channel — finish setup".
- **T3-23.** "Active" vs "ACTIVE"; "Clips from long videos" vs "Clips of the
  long video"; The Money Rulebook's mark read "TH".
- **T3-24.** "Assign & pin" and "Save designs" put the icon above the label.
- **T3-26.** On a phone, card facts were cut off ("… your t…", "… Myst…").
- The channel page's "Resume autopilot" ran with no confirm (the list's
  Manage menu asks).
- **T1-24.** An unknown channel's page said "not found" but read badly.

## Requirements (EARS)

Music mood (`studio/lib/channel-overview.mjs`, `studio/app/api/overview/route.js`)
- M1: THE OVERVIEW SHALL send each channel's `musicFeels`: the registry kit's
  list when it has one, else the brand file's (the engine's order).
- M2: THE CARD SHALL show the mood as plain words ("Calming · Bright"). WHEN a
  channel has no mood data THE CARD SHALL show "Not set".
- M3: THE CODE SHALL hold no per-channel mood map (`MUSIC_MOODS` is deleted;
  a test keeps it gone). The Music page reads the same live data.

Recent uploads (`studio/app/channels/[slug]/page.js`)
- U1: THE CHANNEL PAGE SHALL list this channel's own upload records
  (`/api/library?slug=…`), never the shared log.
- U2: WHEN two records share a title and a day THE LIST SHALL show one row,
  keeping the published one.
- U3: THE LIST SHALL show the newest 10, with dates. WHEN some records could
  not be read THE LIST SHALL say the list may be missing some.

Schedule drawer (`studio/components/SchedulePanel.js`)
- S1: THE DRAWER SHALL NOT show the quota-model advisory. WHEN the busiest day
  is over YouTube's daily upload count THE DRAWER SHALL say so in plain words.
  This applies on load and after Save.
- S2: THE DRAWER SHALL say when Shorts go public AND when long videos go
  public, with their day(s), in your time ("Long videos go public at 7:30 pm
  your time on Wed & Sat"). WHEN the local time crosses midnight THE DAYS
  SHALL move with it. The days follow the long-form days being edited.

API keys (`studio/components/ChannelKeysPanel.js`, `studio/lib/key-hints.mjs`)
- K1: WHEN you type in a key box THE ROW'S OLD MESSAGE SHALL clear.
- K2: WHEN a typed key doesn't start the way its provider's keys do (Groq
  `gsk_`, OpenAI `sk-`, OpenRouter `sk-or-`, Gemini `AIza`, HuggingFace `hf_`,
  Cerebras `csk-`) THE ROW SHALL show a soft hint. The hint SHALL NOT block
  "Save & test". Other providers get no hint.

Times (`studio/app/channels/page.js`, `studio/components/ChannelOverviewDrawer.js`)
- T1: EVERY LOCAL TIME SHALL be labelled "your time"; every UTC time stays
  labelled "UTC".
- T2: WHEN a local time is not today THE TEXT SHALL name the day ("3:35 am
  tomorrow", "7:30 pm Sun").

Counts and labels
- C1: THE CHANNELS HEADER SHALL count active and paused apart ("4 active · 1
  paused"; parked only when there are some).
- C2: WHEN a wizard channel has no niche THE CARD AND PAGE SHALL show "Setup
  not finished" in muted text with a "Finish setup" link to
  `/channels/add?edit=<slug>`. The overview no longer sends a fake niche.
- C3: THE STATUS CHIPS SHALL read "Active", "Paused", "Parked". The clips
  source SHALL read "Clips from long videos" everywhere.
- C4: CHANNEL NAMES AND MARKS SHALL come from `lib/channel-display.mjs` (wave
  C1): Title Case names, initials "MR" for The Money Rulebook.

Layout
- L1: THE FOOTER BUTTONS "Assign & pin" and "Save designs" SHALL keep icon and
  label on one line.
- L2: ON SMALL SCREENS THE CARD FACTS SHALL wrap, not cut off.

Confirm and not-found (`studio/app/channels/[slug]/page.js`)
- R1: WHEN you press "Resume autopilot" on the channel page THE PAGE SHALL ask
  first (same words as the list).
- N1: WHEN the channel does not exist THE PAGE SHALL show "Channel not found"
  with a "Back to Channels" button, and the breadcrumb says "Page not found".
  (The HTTP 404 comes from wave C1's server layout.)

## Plain-English QA (do these on the live site)

Channels list
1. Open Channels. The header says "4 active · 1 paused" (not "5 live
   channels").
2. Debt-Free Doctrine's card: Music mood reads "Calming · Bright". Quote
   Quarry reads "Epic · Inspiring · Heroic".
3. YT-BOT's card: under the name it says "Setup not finished · Finish setup"
   in grey. Click "Finish setup". The wizard opens for YT-BOT.
4. The Money Rulebook's mark says "MR" and its name reads "The Money
   Rulebook" (not all caps).
5. Upload slots: the first line ends in "UTC". The second line starts "Your
   time:" and a time after midnight says "tomorrow" (for example "3:35 am
   tomorrow").
6. Phone width (390px): the voice, mood, slot and account lines wrap onto a
   second line instead of ending in "…".

Overview drawer
7. Click a channel name. The "Next upload (your time)" tile shows a time such
   as "3:35 am tomorrow". The schedule list still says "UTC".

Channel page
8. Open a channel's full page. The chip reads "Active" or "Paused" (not all
   caps). "Shorts come from" reads "Clips from long videos".
9. "Recent uploads" shows up to 10 rows, newest first, with no title shown
   twice on the same day. Debt-Free Doctrine's Enron episode shows once.
10. On YT-BOT (paused), press "Resume autopilot". A box asks "Resume
    <channel name>?" first. Press Cancel. Nothing changes.
11. Go to /channels/not-a-real-channel. You see "Channel not found" and a
    "Back to Channels" button that works.

Schedule drawer
12. Manage → Schedule on any channel. No amber "Quota advisory" text.
13. Under the timeline it says "Shorts go public at … your time. Long videos
    go public at … your time on …". Toggle a long-form day. The day list
    changes with it.

API keys
14. Manage → API keys. Press "Save & test" on an empty box. "Paste a key
    first." appears. Type one letter. The message goes away.
15. In the Groq box type "abc". A grey hint says Groq keys usually start with
    gsk_. "Save & test" still works.

Footers
16. Manage → Templates, pick a card: "Assign & pin" has its icon on the same
    line. Manage → Thumbnails: "Save designs" too.
