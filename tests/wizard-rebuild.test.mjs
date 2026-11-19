// Add Channel wizard rebuild (2026-11-19, round 2): the 7-step stepper.
// (a) behavioural tests of the pure step logic in studio/lib/wizard-steps.mjs
// (b) source scans pinning the page wiring — every API the old single-card
//     wizard called is still called, consent-gated start, no window.confirm,
//     and channel management opens in a Drawer instead of expanding inline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  STEPS, STEP_INDEX, DOC_DAYS, MAX_SLOTS, EMPTY_FORM,
  normalizeHHMM, shiftHHMM, utcToLocal, localToUtc, formatClock, formatOffset,
  parseSlots, setSlotFromLocal, removeSlot, addSlot,
  subNicheList, togglePillar, validateDestinations,
  stepIssues, allIssues, canOpenStep, stepStates, keyStatus, thumbDesignsForNiche,
  describeSlots, reviewSummary,
} from '../studio/lib/wizard-steps.mjs';

const read = (p) => fs.readFileSync(p, 'utf8');
const PAGE = read('studio/app/channels/add/page.js');
const WIZ_DIR = 'studio/components/wizard';
const WIZ = Object.fromEntries(fs.readdirSync(WIZ_DIR).filter((f) => f.endsWith('.js')).map((f) => [f, read(path.join(WIZ_DIR, f))]));
const ALL = [PAGE, ...Object.values(WIZ)].join('\n');
const ROUTE = read('studio/app/api/channels/profile/route.js');

const KARACHI = 300; // UTC+5, no DST
const NEW_YORK_WINTER = -300;
const READY = { ...EMPTY_FORM, niche: 'History stories' };

/* ------------------------------- time maths ------------------------------- */

test('normalizeHHMM pads hours and rejects junk', () => {
  assert.equal(normalizeHHMM('9:05'), '09:05');
  assert.equal(normalizeHHMM(' 22:35 '), '22:35');
  for (const bad of ['24:00', '12:60', '7pm', '', null, '1230']) assert.equal(normalizeHHMM(bad), null, String(bad));
});

test('UTC → local: Karachi sees 22:35 UTC as 03:35 the next day', () => {
  assert.deepEqual(utcToLocal('22:35', KARACHI), { time: '03:35', dayShift: 1 });
  assert.deepEqual(utcToLocal('14:30', KARACHI), { time: '19:30', dayShift: 0 });
});

test('UTC → local: New York (winter) sees 00:00 UTC as 19:00 the previous day', () => {
  assert.deepEqual(utcToLocal('00:00', NEW_YORK_WINTER), { time: '19:00', dayShift: -1 });
});

test('local → UTC is the exact inverse for every minute of the day, at many offsets', () => {
  for (const off of [-720, -330, -300, 0, 60, 300, 330, 345, 840]) {
    for (let m = 0; m < 1440; m += 7) {
      const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      assert.equal(localToUtc(utcToLocal(hhmm, off).time, off).time, hhmm, `${hhmm} @ ${off}`);
    }
  }
});

test('shiftHHMM / formatClock / formatOffset read like a person would say them', () => {
  assert.equal(shiftHHMM('bad', 10), null);
  assert.equal(formatClock('00:05'), '12:05 am');
  assert.equal(formatClock('12:00'), '12:00 pm');
  assert.equal(formatClock('19:30'), '7:30 pm');
  assert.equal(formatOffset(330), 'UTC+05:30');
  assert.equal(formatOffset(-300), 'UTC-05:00');
});

/* ---------------------------------- slots --------------------------------- */

test('parseSlots keeps unreadable saved values so the owner can see and fix them', () => {
  assert.deepEqual(parseSlots('22:35, 9:05,  ,oops'), [
    { raw: '22:35', utc: '22:35' },
    { raw: '9:05', utc: '09:05' },
    { raw: 'oops', utc: null },
  ]);
  assert.deepEqual(parseSlots(''), []);
});

test('editing a slot in local time stores UTC; add/remove respect the 6-slot cap', () => {
  assert.equal(setSlotFromLocal('22:35, 14:30', 1, '20:00', KARACHI), '22:35, 15:00');
  assert.equal(removeSlot('22:35, 14:30', 0), '14:30');
  assert.equal(addSlot('22:35', '23:00'), '22:35, 23:00');
  const six = Array.from({ length: MAX_SLOTS }, (_, i) => `1${i}:00`).join(', ');
  assert.equal(addSlot(six, '23:00'), six, 'no seventh slot');
});

test('describeSlots shows local time first with UTC underneath, and says when nothing is set', () => {
  assert.equal(describeSlots('14:30', KARACHI), '7:30 pm your time · 14:30 UTC');
  assert.match(describeSlots('22:35', KARACHI), /3:35 am \(next day\) your time · 22:35 UTC/);
  assert.equal(describeSlots('', KARACHI), 'No daily short time set');
});

/* ------------------------------- pillars ---------------------------------- */

test('content pillars toggle case-insensitively and stay a comma list the route accepts', () => {
  assert.deepEqual(subNicheList(' A, b ,,C '), ['a', 'b', 'c']);
  assert.equal(togglePillar('power of silence', 'Samurai Mindset'), 'power of silence, samurai mindset');
  assert.equal(togglePillar('power of silence, samurai mindset', 'POWER OF SILENCE'), 'samurai mindset');
});

/* ------------------------------ destinations ------------------------------ */

test('destination checks mirror the profile route (same patterns, same @ stripping)', () => {
  assert.ok(ROUTE.includes(String.raw`/^(?:\d{6,}|UC[A-Za-z0-9_-]{10,})$/`), 'route FB page-id pattern changed — update wizard-steps.mjs too');
  assert.ok(ROUTE.includes(String.raw`/^[\w.-]{1,60}$/`), 'route handle pattern changed — update wizard-steps.mjs too');
  assert.deepEqual(validateDestinations({ fbPageId: '114550268199751', igHandle: '@my.chan', threadsHandle: '', tiktokHandle: 'a_b-c' }), {});
  const errs = validateDestinations({ fbPageId: '12ab', igHandle: 'has space', threadsHandle: 'ok', tiktokHandle: 'bad/slash' });
  assert.deepEqual(Object.keys(errs).sort(), ['fbPageId', 'igHandle', 'tiktokHandle']);
});

/* --------------------------- step completion ------------------------------ */

test('the wizard has the 7 named steps in order', () => {
  assert.deepEqual(STEPS.map((s) => s.id), ['connect', 'identity', 'look', 'thumbnails', 'schedule', 'destinations', 'review']);
  assert.equal(STEP_INDEX.review, 6);
  assert.deepEqual(STEPS.filter((s) => s.optional).map((s) => s.id), ['thumbnails', 'destinations']);
});

test('EMPTY_FORM carries every field the old form had (incl. subNiches — the old reset dropped it)', () => {
  for (const k of ['label', 'niche', 'subNiches', 'style', 'voice', 'accent', 'slots', 'docDay', 'eyebrow', 'tagline', 'tags', 'description', 'fbPageId', 'igHandle', 'threadsHandle', 'tiktokHandle']) {
    assert.ok(k in EMPTY_FORM, k);
  }
  assert.ok(Object.isFrozen(EMPTY_FORM));
});

test('step issues: connect, niche, look, schedule and destinations block; thumbnails never do', () => {
  assert.deepEqual(stepIssues('connect', { form: READY, connectedSlug: '' }), ['Connect a YouTube channel first.']);
  assert.deepEqual(stepIssues('connect', { form: READY, connectedSlug: 'x' }), []);
  assert.equal(stepIssues('identity', { form: EMPTY_FORM }).length, 1);
  assert.deepEqual(stepIssues('identity', { form: READY }), []);
  assert.equal(stepIssues('look', { form: { ...READY, accent: 'blue', voice: '' } }).length, 2);
  assert.deepEqual(stepIssues('thumbnails', { form: { ...READY, eyebrow: '', tagline: '' } }), []);
  assert.deepEqual(stepIssues('schedule', { form: { ...READY, slots: '' } }), [], 'no short time is allowed (legacy channels run on their gate)');
  assert.match(stepIssues('schedule', { form: { ...READY, slots: '25:00' } })[0], /Can't read the time "25:00"/);
  assert.equal(stepIssues('schedule', { form: { ...READY, docDay: 'Sun' } }).length, 1, 'the route only accepts Mon–Fri');
  assert.deepEqual(DOC_DAYS, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  assert.equal(stepIssues('destinations', { form: { ...READY, fbPageId: 'nope' } }).length, 1);
  assert.equal(allIssues({ form: READY, connectedSlug: 'x' }).length, 0);
});

test('navigation: nothing past Connect opens until a channel is connected; done steps stay reachable', () => {
  const none = { form: READY, connectedSlug: '' };
  assert.equal(canOpenStep(0, none), true);
  for (let i = 1; i < STEPS.length; i++) assert.equal(canOpenStep(i, none), false, `step ${i} locked`);
  const blankNiche = { form: EMPTY_FORM, connectedSlug: 'x' };
  assert.equal(canOpenStep(1, blankNiche), true);
  assert.equal(canOpenStep(2, blankNiche), false, 'no niche → Look & sound locked');
  const ok = { form: READY, connectedSlug: 'x' };
  for (let i = 0; i < STEPS.length; i++) assert.equal(canOpenStep(i, ok), true, `step ${i} open when all earlier are done`);
  assert.equal(canOpenStep(99, ok), false);
});

test('stepStates: current / done / attention / todo / locked', () => {
  const ok = { form: READY, connectedSlug: 'x' };
  assert.deepEqual(stepStates(ok, { current: 2, visited: [0, 1, 2] }), ['done', 'done', 'current', 'todo', 'todo', 'todo', 'todo']);
  assert.deepEqual(stepStates(ok, { current: 1, editing: true }), ['done', 'current', 'done', 'done', 'done', 'done', 'todo']);
  const bad = { form: { ...READY, slots: 'x' }, connectedSlug: 'x' };
  const s = stepStates(bad, { current: 1, visited: [0, 1, 4] });
  assert.equal(s[4], 'attention');
  assert.equal(s[5], 'locked', 'steps after an unfinished one are locked');
});

/* ------------------------------- key status ------------------------------- */

test('key chip is honest: never "key saved" next to a blank key name (report 05, C-03)', () => {
  assert.deepEqual(keyStatus({ tokenSecret: 'YT_TOKEN_QQ', tokenSecretSaved: true }).label, 'key saved');
  assert.equal(keyStatus({ tokenSecret: 'YT_TOKEN_QQ', tokenSecretSaved: true }).secret, 'YT_TOKEN_QQ');
  assert.equal(keyStatus({ tokenSecret: 'YT_TOKEN_QQ', tokenSecretSaved: false }).label, 'secret missing');
  for (const e of [{ tokenSecretSaved: true }, { tokenSecret: '', tokenSecretSaved: true }, { tokenSecret: '  ' }, null]) {
    const k = keyStatus(e);
    assert.notEqual(k.label, 'key saved');
    assert.equal(k.tone, 'warn');
  }
});

/* ------------------------------- thumbnails ------------------------------- */

test('thumbnail designs: the niche set, else the full pool (same rule as thumbSetFor)', () => {
  const reg = [{ id: 'a', niches: ['History stories'] }, { id: 'b', niches: ['AI & future tech'] }, { id: 'c', niches: ['History stories'] }];
  assert.deepEqual(thumbDesignsForNiche(reg, 'History stories'), { designs: [reg[0], reg[2]], matched: true });
  assert.deepEqual(thumbDesignsForNiche(reg, 'Unknown'), { designs: reg, matched: false });
  assert.deepEqual(thumbDesignsForNiche(null, 'x'), { designs: [], matched: false });
});

/* ----------------------------- review summary ----------------------------- */

test('review summary: one section per editable step, each with an Edit target and real values', () => {
  const form = { ...READY, label: 'Quote Quarry', style: 'doc', voice: 'bm_george', slots: '14:30', docDay: 'Wed', igHandle: '@qq', tags: 'a, b' };
  const sections = reviewSummary(form, {
    channel: { slug: 'qq', label: 'Quote Quarry', handle: '@quotequarry', tokenSecret: 'YT_QQ', tokenSecretSaved: true },
    offsetMin: KARACHI,
    names: { style: (id) => (id === 'doc' ? 'Market Documentary' : ''), voice: (id) => (id === 'bm_george' ? 'British male · mature storyteller' : '') },
  });
  assert.deepEqual(sections.map((s) => s.step), STEPS.filter((s) => s.id !== 'review').map((s) => s.id));
  for (const s of sections) assert.ok(s.step in STEP_INDEX, `edit link target ${s.step} is a real step`);
  const flat = Object.fromEntries(sections.flatMap((s) => s.rows));
  assert.equal(flat['YouTube channel'], 'Quote Quarry (@quotequarry)');
  assert.equal(flat.Key, 'key saved · YT_QQ');
  assert.equal(flat['Video style'], 'Market Documentary');
  assert.equal(flat.Voice, 'British male · mature storyteller');
  assert.equal(flat['Daily shorts'], '7:30 pm your time · 14:30 UTC');
  assert.equal(flat['Weekly long episode'], 'Every Wed');
  assert.equal(flat.Instagram, '@qq');
  assert.equal(flat.TikTok, 'Not posting');
  assert.equal(flat['SEO tags'], '2 tags');
});

/* ----------------------------- source scans ------------------------------- */

// Every endpoint the pre-rebuild page (1055 lines, commit 962dff1) called.
const OLD_ENDPOINTS = [
  ['GET registry', /fetch\('\/api\/channels\/registry'\)/],
  ['DELETE registry (disconnect)', /fetch\('\/api\/channels\/registry\?slug=' \+ [^,]+, \{ method: 'DELETE' \}\)/],
  ['GET profile (prefill)', /fetch\(`\/api\/channels\/profile\?slug=\$\{/],
  ['POST profile (save)', /fetch\('\/api\/channels\/profile', \{\s*method: 'POST'/],
  ['POST kit (#113 LLM)', /fetch\('\/api\/channels\/kit', \{[\s\S]*?useLLM: true/],
  ['oauth start', /fetch\('\/api\/oauth\/start'\)/],
  ['oauth connect link', /fetch\('\/api\/oauth\/start\?mode=link'\)/],
  ['templates (#115)', /'\/api\/templates'/],
  ['template previews (#115)', /fetch\('\/api\/template-previews'\)/],
  ['template assign (#115)', /fetch\('\/api\/templates\/assign', \{\s*method: 'POST'/],
];

test('every API endpoint the old wizard called is still called', () => {
  for (const [name, re] of OLD_ENDPOINTS) assert.match(ALL, re, name);
});

test('save semantics kept: start only with consent; a plain save never sends startAutopilot', () => {
  assert.match(PAGE, /onClick=\{\(\) => saveProfile\(true\)\}/);
  assert.match(PAGE, /onClick=\{\(\) => saveProfile\(\)\}/);
  assert.match(PAGE, /disabled=\{!canSave \|\| !consent\}/, 'start is disabled until the consent box is ticked');
  assert.match(PAGE, /\.\.\.\(start === true \? \{ startAutopilot: true \} : \{\}\)/);
  assert.doesNotMatch(PAGE, /saveProfile\(false\)/);
  assert.match(PAGE, /Save & start autopilot/);
  assert.match(PAGE, /Save, keep paused/);
  assert.match(WIZ['ReviewStep.js'], /type="checkbox"[\s\S]*?checked=\{consent\}/);
  assert.match(PAGE, /finally \{\s*setSaving\(false\);/, 'saving can never stick on "Saving…"');
});

test('no window.confirm anywhere in the wizard; disconnect asks through useConfirm (danger)', () => {
  assert.doesNotMatch(ALL, /window\.confirm\(/);
  const cc = WIZ['ConnectedChannels.js'];
  assert.match(cc, /const confirm = useConfirm\(\);/);
  assert.match(cc, /await confirm\(\{[\s\S]*?tone: 'danger',[\s\S]*?\}\);\s*if \(!ok\) return;[\s\S]*?method: 'DELETE'/);
});

test('connected list: rows open a Drawer — no inline settings, no inline disconnect', () => {
  const cc = WIZ['ConnectedChannels.js'];
  assert.match(cc, /import Drawer from '@\/components\/Drawer'/);
  assert.match(cc, /onClick=\{\(\) => setOpenSlug\(ch\.slug\)\}/);
  assert.match(cc, /<Drawer\s+open=\{Boolean\(c\)\}/);
  // the row map renders no form controls and no disconnect
  const rows = cc.slice(cc.indexOf('channels.map((ch)'), cc.indexOf('<Drawer'));
  assert.doesNotMatch(rows, /<input|<textarea|<select|disconnect\(/);
  assert.match(rows, /keyStatus\(ch\)/, 'row chip comes from the honest keyStatus');
  // the page itself no longer renders the list or prefills inline from a row
  assert.doesNotMatch(PAGE, /reg\.channels\.map\(/);
  assert.match(PAGE, /<ConnectedChannels /);
});

test('the wizard reuses the shipped preview/voice/audience data (#111/#112/#115)', () => {
  assert.match(WIZ['TemplatePicker.js'], /previewSourceFor\(t\.templateId, t\.family, samples\.samples, samples\.familySamples\)/);
  assert.match(WIZ['TemplatePicker.js'], /STYLE_CATALOG\.map/);
  assert.match(WIZ['VoicePicker.js'], /VOICES\.map/);
  assert.match(WIZ['VoicePicker.js'], /el\.src = voice\.demo/);
  assert.match(WIZ['SchedulePicker.js'], /AUDIENCES\.map/);
  assert.match(WIZ['SchedulePicker.js'], /suggestionFor\(audience\)/);
  assert.match(WIZ['SchedulePicker.js'], /type="time"/);
  assert.doesNotMatch(ALL, /cron/i, 'no raw cron in the wizard');
});

test('prefill + edit/connected query handling survive the rebuild', () => {
  assert.match(PAGE, /q\.get\('edit'\)/);
  assert.match(PAGE, /q\.get\('connected'\)/);
  assert.match(PAGE, /q\.get\('secretWarning'\)/);
  assert.match(PAGE, /q\.get\('error'\)/);
  assert.match(PAGE, /setForm\(\{ \.\.\.EMPTY_FORM \}\)/, 'reset uses the single EMPTY_FORM');
});

test('design kit: no px one-offs, no hardcoded status hex classes in wizard files', () => {
  assert.doesNotMatch(ALL, /text-\[\d+px\]/);
  assert.doesNotMatch(ALL, /text-t-\d+/);
  assert.doesNotMatch(ALL, /text-(red|sky|emerald|amber)-\d00|text-white\/\d+|border-white\/\d+/);
});
