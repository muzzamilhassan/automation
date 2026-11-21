// Engine half of "100% ready before anything publishes" (owner, 2026-11-21).
// The autopilot's discover step (lib/schedule-slot.mjs toDiscoverChannels)
// drops every channel that is not 7/7 ready and logs what is missing; the
// pipeline, the sweeper and the manual long-form uploader refuse a not-ready
// channel even when started directly (lib/readiness-gate.mjs).
// Spec + QA: docs/qa/channel-readiness-qa.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as yaml from 'js-yaml';

import { toDiscoverChannels } from '../lib/schedule-slot.mjs';
import { engineReadiness } from '../lib/readiness-gate.mjs';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

import { readyEntry, READY_DAYS as days, discoverFixtureRoot } from './fixtures/ready-channels.mjs';

describe('G1 — discover drops channels that are not ready', () => {
  test('a ready channel is kept with the same mapping; a not-ready one is dropped and logged', () => {
    const lines = [];
    const out = toDiscoverChannels(
      [readyEntry('ready-one'), readyEntry('half-done', { kit: { templateId: '', voice: '' } })],
      { cadence: { 'ready-one': days, 'half-done': days }, log: (m) => lines.push(m) },
    );
    assert.deepEqual(out, [{ slug: 'ready-one', envSlug: 'READY_ONE', cron: '21 3 * * *' }]);
    assert.deepEqual(lines, [
      '[readiness] half-done: NOT READY to publish (5/7) — missing: Video template picked; Voice chosen — skipped (finish it in the panel)',
    ]);
  });

  test('paused / inactive / keyless channels are still dropped quietly (no readiness noise)', () => {
    const lines = [];
    const out = toDiscoverChannels(
      [readyEntry('paused', { autopilot: false }), readyEntry('off', { active: false }), readyEntry('nokey', { tokenSecretSaved: false })],
      { cadence: { paused: days, off: days, nokey: days }, log: (m) => lines.push(m) },
    );
    assert.deepEqual(out, []);
    assert.deepEqual(lines, []);
  });

  test('FAIL CLOSED: no cadence (unreadable file) means no channel is ready', () => {
    const lines = [];
    assert.deepEqual(toDiscoverChannels([readyEntry('ready-one')], { log: (m) => lines.push(m) }), []);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /ready-one: NOT READY .*Full schedule/);
    assert.deepEqual(toDiscoverChannels([readyEntry('ready-one')], { cadence: 'junk', log: () => {} }), []);
  });

  test('FAIL CLOSED: malformed entries are skipped, never crash the discover step', () => {
    const out = toDiscoverChannels([null, 'x', { slug: 7 }, { autopilot: true }, readyEntry('ready-one')], { cadence: { 'ready-one': days }, log: () => {} });
    assert.deepEqual(out.map((c) => c.slug), ['ready-one']);
    assert.deepEqual(toDiscoverChannels(null, { cadence: {} }), []);
  });
});

describe('G2 — the discover script in channel-autopilot.yml', () => {
  const WF = '.github/workflows/channel-autopilot.yml';

  test('reads the cadence file and hands it to toDiscoverChannels with a logger', () => {
    const raw = read(WF);
    assert.match(raw, /fs\.readFileSync\('yt-mcp\/cadence\.json', 'utf8'\)/);
    assert.match(raw, /toDiscoverChannels\(reg\.channels, \{ cadence, log: \(m\) => console\.log\(m\) \}\)/);
  });

  test('RUN: only ready channels come out; a not-ready one is named in the log', () => {
    const dir = discoverFixtureRoot({
      channels: [readyEntry('ready-one'), readyEntry('no-template', { kit: { templateId: '' } })],
      cadence: { 'ready-one': days, 'no-template': days },
    });
    const wf = yaml.load(fs.readFileSync(WF, 'utf8'));
    const step = wf.jobs.discover.steps.find((s) => s.id === 'disc');
    const script = step.run.match(/node --input-type=module -e "\n([\s\S]*)\n\s*"\s*$/)[1];
    const out = path.join(dir, 'out.txt');
    fs.writeFileSync(out, '');
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: dir, encoding: 'utf8', timeout: 30000,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GITHUB_OUTPUT: out },
    });
    assert.equal(r.status, 0, r.stderr);
    const chans = JSON.parse(fs.readFileSync(out, 'utf8').replace(/^channels=/, ''));
    assert.deepEqual(chans.map((c) => c.slug), ['ready-one']);
    assert.match(r.stdout, /\[readiness\] no-template: NOT READY to publish \(6\/7\) — missing: Video template picked/);
  });
});

describe('G3 — engineReadiness reads the engine files (fail closed)', () => {
  const fixture = (files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ready-gate-'));
    fs.mkdirSync(path.join(dir, 'yt-mcp'), { recursive: true });
    for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'yt-mcp', name), body);
    return dir;
  };

  test('ready channel → ready, with a log line', () => {
    const root = fixture({ 'studio-channels.json': JSON.stringify({ channels: [readyEntry('ready-one')] }), 'cadence.json': JSON.stringify({ 'ready-one': days }) });
    const r = engineReadiness('ready-one', { root });
    assert.equal(r.ready, true);
    assert.equal(r.line, '[readiness] ready-one: ready to publish (7/7)');
  });

  test('missing registry, broken JSON, missing cadence or unknown slug → not ready', () => {
    const good = JSON.stringify({ channels: [readyEntry('ready-one')] });
    const cad = JSON.stringify({ 'ready-one': days });
    assert.equal(engineReadiness('ready-one', { root: fixture({ 'cadence.json': cad }) }).ready, false);
    assert.equal(engineReadiness('ready-one', { root: fixture({ 'studio-channels.json': '{nope', 'cadence.json': cad }) }).ready, false);
    assert.equal(engineReadiness('ready-one', { root: fixture({ 'studio-channels.json': good }) }).ready, false);
    const unknown = engineReadiness('someone-else', { root: fixture({ 'studio-channels.json': good, 'cadence.json': cad }) });
    assert.equal(unknown.ready, false);
    assert.match(unknown.line, /someone-else: NOT READY to publish \(0\/7\)/);
  });
});

describe('G4 — direct starts refuse a not-ready channel', () => {
  test('channel-pipeline.mjs checks readiness right after the brand resolves, before any work, and exits 0', () => {
    const src = read('channel-pipeline.mjs');
    const brand = src.indexOf("if (!b) { console.error(`[pipeline] unknown slug: ${slug}`); process.exit(1); }");
    const gate = src.indexOf("const { engineReadiness } = await import('./lib/readiness-gate.mjs');");
    assert.ok(brand > 0 && gate > brand, 'the gate runs after the brand resolves');
    const after = src.slice(gate, gate + 400);
    assert.match(after, /const readiness = engineReadiness\(slug\);/);
    assert.match(after, /if \(!readiness\.ready\) \{ console\.log\(readiness\.line\); process\.exit\(0\); \}/);
    // nothing that spends (jobs, keys, quota) happens before the gate
    for (const marker of ['applyChannelKeys(', 'makePipelineJobController({', 'evaluate(']) {
      const at = src.indexOf(marker, src.indexOf('const results ='));
      assert.ok(at === -1 || at > gate, `${marker} runs after the gate`);
    }
  });

  test('RUN: the pipeline exits 0 for a not-ready channel and says why', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ready-pipe-'));
    fs.mkdirSync(path.join(dir, 'yt-mcp', 'state'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'yt-mcp', 'studio-channels.json'), JSON.stringify({
      channels: [readyEntry('fixture-chan', { kit: { storyShape: '', thumbTemplates: [] } })],
    }));
    fs.writeFileSync(path.join(dir, 'yt-mcp', 'cadence.json'), JSON.stringify({ 'fixture-chan': days }));
    const r = spawnSync(process.execPath, [path.resolve('channel-pipeline.mjs'), 'fixture-chan'], {
      cwd: dir, encoding: 'utf8', timeout: 60000,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[readiness\] fixture-chan: NOT READY to publish \(5\/7\) — missing: Story shape chosen; Thumbnail designs \(2–5\)/);
    assert.doesNotMatch(r.stdout, /\[fixture-chan\] /, 'no pipeline step ran');
  });

  test('sweeper.mjs never heals a not-ready channel (neither dispatch nor in-process top-up)', () => {
    const src = read('sweeper.mjs');
    assert.match(src, /import \{ engineReadiness \} from '\.\/lib\/readiness-gate\.mjs';/);
    const gate = src.indexOf('const readiness = engineReadiness(slug);');
    assert.ok(gate > 0);
    assert.match(src.slice(gate, gate + 200), /if \(!readiness\.ready\) \{ log\(`⛔ \$\{readiness\.line\} — not healing`\); continue; \}/);
    assert.ok(gate < src.indexOf('const route = healRouteFor('), 'before the heal dispatch');
    assert.ok(gate < src.indexOf("execFileSync('node', ['yt-daily.mjs'"), 'before the in-process top-up');
  });

  test('longvideo/longform-upload.mjs (manual uploader) skips a not-ready channel', () => {
    const src = read('longvideo/longform-upload.mjs');
    assert.match(src, /import \{ engineReadiness \} from "\.\.\/lib\/readiness-gate\.mjs";/);
    const fn = src.indexOf('async function processChannel(slug) {');
    const body = src.slice(fn, fn + 500);
    assert.match(body, /const readiness = engineReadiness\(slug, \{ root: ROOT \}\);/);
    assert.match(body, /if \(!readiness\.ready\) \{ console\.log\(readiness\.line\); return; \}/);
  });
});
