// Live fix wave A2 — T4-02 / P4 + T4-18 (2026-11-20 live test).
// T4-02: "Edit setup" on a real channel pre-filled EMPTY slots/tags/
// description (it read the registry's top-level `slots: []`, not kit.slots),
// so pressing Save would have wiped a live channel. Now the form shows what
// the ENGINE uses (lib/brand-resolve.mjs precedence, cross-checked here
// against the real engine merge), an edit sends only the fields the owner
// changed, and the profile route refuses to blank a filled field unless the
// client says it was cleared on purpose.
// T4-18: healthy legacy channels showed "key name missing — re-connect".
// Spec + QA: docs/qa/live-fix-wave-a2-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineFormValues, editPayload, protectFilledFields, secretNameFor, channelKeyStatus, withReviewKeyRow } from '../studio/lib/edit-prefill.mjs';
import { registryToKit, mergeBrand } from '../lib/brand-resolve.mjs';
import { bySlug } from '../yt-brands/brands.mjs';

// Quote Quarry's live Neon projection on 2026-11-20 (api-snap.json)
const QQ_ROW = {
  slug: 'quotequarry', label: 'Quote Quarry', handle: '@quotequarry302', niche: 'Timeless wisdom, self-mastery & human psychology',
  style: '', voice: '', accent: '#F5E31C', slots: [], docDay: 'Tue', autopilot: true,
  kit: {
    slots: ['22:35'], docDay: 'Tue', longSlot: '14:30', thumbTemplates: ['slab-quote', 'serif-frame', 'plinth'],
    niches: ['human psychology & respect', 'power of silence & solitude', 'dark psychology defense', 'samurai mindset & musashi', 'emotional detachment', 'stoic rules for modern life'],
  },
  destinations: null, ytDescription: '', ytKeywords: '', tokenSecret: '', tokenSecretSaved: true, status: '', active: true,
};
const MR_ROW = { ...QQ_ROW, slug: 'money-rulebook', label: 'The Money Rulebook', niche: 'Personal finance rules & money habits', accent: '#3DDC97', kit: { slots: ['00:05'], niches: ['budget rules'] } };
const WIZ_ROW = {
  slug: 'wiz-x', label: 'Wiz X', niche: 'Sleep science', style: 'paper', voice: 'af_bella', accent: '#112233', slots: ['21:00'], docDay: 'Thu',
  kit: { slots: ['09:00'], tags: ['sleep', 'rest'], eyebrow: 'SLEEP // WIZ X', tagline: 'Rest well.', description: 'Kit text.', niches: ['deep sleep'] },
  ytDescription: 'YouTube text.', ytKeywords: '',
};

const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

// what the engine actually runs on (resolveBrand minus the cadence file)
const engine = (row) => mergeBrand(bySlug[row.slug] || null, registryToKit(row));

for (const row of [QQ_ROW, MR_ROW, WIZ_ROW]) {
  test(`E1 edit prefill shows what the engine uses — ${row.slug}`, () => {
    const eng = engine(row);
    const f = engineFormValues(row, bySlug[row.slug] || null);
    assert.equal(f.slots, eng.slots.join(', '), 'slots');
    assert.equal(f.voice, eng.voice, 'voice');
    assert.equal(f.accent, eng.accent, 'accent');
    assert.equal(f.docDay, eng.docDay, 'docDay');
    assert.equal(f.label, eng.label, 'label');
    assert.equal(f.niche, eng.niche, 'niche');
    assert.equal(f.eyebrow, eng.eyebrow || '', 'eyebrow');
    assert.equal(f.tagline, eng.tagline || '', 'tagline');
    assert.equal(f.description, eng.description || '', 'description');
    assert.deepEqual(csv(f.tags), eng.tags || [], 'tags');
    assert.deepEqual(csv(f.subNiches), eng.niches, 'content pillars');
  });
}

test('E2 the live Quote Quarry row no longer pre-fills empty slots/tags', () => {
  const f = engineFormValues(QQ_ROW, bySlug.quotequarry);
  assert.equal(f.slots, '22:35', 'kit.slots, not the empty registry slots');
  assert.ok(csv(f.tags).length > 0, 'tags come from the brand kit');
  assert.equal(f.voice, 'am_michael');
  assert.equal(f.eyebrow, 'DAILY WISDOM // QUOTE QUARRY');
});

test('E3 without any brand file the registry kit still wins over the empty top-level fields', () => {
  const f = engineFormValues(QQ_ROW, null);
  assert.equal(f.slots, '22:35');
  assert.equal(f.docDay, 'Tue');
  assert.equal(f.subNiches.split(', ').length, 6);
});

// ---- editPayload: only changed fields go out ----
const body = (over = {}) => ({
  slug: 'quotequarry', label: 'Quote Quarry', niche: 'N', subNiches: ['a'], style: 'cinematic', voice: 'am_michael', accent: '#F5E31C', slots: '22:35', docDay: 'Tue',
  kit: { eyebrow: 'E', tagline: 'T', tags: ['x', 'y'], niches: ['a'], description: 'D', thumbTemplates: ['plinth'] },
  destinations: { fbPageId: '', igHandle: 'qq', threadsHandle: '', tiktokHandle: '' },
  ...over,
});

test('E4 an untouched edit sends nothing but the slug', () => {
  assert.deepEqual(editPayload(body(), body()), { slug: 'quotequarry' });
});

test('E5 a changed field is sent alone; the kit carries only its changed keys', () => {
  const now = body({ voice: 'bm_daniel', kit: { ...body().kit, tags: ['x', 'y', 'z'] } });
  assert.deepEqual(editPayload(now, body()), { slug: 'quotequarry', voice: 'bm_daniel', kit: { tags: ['x', 'y', 'z'] } });
});

test('E6 a field the owner emptied is sent with an explicit clear', () => {
  const now = body({ slots: '', kit: { ...body().kit, description: '', tags: [] } });
  const p = editPayload(now, body());
  assert.equal(p.slots, '');
  assert.deepEqual(p.kit, { tags: [], description: '' });
  assert.deepEqual(p.clear.sort(), ['description', 'slots', 'tags']);
});

test('E7 one changed destination sends the whole destinations block (the route replaces it whole)', () => {
  const now = body({ destinations: { ...body().destinations, threadsHandle: 'qq' } });
  assert.deepEqual(editPayload(now, body()).destinations, now.destinations);
});

// ---- protectFilledFields: the server never blanks a filled field by accident ----
const LIVE = { slug: 'quotequarry', niche: 'N', slots: [], kit: { slots: ['22:35'], tags: ['a'], description: 'D', eyebrow: 'E', tagline: 'T', niches: ['p'] } };

test('E8 empty slots/tags/description/eyebrow/tagline/pillars for a filled channel are ignored and reported', () => {
  const { body: safe, kept } = protectFilledFields({ slug: 'quotequarry', slots: '', subNiches: [], niche: '', kit: { tags: [], description: '', eyebrow: ' ', tagline: '', niches: [], thumbTemplates: [] } }, LIVE);
  assert.equal('slots' in safe, false);
  assert.equal('niche' in safe, false);
  assert.equal('subNiches' in safe, false);
  assert.deepEqual(safe.kit, { thumbTemplates: [] }, 'thumbTemplates [] = automatic, never guarded');
  assert.deepEqual(kept.sort(), ['description', 'eyebrow', 'niche', 'niches', 'slots', 'tagline', 'tags']);
});

test('E9 an explicit clear is honoured', () => {
  const { body: safe, kept } = protectFilledFields({ slug: 'quotequarry', slots: '', kit: { tags: [] }, clear: ['slots', 'tags'] }, LIVE);
  assert.equal(safe.slots, '');
  assert.deepEqual(safe.kit.tags, []);
  assert.deepEqual(kept, []);
});

test('E10 the create flow is unchanged: empties for an empty new channel and real values pass straight through', () => {
  const fresh = { slug: 'new-one', slots: [], kit: {} };
  const sent = { slug: 'new-one', slots: '21:00', subNiches: [], kit: { eyebrow: '', tagline: '', tags: [], description: '', niches: ['n'] } };
  assert.deepEqual(protectFilledFields(sent, fresh), { body: sent, kept: [] });
  const filled = protectFilledFields({ slug: 'quotequarry', slots: '01:00', kit: { tags: ['new'] } }, LIVE);
  assert.equal(filled.body.slots, '01:00');
  assert.deepEqual(filled.body.kit.tags, ['new']);
});

// ---- T4-18 key status ----
test('K1 a saved key is healthy even with no recorded name — the conventional name is shown', () => {
  assert.equal(secretNameFor('debt-free-doctrine'), 'YT_TOKEN_DEBT_FREE_DOCTRINE');
  const k = channelKeyStatus({ slug: 'quotequarry', tokenSecret: '', tokenSecretSaved: true });
  assert.equal(k.tone, 'ok');
  assert.equal(k.label, 'key saved');
  assert.equal(k.secret, 'YT_TOKEN_QUOTEQUARRY');
  const named = channelKeyStatus({ slug: 'yt-bot', tokenSecret: 'YT_TOKEN_YT_BOT', tokenSecretSaved: true });
  assert.equal(named.secret, 'YT_TOKEN_YT_BOT', 'a recorded name wins');
});

test('K2 while the registry read is degraded the key shows "status unknown", never "re-connect"', () => {
  const k = channelKeyStatus({ slug: 'quotequarry', tokenSecret: '', tokenSecretSaved: false, overlayDegraded: true });
  assert.equal(k.label, 'status unknown');
  assert.equal(k.tone, 'info');
  assert.doesNotMatch(k.detail, /re-connect/i);
});

test('K3 a real problem still says so (not degraded, not saved)', () => {
  assert.equal(channelKeyStatus({ slug: 'x', tokenSecret: '', tokenSecretSaved: false }).label, 'key name missing');
  assert.equal(channelKeyStatus({ slug: 'x', tokenSecret: 'YT_TOKEN_X', tokenSecretSaved: false }).label, 'secret missing');
});

test('K4 the Review "Key" row uses the same honest status', () => {
  const sections = [{ step: 'connect', rows: [['YouTube channel', 'QQ'], ['Key', 'key name missing']] }, { step: 'identity', rows: [['Name', 'QQ']] }];
  const out = withReviewKeyRow(sections, { slug: 'quotequarry', tokenSecretSaved: true });
  assert.deepEqual(out[0].rows[1], ['Key', 'key saved · YT_TOKEN_QUOTEQUARRY']);
  assert.deepEqual(out[1], sections[1]);
  const unknown = withReviewKeyRow(sections, { slug: 'quotequarry', tokenSecretSaved: false, overlayDegraded: true });
  assert.deepEqual(unknown[0].rows[1], ['Key', 'status unknown']);
  assert.deepEqual(withReviewKeyRow(sections, null), sections, 'no channel → untouched');
});
