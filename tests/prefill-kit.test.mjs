// scripts/prefill-kit-from-brands.mjs — the one-time pre-fill for the
// "100% ready before anything publishes" rule (owner, 2026-11-21). It copies
// what the engine ALREADY uses (voice, description, tags from the static
// brand files via lib/brand-resolve.mjs) into the registry kit, only where
// the kit is empty, so the checklist counts it. Channels that are running
// today (autopilot on — data, not names) also get storyShape 'template' and
// their Neon template assignment mirrored, so they stay 7/7 and keep running.
// Everyone else gets no template and no story shape (the owner chooses).
// The dry run is the default; --apply is for the lead (never run by tests).
// Spec + QA: docs/qa/channel-readiness-qa.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { planPrefill, applyPlan, keepRunningSlugs } from '../scripts/prefill-kit-from-brands.mjs';

const days = { docDays: ['Thu'], shortDays: ['Mon'] };
const legacyKit = { voice: 'bm_daniel', description: 'Money rules.', tags: ['money', 'budget'] };
const entry = (slug, over = {}) => ({
  slug, label: slug, niche: 'Personal finance', tokenSecretSaved: true, active: true, autopilot: false, cron: '21 3 * * *',
  ...over,
  kit: { thumbTemplates: ['ledger', 'coinflip'], slots: ['00:05'], longSlot: '22:30', gateCron: '21 3 * * *', ...(over.kit || {}) },
});

function plan(channels, { keep, legacy = { 'legacy-a': legacyKit, 'running-b': legacyKit } } = {}) {
  return planPrefill({
    channels,
    cadence: Object.fromEntries(channels.map((c) => [c.slug, days])),
    legacyBySlug: legacy,
    effectiveBrand: (slug) => (legacy[slug] ? { ...legacy[slug] } : { voice: 'am_michael', description: '', tags: [] }),
    keepRunning: keep ?? keepRunningSlugs(channels),
  });
}

describe('F1 — what gets copied', () => {
  test('empty kit fields get the value the engine uses today; filled ones are never touched', () => {
    const [row] = plan([entry('legacy-a', { kit: { voice: 'am_custom' } })]).rows;
    assert.deepEqual(row.patch, { description: 'Money rules.', tags: ['money', 'budget'] }, 'voice was already set in the kit');
  });

  test('a channel without a static brand kit gets nothing (no invented defaults)', () => {
    const [row] = plan([entry('wizard-only')]).rows;
    assert.deepEqual(row.patch, {});
    assert.match(row.notes.join(' '), /no static brand kit/);
  });

  test('empty effective values are skipped (nothing blank is written)', () => {
    const [row] = plan([entry('legacy-a')], { legacy: { 'legacy-a': { voice: 'bm_daniel', description: '', tags: [] } } }).rows;
    assert.deepEqual(row.patch, { voice: 'bm_daniel' });
  });
});

describe('F2 — running channels keep running; the rest wait for the owner', () => {
  test('keep-running = channels whose autopilot is ON and active (data, not names)', () => {
    assert.deepEqual(keepRunningSlugs([entry('a', { autopilot: true }), entry('b'), entry('c', { autopilot: true, active: false })]), ['a']);
  });

  test('a running channel gets storyShape "template" and a pending template mirror; after = 7/7 once mirrored', () => {
    const [row] = plan([entry('running-b', { autopilot: true })]).rows;
    assert.equal(row.patch.storyShape, 'template');
    assert.equal(row.mirrorTemplate, true);
    assert.equal(row.before.done, 3);
    assert.equal(row.after.done, 6, 'template still missing until --apply mirrors it');
    assert.equal(row.afterWithMirror.ready, true, '7/7 once the Neon assignment is mirrored');
  });

  test('a paused channel gets NO story shape and NO template', () => {
    const [row] = plan([entry('legacy-a')]).rows;
    assert.equal(row.patch.storyShape, undefined);
    assert.equal(row.mirrorTemplate, false);
    assert.equal(row.after.ready, false);
  });

  test('an already chosen story shape / mirrored template is left alone', () => {
    const [row] = plan([entry('running-b', { autopilot: true, kit: { hasChapters: false, templateId: 'x' } })]).rows;
    assert.equal(row.patch.storyShape, undefined);
    assert.equal(row.mirrorTemplate, false);
  });
});

describe('F3 — --apply (fakes only: tests never touch Neon)', () => {
  const fakes = (over = {}) => {
    const writes = [];
    return {
      writes,
      readDbKit: async () => ({}),
      getAssignment: async (slug) => (slug === 'running-b' ? { family_id: 'myth-vs-money', pinned_major: 1, pinned_version: '1.2.0' } : null),
      writeKit: async (slug, patch) => { writes.push([slug, patch]); return { ok: true }; },
      log: () => {},
      ...over,
    };
  };

  test('writes the patch plus the mirrored assignment for running channels', async () => {
    const p = plan([entry('running-b', { autopilot: true }), entry('legacy-a')]);
    const f = fakes();
    const res = await applyPlan(p, f);
    assert.equal(res.ok, true);
    const bySlug = Object.fromEntries(f.writes);
    assert.deepEqual(bySlug['running-b'], {
      voice: 'bm_daniel', description: 'Money rules.', tags: ['money', 'budget'], storyShape: 'template',
      templateId: 'myth-vs-money', templateVersion: '1.2.0', templateMajor: 1,
    });
    assert.deepEqual(bySlug['legacy-a'], { voice: 'bm_daniel', description: 'Money rules.', tags: ['money', 'budget'] });
  });

  test('a value already in the Neon kit wins over the static file (the panel is the truth)', async () => {
    const p = plan([entry('legacy-a')]);
    const f = fakes({ readDbKit: async () => ({ voice: 'am_panel_pick' }) });
    await applyPlan(p, f);
    assert.equal(f.writes[0][1].voice, 'am_panel_pick');
  });

  test('ABORTS before any write when a running channel has no template in Neon (it would stop publishing)', async () => {
    const p = plan([entry('legacy-a'), entry('running-b', { autopilot: true })]);
    const f = fakes({ getAssignment: async () => null });
    const res = await applyPlan(p, f);
    assert.equal(res.ok, false);
    assert.match(res.error, /running-b has no active template/);
    assert.deepEqual(f.writes, [], 'nothing written');
  });

  test('paused channels with a Neon template are reported, not mirrored (the owner decides)', async () => {
    const p = plan([entry('legacy-a')]);
    const f = fakes({ getAssignment: async () => ({ family_id: 'other', pinned_major: 1, pinned_version: '1.0.0' }) });
    const res = await applyPlan(p, f);
    assert.equal(f.writes[0][1].templateId, undefined);
    assert.match(res.notes.join(' '), /legacy-a has an active template "other" in Neon that is not mirrored/);
  });

  test('channels with nothing to write are skipped', async () => {
    const p = plan([entry('wizard-only')]);
    const f = fakes();
    await applyPlan(p, f);
    assert.deepEqual(f.writes, []);
  });
});

describe('F4 — the real dry run (repo files only, writes nothing)', () => {
  test('prints a before → after table and leaves the registry untouched', () => {
    const hash = () => crypto.createHash('sha256').update(fs.readFileSync('yt-mcp/studio-channels.json')).digest('hex');
    const before = hash();
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
    const r = spawnSync(process.execPath, ['scripts/prefill-kit-from-brands.mjs'], { encoding: 'utf8', timeout: 60000, env });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /DRY RUN/);
    assert.match(r.stdout, /before → after/);
    assert.equal(hash(), before, 'dry run never writes');
  });

  test('the script source never names a channel (owner: no static maps)', () => {
    const src = fs.readFileSync('scripts/prefill-kit-from-brands.mjs', 'utf8');
    assert.doesNotMatch(src, /'money-rulebook'|'quotequarry'|'investors-compass'|'debt-free-doctrine'|'yt-bot'/);
  });
});
