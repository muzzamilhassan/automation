// Live fix wave C3 (2026-11-20 live test) — the channels area.
//   T3-07  music mood comes from the channel's real kit/brand data (no static map)
//   T3-10  "Recent uploads" = this channel's own records, de-duplicated, newest 10
//   T3-16  no developer "Quota advisory" text in the Schedule drawer
//   T3-17  "Goes public" names the long-form time and day(s) too
//   T3-19  the key message clears on typing; soft per-provider format hints
//   T3-21  local times say "your time" and name the day when it isn't today
//   T3-22  header counts "4 active · 1 paused"; unfinished setup says so
//   T3-23  one wording per label; channel names + initials via channel-display
//   T3-24  footer buttons keep icon + label on one line
//   T3-26  card facts wrap on phones
//   Resume on the channel page confirms; T1-24 a clean "Channel not found"
// Pure logic is tested by behaviour; components (with '@/' imports) by
// CRLF-safe source pins. Spec + QA: docs/qa/live-fix-wave-c3-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  overviewMusicFeels, moodText, channelCounts, countsText, needsSetup, SETUP_TEXT,
  recentUploads, localWhen, nextSlotAt, slotLocalText, longPublicText, shortsPublicText,
  plainScheduleWarnings,
} from '../studio/lib/channel-overview.mjs';
import { keyFormatHint } from '../studio/lib/key-hints.mjs';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const KARACHI = 300; // UTC+5
const NEW_YORK_WINTER = -300;

const LIST = read('studio/app/channels/page.js');
const SLUG = read('studio/app/channels/[slug]/page.js');
const DRAWER = read('studio/components/ChannelOverviewDrawer.js');
const ROUTE = read('studio/app/api/overview/route.js');
const SCHED = read('studio/components/SchedulePanel.js');
const KEYS = read('studio/components/ChannelKeysPanel.js');
const TPL = read('studio/components/TemplateAssignPanel.js');
const THUMB = read('studio/components/ThumbnailAssignPanel.js');
const SITE = read('studio/lib/site-data.js');
const MUSIC = read('studio/app/music/page.js');

/* ---------------------------------- T3-07 --------------------------------- */

test('T3-07 EARS: WHEN the registry kit declares musicFeels THEN it wins over the brand file (engine order)', () => {
  assert.deepEqual(overviewMusicFeels({ musicFeels: ['epic'] }, { kit: { musicFeels: ['calming', 'bright'] } }), ['calming', 'bright']);
  assert.deepEqual(overviewMusicFeels({ musicFeels: ['calming', 'bright'] }, { kit: {} }), ['calming', 'bright']);
  assert.deepEqual(overviewMusicFeels({ musicFeels: ['calming'] }, { kit: { musicFeels: [] } }), ['calming'], 'an empty kit list never erases the brand');
  assert.deepEqual(overviewMusicFeels(null, null), []);
  assert.deepEqual(overviewMusicFeels(null, { kit: { musicFeels: 'calm' } }), [], 'non-arrays are ignored');
});

test('T3-07 EARS: the mood reads as plain words; no data reads as empty (the card says "Not set")', () => {
  assert.equal(moodText(['calming', 'bright']), 'Calming · Bright');
  assert.equal(moodText(['epic', 'inspir', 'heroic']), 'Epic · Inspiring · Heroic', 'the engine stem "inspir" reads as a word');
  assert.equal(moodText([]), '');
  assert.equal(moodText(undefined), '');
  assert.equal(moodText(['', '  ', 'calming']), 'Calming');
});

test('T3-07: the static MUSIC_MOODS map is gone and stays gone', () => {
  assert.doesNotMatch(SITE, /export const MUSIC_MOODS\b/);
  const offenders = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(m?js|jsx|tsx?)$/.test(ent.name)) {
        // comments may name the deleted map; code may not
        const code = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
        if (/\bMUSIC_MOODS\b/.test(code)) offenders.push(p);
      }
    }
  };
  for (const d of ['studio/app', 'studio/components', 'studio/lib']) walk(d);
  assert.deepEqual(offenders, []);
});

test('T3-07: the overview exposes musicFeels per channel (kit over brand) and the pages read it', () => {
  assert.match(ROUTE, /musicFeels: overviewMusicFeels\(k, regEntry\)/);
  assert.match(ROUTE, /musicFeels: overviewMusicFeels\(null, e\)/);
  assert.match(ROUTE, /\.map\(\(c\) => \(\{ slug: c\.slug, label: c\.label \|\| c\.slug, accent: c\.accent, musicFeels: c\.musicFeels \|\| \[\] \}\)\)/, 'music tabs get the mood too');
  assert.match(LIST, /const mood = moodText\(c\.musicFeels\);/);
  assert.match(LIST, /\{mood \|\| <span className="text-faint">Not set<\/span>\}/);
  assert.match(MUSIC, /moodText\(/);
});

/* ---------------------------------- T3-10 --------------------------------- */

const up = (title, at, status, videoId = null, kind = 'short') => ({ title, at, status, videoId, kind });

test('T3-10 EARS: WHEN two records share a title and a day THEN one row shows — the published one', () => {
  const rows = recentUploads([
    up('Enron Fall', '2026-09-20T04:30:00Z', 'published', 'gPXNS9erGDM', 'long'),
    up('Enron Fall', '2026-09-20T04:30:00Z', 'published', 'r7JRpBaWNwk', 'long'),
    up('Same Day', '2026-11-18T09:00:00Z', 'scheduled', 'aaaaaaaaaaa'),
    up('same day ', '2026-11-18T21:00:00Z', 'published', 'bbbbbbbbbbb'),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => /enron/i.test(r.title)).videoId, 'gPXNS9erGDM', 'first published kept');
  assert.equal(rows.find((r) => /same day/i.test(r.title)).videoId, 'bbbbbbbbbbb', 'the published one wins');
});

test('T3-10 EARS: the same title on different days is two uploads; newest first; at most 10', () => {
  const items = Array.from({ length: 14 }, (_, i) => up(`Clip ${i}`, `2026-11-${String(i + 1).padStart(2, '0')}T21:20:00Z`, 'published', null));
  items.push(up('Clip 3', '2026-10-01T21:20:00Z', 'published'));
  items.push(up('No date', null, 'unknown'));
  const rows = recentUploads(items);
  assert.equal(rows.length, 10);
  assert.equal(rows[0].title, 'Clip 13');
  assert.equal(rows[9].title, 'Clip 4');
  assert.equal(recentUploads(items, 20).at(-1).title, 'No date', 'undated rows sink');
  assert.equal(recentUploads(items, 20).filter((r) => r.title === 'Clip 3').length, 2);
  assert.deepEqual(recentUploads(null), []);
});

test('T3-10: the channel page reads this channel\'s own library records, never the global 20-row log', () => {
  assert.match(SLUG, /fetch\(`\/api\/library\?slug=\$\{encodeURIComponent\(slug\)\}&limit=60`\)/);
  assert.match(SLUG, /recentUploads\(d\.items, 10\)/);
  assert.doesNotMatch(SLUG, /channelUploads\(data\.logs/);
  assert.match(SLUG, /function RecentUploads\(\{ slug \}\)/);
});

/* ---------------------------------- T3-16 --------------------------------- */

test('T3-16 EARS: the informational quota advisory is dropped; a real limit reads in plain words', () => {
  const advisory = 'Quota advisory: this project\'s uploads are gated at 100 units/upload (legacy math assumed 1700 — 17.0x cheaper), so the shared pool now allows far more uploads per day than the old projection. Edit the youtube_quota_models row (project "workspace-default") to change this.';
  assert.deepEqual(plainScheduleWarnings([advisory]), []);
  assert.deepEqual(
    plainScheduleWarnings(['Advisory: the busiest day plans 9 uploads, over this project\'s insert bucket of 6/day — YouTube would refuse uploads past the bucket even though the unit pool allows them.']),
    ['Too many uploads on the busiest day: 9 planned, YouTube takes 6 a day. The rest would be refused.'],
  );
  const clip = 'No short day shares a doc day — clips will post from the queue backlog only.';
  assert.deepEqual(plainScheduleWarnings([clip, clip, advisory, '', null]), [clip]);
  assert.deepEqual(plainScheduleWarnings(undefined), []);
});

test('T3-16: the Schedule drawer filters warnings on load AND after save', () => {
  assert.match(SCHED, /setModelWarnings\(plainScheduleWarnings\(d\.projection\?\.warnings\)\);/);
  assert.match(SCHED, /const saveWarnings = plainScheduleWarnings\(\[\.\.\.\(j\.projection\?\.warnings \|\| \[\]\), \.\.\.\(j\.warnings \|\| \[\]\)\]\);/);
  assert.doesNotMatch(SCHED, /youtube_quota_models/);
});

/* ---------------------------------- T3-17 --------------------------------- */

test('T3-17 EARS: the long-form line names the local time and day(s), shifting the day across midnight', () => {
  assert.equal(longPublicText('14:30', ['Sat', 'Wed'], KARACHI), 'Long videos go public at 7:30 pm your time on Wed & Sat');
  // 20:20 UTC Fri/Mon = 1:20 am Sat/Tue in Karachi
  assert.equal(longPublicText('20:20', ['Fri', 'Mon'], KARACHI), 'Long videos go public at 1:20 am your time on Tue & Sat');
  // 01:30 UTC Mon = 8:30 pm Sun in New York (winter)
  assert.equal(longPublicText('01:30', ['Mon'], NEW_YORK_WINTER), 'Long videos go public at 8:30 pm your time on Sun');
  assert.equal(longPublicText('12:00', ['Mon', 'Wed', 'Fri'], 0), 'Long videos go public at 12:00 pm your time on Mon, Wed & Fri');
  assert.equal(longPublicText(null, ['Mon'], 0), '');
  assert.equal(longPublicText('12:00', [], 0), '');
  assert.equal(longPublicText('25:00', ['Mon'], 0), '');
});

test('T3-17: the shorts line keeps its own wording', () => {
  assert.equal(shortsPublicText(['22:35'], KARACHI), 'Shorts go public at 3:35 am your time');
  assert.equal(shortsPublicText(['14:30', '22:35'], KARACHI), 'Shorts go public at 7:30 pm and 3:35 am your time');
  assert.equal(shortsPublicText([], KARACHI), '');
});

test('T3-17: the Schedule drawer shows both lines (long-form days follow the draft)', () => {
  assert.match(SCHED, /const \[publishLong, setPublishLong\] = useState\(null\);/);
  assert.match(SCHED, /setPublishLong\(d\.publish\?\.long \|\| null\);/);
  assert.match(SCHED, /const longLine = longPublicText\(publishLong, draft\.docDays, offsetMin\);/);
  assert.match(SCHED, /shortsPublicText\(publish, offsetMin\)/);
  assert.ok(SCHED.indexOf('const [publishLong, setPublishLong]') < SCHED.indexOf('const longLine ='), 'declared before use');
});

/* ---------------------------------- T3-19 --------------------------------- */

test('T3-19 EARS: a key that does not look right gets a soft hint; unknown formats never do', () => {
  assert.match(keyFormatHint('groq', 'abc123', 'Groq'), /Groq keys usually start with gsk_/);
  assert.equal(keyFormatHint('groq', ' gsk_abc ', 'Groq'), null);
  assert.equal(keyFormatHint('gemini', 'AIzaSyX', 'Gemini'), null);
  assert.match(keyFormatHint('hf', 'xx', 'HuggingFace'), /hf_/);
  assert.equal(keyFormatHint('openrouter', 'sk-or-v1-x', 'OpenRouter'), null);
  assert.equal(keyFormatHint('pixabay', 'anything', 'Pixabay'), null, 'no hint where the format is not well known');
  assert.equal(keyFormatHint('groq', '', 'Groq'), null, 'an empty field gets no hint');
});

test('T3-19: typing clears the old message; the hint is shown, never blocks Save', () => {
  assert.match(KEYS, /onChange=\{\(e\) => \{\s*const value = e\.target\.value;\s*setInputs\(\(s\) => \(\{ \.\.\.s, \[p\]: value \}\)\);\s*setMsg\(\(m\) => \(m\[p\] \? \{ \.\.\.m, \[p\]: null \} : m\)\);\s*\}\}/);
  assert.match(KEYS, /const hint = keyFormatHint\(p, inputs\[p\], v\.label\);/);
  assert.match(KEYS, /disabled=\{busy === p\}/, 'Save is never blocked by the hint');
});

/* ---------------------------------- T3-21 --------------------------------- */

const NOW = new Date('2026-11-20T15:00:00Z'); // 8:00 pm Fri in Karachi

test('T3-21 EARS: a local time names the day when it is not today', () => {
  assert.equal(localWhen(new Date('2026-11-20T16:00:00Z'), NOW, KARACHI), '9:00 pm');
  assert.equal(localWhen(new Date('2026-11-20T22:35:00Z'), NOW, KARACHI), '3:35 am tomorrow', 'crosses local midnight');
  assert.equal(localWhen(new Date('2026-11-22T14:30:00Z'), NOW, KARACHI), '7:30 pm Sun');
  assert.equal(localWhen('2026-11-20T22:35:00Z', NOW, KARACHI), '3:35 am tomorrow', 'ISO strings work too');
  assert.equal(localWhen('nope', NOW, KARACHI), '');
});

test('T3-21: the next occurrence of a daily slot, or of a slot on given UTC days', () => {
  assert.equal(nextSlotAt('22:35', NOW).toISOString(), '2026-11-20T22:35:00.000Z');
  assert.equal(nextSlotAt('14:30', NOW).toISOString(), '2026-11-21T14:30:00.000Z', 'already passed today → tomorrow');
  assert.equal(nextSlotAt('14:30', NOW, ['Sun', 'Wed']).toISOString(), '2026-11-22T14:30:00.000Z');
  assert.equal(nextSlotAt('bad', NOW), null);
  assert.equal(slotLocalText('22:35', NOW, KARACHI), '3:35 am tomorrow');
  assert.equal(slotLocalText('14:30', NOW, KARACHI, ['Sat', 'Wed']), '7:30 pm tomorrow');
  assert.equal(slotLocalText('', NOW, KARACHI), '');
});

test('T3-21: card, drawer and page label local times "your time" and keep UTC labelled', () => {
  assert.match(LIST, /Your time: \{localTimes\.join\(' · '\)\}/);
  assert.match(LIST, /\.join\(' · '\)\} UTC/);
  assert.match(DRAWER, /label="Next upload \(your time\)" value=\{localWhen\(next\.at, now, offsetMin\)\}/);
  assert.match(DRAWER, /your time: \$\{localWhen\(slot\.at, now, offsetMin\)\}/);
  assert.doesNotMatch(DRAWER, /value=\{when\(next\.at\)\}/);
  assert.match(SLUG, /slotLocalText\(/);
});

/* ---------------------------------- T3-22 --------------------------------- */

test('T3-22 EARS: the header counts paused channels apart from active ones', () => {
  const rows = [
    { slug: 'a', active: true }, { slug: 'b', active: true }, { slug: 'c', active: true },
    { slug: 'd', active: true }, { slug: 'e', active: true, flowPaused: true }, { slug: 'f', active: false },
  ];
  assert.deepEqual(channelCounts(rows), { active: 4, paused: 1, parked: 1 });
  assert.equal(countsText({ active: 4, paused: 1, parked: 0 }), '4 active · 1 paused');
  assert.equal(countsText({ active: 1, paused: 0, parked: 2 }), '1 active · 2 parked');
  assert.equal(countsText(channelCounts([])), '0 active');
});

test('T3-22 EARS: a wizard channel with no niche says "Setup not finished", never a placeholder niche', () => {
  assert.equal(needsSetup({ fromRegistry: true, niche: '' }), true);
  assert.equal(needsSetup({ fromRegistry: true, niche: 'History' }), false);
  assert.equal(needsSetup({ niche: '' }), false, 'a legacy brand without a niche is not a wizard draft');
  assert.equal(SETUP_TEXT, 'Setup not finished');
  assert.doesNotMatch(ROUTE, /finish setup/);
  assert.match(ROUTE, /niche: e\.niche \|\| '',/);
  assert.match(LIST, /header\(`\$\{countsText\(counts\)\} · every platform account in one place`\)/);
  assert.match(LIST, /needsSetup\(c\) \? \(/);
  assert.match(LIST, /href=\{editHref\(c\.slug\)\}[^>]*>Finish setup<\/Link>/);
  assert.match(SLUG, /needsSetup\(c\)/);
});

/* ---------------------------------- T3-23 --------------------------------- */

test('T3-23: one wording per label — "Active"/"Paused"/"Parked" and "Clips from long videos"', () => {
  for (const src of [LIST, SLUG, DRAWER]) {
    assert.doesNotMatch(src, />(ACTIVE|PAUSED|PARKED)</);
  }
  assert.doesNotMatch(SLUG, /Clips of the long video/);
  assert.match(SLUG, /'Clips from long videos'/);
  assert.match(SCHED, /'Clips from long videos'/);
});

test('T3-23: names and marks come from the shared channel-display helper (MR, not TH)', () => {
  for (const src of [LIST, SLUG, DRAWER]) {
    assert.match(src, /from '@\/lib\/channel-display\.mjs'/);
    assert.match(src, /channelDisplayName\(/);
  }
  assert.match(LIST, /short=\{channelInitials\(c\.label, c\.slug\) \|\| BRAND\[c\.slug\]\?\.short \|\| '•'\}/);
  assert.match(SLUG, /channelInitials\(c\.label, slug\)/);
});

/* ---------------------------------- T3-24 --------------------------------- */

test('T3-24: footer buttons keep the icon and label on one line', () => {
  assert.match(TPL, /<span className="inline-flex items-center gap-1\.5 whitespace-nowrap">\s*\{assigning \? <Loader2[\s\S]*?\} Assign &amp; pin\s*<\/span>/);
  assert.match(THUMB, /<span className="inline-flex items-center gap-1\.5 whitespace-nowrap">\s*\{saving \? <Loader2[\s\S]*?\} Save designs\s*<\/span>/);
});

/* ---------------------------------- T3-26 --------------------------------- */

test('T3-26: card facts wrap instead of cutting off', () => {
  const facts = LIST.slice(LIST.indexOf('{/* key facts */}'), LIST.indexOf('{/* one action row */}'));
  assert.ok(facts.length > 100);
  assert.doesNotMatch(facts, /\btruncate\b/);
  assert.match(facts, /break-words/);
});

/* ------------------------- resume confirm + T1-24 -------------------------- */

test('EARS: WHEN the owner resumes on the channel page THEN a confirm asks first (same as the list)', () => {
  assert.match(SLUG, /const askResume = async \(\) => \{\s*const ok = await confirm\(\{[\s\S]*?confirmLabel: 'Resume autopilot',[\s\S]*?\}\);\s*if \(ok\) setFlow\(true\);/);
  assert.match(SLUG, /onClick=\{askResume\}/);
  assert.doesNotMatch(SLUG, /onClick=\{\(\) => setFlow\(true\)\}/);
});

test('T1-24: an unknown channel shows a clean not-found with a way back to Channels', () => {
  assert.match(SLUG, /title="Channel not found"/);
  assert.match(SLUG, /<PageMissingMark \/>/);
  assert.match(SLUG, />\s*<ArrowLeft size=\{14\} aria-hidden \/> Back to Channels\s*</);
});
