// T4a (#106 Phase 4.5) — registry-driven scheduling. channel-autopilot.yml
// fires ONE cron every 30 minutes; the discover step slot-gates the registry:
// a channel runs only when the current UTC time is inside the 30 minutes
// after its scheduled time (entry.cron). Gate math + discovery selection live
// in lib/schedule-slot.mjs (imported by the workflow's inline node script);
// Studio's schedule route re-derives entry.cron from the channel's slot times
// on every save (cronFromSlots in studio/lib/schedule-projection.js, written
// repo-side via setChannelCron — the house route-test pattern is source scan,
// see tests/schedule-quota-route.test.mjs for why).
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
} from '../lib/schedule-slot.mjs';
import { parseHHMM, cronFromSlots } from '../studio/lib/schedule-projection.js';

const at = (h, m) => new Date(Date.UTC(2026, 10, 1, h, m));

// ---------- the gate math (pure) ----------

test('design constants: one 30-minute scheduler, 30-minute gate, legacy catch-all preserved', () => {
  assert.equal(SCHEDULER_CRON, '*/30 * * * *');
  assert.equal(SLOT_WINDOW_MINUTES, 30, 'the gate window equals the scheduler frequency');
  assert.equal(LEGACY_FALLBACK_CRON, '33 2 * * *', 'wizard catch-all slot is the no-cron default');
});

test('parseDailyCron: accepts the simple daily "M H * * *" form the registry uses', () => {
  assert.deepEqual(parseDailyCron('21 3 * * *'), { minute: 21, hour: 3 });
  assert.deepEqual(parseDailyCron('13 2 * * *'), { minute: 13, hour: 2 });
  assert.deepEqual(parseDailyCron(' 33 2 * * * '), { minute: 33, hour: 2 }, 'surrounding whitespace tolerated');
});

test('parseDailyCron: non-daily, out-of-range and junk forms return null', () => {
  assert.equal(parseDailyCron('*/30 * * * *'), null, 'step minutes are not the daily form');
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

test('toDiscoverChannels: engine mapping — filters, envSlug, cron fallback', () => {
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

test('MIGRATION (unit): the 4 legacy hand-tuned crons each land on exactly one fire instant', () => {
  const expected = {
    '13 2 * * *': ['2:30'], // window [02:13, 02:43) contains only the 02:30 heartbeat
    '47 2 * * *': ['3:0'], // window [02:47, 03:17) contains only the 03:00 heartbeat
    '21 3 * * *': ['3:30'], // window [03:21, 03:51) contains only the 03:30 heartbeat
    '53 3 * * *': ['4:0'], // window [03:53, 04:23) contains only the 04:00 heartbeat
  };
  for (const [cron, want] of Object.entries(expected)) {
    const hits = [];
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        if (cronMatchesSlot(cron, at(h, m))) hits.push(`${h}:${m}`);
      }
    }
    assert.deepEqual(hits, want, `${cron} must be selected by exactly one 30-min slot per day`);
  }
});

test('MIGRATION (registry): every live channel is selected by exactly one fire instant per day', () => {
  const reg = JSON.parse(fs.readFileSync('yt-mcp/studio-channels.json', 'utf8'));
  const chans = toDiscoverChannels(reg.channels);
  assert.ok(chans.length >= 4, 'the four legacy channels must still be discovered');
  const picks = Object.fromEntries(chans.map((c) => [c.slug, []]));
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
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
  assert.deepEqual(selectChannelsForSlot(chans, at(3, 0)).map((c) => c.slug), ['b', 'c'], '02:47 and the 02:33 catch-all share the 03:00 heartbeat');
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

test('cronFromSlots: FIRST short slot wins, longSlot is the fallback, junk yields null', () => {
  assert.equal(cronFromSlots(['22:35', '01:10'], '14:30'), '35 22 * * *', "first short slot -> 'M H * * *'");
  assert.equal(cronFromSlots(['nope', '01:10'], '14:30'), '10 1 * * *', 'a junk first slot is skipped, not fatal');
  assert.equal(cronFromSlots([], '14:30'), '30 14 * * *', 'no short slots -> longSlot');
  assert.equal(cronFromSlots(undefined, '14:30'), '30 14 * * *');
  assert.equal(cronFromSlots([], ''), null, 'no valid time -> null (route leaves the existing cron)');
  assert.equal(cronFromSlots(['25:00'], ''), null, 'invalid HH:MM never becomes a cron');
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
  const guarded = /try \{[\s\S]{0,400}await setChannelCron\([\s\S]{0,400}\} catch \(e\) \{[\s\S]{0,300}cron sync failed/i;
  assert.ok(guarded.test(routeSrc), 'setChannelCron must sit in catch-to-warning (same belt as the quota store)');
  assert.match(routeSrc, /cronWarning/, 'the warning must reach the response warnings array');
});

test('route: slot times come from the registry entry (first short slot / longSlot), re-derived on save', () => {
  assert.match(routeSrc, /readRegistry\(\)/, 'the route must read the registry (DB-first, repo sync) for slots/longSlot');
  assert.match(routeSrc, /entry\?\.slots/, 'first short slot source');
  assert.match(routeSrc, /longSlot/, 'longSlot fallback source');
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
    env: { ...process.env, INPUT_CHANNEL: 'quotequarry', EVENT_SCHEDULE: '', GITHUB_OUTPUT: out },
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.equal(r.status, 0, `discover script must exit 0\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  const channels = readGithubOutput(out);
  assert.equal(channels.length, 1);
  assert.equal(channels[0].slug, 'quotequarry');
  assert.equal(channels[0].envSlug, 'QUOTEQUARRY');
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
