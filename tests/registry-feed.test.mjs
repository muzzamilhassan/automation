// Step C1a (docs/superpowers/specs/2026-11-16-neon-single-source-of-truth-design.md):
// the engine feed (yt-mcp/studio-channels.json) and cadence (yt-mcp/cadence.json)
// get a Neon copy (channels.feed_entry / channels.cadence). Shadow week: every
// run rebuilds both files from Neon and compares them with the committed ones;
// nothing switches until the diff stays empty for a week (owner decision).
// Spec + QA: docs/qa/registry-feed-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canonicalJson, buildFeed, buildCadence, diffFeeds, diffCadence,
  seedPlan, applySeed, recordShadowCheck,
} from '../studio/lib/registry-feed.mjs';

const MR = { slug: 'money-rulebook', label: 'The Money Rulebook', cron: '21 3 * * *', active: true, kit: { slots: ['00:05'], niches: ['a'] } };
const QQ = { slug: 'quotequarry', label: 'Quote Quarry', cron: '13 2 * * *', active: true, kit: { slots: ['22:35'] } };

test('canonicalJson ignores key order but not values', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } }), canonicalJson({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }));
  assert.notEqual(canonicalJson({ a: 1 }), canonicalJson({ a: 2 }));
});

test('buildFeed: only rows with a feed_entry, sorted by slug; db-only rows (parked brands) excluded', () => {
  const rows = [
    { slug: 'quotequarry', feed_entry: QQ },
    { slug: 'tax-shield', feed_entry: null },
    { slug: 'money-rulebook', feed_entry: MR },
  ];
  assert.deepEqual(buildFeed(rows), { channels: [MR, QQ] });
});

test('buildCadence: slug-keyed object from rows that have one', () => {
  const rows = [{ slug: 'money-rulebook', cadence: { docDays: ['Thu', 'Sun'] } }, { slug: 'x', cadence: null }];
  assert.deepEqual(buildCadence(rows), { 'money-rulebook': { docDays: ['Thu', 'Sun'] } });
});

test('diffFeeds: equal regardless of channel order and key order', () => {
  assert.deepEqual(diffFeeds({ channels: [MR, QQ] }, { channels: [{ ...QQ }, { kit: MR.kit, slug: MR.slug, label: MR.label, cron: MR.cron, active: true }] }), []);
});

test('diffFeeds: names the channel and the field that differs; missing/extra channels', () => {
  const d = diffFeeds({ channels: [MR, QQ] }, { channels: [{ ...MR, cron: '0 4 * * *' }] });
  assert.ok(d.some((x) => /money-rulebook: cron/.test(x)), d.join(' | '));
  assert.ok(d.some((x) => /quotequarry missing from neon/.test(x)), d.join(' | '));
  const extra = diffFeeds({ channels: [MR] }, { channels: [MR, QQ] });
  assert.ok(extra.some((x) => /quotequarry only in neon/.test(x)));
});

test('diffCadence: per-slug differences', () => {
  assert.deepEqual(diffCadence({ a: { docDays: ['Thu'] } }, { a: { docDays: ['Thu'] } }), []);
  assert.match(diffCadence({ a: { docDays: ['Thu'] } }, { a: { docDays: ['Fri'] } }).join(' '), /a: docDays/);
});

test('seedPlan: the committed files win; feed slugs get feed_entry, others are cleared; cadence per slug', () => {
  const plan = seedPlan({ channels: [MR, QQ] }, { 'money-rulebook': { docDays: ['Thu'] } }, ['money-rulebook', 'quotequarry', 'tax-shield']);
  assert.deepEqual(plan.updates.find((u) => u.slug === 'money-rulebook'), { slug: 'money-rulebook', feed_entry: MR, cadence: { docDays: ['Thu'] } });
  assert.deepEqual(plan.updates.find((u) => u.slug === 'tax-shield'), { slug: 'tax-shield', feed_entry: null, cadence: null });
  assert.deepEqual(plan.missingRows, [], 'every feed slug has a channels row');
  const plan2 = seedPlan({ channels: [MR, { slug: 'new-one' }] }, {}, ['money-rulebook']);
  assert.deepEqual(plan2.missingRows, ['new-one'], 'a feed slug without a DB row is reported, not invented');
});

function fakeSql() {
  const calls = [];
  const sql = async (text, params) => { calls.push({ text: text.replace(/\s+/g, ' ').trim(), params }); return []; };
  sql.calls = calls;
  return sql;
}

test('applySeed adds the columns idempotently and writes each planned row', async () => {
  const sql = fakeSql();
  const plan = seedPlan({ channels: [MR] }, { 'money-rulebook': { docDays: ['Thu'] } }, ['money-rulebook', 'tax-shield']);
  await applySeed(sql, plan);
  assert.ok(sql.calls[0].text.includes('ADD COLUMN IF NOT EXISTS feed_entry jsonb'));
  assert.ok(sql.calls[0].text.includes('ADD COLUMN IF NOT EXISTS cadence jsonb'));
  const upd = sql.calls.filter((c) => c.text.startsWith('UPDATE channels SET feed_entry'));
  assert.equal(upd.length, 2);
  assert.deepEqual(JSON.parse(upd.find((u) => u.params[2] === 'money-rulebook').params[0]), MR);
});

test('recordShadowCheck stores ok + diff text', async () => {
  const sql = fakeSql();
  await recordShadowCheck(sql, { ok: false, diff: ['x: cron'], runId: '123' });
  assert.ok(sql.calls[0].text.includes('CREATE TABLE IF NOT EXISTS registry_shadow_checks'));
  const ins = sql.calls.find((c) => c.text.startsWith('INSERT INTO registry_shadow_checks'));
  assert.deepEqual(ins.params, ['123', false, 'x: cron']);
});

test('the committed feed and cadence files parse (seed sources exist)', () => {
  assert.ok(Array.isArray(JSON.parse(fs.readFileSync('yt-mcp/studio-channels.json', 'utf8')).channels));
  assert.equal(typeof JSON.parse(fs.readFileSync('yt-mcp/cadence.json', 'utf8')), 'object');
});

test('C1a wiring: every Studio write of the engine feed / cadence is mirrored into Neon', () => {
  const reg = fs.readFileSync('studio/lib/channels-registry.js', 'utf8');
  const feedWrites = (reg.match(/writeRepoJSON\(REG_PATH/g) || []).length;
  const mirrors = (reg.match(/await mirrorFeedBestEffort\(/g) || []).length;
  assert.ok(feedWrites >= 4);
  assert.equal(mirrors, feedWrites + 2, 'one mirror per writeRepoJSON(REG_PATH) + both writeRegistry paths');
  const sched = fs.readFileSync('studio/app/api/channels/schedule/route.js', 'utf8');
  assert.ok(sched.indexOf('mirrorCadenceToNeon') > sched.indexOf('await writeRepoJSON(FILE, file'), 'cadence mirrored after the repo write');
});

test('C1a wiring: every produce run records a non-blocking shadow check', async () => {
  const { load } = await import('js-yaml');
  const wf = load(fs.readFileSync('.github/workflows/channel-autopilot.yml', 'utf8'));
  const step = wf.jobs.produce.steps.find((s) => /Registry shadow check/.test(s.name || ''));
  assert.ok(step, 'shadow step present');
  assert.equal(step['continue-on-error'], true);
  assert.equal(step.run.trim(), 'node scripts/export-registry.mjs --check --record');
  const names = wf.jobs.produce.steps.map((s) => s.name || '');
  assert.ok(names.indexOf(step.name) < names.findIndex((n) => /Channel Pipeline/.test(n)), 'runs before the pipeline');
  assert.ok(names.indexOf(step.name) > names.findIndex((n) => /Install Node Dependencies/.test(n)), 'after npm install');
});
