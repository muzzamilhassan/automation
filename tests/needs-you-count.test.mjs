// Live fix wave A4 (T2-02 / T1-08 / T2-07 / T2-09 / T2-08, 2026-11-20).
// ONE "needs you" number everywhere (home verdict, /tasks, /warnings), honest
// group titles, review links on every review alert, and a /review deep-link
// that shows the script's REAL status with only the valid actions.
// QA: docs/qa/live-fix-wave-a4-qa.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { needsYou, groupRealWarnings } from '../studio/lib/notify-policy.mjs';
import { deriveVerdict } from '../studio/lib/cockpit-verdict.mjs';
import { reviewStatusView } from '../studio/lib/review-actions.mjs';

const strip = (src) => src.replace(/\r\n/g, '\n').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
const LATE = new Date('2026-11-20T23:30:00Z');
const w = (id, severity, channel_id, code, title, extra = {}) => ({ id, severity, channel_id, code, title, created_at: `2026-11-${String(10 + (id % 10)).padStart(2, '0')}`, ...extra });

// The 2026-11-20 production shape, reduced: 11 real rows + quiet notes.
const ROWS = [
  ...['16', '17', '18', '19', '20'].map((d, i) => w(i + 1, 'action_required', 'money-rulebook', 'review_hold', `waiting for your approval — slot 2026-11-${d} held`, { dedupe_key: `money-rulebook:review_hold:2026-11-${d}` })),
  w(6, 'action_required', 'money-rulebook', 'review_timeout', 'approval window passed — script "$100K Barrier A" still awaiting review'),
  w(7, 'action_required', 'money-rulebook', 'review_timeout', 'approval window passed — script "$100K Barrier B" still awaiting review'),
  w(8, 'warning', 'money-rulebook', 'upload_ghost', 'recorded upload missing'),
  w(9, 'warning', 'money-rulebook', 'upload_ghost', 'recorded upload missing'),
  w(10, 'action_required', 'debt-free-doctrine', 'run_failed', "today's run failed"),
  w(11, 'action_required', 'money-rulebook', 'approved_not_published', 'approved video never published — "Hidden Money Rules"'),
  w(12, 'advisory', 'quotequarry', 'upload_orphan', 'untracked upload'),
];

test('N1: THE needs-you number = real problem groups + scripts awaiting approval, held-slot alerts counted once', () => {
  // 3 scripts await approval: the hold/timeout groups describe the same waits
  const n = needsYou({ rows: ROWS, awaiting: 3 });
  assert.equal(n.alerts, 3, 'upload_ghost, run_failed, approved_not_published');
  assert.equal(n.approvals, 3);
  assert.equal(n.count, 6);
  // grouped rows give the same answer as raw rows (the hook passes grouped rows)
  assert.equal(needsYou({ rows: groupRealWarnings(ROWS), awaiting: 3 }).count, 6);
  // no script waiting: the held-slot alerts are the only record, so they count
  assert.deepEqual(
    (({ count, alerts, approvals }) => ({ count, alerts, approvals }))(needsYou({ rows: ROWS, awaiting: 0 })),
    { count: 5, alerts: 5, approvals: 0 },
  );
  assert.equal(needsYou({ rows: [], awaiting: 0 }).count, 0);
  assert.equal(needsYou({ rows: [w(1, 'advisory', 'a', 'x', 't')], awaiting: 0 }).count, 0, 'quiet rows never count');
});

test('N2: THE home verdict headline uses the same number; channel states are rows, not counted', () => {
  const ch = (slug, extra = {}) => ({ slug, label: slug.toUpperCase(), slots: ['22:35'], todayVideos: 1, ...extra });
  const channels = [ch('a'), ch('b', { todayVideos: 0 }), ch('c', { flowPaused: true, todayVideos: 0 })];
  const v = deriveVerdict({ now: LATE, channels, warnings: { status: 'ok', rows: groupRealWarnings(ROWS) }, review: { status: 'ok', count: 3 } });
  assert.equal(v.kind, 'needs_you');
  assert.equal(v.count, 6);
  assert.equal(v.headline, '6 things need you');
  assert.ok(v.items.some((i) => i.key === 'run:b'), 'the not-run channel is still listed');
  // only channel states: nothing is counted, the line says so plainly
  const only = deriveVerdict({ now: LATE, channels, warnings: { status: 'ok', rows: [] }, review: { status: 'ok', count: 0 } });
  assert.equal(only.count, 0);
  assert.equal(only.kind, 'all_good');
  assert.equal(only.headline, 'Nothing needs you');
  assert.match(only.sub, /1 didn't run today/);
  assert.match(only.sub, /1 paused/);
});

test('N3: /tasks header and /warnings "Need you" use the shared helper', () => {
  const tasks = strip(fs.readFileSync('studio/app/tasks/page.js', 'utf8'));
  assert.match(tasks, /import \{ groupRealWarnings, needsYou \} from '@\/lib\/notify-policy\.mjs';/);
  assert.match(tasks, /const need = needsYou\(\{ rows: open, awaiting: scripts\.length \}\);/);
  assert.match(tasks, /\$\{need\.count\} things need you/);
  const wp = strip(fs.readFileSync('studio/app/warnings/page.js', 'utf8'));
  assert.match(wp, /needsYou\(\{ rows: open, awaiting: awaitingCount \}\)/);
  assert.match(wp, /label="Need you" value=\{need\.count\}/);
  assert.match(wp, /apiFetch\('\/api\/review'\)/, 'the approval count comes from the review queue');
  assert.match(fs.readFileSync('studio/lib/cockpit-verdict.mjs', 'utf8'), /needsYou\(/);
});

test('N4: group titles never merge different things under one specific title', () => {
  const groups = groupRealWarnings(ROWS);
  const hold = groups.find((g) => g.code === 'review_hold');
  assert.equal(hold.count, 5);
  assert.equal(hold.title, '5 slots held for review (Nov 16–20)');
  const timeouts = groups.find((g) => g.code === 'review_timeout');
  assert.equal(timeouts.title, '2 scripts past the approval window');
  // identical titles: the same thing repeated keeps "N× title"
  const ghost = groups.find((g) => g.code === 'upload_ghost');
  assert.equal(ghost.title, '2× recorded upload missing');
  // shape stays renderer-compatible
  for (const k of ['id', 'title', 'severity', 'channel_id', 'code', 'count', 'ids', 'latestAt', 'groupKey']) assert.ok(k in hold, k);
  // a range across months reads plainly
  const span = groupRealWarnings([
    w(1, 'action_required', 'mr', 'review_hold', 'waiting for your approval — slot 2026-11-30 held'),
    w(2, 'action_required', 'mr', 'review_hold', 'waiting for your approval — slot 2026-12-02 held'),
  ]);
  assert.equal(span[0].title, '2 slots held for review (Nov 30–Dec 2)');
  // an unknown code with different titles gets a neutral count title
  const other = groupRealWarnings([w(1, 'warning', 'mr', 'odd_code', 'A'), w(2, 'warning', 'mr', 'odd_code', 'B')]);
  assert.equal(other[0].title, '2 odd code alerts');
});

test('N5: every review alert that carries a script id links to /review?id=', () => {
  const wp = strip(fs.readFileSync('studio/app/warnings/page.js', 'utf8'));
  assert.match(wp, /import \{ isRealSeverity, needsYou, scriptIdOf \} from '@\/lib\/notify-policy\.mjs';/);
  assert.doesNotMatch(wp, /w\.code === 'approval_dispatch_failed' \?/, 'no single-code link rule');
  assert.match(wp, /const scriptId = scriptIdOf\(w\);/);
  assert.match(wp, /href=\{`\/review\?id=\$\{encodeURIComponent\(scriptId\)\}`\}/);
});

test('N6: the review deep-link shows the real status and only the valid actions', () => {
  assert.deepEqual(reviewStatusView({ status: 'awaiting_review' }).actions, ['approve', 'reject']);
  assert.deepEqual(reviewStatusView({ status: 'approved' }).actions, ['redispatch']);
  assert.deepEqual(reviewStatusView({ status: 'consumed', video_id: 'v1' }).actions, []);
  assert.deepEqual(reviewStatusView({ status: 'rejected' }).actions, []);
  assert.equal(reviewStatusView({ status: 'approved' }).label, 'approved');
  assert.equal(reviewStatusView({ status: 'consumed', video_id: 'v1' }).label, 'published');
  assert.equal(reviewStatusView({ status: 'rejected' }).label, 'rejected');
  assert.equal(reviewStatusView({ status: 'awaiting_review' }).label, 'awaiting review');
  assert.equal(reviewStatusView({ status: 'awaiting_review', slot_date: '2026-11-20', publish_at: '2026-11-20T14:30:00Z' }).slot, 'slot 2026-11-20 · 14:30 UTC');
  assert.equal(reviewStatusView({ status: 'awaiting_review', slot_date: '2026-11-20' }).slot, 'slot 2026-11-20');
  assert.equal(reviewStatusView({ status: 'awaiting_review' }).slot, null);
  const page = strip(fs.readFileSync('studio/app/review/page.js', 'utf8'));
  assert.doesNotMatch(page, /<Chip tone="accent" dot>awaiting_review<\/Chip>/, 'no hard-coded status chip');
  assert.match(page, /const view = detail \? reviewStatusView\(detail\.script\) : null;/);
  assert.match(page, /<Chip tone=\{view\.tone\} dot>\{view\.label\}<\/Chip>/);
  assert.match(page, /view\.actions\.includes\('approve'\)/);
  assert.match(page, /view\.actions\.includes\('reject'\)/);
  assert.match(page, /view\.actions\.includes\('redispatch'\)/);
  assert.match(page, /view\.slot/);
});
