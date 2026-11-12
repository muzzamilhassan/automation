// T4a (#106 Phase 4.5, round 1) — registry-driven scheduling. channel-autopilot.yml
// fires ONE 30-minute heartbeat ('5,35 * * * *' — off GitHub's worst
// top-of-hour minute); the discover step slot-gates the registry: a channel
// runs only when the current UTC time is inside the 30 minutes after its
// scheduled time (entry.cron / kit.gateCron). Gate math + discovery selection
// live in lib/schedule-slot.mjs (imported by the workflow's inline node
// script). The gate cron is durable in kit.gateCron (Neon row + repo feed):
// a DB->repo registry sync (connect / profile save / importer) projects kit
// but not cron, so a repo-file-only cron would be wiped. Studio's schedule
// route re-derives entry.cron from the channel's SHORT slots on every save
// (cronFromSlots in studio/lib/schedule-projection.js, written repo-side via
// setChannelCron). Route/registry wiring is pinned by SOURCE SCAN — the house
// pattern for '@/lib'-alias route files (tests/schedule-quota-route.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as yaml from 'js-yaml';

import {
  SCHEDULER_CRON,
  LEGACY_FALLBACK_CRON,
  SLOT_WINDOW_MINUTES,
  parseDailyCron,
  gateOpensAt,
  inSlotWindow,
  cronMatchesSlot,
  toDiscoverChannels,
  selectChannelsForSlot,
  selectChannelsDueOrMissed,
} from '../lib/schedule-slot.mjs';
import { parseHHMM, cronFromSlots } from '../studio/lib/schedule-projection.js';

const at = (h, m) => new Date(Date.UTC(2026, 10, 1, h, m));
const FIRE_MINUTES = [5, 35]; // the heartbeat's minute offsets — 30-min spacing is what exactly-once needs

// ---------- the gate math (pure) ----------

test('design constants: one 30-minute heartbeat off the hour, 30-minute gate, legacy catch-all preserved', () => {
  assert.equal(SCHEDULER_CRON, '5,35 * * * *', 'heartbeat at :05/:35 — NOT GitHub\'s worst top-of-hour minute');
  assert.equal(SLOT_WINDOW_MINUTES, 30, 'the gate window equals the heartbeat spacing');
  assert.equal(LEGACY_FALLBACK_CRON, '33 2 * * *', 'wizard catch-all slot is the no-cron default');
});

test('parseDailyCron: accepts the simple daily "M H * * *" form the registry uses', () => {
  assert.deepEqual(parseDailyCron('21 3 * * *'), { minute: 21, hour: 3 });
  assert.deepEqual(parseDailyCron('13 2 * * *'), { minute: 13, hour: 2 });
  assert.deepEqual(parseDailyCron(' 33 2 * * * '), { minute: 33, hour: 2 }, 'surrounding whitespace tolerated');
});

test('parseDailyCron: non-daily, out-of-range and junk forms return null', () => {
  assert.equal(parseDailyCron('*/30 * * * *'), null, 'step minutes are not the daily form');
  assert.equal(parseDailyCron('5,35 * * * *'), null, 'minute lists are not the daily form');
  assert.equal(parseDailyCron('0 12 * * 1'), null, 'day-of-week form is not the daily form');
  assert.equal(parseDailyCron('0 12 1 * *'), null, 'day-of-month form is not the daily form');
  assert.equal(parseDailyCron('60 3 * * *'), null, 'minute out of range');
  assert.equal(parseDailyCron('21 24 * * *'), null, 'hour out of range');
  assert.equal(parseDailyCron(''), null);
  assert.equal(parseDailyCron(null), null);
  assert.equal(parseDailyCron('daily at noon'), null);
});

test('inSlotWindow: exact window [opensAt, opensAt + 30)', () => {
  const opens = 3 * 60 + 21; // 03:21
  assert.equal(inSlotWindow(3 * 60 + 21, opens), true, 'window start selects');
  assert.equal(inSlotWindow(3 * 60 + 50, opens), true, '29 minutes in still selects');
  assert.equal(inSlotWindow(3 * 60 + 51, opens), false, '30 minutes in belongs to the next window');
  assert.equal(inSlotWindow(3 * 60 + 20, opens), false, 'before the window does not select');
});

test('inSlotWindow: a window past midnight wraps modulo 1440', () => {
  const opens = 23 * 60 + 51; // 23:51 -> [23:51, 24:21) = 23:51-00:00 + 00:00-00:21
  assert.equal(inSlotWindow(23 * 60 + 51, opens), true);
  assert.equal(inSlotWindow(0, opens), true, 'midnight is inside the wrapped window');
  assert.equal(inSlotWindow(20, opens), true, '00:20 still inside');
  assert.equal(inSlotWindow(21, opens), false, '00:21 is the next window');
  assert.equal(gateOpensAt('51 23 * * *'), opens, 'gateOpensAt converts to minute-of-day');
});

test('cronMatchesSlot: cron "21 3 * * *" selects in [03:21, 03:51) UTC', () => {
  assert.equal(cronMatchesSlot('21 3 * * *', at(3, 20)), false);
  assert.equal(cronMatchesSlot('21 3 * * *', at(3, 21)), true);
  assert.equal(cronMatchesSlot('21 3 * * *', at(3, 50)), true);
  assert.equal(cronMatchesSlot('21 3 * * *', at(3, 51)), false);
  assert.equal(cronMatchesSlot('21 3 * * *', at(4, 21)), false, 'a later hour never selects');
});

test('cronMatchesSlot: missing or non-daily cron defaults to the legacy 33 2 slot', () => {
  for (const cron of [undefined, null, '', 'junk', '*/30 * * * *', '0 12 * * 1']) {
    assert.equal(cronMatchesSlot(cron, at(2, 45)), true, `fallback gates [02:33, 03:03): ${JSON.stringify(cron)}`);
    assert.equal(cronMatchesSlot(cron, at(3, 3)), false, `outside the fallback window: ${JSON.stringify(cron)}`);
  }
});

// ---------- discovery selection ----------

test('toDiscoverChannels: engine mapping — filters, envSlug, effective cron', () => {
  const chans = toDiscoverChannels([
    { slug: 'quote-quarry', autopilot: true, active: true, tokenSecretSaved: true, cron: '13 2 * * *' },
    { slug: 'paused', autopilot: false },
    { slug: 'inactive', active: false },
    { slug: 'no-token', tokenSecretSaved: false },
    { slug: 'wizard-channel' },
  ]);
  assert.deepEqual(chans, [
    { slug: 'quote-quarry', envSlug: 'QUOTE_QUARRY', cron: '13 2 * * *' },
    { slug: 'wizard-channel', envSlug: 'WIZARD_CHANNEL', cron: LEGACY_FALLBACK_CRON },
  ]);
  assert.deepEqual(toDiscoverChannels(null), [], 'null registry yields no channels');
});

test('toDiscoverChannels: kit.gateCron is the durable fallback when the projection drops cron', () => {
  // the exact wipe scenario: every connect/profile-save/importer runs
  // upsertChannel -> syncRegistryRepo, rewriting the repo feed from rowToEntry
  // DB projections that carry kit but NOT cron — the gate time must survive.
  const dbProjected = { slug: 'money-rulebook', label: 'Money Rulebook', kit: { gateCron: '21 3 * * *' }, autopilot: true, active: true };
  const [ch] = toDiscoverChannels([dbProjected]);
  assert.equal(ch.cron, '21 3 * * *', 'discover reads c.cron || c.kit?.gateCron || legacy fallback');
  // a junk gateCron maps through, but the gate math still validates: it can
  // only select inside the legacy fallback window, never an invented time.
  const junk = toDiscoverChannels([{ slug: 'x', kit: { gateCron: 'junk' } }])[0];
  assert.equal(cronMatchesSlot(junk.cron, at(14, 20)), false, 'junk gateCron never opens an arbitrary window');
  assert.equal(cronMatchesSlot(junk.cron, at(2, 45)), true, 'junk gateCron gates on the legacy 02:33 window');
});

test('MIGRATION (unit): the 4 legacy hand-tuned crons each land on exactly one fire instant', () => {
  const expected = {
    '13 2 * * *': ['2:35'], // window [02:13, 02:43) contains only the 02:35 heartbeat
    '47 2 * * *': ['3:5'], // window [02:47, 03:17) contains only the 03:05 heartbeat
    '21 3 * * *': ['3:35'], // window [03:21, 03:51) contains only the 03:35 heartbeat
    '53 3 * * *': ['4:5'], // window [03:53, 04:23) contains only the 04:05 heartbeat
  };
  for (const [cron, want] of Object.entries(expected)) {
    const hits = [];
    for (let h = 0; h < 24; h++) {
      for (const m of FIRE_MINUTES) {
        if (cronMatchesSlot(cron, at(h, m))) hits.push(`${h}:${m}`);
      }
    }
    assert.deepEqual(hits, want, `${cron} must be selected by exactly one 30-min slot per day`);
  }
});

test('SWEEP: all 1440 daily crons x 48 heartbeats — exactly-once holds (the half-open window is load-bearing)', () => {
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m++) {
      const cron = `${m} ${h} * * *`;
      let picks = 0;
      for (let fh = 0; fh < 24; fh++) {
        for (const fm of FIRE_MINUTES) {
          if (cronMatchesSlot(cron, at(fh, fm))) picks++;
        }
      }
      assert.equal(picks, 1, `${cron} was picked by ${picks} heartbeats`);
    }
  }
});

test('MIGRATION (registry): every live channel is selected by exactly one fire instant per day', () => {
  const reg = JSON.parse(fs.readFileSync('yt-mcp/studio-channels.json', 'utf8'));
  const chans = toDiscoverChannels(reg.channels);
  assert.ok(chans.length >= 1, 'the active channel(s) must still be discovered (MR-only mode: the paused three are filtered by design)');
  const picks = Object.fromEntries(chans.map((c) => [c.slug, []]));
  for (let h = 0; h < 24; h++) {
    for (const m of FIRE_MINUTES) {
      const now = at(h, m);
      for (const sel of selectChannelsForSlot(chans, now)) picks[sel.slug].push(`${h}:${m}`);
    }
  }
  for (const [slug, fireList] of Object.entries(picks)) {
    const cron = chans.find((c) => c.slug === slug).cron;
    assert.equal(fireList.length, 1, `${slug} (cron ${cron}) must run exactly once a day, got: ${fireList.join(', ') || 'never'}`);
  }
});

test('selectChannelsForSlot: the heartbeat instant picks every channel whose window is open', () => {
  const chans = [
    { slug: 'a', cron: '21 3 * * *' },
    { slug: 'b', cron: '47 2 * * *' },
    { slug: 'c', cron: '' }, // legacy fallback window [02:33, 03:03)
  ];
  assert.deepEqual(selectChannelsForSlot(chans, at(3, 30)).map((c) => c.slug), ['a']);
  assert.deepEqual(selectChannelsForSlot(chans, at(3, 0)).map((c) => c.slug), ['b', 'c'], '02:47 and the 02:33 catch-all share the 03:05 heartbeat');
  assert.deepEqual(selectChannelsForSlot(chans, at(12, 0)), [], 'no channel runs outside every window');
});

// ---------- Studio: slot times -> registry cron ----------

test('parseHHMM: strict HH:MM (UTC) parse with range checks', () => {
  assert.deepEqual(parseHHMM('22:35'), { hour: 22, minute: 35 });
  assert.deepEqual(parseHHMM('00:05'), { hour: 0, minute: 5 });
  assert.equal(parseHHMM('22:5'), null, 'minutes need two digits');
  assert.equal(parseHHMM('24:00'), null, 'hour out of range');
  assert.equal(parseHHMM('22:60'), null, 'minute out of range');
  assert.equal(parseHHMM(''), null);
  assert.equal(parseHHMM(null), null);
  assert.equal(parseHHMM('tomorrow'), null);
});

test('cronFromSlots: derives from the FIRST valid SHORT slot; no/invalid slots -> null (cron keeps)', () => {
  assert.equal(cronFromSlots(['22:35', '01:10']), '35 22 * * *', "first short slot -> 'M H * * *'");
  assert.equal(cronFromSlots(['nope', '01:10']), '10 1 * * *', 'a junk first slot is skipped, not fatal');
  assert.equal(cronFromSlots([]), null, 'no short slots -> null (route keeps the existing cron)');
  assert.equal(cronFromSlots(undefined), null);
  assert.equal(cronFromSlots(['25:00']), null, 'invalid HH:MM never becomes a cron');
});

// ---------- registry durability (T4a round 1, CRITICAL 1) ----------

test('registry: applyGateCronToChannels — target gets cron + kit.gateCron; every daily-cron entry backfills', async () => {
  const { applyGateCronToChannels } = await import('../studio/lib/channels-registry.js');
  const reg = [
    { slug: 'money-rulebook', cron: '21 3 * * *', kit: { longSlot: '22:30', niches: ['x'] } },
    { slug: 'quotequarry', cron: '13 2 * * *' },
    { slug: 'wizard-channel', kit: {} }, // no cron — nothing to backfill
  ];
  const { channels, found } = applyGateCronToChannels(reg, 'money-rulebook', '35 3 * * *');
  assert.equal(found, true, 'the target slug must be present');
  const mr = channels.find((c) => c.slug === 'money-rulebook');
  assert.equal(mr.cron, '35 3 * * *', 'engine-facing top-level cron updated');
  assert.equal(mr.kit.gateCron, '35 3 * * *', 'durable kit mirror updated');
  assert.equal(mr.kit.longSlot, '22:30', 'existing kit fields survive');
  const qq = channels.find((c) => c.slug === 'quotequarry');
  assert.equal(qq.cron, '13 2 * * *', 'backfill keeps the engine cron');
  assert.equal(qq.kit.gateCron, '13 2 * * *', 'backfill mirrors it into kit — the next DB->repo sync can no longer wipe it');
  assert.equal(channels.find((c) => c.slug === 'wizard-channel').kit.gateCron, undefined, 'no daily cron -> no backfill');
});

test('registry: applyGateCronToChannels — slug missing from the repo registry reports not-found', async () => {
  const { applyGateCronToChannels } = await import('../studio/lib/channels-registry.js');
  const { channels, found } = applyGateCronToChannels([{ slug: 'a', cron: '13 2 * * *' }], 'ghost', '35 3 * * *');
  assert.equal(found, false, 'setChannelCron skips the write for ghost slugs');
  assert.equal(channels[0].cron, '13 2 * * *', 'the ghost target is absent, so no cron rewrite happened');
  assert.equal(channels.find((c) => c.slug === 'a').kit.gateCron, '13 2 * * *', 'the pure mapper still backfills (harmless — nothing persists it)');
});

const registrySrc = fs.readFileSync('studio/lib/channels-registry.js', 'utf8');

test('registry: setChannelCron persists the gate cron durably — kit.gateCron in the Neon row AND the repo feed', () => {
  assert.match(registrySrc, /UPDATE channels SET kit = \$\{db\.json\(kit\)\} WHERE slug = \$\{slug\}/,
    'the Neon kit jsonb is the durable home (rowToEntry projects kit, not cron)');
  assert.match(registrySrc, /gateCron: cron/, 'the DB kit merge must write gateCron');
  assert.match(registrySrc, /applyGateCronToChannels\(/, 'the repo feed must go through the backfilling mapper');
});

// ---------- Studio route wiring (source scan — the house route-test pattern) ----------

const routeSrc = fs.readFileSync('studio/app/api/channels/schedule/route.js', 'utf8');

test('route: cron re-derivation is wired — cronFromSlots + setChannelCron imported and called', () => {
  assert.match(routeSrc, /cronFromSlots/, 'route must import cronFromSlots from schedule-projection');
  assert.match(routeSrc, /cronFromSlots\(/, 'route must CALL cronFromSlots');
  assert.match(routeSrc, /setChannelCron/, 'route must import setChannelCron from channels-registry');
  assert.match(routeSrc, /await setChannelCron\(/, 'route must CALL setChannelCron');
});

test('route: cron sync happens AFTER the cadence save, on the POST path only once', () => {
  const cadenceWrite = routeSrc.indexOf('await writeRepoJSON(FILE');
  const cronSync = routeSrc.indexOf('await setChannelCron(');
  assert.ok(cadenceWrite > -1, 'cadence save must stay');
  assert.ok(cronSync > cadenceWrite, 'the registry cron write must follow the cadence save');
  const calls = routeSrc.match(/await setChannelCron\(/g) || [];
  assert.equal(calls.length, 1, 'exactly one cron sync per save');
});

test('route: cron sync is fail-soft — a sync failure warns, never 500s the save', () => {
  const guarded = /try \{[\s\S]{0,400}await setChannelCron\([\s\S]{0,800}\} catch \(e\) \{[\s\S]{0,300}cron sync failed/i;
  assert.ok(guarded.test(routeSrc), 'setChannelCron must sit in catch-to-warning (same belt as the quota store)');
});

test('route: gate cron derives from SHORT slots only — the longSlot fallback is removed (IMPORTANT 2)', () => {
  assert.match(routeSrc, /cronFromSlots\(entry\.slots\)/, 'single-argument call (guarded by the slots-length ternary) — slots only, no second (documentary-slot) source');
  assert.equal(routeSrc.includes('kit?.longSlot'), false, 'legacy channels have no slots, only kit.longSlot — a fallback would silently re-time their hand-tuned 02:13-03:53 gates to the documentary slot\'s afternoon peak');
  assert.match(routeSrc, /entry\?\.slots\?\.length/, 'the rewrite is gated on entry.slots?.length — no slots = KEEP the existing cron');
});

test('route: the response carries the derived gate time, with old->new when it changed (minors 2/7)', () => {
  assert.match(routeSrc, /Gate time set to/, "the owner must see the gate time without reading the repo ('Gate time set to HH:MM UTC')");
  assert.match(routeSrc, /\(was \$\{oldCron\}\)/, 'a changed cron must carry the old->new values in the response');
  assert.match(routeSrc, /entry\?\.cron \|\| entry\?\.kit\?\.gateCron/, 'the previous gate time is read from the durable pair');
});

// ---------- the workflow discover step runs the module end-to-end ----------

const WF = '.github/workflows/channel-autopilot.yml';

function discoverRunBlock() {
  const doc = yaml.load(fs.readFileSync(WF, 'utf8'));
  const step = doc.jobs.discover.steps.find((s) => s.id === 'disc');
  assert.ok(step, 'discover step with id "disc" must exist');
  return step.run;
}

function discoverScript() {
  const run = discoverRunBlock();
  const m = /node --input-type=module -e "([\s\S]*)"\s*$/.exec(run);
  assert.ok(m, 'discover step must invoke: node --input-type=module -e "<script>"');
  return m[1];
}

function readGithubOutput(file) {
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith('channels='));
  assert.ok(line, 'GITHUB_OUTPUT must carry channels=<json>');
  return JSON.parse(line.slice('channels='.length));
}

test('discover script (extracted from the workflow): single-slug dispatch input selects one channel', (t) => {
  const out = path.join(os.tmpdir(), `disc-slug-${process.pid}-${Date.now()}.txt`);
  t.after(() => fs.rmSync(out, { force: true }));
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', discoverScript()], {
    cwd: process.cwd(),
    env: { ...process.env, INPUT_CHANNEL: 'money-rulebook', EVENT_SCHEDULE: '', GITHUB_OUTPUT: out },
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.equal(r.status, 0, `discover script must exit 0\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  const channels = readGithubOutput(out);
  assert.equal(channels.length, 1);
  assert.equal(channels[0].slug, 'money-rulebook');
  assert.equal(channels[0].envSlug, 'MONEY_RULEBOOK');
});

test('discover script (extracted from the workflow): schedule event slot-gates via the module', (t) => {
  const out = path.join(os.tmpdir(), `disc-slot-${process.pid}-${Date.now()}.txt`);
  t.after(() => fs.rmSync(out, { force: true }));
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', discoverScript()], {
    cwd: process.cwd(),
    env: { ...process.env, INPUT_CHANNEL: '', EVENT_SCHEDULE: SCHEDULER_CRON, GITHUB_OUTPUT: out },
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.equal(r.status, 0, `discover script must exit 0\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  const channels = readGithubOutput(out);
  const now = new Date();
  for (const c of channels) {
    assert.ok(cronMatchesSlot(c.cron, now), `${c.slug} (cron ${c.cron}) must be inside its gate window at the run time`);
  }
});

// ---------- catch-up gating (selectChannelsDueOrMissed) ----------

test('selectChannelsDueOrMissed: in-slot always selects even if already posted today', () => {
  const chans = [{ slug: 'mr', cron: '21 3 * * *' }];
  const states = { mr: { lastRunDate: '2026-11-01', clipLastPostDate: '2026-11-01', healedDate: '2026-11-01' } };
  assert.deepEqual(selectChannelsDueOrMissed(chans, states, at(3, 35)).map((c) => c.slug), ['mr']);
});

test('selectChannelsDueOrMissed: catch-up selects missed channel within catchUpMinutes when not posted today', () => {
  const chans = [
    { slug: 'missed', cron: '21 3 * * *' },       // 03:21 -> catch-up [03:21, 07:21)
    { slug: 'ran', cron: '13 2 * * *' },          // 02:13 -> catch-up [02:13, 06:13), posted via lastRunDate
    { slug: 'clipped', cron: '47 2 * * *' },      // 02:47 -> catch-up [02:47, 06:47), posted via clipLastPostDate
    { slug: 'healed', cron: '53 3 * * *' },       // 03:53 -> catch-up [03:53, 07:53), posted via healedDate
    { slug: 'too-late', cron: '0 0 * * *' },      // 00:00 -> catch-up [00:00, 04:00), expired by 05:05
  ];
  const states = {
    missed: { lastRunDate: '2026-10-31' },
    ran: { lastRunDate: '2026-11-01' },
    clipped: { clipLastPostDate: '2026-11-01' },
    healed: { healedDate: '2026-11-01' },
    'too-late': {},
  };
  assert.deepEqual(selectChannelsDueOrMissed(chans, states, at(5, 5)).map((c) => c.slug), ['missed']);
});

test('selectChannelsDueOrMissed: catch-up window wraps modulo 1440 past midnight and honors boundary', () => {
  const chans = [{ slug: 'late', cron: '51 23 * * *' }]; // 23:51 -> 240 min ends at 03:51 UTC
  const states = { late: { lastRunDate: '2026-11-01' } }; // posted yesterday (Nov 1) — on Nov 2 it is unposted
  const nov2 = (h, m) => new Date(Date.UTC(2026, 10, 2, h, m));
  assert.deepEqual(selectChannelsDueOrMissed(chans, states, nov2(3, 50)).map((c) => c.slug), ['late'], '1 min before catch-up end selects');
  assert.deepEqual(selectChannelsDueOrMissed(chans, states, nov2(3, 51)), [], 'exact catch-up boundary is excluded');
  assert.deepEqual(selectChannelsDueOrMissed(chans, { late: { lastRunDate: '2026-11-02' } }, nov2(3, 50)), [], 'already ran today UTC is excluded');
});
