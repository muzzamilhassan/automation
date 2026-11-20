# Spec + QA — Live fix wave A2 (2026-11-20)

Source: research/live-e2e-test-2026-11-20.md, items T4-01 (P1), T4-02 (P4),
T4-18 and T4-11. Evidence: studio-ui-audit/e2e/t4-wizard (`api-snap.json`
vs `registry-now.json`, `shots/s3c-edit-qq-*.png`).

## What was wrong

- **T4-01.** The registry read sometimes showed all four real channels as off,
  with no key and no start time. The repo copy of the channel list
  (`yt-mcp/studio-channels.json`) is laid over the Neon rows. When GitHub
  refused the read (403) or timed out, that layer became an empty list.
- **T4-02.** "Edit setup" on Quote Quarry showed empty times, tags and
  description. It read the registry's top-level `slots: []`, but the real
  values are in `kit.slots` and the brand kit. Pressing Save would have wiped
  them.
- **T4-18.** All four healthy channels said "key name missing — re-connect".
  Their keys are GitHub secrets named `YT_TOKEN_<SLUG>`, so no name is
  recorded, but the key is saved.
- **T4-11.** Nothing warned about a duplicate channel name. Also, the brand
  list removed a second channel that had the same name, so it vanished from
  the sidebar.

## Requirements (EARS)

T4-01, registry overlay (`studio/lib/channels-registry.js`)
- R1: WHEN the repo read succeeds, THE OVERLAY SHALL reuse it for 60 s.
- R2: WHEN a refresh fails, THE OVERLAY SHALL serve the last good copy and
  log a warning.
- R3: THE OVERLAY SHALL never cache a failure. After a 15 s backoff, the next
  call retries.
- R4: IF the repo returns an empty channel list, THE OVERLAY SHALL treat it as
  a failed read.
- R5: IF no good copy was ever loaded, THE OVERLAY SHALL use the Neon feed
  mirror (`channels.feed_entry`). If that is also empty, it SHALL return the
  degraded marker (null).
- R6: Concurrent callers SHALL share one in-flight read.
- R8: WHILE degraded, `readRegistry` SHALL flag each entry `overlayDegraded`,
  keep the DB values, and return `overlayDegraded: true`.
- R9: WHILE degraded, `registryChannels` SHALL keep listing channels that are
  not parked, so Resume and the run buttons keep working.
- R10–R11: THE DB → repo SYNC SHALL never write `active: false`, drop `cron`,
  blank the key name or write `overlayDegraded` because of a degraded read.
  New channels keep their DB values.
- R13: THE SYNC SHALL always rebuild from a fresh repo read, never from the
  overlay memo.
- R14: THE DB-down repo fallback in `upsertChannel` SHALL keep the same
  engine flags.

T4-02, edit prefill and save (`studio/lib/edit-prefill.mjs`, wizard page,
profile route)
- E1: WHEN an existing channel is edited, THE FORM SHALL show what the engine
  uses, in the same order as `lib/brand-resolve.mjs`: the registry entry, then
  its kit, then the brand kit, then the wizard default. The fields are slots,
  voice, accent, doc day, name, niche, eyebrow, tagline, description, tags and
  pillars.
- E4–E7: WHEN an edit is saved, THE PAGE SHALL send only the fields that
  changed. A field the owner emptied goes out with `clear: [...]`. One changed
  destination sends the whole destinations block.
- E8–E10: IF the profile route gets an empty slots, tags, description,
  eyebrow, tagline, pillars or niche value for a channel that has one, it
  SHALL keep the stored value and report it in `kept`. The exception is a
  field listed in `clear`. The create flow and `thumbTemplates: []`
  ("automatic") are unchanged.

T4-18, key status
- K1: WHEN the key is saved but no name is recorded, THE CHIP SHALL say "key
  saved" and show `YT_TOKEN_<SLUG>`.
- K2: WHILE the registry read is degraded, THE CHIP SHALL say "status
  unknown", never "re-connect".
- K3: A real missing key SHALL still be shown.
- K4/K5: THE connected list, the Connect step and the Review "Key" row SHALL
  all use the same status.

T4-11, duplicate names
- D1: THE brand list SHALL de-dupe by slug only.
- D2/D3: WHEN the typed name matches another channel's name (case and outer
  spaces ignored), THE IDENTITY STEP SHALL show a warning. A channel never
  clashes with itself.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1–R6 | memo: reuse, stale on fail, backoff + retry, empty = fail, cold start, shared read | automated | `node --test tests/registry-overlay-degraded.test.mjs` |
| 2 | R7–R9 | feed mirror parse; degraded flags; live list keeps un-parked | automated | same |
| 3 | R10–R11 | degraded entries synced into a copy of the engine file: no `active: false`, cron and key name kept, no flag | automated | same |
| 4 | R12–R15 | wiring pins: fresh read in the sync, guard in the fallback | automated | same |
| 5 | — | existing overlay + sync guard still hold | automated | `node --test tests/registry-overlay.test.mjs tests/channels-registry.test.mjs` |
| 6 | E1–E3 | prefill = the real engine merge for QQ, MR and a wizard channel | automated | `node --test tests/edit-prefill.test.mjs` |
| 7 | E4–E10 | changed-only payload; server keeps filled fields; explicit clear honoured | automated | same |
| 8 | K1–K4 | key status and the Review row | automated | same |
| 9 | D1–D3, K5, P1–P4 | brand list, clash finder, wiring pins | automated | `node --test tests/wave-a2.test.mjs` |
| 10 | E1 | Open Channels → Quote Quarry → Edit setup. Schedule shows 22:35 UTC; tags and voice are filled. | manual | prod, after deploy |
| 11 | E4 | On that edit, change nothing and press "Save, keep paused". Then reload Edit setup. Nothing changed, and the engine file has no new commit for QQ fields. | manual | prod + `git log -p yt-mcp/studio-channels.json` |
| 12 | K1 | Add channel page → Connected list. All four real channels show a green "key saved" with `YT_TOKEN_…`. | manual | prod |
| 13 | D3 | Add channel → Identity. Type "quote quarry". A warning appears under the name. | manual | prod |
| 14 | R2 | Look in the Vercel logs for `repo overlay refresh failed`. The next request still shows the channels as active. | manual | Vercel logs, during a GitHub hiccup |

## Plain-English QA

1. Open a real channel's setup ("Edit setup"). The times, tags, voice and
   pillars should match what the channel really posts with. Nothing should be
   blank that isn't blank in real life.
2. Press Save without changing anything. Nothing on the channel changes.
3. Change one thing, like a tag, and save. Only that thing changes.
4. Empty a field on purpose and save. That field is cleared, because you
   asked for it.
5. In the connected list, every real channel shows "key saved". None says
   "re-connect" unless its key is really missing.
6. If GitHub has a bad minute, the channels stay on and keep their start
   times. If Studio truly can't tell, the key chip says "status unknown".
7. Type the name of a channel you already have. A warning tells you the name
   is taken.
