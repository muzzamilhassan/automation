// Live fix wave B4 (2026-11-20 live test) — schedule drawer, timeline and the
// Add Channel wizard.
//   T3-18  Save schedule is disabled until something changed
//   T3-09  the channel's own saved hour stays pickable when another channel shares it
//   T3-25  no "yours · sh…" truncation;  T4-20  "Taken:" sorted by local time
//   T3-21  the Taken legend shows real minutes ("7:13 am")
//   T4-13  no stars (and no picks) while the registry is loading
//   T4-09  a new channel's default short / "Add a short" land on a FREE hour
//   T4-10  zero shorts block Next/Save (at least one daily short)
//   T4-08  the wizard keeps an unsaved draft in sessionStorage
//   T4-14  a bad hex blocks Next;  T4-15  name ≤ 60;  T4-16  eyebrow follows the name
//   T4-17  Review lists designs + audience; "3:35 am your time (22:35 UTC)"
// Pure logic is tested by behaviour; components (with '@/' imports) by
// CRLF-safe source pins. Spec + QA: docs/qa/live-fix-wave-b4-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  channelTimes, takenHours, takenLegend, timelineCell, freeSlotTime, scheduleDirty,
} from '../studio/lib/slot-planner.mjs';
import {
  EMPTY_FORM, NAME_MAX, EYEBROW_MAX, stepIssues, describeSlots, reviewSummary,
  withField, eyebrowFor, renameEyebrow, draftKey, draftSnapshot, parseDraft, sameForm,
} from '../studio/lib/wizard-steps.mjs';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const KARACHI = 300;
const NEW_YORK_WINTER = -300;
const READY = { ...EMPTY_FORM, niche: 'History stories' };

// the live registry the testers saw: QQ + IC share 02:13, MR + DFD share 03
const REGISTRY = [
  { slug: 'quotequarry', label: 'Quote Quarry', cron: '13 2 * * *', kit: { slots: ['22:35'] } },
  { slug: 'investors-compass', label: "Investor's Compass", cron: '13 2 * * *', kit: { slots: ['23:10'] } },
  { slug: 'money-rulebook', label: 'The Money Rulebook', cron: '21 3 * * *', kit: { slots: ['00:05'] } },
  { slug: 'debt-free-doctrine', label: 'Debt-Free Doctrine', kit: { gateCron: '53 3 * * *', slots: ['21:20'] } },
];

/* ------------------------------ slot planner ------------------------------ */

test('P1 takenHours carries the real minute of each taken time', () => {
  const t = takenHours(channelTimes(REGISTRY), { exclude: 'quotequarry', kind: 'start' });
  assert.deepEqual(t.map((x) => [x.hour, x.minute, x.slug]), [
    [2, 13, 'investors-compass'],
    [3, 53, 'debt-free-doctrine'],
    [3, 21, 'money-rulebook'],
  ]);
});

test('P2 (T4-20 + T3-21) the Taken legend is sorted by YOUR clock and shows real minutes', () => {
  const t = takenHours(channelTimes(REGISTRY), { exclude: 'quotequarry', kind: 'start' });
  assert.deepEqual(takenLegend(t, KARACHI), ["Investor's Compass 7:13 am", 'The Money Rulebook 8:21 am', 'Debt-Free Doctrine 8:53 am']);
  // New York: UTC 23 (6 pm) comes BEFORE UTC 2 (9 pm) on the local clock
  const ny = takenLegend([{ hour: 2, minute: 0, label: 'Late' }, { hour: 23, minute: 30, label: 'Early' }], NEW_YORK_WINTER);
  assert.deepEqual(ny, ['Early 6:30 pm', 'Late 9 pm']);
  assert.deepEqual(takenLegend([], KARACHI), []);
  assert.deepEqual(takenLegend(null, KARACHI), []);
});

test('P3 (T3-09) the channel\'s own saved hour stays pickable even when another channel shares it', () => {
  // QQ saved 02:13 (shared with IC), now picked 05 → the 02 cell must stay enabled
  const own = timelineCell({ owners: ["Investor's Compass"], selected: false, own: true });
  assert.equal(own.blocked, false);
  assert.equal(own.tag, 'shared');
  // someone else's hour is still blocked
  const other = timelineCell({ owners: ['Debt-Free Doctrine'], selected: false, own: false });
  assert.equal(other.blocked, true);
  assert.equal(other.tag, 'taken');
  assert.equal(other.strike, true);
  // picked + shared reads short (T3-25: no "yours · sh…")
  const picked = timelineCell({ owners: ['X'], selected: true, own: true });
  assert.equal(picked.tag, 'shared');
  assert.equal(picked.blocked, false);
  assert.ok(picked.tag.length <= 7, 'fits a narrow cell');
  // own hour, nobody else, not picked → marked as the saved time
  assert.equal(timelineCell({ owners: null, selected: false, own: true }).tag, 'saved');
});

test('P4 (T4-13) while loading, no cell is starred and none can be picked', () => {
  const c = timelineCell({ owners: null, selected: false, own: false, star: { hour: 5 }, loading: true });
  assert.equal(c.star, false);
  assert.equal(c.blocked, true);
  const ready = timelineCell({ owners: null, selected: false, own: false, star: { hour: 5 }, loading: false });
  assert.equal(ready.star, true);
  assert.equal(ready.blocked, false);
});

test('P5 (T4-09) freeSlotTime keeps a free preferred time, else moves to the nearest hour with the 1-hour gap', () => {
  const taken = takenHours(channelTimes(REGISTRY), { exclude: 'new-one', kind: 'publish' }); // 22, 23, 0, 21
  assert.equal(freeSlotTime({ prefer: '16:35', taken }), '16:35', 'free + gapped → unchanged');
  const moved = freeSlotTime({ prefer: '22:35', taken });
  assert.notEqual(moved, '22:35');
  assert.match(moved, /:35$/, 'keeps the minute');
  const h = Number(moved.slice(0, 2));
  for (const x of [21, 22, 23, 0]) assert.ok(Math.min(Math.abs(h - x) % 24, 24 - (Math.abs(h - x) % 24)) > 1, `gap from ${x}`);
  assert.equal(moved, '19:35', 'nearest hour that keeps a gap from 21-00');
  // own other shorts are avoided too (two shorts never share an hour)
  assert.equal(freeSlotTime({ prefer: '16:35', taken, own: ['16:35'] }) === '16:35', false);
  // nothing free at all → null (the caller keeps its own default)
  const all = [...Array(24).keys()].map((hour) => ({ hour }));
  assert.equal(freeSlotTime({ prefer: '22:35', taken: all }), null);
});

test('P6 (T3-18) scheduleDirty: days in any order are the same; any real change is dirty', () => {
  const saved = { docDays: ['Wed', 'Sat'], shortDays: ['Mon', 'Tue'], shortsSource: 'clips', gateCron: '13 2 * * *' };
  assert.equal(scheduleDirty(saved, { ...saved, docDays: ['Sat', 'Wed'], gateCron: ' 13 2 * * * ' }), false);
  assert.equal(scheduleDirty(saved, { ...saved, docDays: ['Wed'] }), true);
  assert.equal(scheduleDirty(saved, { ...saved, shortsSource: 'generated' }), true);
  assert.equal(scheduleDirty(saved, { ...saved, gateCron: '13 5 * * *' }), true);
  assert.equal(scheduleDirty(null, saved), false, 'nothing loaded → nothing to save');
});

/* ------------------------------ wizard rules ------------------------------ */

test('W1 (T4-10) zero daily shorts block the schedule step with a plain message', () => {
  const issues = stepIssues('schedule', { form: { ...READY, slots: '' } });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /at least one daily short/i);
  assert.deepEqual(stepIssues('schedule', { form: { ...READY, slots: '19:35' } }), []);
});

test('W2 (T4-14) an invalid accent blocks the look step (never silently kept)', () => {
  assert.match(stepIssues('look', { form: { ...READY, accent: '#12' } })[0], /colour like #38BDF8/);
});

test('W3 (T4-15) names are capped at 60: the form clamps, and a longer one blocks Identity', () => {
  assert.equal(NAME_MAX, 60);
  const f = withField(READY, 'label', 'x'.repeat(200));
  assert.equal(f.label.length, 60);
  assert.match(stepIssues('identity', { form: { ...READY, label: 'y'.repeat(61) } })[0], /60 characters/);
  assert.deepEqual(stepIssues('identity', { form: { ...READY, label: 'y'.repeat(60) } }), []);
});

test('W4 (T4-16) the eyebrow follows a rename and is never cut mid-word', () => {
  // the exact eyebrow the tester got (server cut "QUOTE QU…" mid-word)
  const raw = 'TIMELESS WISDOM, SELF-MASTERY & HUMAN PSYCHOLOGY // QUOTE QU';
  const fixed = eyebrowFor(raw, 'Quote Quarry');
  assert.ok(fixed.length <= EYEBROW_MAX);
  assert.match(fixed, / \/\/ QUOTE QUARRY$/, 'uses the full current name');
  assert.ok(raw.replace(' // QUOTE QU', '').split(/\s+/).join(' ').startsWith(fixed.split(' // ')[0]), 'left side lost whole words only');
  assert.doesNotMatch(fixed.split(' // ')[0], /[,&]$/, 'no dangling comma or &');
  // rename: the old name in the eyebrow becomes the new one
  const f1 = withField({ ...READY, label: 'Quote Quarry', eyebrow: 'WISDOM // QUOTE QUARRY' }, 'label', 'Stone Sayings');
  assert.equal(f1.eyebrow, 'WISDOM // STONE SAYINGS');
  assert.equal(renameEyebrow('WISDOM // QUOTE QU', 'Quote Quarry', 'Calm Minds'), 'WISDOM // CALM MINDS', 'a truncated old name counts');
  // a custom eyebrow that does not carry the name is left alone
  assert.equal(renameEyebrow('OLD MONEY HABITS // OLD MONEY CODE', 'Quote Quarry', 'X'), 'OLD MONEY HABITS // OLD MONEY CODE');
  assert.equal(renameEyebrow('', 'a', 'b'), '');
  // a draft with no name part is only fitted
  assert.ok(eyebrowFor('A '.repeat(80).trim(), '').length <= EYEBROW_MAX);
});

test('W5 (T4-17) daily-short wording: "3:35 am your time (22:35 UTC)", no day words', () => {
  assert.equal(describeSlots('22:35', KARACHI), '3:35 am your time (22:35 UTC)');
  assert.equal(describeSlots('14:30, 22:35', KARACHI), '7:30 pm your time (14:30 UTC); 3:35 am your time (22:35 UTC)');
  assert.doesNotMatch(describeSlots('00:00', NEW_YORK_WINTER), /day/);
});

test('W6 (T4-17) Review lists the chosen thumbnail designs and the audience', () => {
  const s = reviewSummary(
    { ...READY, thumbTemplates: ['bold-split', 'quote-card'] },
    { offsetMin: KARACHI, names: { thumb: (id) => ({ 'bold-split': 'Bold split' })[id] || '' }, audience: 'US & Canada' },
  );
  const rows = (step) => Object.fromEntries(s.find((x) => x.step === step).rows);
  assert.equal(rows('thumbnails').Designs, 'Bold split, Quote card');
  assert.equal(rows('schedule').Audience, 'US & Canada');
  const none = reviewSummary(READY, { offsetMin: KARACHI });
  assert.match(Object.fromEntries(none.find((x) => x.step === 'thumbnails').rows).Designs, /not picked/i);
  assert.equal(Object.fromEntries(none.find((x) => x.step === 'schedule').rows).Audience, 'Not picked');
});

/* ------------------------------- T4-08 draft ------------------------------ */

test('D1 draft keys are per mode and slug; no slug → no key', () => {
  assert.equal(draftKey('edit', 'quotequarry'), 'qs-wizard-draft:edit:quotequarry');
  assert.equal(draftKey('new', 'abc'), 'qs-wizard-draft:new:abc');
  assert.equal(draftKey('anything', 'abc'), 'qs-wizard-draft:new:abc');
  assert.equal(draftKey('edit', ''), '');
});

test('D2 a draft snapshot never carries secrets or tokens and round-trips the form', () => {
  const snap = draftSnapshot({ ...READY, label: 'A', accessToken: 'ya29.x', refresh_token: 'r', apiKey: 'k', tokenSecret: 'YT_TOKEN_X', password: 'p' }, { step: 3, audience: 'us-ca' });
  const json = JSON.stringify(snap);
  for (const bad of ['ya29', 'refresh_token', 'apiKey', 'YT_TOKEN_X', 'password', 'accessToken']) assert.ok(!json.includes(bad), bad);
  const back = parseDraft(json);
  assert.equal(back.form.label, 'A');
  assert.equal(back.form.niche, 'History stories');
  assert.equal(back.step, 3);
  assert.equal(back.audience, 'us-ca');
});

test('D3 parseDraft rejects junk and keeps only known fields', () => {
  for (const bad of ['', 'nope', '{}', '[]', 'null', JSON.stringify({ v: 2, form: {} }), JSON.stringify({ v: 1, form: 'x' })]) {
    assert.equal(parseDraft(bad), null, bad);
  }
  const d = parseDraft(JSON.stringify({ v: 1, form: { label: 'Ok', evil: '<script>', slots: 5 }, step: 'x' }));
  assert.equal(d.form.label, 'Ok');
  assert.ok(!('evil' in d.form));
  assert.ok(!('slots' in d.form), 'wrong types are dropped');
  assert.equal(d.step, 0);
});

test('D4 sameForm ignores untouched optional fields; any edit differs', () => {
  assert.equal(sameForm(EMPTY_FORM, { ...EMPTY_FORM }), true);
  assert.equal(sameForm(EMPTY_FORM, { ...EMPTY_FORM, thumbTemplates: undefined }), true);
  assert.equal(sameForm(EMPTY_FORM, { ...EMPTY_FORM, label: 'x' }), false);
  assert.equal(sameForm({ ...EMPTY_FORM, thumbTemplates: ['a'] }, { ...EMPTY_FORM, thumbTemplates: ['a'] }), true);
  assert.equal(sameForm({ ...EMPTY_FORM, thumbTemplates: ['a'] }, { ...EMPTY_FORM, thumbTemplates: ['b'] }), false);
  assert.equal(sameForm(null, EMPTY_FORM), false);
});

/* ------------------------------ wiring pins ------------------------------- */

const SCHED = read('studio/components/SchedulePanel.js');
const TIMELINE = read('studio/components/SlotTimeline.js');
const PICKER = read('studio/components/wizard/SchedulePicker.js');
const PAGE = read('studio/app/channels/add/page.js');
const ACCENT = read('studio/components/wizard/AccentPicker.js');
const THUMB = read('studio/components/wizard/ThumbnailStep.js');

test('X1 (T3-18) Save schedule is disabled until dirty; the baseline resets after a save', () => {
  assert.match(SCHED, /const dirty = scheduleDirty\(saved, \{ \.\.\.draft, gateCron \}\);/);
  assert.match(SCHED, /isDisabled=\{saving \|\| Boolean\(loadError\) \|\| !schedule \|\| proj\.blocked \|\| !cronState\.valid \|\| !dirty\}/);
  assert.match(SCHED, /setSaved\(\{ \.\.\.draft, gateCron: j\.gateCron \|\| gateCron \}\)/);
  // declared before use (a use-before-declare broke the build last wave)
  assert.ok(SCHED.indexOf('const [saved, setSaved] = useState(null);') < SCHED.indexOf('const dirty = scheduleDirty('));
});

test('X2 (T3-09/T4-13) both pickers pass their own saved hour(s) and the loading flag', () => {
  assert.match(TIMELINE, /export default function SlotTimeline\(\{[^}]*\bown = \[\][^}]*\}\)/);
  assert.match(TIMELINE, /timelineCell\(\{/);
  assert.match(TIMELINE, /takenLegend\(taken, offsetMin\)/);
  assert.match(TIMELINE, /\{!loading && suggestions\.length \? \(/, 'no suggestion list while loading');
  assert.doesNotMatch(TIMELINE, /yours · shared/);
  assert.match(SCHED, /own=\{savedAt \? \[savedAt\.hour\] : \[\]\}/);
  assert.match(SCHED, /loading=\{loading\}/);
  assert.match(PICKER, /own=\{ownHours\}/);
  assert.match(PICKER, /const ownHours = editing \?/, 'only an existing channel has saved hours');
  assert.match(PICKER, /loading=\{!loaded\}/);
});

test('X3 (T4-09/T4-10) new channels default to a free hour, "Add a short" too, and zero shorts warn', () => {
  // "Add a short": nearest free hour (other channels + this channel's other shorts)
  assert.match(PICKER, /const free = freeSlotTime\(\{ prefer, taken, own: rows\.map\(\(r\) => r\.utc\)\.filter\(Boolean\) \}\);/);
  assert.match(PICKER, /At least one daily short is needed\./);
  // the default 22:35 of a NEW channel moves to a free hour once the registry is known
  assert.match(PAGE, /if \(!editSlug\) applyFreeDefault\(slug, r\.channels\);/);
  assert.match(PAGE, /if \(f\.slots !== EMPTY_FORM\.slots\) return f;/, 'only the untouched default moves');
  assert.match(PAGE, /freeSlotTime\(\{ prefer: EMPTY_FORM\.slots, taken: takenHours\(channelTimes\(channels\), \{ exclude: slug, kind: 'publish' \}\) \}\)/);
  // the picker knows which channel it edits (in-page "Edit" has no ?edit= in the URL)
  assert.match(PAGE, /<SchedulePicker[\s\S]*?slug=\{connectedSlug\}[\s\S]*?editing=\{editing\}/);
});

test('X4 (T4-08) the wizard saves a draft to sessionStorage, restores it with a note, warns on unload', () => {
  assert.match(PAGE, /import \{[^}]*draftKey[^}]*\} from '@\/lib\/wizard-steps\.mjs';/);
  assert.match(PAGE, /window\.sessionStorage\.setItem\(/);
  assert.match(PAGE, /window\.sessionStorage\.removeItem\(/);
  assert.match(PAGE, /parseDraft\(window\.sessionStorage\.getItem\(/);
  assert.match(PAGE, /Restored your unsaved setup/);
  assert.match(PAGE, /Start over/);
  assert.match(PAGE, /window\.addEventListener\('beforeunload', /);
  // cleared after a successful save
  const save = PAGE.slice(PAGE.indexOf('const saveProfile = async'), PAGE.indexOf('const ctx = {'));
  assert.match(save, /forgetDraft\(\);/);
  // wave A2 behaviour is untouched
  assert.match(PAGE, /const payload = editing && savedForm\.current \? editPayload\(full, profileBody\(savedForm\.current\)\) : full;/);
  assert.match(PAGE, /savedForm\.current = next;/);
});

test('X5 refs/state used by the draft effects are declared before the effects', () => {
  for (const s of ['const draftReady = useRef(false);', 'const cleanForm = useRef(null);', 'const [draftNote, setDraftNote] = useState(false);']) {
    const at = PAGE.indexOf(s);
    assert.ok(at > 0, s);
    assert.ok(at < PAGE.indexOf('// T4-08: keep the in-progress setup'), `${s} before the draft effect`);
  }
});

test('X6 (T4-14/T4-15/T4-16/T4-17) wizard wiring', () => {
  // a bad hex reaches the form so the look step blocks
  assert.match(ACCENT, /onChange\(HEX_RE\.test\(v\) \? v\.toUpperCase\(\) : v\)/);
  // label goes through withField (60 cap + eyebrow rename)
  assert.match(PAGE, /const setField = useCallback\(\(key, value\) => setForm\(\(f\) => withField\(f, key, value\)\), \[\]\);/);
  // AI / template eyebrow is fitted to the current name
  assert.match(PAGE, /eyebrowFor\(/);
  // Review gets the design names + the audience label
  assert.match(PAGE, /audience: suggestionFor\(audience\)\?\.label/);
  assert.match(THUMB, /onDesigns/);
});
