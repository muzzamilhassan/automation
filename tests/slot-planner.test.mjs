// Feedback round 1, items E + F (2026-11-19) — drawers that scroll, less
// text, and ONE schedule picker (SlotTimeline) with honest best times + free
// slots. Spec + QA: docs/qa/feedback-r1-schedule-qa.md.
// (a) behaviour of the pure planner studio/lib/slot-planner.mjs
// (b) source pins for the components (they use '@/' aliases that plain
//     node --test cannot resolve). String.raw regexes, CRLF-robust.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseDailyCron, cronFromUtc, parseHHMM, toHHMM,
  utcToLocalMinutes, timelineHours, zoneLabel,
  channelTimes, takenHours, hourDistance,
  NICHE_PEAKS, peaksForNiche, suggestHours, suggestStartHours,
} from '../studio/lib/slot-planner.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const KARACHI = 300;
const INDIA = 330;

/* --------------------------- cron + clock maths --------------------------- */

test('parseDailyCron reads only the daily "M H * * *" form the engine gates on', () => {
  assert.deepEqual(parseDailyCron('21 3 * * *'), { hour: 3, minute: 21 });
  assert.deepEqual(parseDailyCron(' 5 23 * * * '), { hour: 23, minute: 5 });
  for (const bad of ['', null, '60 1 * * *', '1 24 * * *', '*/5 * * * *', '1 2 * * 1', 'junk']) {
    assert.equal(parseDailyCron(bad), null, String(bad));
  }
});

test('cronFromUtc builds the daily cron and round-trips through parseDailyCron', () => {
  assert.equal(cronFromUtc(3, 21), '21 3 * * *');
  assert.equal(cronFromUtc(20), '0 20 * * *');
  for (let h = 0; h < 24; h++) assert.deepEqual(parseDailyCron(cronFromUtc(h, 35)), { hour: h, minute: 35 });
  assert.equal(cronFromUtc(24, 0), null);
  assert.equal(cronFromUtc(1, 60), null);
});

test('parseHHMM / toHHMM read and write the kit slot form', () => {
  assert.deepEqual(parseHHMM('22:35'), { hour: 22, minute: 35 });
  assert.deepEqual(parseHHMM('0:05'), { hour: 0, minute: 5 });
  assert.equal(parseHHMM('24:00'), null);
  assert.equal(parseHHMM('7pm'), null);
  assert.equal(toHHMM(0, 5), '00:05');
  assert.equal(toHHMM(23, 35), '23:35');
});

test('utcToLocalMinutes wraps around midnight, incl. half-hour zones', () => {
  assert.equal(utcToLocalMinutes(22, 35, KARACHI), 3 * 60 + 35); // 03:35 next day
  assert.equal(utcToLocalMinutes(14, 30, INDIA), 20 * 60);       // 20:00
  assert.equal(utcToLocalMinutes(0, 0, -300), 19 * 60);           // New York winter
});

test('timelineHours: 24 UTC hours sorted by the viewer\'s local clock, labelled locally', () => {
  const t = timelineHours(KARACHI);
  assert.equal(t.length, 24);
  assert.deepEqual([...new Set(t.map((c) => c.hour))].sort((a, b) => a - b), [...Array(24).keys()]);
  assert.equal(t[0].hour, 19, 'local midnight in Karachi = 19:00 UTC');
  assert.equal(t[0].label, '12 am');
  assert.equal(t.find((c) => c.hour === 14).label, '7 pm');
  for (let i = 1; i < 24; i++) assert.ok(t[i].localMinutes > t[i - 1].localMinutes, 'ascending local time');
  // half-hour zone keeps the minutes in the label
  assert.equal(timelineHours(INDIA).find((c) => c.hour === 14).label, '7:30 pm');
});

test('zoneLabel says "your time" with the zone name, readable', () => {
  assert.equal(zoneLabel('Asia/Karachi'), 'your time (Asia/Karachi)');
  assert.equal(zoneLabel('America/New_York'), 'your time (America/New York)');
  assert.equal(zoneLabel(''), 'your time');
});

/* ------------------------- taken hours (live data) ------------------------ */

const REGISTRY = [
  { slug: 'quotequarry', label: 'Quote Quarry', cron: '13 2 * * *', niche: 'Timeless wisdom, self-mastery & human psychology', kit: { slots: ['22:35'], longSlot: '14:30' } },
  { slug: 'money-rulebook', label: 'The Money Rulebook', cron: '21 3 * * *', niche: 'Personal finance rules & money habits', kit: { slots: ['00:05'], longSlot: '22:30' } },
  { slug: 'debt-free-doctrine', label: 'Debt-Free Doctrine', kit: { gateCron: '53 3 * * *', slots: ['21:20'] } },
  { slug: 'yt-bot', label: 'YT-BOT', slots: [], kit: {} },
  { slug: 'parked', label: 'Parked', cron: '0 9 * * *', active: false, kit: { slots: ['09:00'] } },
];

test('channelTimes projects start/publish times from live registry rows (cron, then kit.gateCron)', () => {
  const ct = channelTimes(REGISTRY);
  assert.deepEqual(ct.map((c) => c.slug), ['quotequarry', 'money-rulebook', 'debt-free-doctrine', 'yt-bot'], 'inactive channels hold no slot');
  assert.deepEqual(ct[0], { slug: 'quotequarry', label: 'Quote Quarry', niche: 'Timeless wisdom, self-mastery & human psychology', start: '02:13', publish: ['22:35'], long: '14:30' });
  assert.equal(ct[2].start, '03:53', 'kit.gateCron is the durable fallback');
  assert.equal(ct[3].start, null, 'no cron → no invented start time');
  assert.deepEqual(ct[3].publish, []);
});

test('takenHours: start or publish hours of OTHER channels, labelled, own slug excluded', () => {
  const ct = channelTimes(REGISTRY);
  const start = takenHours(ct, { exclude: 'money-rulebook', kind: 'start' });
  assert.deepEqual(start, [
    { hour: 2, slug: 'quotequarry', label: 'Quote Quarry' },
    { hour: 3, slug: 'debt-free-doctrine', label: 'Debt-Free Doctrine' },
  ]);
  const pub = takenHours(ct, { exclude: 'quotequarry', kind: 'publish' });
  assert.deepEqual(pub.map((t) => t.hour), [0, 21]);
  assert.equal(takenHours(null).length, 0);
});

test('hourDistance is circular', () => {
  assert.equal(hourDistance(23, 0), 1);
  assert.equal(hourDistance(2, 22), 4);
  assert.equal(hourDistance(5, 5), 0);
});

/* ------------------------------ suggestions ------------------------------- */

test('niche table is data keyed by niche wording (no per-channel map), with a general fallback', () => {
  assert.ok(Array.isArray(NICHE_PEAKS) && NICHE_PEAKS.length >= 2);
  const money = peaksForNiche('Personal finance rules & money habits');
  assert.equal(money.region, 'evenings in the US');
  assert.equal(money.general, false);
  const unknown = peaksForNiche('');
  assert.equal(unknown.general, true);
  assert.ok(unknown.peakUtc.length > 0);
});

test('suggestHours: niche source, 3 stars, honest reason text', () => {
  const s = suggestHours({ niche: 'Personal finance rules & money habits' });
  assert.equal(s.length, 3);
  assert.equal(new Set(s.map((x) => x.hour)).size, 3);
  assert.equal(s[0].source, 'niche');
  assert.match(s[0].reason, /^⭐ Best — evenings in the US · typical for this niche$/);
  for (const x of s) assert.match(x.reason, /typical for this niche/);
});

test('suggestHours avoids taken hours AND keeps a 1-hour gap from them', () => {
  const peak = peaksForNiche('Personal finance rules & money habits').peakUtc;
  const taken = [{ hour: peak[0], label: 'A' }];
  const s = suggestHours({ niche: 'Personal finance rules & money habits', takenHours: taken });
  for (const x of s) assert.ok(hourDistance(x.hour, peak[0]) >= 2, `hour ${x.hour} too close to taken ${peak[0]}`);
});

test('suggestHours relaxes to "not exactly taken" only when every gapped hour is gone', () => {
  const taken = [...Array(24).keys()].filter((h) => h % 2 === 0).map((hour) => ({ hour, label: 'X' }));
  const s = suggestHours({ niche: 'History stories', takenHours: taken });
  assert.equal(s.length, 3);
  for (const x of s) assert.equal(x.hour % 2, 1, 'never an exactly-taken hour');
  const all = [...Array(24).keys()].map((hour) => ({ hour, label: 'X' }));
  assert.deepEqual(suggestHours({ niche: 'x', takenHours: all }), []);
});

test('suggestHours source order: real viewers → picked audience → niche → general', () => {
  const viewers = suggestHours({ niche: 'Personal finance rules & money habits', audienceHours: [{ hour: 15, views: 900 }, { hour: 16, views: 400 }] });
  assert.equal(viewers[0].hour, 15);
  assert.equal(viewers[0].source, 'audience');
  assert.match(viewers[0].reason, /based on your channel’s viewers$/);

  const picked = suggestHours({ niche: 'Personal finance rules & money habits', preset: { utc: '19:00', label: 'UK & Ireland' } });
  assert.equal(picked[0].hour, 19);
  assert.equal(picked[0].source, 'preset');
  assert.match(picked[0].reason, /^⭐ Best — evenings for UK & Ireland viewers · the audience you picked$/);

  const general = suggestHours({ niche: '' });
  assert.equal(general[0].source, 'general');
  assert.match(general[0].reason, /general guess/);
});

test('suggestHours never claims analytics when none are passed (empty list = skipped)', () => {
  const s = suggestHours({ niche: 'Personal finance rules & money habits', audienceHours: [] });
  assert.equal(s[0].source, 'niche');
  for (const x of s) assert.doesNotMatch(x.reason, /viewers$/);
});

test('suggestStartHours: free start hours that leave review time before the video goes public', () => {
  // MR goes public 00:05 UTC; others start at 02 and 03 UTC
  const taken = [{ hour: 2, label: 'Quote Quarry' }, { hour: 3, label: 'Debt-Free Doctrine' }];
  const s = suggestStartHours({ publishHours: [0], takenHours: taken });
  assert.equal(s.length, 3);
  for (const x of s) {
    assert.ok(![1, 2, 3, 4].includes(x.hour), `gap kept (${x.hour})`);
    const lead = (0 - x.hour + 24) % 24;
    assert.ok(lead >= 6 && lead <= 22, `lead ${lead}h leaves review time`);
    assert.match(x.reason, /^⭐ (Best|Good) — free · about \d+ h to review before it goes public$/);
    assert.equal(x.source, 'publish');
  }
});

test('suggestStartHours without a publish time: free hours only, said plainly', () => {
  const s = suggestStartHours({ publishHours: [], takenHours: [{ hour: 2, label: 'A' }] });
  assert.equal(s.length, 3);
  for (const x of s) {
    assert.ok(hourDistance(x.hour, 2) >= 2);
    assert.match(x.reason, /no other channel starts near this hour/);
  }
});

/* ---------------------------- source pins: E ------------------------------ */

const DRAWER = read('studio/components/Drawer.js');

test('E1: Drawer renders through a portal on document.body, guarded for SSR', () => {
  assert.match(DRAWER, /import \{ createPortal \} from 'react-dom';/);
  assert.match(DRAWER, /createPortal\(\s*[\s\S]*?,\s*document\.body\s*\)/);
  assert.match(DRAWER, /useSyncExternalStore\(/, 'mounted guard (server snapshot false)');
  assert.match(DRAWER, /if \(!open \|\| !mounted\) return null;/);
});

test('E2: only the Drawer body scrolls; header and footer stay put', () => {
  assert.match(DRAWER, /<div className="fixed inset-0 z-\[60\]"/);
  assert.match(DRAWER, /'absolute inset-y-0 right-0 w-full h-full max-h-\[100dvh\] flex flex-col/);
  assert.match(DRAWER, /<header className="[^"]*shrink-0/);
  assert.match(DRAWER, /<div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [^"]*">\{children\}<\/div>/);
  assert.match(DRAWER, /<footer className="shrink-0 /);
});

test('E3: every accessibility behaviour survives the portal', () => {
  assert.match(DRAWER, /role="dialog"/);
  assert.match(DRAWER, /aria-modal="true"/);
  assert.match(DRAWER, /const onCloseRef = useRef\(onClose\);/);
  assert.match(DRAWER, /if \(document\.querySelector\('\[role="alertdialog"\]'\)\) return;/);
  assert.match(DRAWER, /if \(e\.key === 'Escape'\)/);
  assert.match(DRAWER, /if \(e\.key !== 'Tab' \|\| !panelRef\.current\) return;/);
  assert.match(DRAWER, /document\.body\.style\.overflow = 'hidden';/);
  assert.match(DRAWER, /if \(opener && typeof opener\.focus === 'function'\) opener\.focus\(\);/);
});

const SCHED = read('studio/components/SchedulePanel.js');
const KEYS = read('studio/components/ChannelKeysPanel.js');
const ROUTING = read('studio/components/ProviderRoutingPanel.js');

test('E4: no help paragraphs under headings in the three drawers', () => {
  assert.doesNotMatch(SCHED, /\bhint=/, 'DayPicker has no hint line');
  assert.doesNotMatch(SCHED, /A daily cron in UTC/);
  assert.doesNotMatch(SCHED, /Cut from this channel’s long videos|A new Short is generated for each slot/);
  assert.doesNotMatch(KEYS, /A channel key is used <span/);
  assert.match(KEYS, /Channel keys run before shared keys\. Saved keys are never shown again\./);
  assert.doesNotMatch(ROUTING, /This channel’s overrides run before the workspace defaults; the built-in local services are always the last resort\./);
  assert.doesNotMatch(ROUTING, /Empty chains fall through to the workspace default\./);
  assert.doesNotMatch(ROUTING, /Every covering provider is already in this chain\./);
});

/* ---------------------------- source pins: F ------------------------------ */

const TIMELINE = read('studio/components/SlotTimeline.js');
const PICKER = read('studio/components/wizard/SchedulePicker.js');
const ROUTE = read('studio/app/api/channels/schedule/route.js');
const PLANNER = read('studio/lib/slot-planner.mjs');

test('F8: the planner is pure — no @/ imports', () => {
  assert.doesNotMatch(PLANNER, /from '@\//);
});

test('F1/F2: SlotTimeline renders the local 24-hour grid, taken + suggested marks, zone label', () => {
  assert.match(TIMELINE, /timelineHours\(offsetMin\)/);
  assert.match(TIMELINE, /zoneLabel\(/);
  assert.match(TIMELINE, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(TIMELINE, /`taken by \$\{/);
  assert.match(TIMELINE, /aria-pressed=\{selected\}/);
  assert.match(TIMELINE, /onPick\(c\.hour\)/);
});

test('F1: both pickers use the ONE shared SlotTimeline', () => {
  assert.match(SCHED, /import SlotTimeline from '@\/components\/SlotTimeline';/);
  assert.match(PICKER, /import SlotTimeline from '@\/components\/SlotTimeline';/);
  assert.match(SCHED, /<SlotTimeline\b/);
  assert.match(PICKER, /<SlotTimeline\b/);
});

test('F5: the drawer computes the cron under the hood; raw cron only inside Advanced', () => {
  assert.match(SCHED, /setGateCron\(cronFromUtc\(hour, /);
  assert.match(SCHED, /<details\b[\s\S]*?<summary[^>]*>[\s\S]*?Advanced[\s\S]*?id=\{`gate-cron-\$\{slug\}`\}[\s\S]*?<\/details>/);
});

test('F6: schedule GET adds live channel times (owner/staff only) via the shared planner', () => {
  assert.match(ROUTE, /import \{ channelTimes \} from '@\/lib\/slot-planner\.mjs';/);
  assert.match(ROUTE, /\['owner', 'staff'\]\.includes\(user\.role\) \? channelTimes\(reg\.channels \|\| \[\]\) : \[\]/);
  assert.match(PICKER, /fetch\('\/api\/channels\/registry'\)/);
  assert.match(PICKER, /channelTimes\(/);
  assert.match(SCHED, /takenHours\(channels, \{ exclude: slug, kind: 'start' \}\)/);
  assert.match(PICKER, /takenHours\(/);
});

test('F7: saving still uses the existing paths', () => {
  assert.match(SCHED, /fetch\('\/api\/channels\/schedule', \{\s*method: 'POST'/);
  assert.match(SCHED, /gateCron: gateCron\.trim\(\)/);
  assert.match(PICKER, /onSlots\(/);
  assert.doesNotMatch(PICKER, /cron/i, 'no raw cron in the wizard');
});
