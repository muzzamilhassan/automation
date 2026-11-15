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
  const discovered = toDiscoverChannels(reg.channels);
  const bySlug = Object.fromEntries(discovered.map((c) => [c.slug, c]));
  assert.equal(bySlug['quotequarry']?.envSlug, 'QUOTEQUARRY');
  assert.equal(bySlug['investors-compass']?.envSlug, 'INVESTORS_COMPASS');
  assert.equal(bySlug['money-rulebook']?.envSlug, 'MONEY_RULEBOOK');
  assert.equal(bySlug['debt-free-doctrine']?.envSlug, 'DEBT_FREE_DOCTRINE');
  // An inactive/paused channel in a synthetic fixture stays excluded from discovery:
  const pausedFixture = toDiscoverChannels([
    { slug: 'quotequarry', autopilot: true, active: false, tokenSecretSaved: true },
    { slug: 'investors-compass', autopilot: false, active: true, tokenSecretSaved: true },
    { slug: 'money-rulebook', autopilot: true, active: true, tokenSecretSaved: true },
  ]);
  assert.deepEqual(pausedFixture.map((c) => c.slug), ['money-rulebook']);
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

// ---------------------------------------------------------------------------
// External clock (cron-job.org, owner 2026-11-15; audit #10). GitHub's cron
// fires 3-5 of 48 heartbeats/day, so an external service dispatches the
// workflow every 30 min. A BLANK dispatch means "all channels" — every channel
// on every tick — so the clock must send inputs.heartbeat=1, which the
// discover step gates exactly like a scheduled tick. These tests RUN the real
// discover script extracted from the workflow YAML.
// Spec + QA: docs/qa/external-heartbeat-qa.md.
// ---------------------------------------------------------------------------
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { selectChannelsDueOrMissed } from '../lib/schedule-slot.mjs';

function runDiscover(env) {
  const wf = yaml.load(fs.readFileSync(WF, 'utf8'));
  const step = wf.jobs.discover.steps.find((s) => s.id === 'disc');
  const script = step.run.match(/node --input-type=module -e "\n([\s\S]*)\n\s*"\s*$/)[1];
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'disc-')), 'out.txt');
  fs.writeFileSync(out, '');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 30000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GITHUB_OUTPUT: out, ...env },
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(fs.readFileSync(out, 'utf8').replace(/^channels=/, '')).map((c) => c.slug);
}

const NOW = '2030-01-01T03:25:00Z'; // far future: no channel has run "today"
const allSlugs = () => toDiscoverChannels(JSON.parse(fs.readFileSync('yt-mcp/studio-channels.json', 'utf8')).channels).map((c) => c.slug);

test('heartbeat=1 dispatch is slot-gated exactly like the scheduled tick', () => {
  const all = toDiscoverChannels(JSON.parse(fs.readFileSync('yt-mcp/studio-channels.json', 'utf8')).channels);
  const states = Object.fromEntries(all.map((c) => { try { return [c.slug, JSON.parse(fs.readFileSync(`yt-mcp/state/${c.slug}.json`, 'utf8'))]; } catch { return [c.slug, {}]; } }));
  const expected = selectChannelsDueOrMissed(all, states, new Date(NOW)).map((c) => c.slug);
  const viaHeartbeat = runDiscover({ INPUT_HEARTBEAT: '1', DISCOVER_NOW: NOW });
  const viaSchedule = runDiscover({ EVENT_SCHEDULE: '5,35 * * * *', DISCOVER_NOW: NOW });
  assert.deepEqual(viaHeartbeat, expected);
  assert.deepEqual(viaHeartbeat, viaSchedule, 'external tick == GitHub tick');
  assert.ok(viaHeartbeat.length < allSlugs().length, `gating must exclude channels outside their window (got ${viaHeartbeat})`);
});

test('a blank dispatch still means all channels (manual "run everything" unchanged)', () => {
  assert.deepEqual(runDiscover({ DISCOVER_NOW: NOW }), allSlugs());
});

test('channel=<slug> still wins over heartbeat', () => {
  assert.deepEqual(runDiscover({ INPUT_CHANNEL: 'money-rulebook', INPUT_HEARTBEAT: '1', DISCOVER_NOW: NOW }), ['money-rulebook']);
});

test('the workflow declares the heartbeat input and wires it into the discover env', () => {
  const wf = yaml.load(fs.readFileSync(WF, 'utf8'));
  const inputs = (wf.on || wf[true]).workflow_dispatch.inputs;
  assert.ok(inputs.heartbeat, 'heartbeat input declared');
  const step = wf.jobs.discover.steps.find((s) => s.id === 'disc');
  assert.equal(step.env.INPUT_HEARTBEAT, '${{ inputs.heartbeat }}');
});

test('cost: the 48x/day discover job runs on the 1-vCPU ubuntu-slim runner; produce stays on ubuntu-latest', () => {
  const wf = yaml.load(fs.readFileSync(WF, 'utf8'));
  assert.equal(wf.jobs.discover['runs-on'], 'ubuntu-slim');
  assert.ok(wf.jobs.discover['timeout-minutes'] <= 15, 'ubuntu-slim jobs are capped at 15 min');
  assert.equal(wf.jobs.produce['runs-on'], 'ubuntu-latest', 'rendering needs the full runner');
});
