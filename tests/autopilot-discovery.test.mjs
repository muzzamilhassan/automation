// Workflow-side pins for the autopilot discovery: the ONE 30-minute scheduler
// cron (T4a — the static per-channel cron list is retired; per-channel times
// live in the registry, yt-mcp/studio-channels.json, and the discover step
// slot-gates via lib/schedule-slot.mjs), plus the channel mapping the
// discover step and the warning-probe matrix share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as yaml from 'js-yaml';
import { SCHEDULER_CRON, toDiscoverChannels } from '../lib/schedule-slot.mjs';

const WF = '.github/workflows/channel-autopilot.yml';

test('toDiscoverChannels: preserves the legacy channels and their envSlug mapping', () => {
  const reg = JSON.parse(fs.readFileSync('yt-mcp/studio-channels.json', 'utf8'));
  const bySlug = Object.fromEntries(toDiscoverChannels(reg.channels).map((c) => [c.slug, c]));
  assert.equal(bySlug.quotequarry.envSlug, 'QUOTEQUARRY');
  assert.equal(bySlug['investors-compass'].envSlug, 'INVESTORS_COMPASS');
  assert.equal(bySlug['money-rulebook'].envSlug, 'MONEY_RULEBOOK');
  assert.equal(bySlug['debt-free-doctrine'].envSlug, 'DEBT_FREE_DOCTRINE');
});

test('toDiscoverChannels: paused/inactive/tokenless channels are excluded; cron falls back to the catch-all', () => {
  const chans = toDiscoverChannels([
    { slug: 'live', autopilot: true, active: true, tokenSecretSaved: true, cron: '13 2 * * *' },
    { slug: 'paused', autopilot: false },
    { slug: 'inactive', active: false },
    { slug: 'no-token', tokenSecretSaved: false },
    { slug: 'wizard-channel' },
  ]);
  assert.deepEqual(chans.map((c) => c.slug), ['live', 'wizard-channel']);
  assert.equal(chans.find((c) => c.slug === 'wizard-channel').cron, '33 2 * * *');
});

test('single slug override: the discover target filter picks exactly the requested channel', () => {
  const reg = JSON.parse(fs.readFileSync('yt-mcp/studio-channels.json', 'utf8'));
  const all = toDiscoverChannels(reg.channels);
  const target = all.filter((c) => c.slug === 'money-rulebook');
  assert.equal(target.length, 1);
  assert.equal(target[0].slug, 'money-rulebook');
});

test('channel-autopilot.yml: ONE 30-minute scheduler cron; per-channel times live in the registry (T4a)', () => {
  const raw = fs.readFileSync(WF, 'utf8');
  const cronLines = raw.split(/\r?\n/).filter((l) => /^\s*-\s*cron:/.test(l));
  assert.equal(cronLines.length, 1, `the static per-channel cron list is retired; found:\n${cronLines.join('\n')}`);
  assert.ok(cronLines[0].includes(SCHEDULER_CRON), `the single cron must be the 30-minute scheduler (${SCHEDULER_CRON}): ${cronLines[0]}`);
  assert.match(raw, /yt-mcp\/studio-channels\.json/, 'a comment must point at the registry as the per-channel schedule home');
  assert.match(raw, /Admin Panel/i, 'the comment must say the registry is editable from the Admin Panel');
});

test('discover step wires the slot-gating module by file path (T4a)', () => {
  const raw = fs.readFileSync(WF, 'utf8');
  assert.match(raw, /lib\/schedule-slot\.mjs/, 'the discover script must import lib/schedule-slot.mjs');
  assert.match(raw, /selectChannelsForSlot\(/, 'the schedule branch must gate through selectChannelsForSlot');
  assert.match(raw, /EVENT_SCHEDULE/, 'the schedule-event env wiring must stay');
  assert.match(raw, /INPUT_CHANNEL/, 'the workflow_dispatch input wiring must stay');
});

test('warning-probe keeps its own nightly cron (not slot-gated, untouched by T4a)', () => {
  const raw = fs.readFileSync('.github/workflows/warning-probe.yml', 'utf8');
  assert.match(raw, /cron: '41 5 \* \* \*'/);
});

test('composite actions exist and parse as valid YAML', () => {
  const renderAction = yaml.load(fs.readFileSync('.github/actions/setup-render/action.yml', 'utf8'));
  assert.equal(renderAction.name, 'Setup Render');
  assert.equal(renderAction.runs.using, 'composite');
  assert.ok(renderAction.runs.steps.length >= 3);

  const ffmpegAction = yaml.load(fs.readFileSync('.github/actions/setup-ffmpeg/action.yml', 'utf8'));
  assert.equal(ffmpegAction.name, 'Setup FFmpeg');
  assert.equal(ffmpegAction.runs.using, 'composite');
  assert.ok(ffmpegAction.runs.steps.length >= 2);
});
