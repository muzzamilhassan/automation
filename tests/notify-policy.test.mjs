// Owner policy 2026-11-19: "just real notifications". The badge/bell/home
// count REAL problems only, grouped; quiet rows never count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { groupRealWarnings, quietCount, isRealSeverity } from '../studio/lib/notify-policy.mjs';

const w = (id, severity, channel_id, code, title, created_at) => ({ id, severity, channel_id, code, title, created_at });

test('the production shape: 180 orphans + 9 real → 5 grouped real notifications', () => {
  const rows = [];
  for (let i = 0; i < 180; i++) rows.push(w(`o${i}`, 'advisory', 'quotequarry', 'upload_orphan', 'untracked upload', '2026-11-15'));
  for (const d of ['16', '17', '18', '19']) rows.push(w(`h${d}`, 'action_required', 'money-rulebook', 'review_hold', `script held for review — slot 2026-11-${d} skipped`, `2026-11-${d}`));
  rows.push(w('t1', 'action_required', 'money-rulebook', 'review_timeout', 'approval window passed — A', '2026-11-16'));
  rows.push(w('t2', 'action_required', 'money-rulebook', 'review_timeout', 'approval window passed — B', '2026-11-16'));
  rows.push(w('g1', 'warning', 'money-rulebook', 'upload_ghost', 'recorded upload missing', '2026-11-18'));
  rows.push(w('g2', 'warning', 'debt-free-doctrine', 'upload_ghost', 'recorded upload missing', '2026-11-18'));
  rows.push(w('f1', 'action_required', 'quotequarry', 'doc_template_foreign_format', 'Doc slot skipped', '2026-11-15'));
  const groups = groupRealWarnings(rows);
  assert.equal(groups.length, 5, 'review_hold×4, review_timeout×2, ghost(MR), ghost(DFD), foreign format');
  assert.equal(quietCount(rows), 180);
  const hold = groups.find((g) => g.code === 'review_hold');
  assert.equal(hold.count, 4);
  // live fix wave A4 (T2-07): four DIFFERENT slots never borrow one slot's title
  assert.equal(hold.title, '4 slots held for review (Nov 16–19)');
  assert.equal(groups.find((g) => g.code === 'review_timeout').title, '2 scripts past the approval window');
  assert.equal(groups.find((g) => g.code === 'upload_ghost').title, 'recorded upload missing');
  assert.equal(groups[0].severity, 'action_required', 'most severe first');
});

test('severity policy: blocking/action_required/warning are real; advisory/informational are quiet', () => {
  for (const s of ['blocking', 'action_required', 'warning']) assert.equal(isRealSeverity(s), true, s);
  for (const s of ['advisory', 'informational', undefined]) assert.equal(isRealSeverity(s), false, String(s));
});

test('the shared hook feeds every surface the grouped REAL list', () => {
  const hook = fs.readFileSync('studio/components/use-open-warnings.js', 'utf8');
  assert.match(hook, /rows: groupRealWarnings\(open\), quiet: quietCount\(open\)/);
});

// 2026-11-19 (found by the live check): AppShell stayed mounted across the
// /login → app navigation, so its alert/identity fetches ran once while
// signed OUT and never re-ran — empty bell + inbox + '··' avatar after every
// sign-in. The data-bearing frame must mount only on real pages.
test('AppShell: bare pages render without the frame; hooks live in ShellFrame', () => {
  const src = fs.readFileSync('studio/components/shell/AppShell.js', 'utf8').replace(/\r\n/g, '\n');
  const def = src.slice(src.indexOf('export default function AppShell'), src.indexOf('function ShellFrame'));
  assert.match(def, /return <ShellFrame>\{children\}<\/ShellFrame>;/);
  assert.doesNotMatch(def, /useOpenWarnings|useMe\(|useState/, 'no data hooks before the bare-page return');
  const frame = src.slice(src.indexOf('function ShellFrame'));
  assert.match(frame, /useOpenWarnings\(\)/);
  assert.match(frame, /useMe\(\)/);
});

test('home chip reads fetchedAt from the payload (no "Invalid Date")', () => {
  const home = fs.readFileSync('studio/app/page.js', 'utf8');
  assert.match(home, /fetchedAt: a\.fetchedAt \|\| null/);
});
