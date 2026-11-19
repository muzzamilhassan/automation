// Phase 0 — the panel must tell the truth. Source-scan pins for the 23-item
// sweep (research/ui-ux-redesign-2026-11-18.md §3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => fs.readFileSync(p, 'utf8');
const shell = read('studio/components/shell/AppShell.js');
const noMatch = (src, re) => assert.doesNotMatch(src, re);

test('P0-1: no hardcoded nav badge numbers anywhere in the shell/hubs', () => {
  noMatch(shell, /rounded-full text-\[10px\] font-bold bg-accent\/20 text-accent">\s*\n\s*3/);
  noMatch(shell, /text-error-primary\/20 text-error-primary">\s*\n\s*1/);
  // Phase 2: the Inbox badge (approvals + open alerts) replaced the Studio/Operations pair;
  // unknown → no badge, never a guessed number
  assert.match(shell, /i\.badge === 'inbox' && inboxCount/);
  assert.match(shell, /inboxCount=\{pendingReview != null && /);
  noMatch(read('studio/app/studio/page.js'), /badge: '3'/);
  noMatch(read('studio/app/network/page.js'), /Channels \(16\)/);
  noMatch(read('studio/app/templates/page.js'), /100\+|14 Full Stories/);
});

test('P0-2: DB-down answers 503 DB_DOWN and no surface can say "quiet" on error', () => {
  assert.match(read('studio/app/api/warnings/route.js'), /DB_DOWN.*\{ status: 503 \}/);
  assert.match(read('studio/app/api/review/route.js'), /DB_DOWN.*\{ status: 503 \}/);
  const hook = read('studio/components/use-open-warnings.js');
  assert.match(hook, /status: 'error'/);
  const home = read('studio/app/page.js');
  assert.match(home, /warnStatus === 'error'/);
  assert.match(home, /this is not an all-clear/);
  assert.match(read('studio/app/tasks/page.js'), /not an all-clear/);
});

test('P0-3: fake engine lights removed', () => {
  noMatch(shell, /Engine connected/);
  noMatch(shell, /Engine live/);
});

test('P0-4: analytics carries coverage; the constant "real data" chip is gone', () => {
  const route = read('studio/app/api/analytics/route.js');
  assert.match(route, /coverage = \{ ok: \[\], failed: \[\] \}/);
  assert.match(route, /all\.coverage = coverage/);
  assert.match(route, /if \(coverage\.ok\.length > 0\) \{/);
  const home = read('studio/app/page.js');
  noMatch(home, /Chip tone="ok">real data</);
  assert.match(home, /analyticsCoverage/);
});

test('P0-5: the Sep-2026 retention baseline is extinct; analytics draws live only', () => {
  noMatch(read('studio/lib/site-data.js'), /export const RETENTION\b/);
  const an = read('studio/app/analytics/page.js');
  noMatch(an, /RETENTION(?!_GOAL)/);
  noMatch(an, /Sep 19/);
  assert.match(an, /no data/);
});

test('P0-7: the account menu renders the session identity, never "Muzzamil Hassan"', () => {
  noMatch(shell, /Muzzamil Hassan/);
  noMatch(shell, />MH</);
  assert.match(shell, /initialsOf\(me\.name, me\.email\)/);
  assert.match(fs.readFileSync('studio/app/api/me/route.js', 'utf8'), /email: user\.email/);
});

test('P0-8: timeAgo is future-aware', () => {
  assert.match(read('studio/lib/utils.js'), /'in '/);
});

test('P0-9: display severity ladder puts blocking first; consumers use real keys', () => {
  const wp = read('studio/app/warnings/page.js');
  assert.match(wp, /\['blocking', 'action_required', 'warning', 'advisory', 'informational'\]/);
  assert.match(read('studio/app/tasks/page.js'), /blocking: 'bad', action_required: 'warn'/);
  assert.match(read('studio/app/page.js'), /severity === 'blocking'/);
});

test('P0-11: "today" counts only today\'s run', () => {
  assert.match(read('studio/app/api/overview/route.js'), /s\.lastRunDate === todayStr/);
});

test('P0-12: review/warnings show an error card, spinner only without an error', () => {
  assert.match(read('studio/app/review/page.js'), /Can't load the review queue|Can&apos;t load the review queue/);
  assert.match(read('studio/app/warnings/page.js'), /Can&apos;t load warnings/);
});

test('P0-13: the palette confirms production runs and reports results', () => {
  const cp = read('studio/components/shell/CommandPalette.js');
  assert.match(cp, /kind === 'run' && armed !== it\.id/);
  assert.match(cp, /nothing was started/);
  assert.match(cp, /payload: \{ action: 'yt-daily', slug: c\.slug \}/);
});

test('P0-14: live YouTube thumbnail actions confirm first', () => {
  const t = read('studio/app/thumbs/page.js');
  assert.match(t, /Replace the live thumbnail/);
  assert.match(t, /Redesign and replace \$\{selected\.length\} LIVE/);
});

test('P0-15: the wizard can actually start autopilot', () => {
  const w = read('studio/app/channels/add/page.js');
  assert.match(w, /saveProfile\(true\)/);
  assert.match(w, /Save & start autopilot/);
});

test('P0-16: create reads ?template=', () => {
  assert.match(read('studio/app/create/page.js'), /location\.search\)\.get\('template'\)/);
});

test('P0-17 → Phase 2: channel links open the per-channel page; /channels#slug still highlights', () => {
  noMatch(read('studio/components/shell/AppShell.js'), /network\?channel=/);
  assert.match(read('studio/components/shell/AppShell.js'), /\/channels\/\$\{p\.slug\}/);
  assert.match(read('studio/components/shell/CommandPalette.js'), /\/channels\/\$\{c\.slug\}/);
  assert.match(read('studio/app/channels/page.js'), /chan-' \+ c\.slug/);
});

test('P0-18: DataTable defaults the row header to the first labelled column', () => {
  assert.match(read('studio/components/DataTable.js'), /rowHeaderKey = /);
});

test('P0-19/P0-20: music button visible; undefined tokens replaced', () => {
  // Phase 1 tail: the play button is the kit's .icon-btn (visible ink by default)
  const music = read('studio/app/music/page.js');
  assert.match(music, /className="icon-btn shrink-0/);
  noMatch(music, /'transparent'/);
  for (const p of ['studio/app/templates/page.js', 'studio/app/templates/registry/page.js', 'studio/components/TemplateSimulator.js'])
    noMatch(read(p), /var\(--surface-1\)/);
  noMatch(read('studio/app/usage/page.js'), /var\(--error\)/);
});

test('P0-21: .icon-btn lives in @layer components (utilities can override)', () => {
  assert.match(read('studio/app/globals.css'), /@layer components \{\r?\n\.icon-btn/);
});

test('P0-23: the ntfy topic is not printed in the UI', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.js') && read(p).includes('quarry-x7f2k-reports')) offenders.push(p);
    }
  };
  walk('studio/app');
  assert.deepEqual(offenders, []);
});

test('P0-10: one channel, one name — the stale brands.json label is gone', () => {
  const b = JSON.parse(read('lib/brands.json'));
  assert.equal(b['debt-free-doctrine'].label, 'Debt-Free Doctrine');
});

// ---- P1 slice 4a regression guard (2026-11-19): the codemod wrote
// `text-t-11` — a class that does not exist — so 628 texts silently fell back
// to the 14px default. Scale classes must be the bare `t-NN` utilities.
test('P1-4a: no invalid text-t-NN classes; the t-NN utilities are defined', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.js') && /\btext-t-1[0-6]\b/.test(read(p))) offenders.push(p);
    }
  };
  walk('studio/app');
  walk('studio/components');
  assert.deepEqual(offenders, []);
  const css = read('studio/app/globals.css');
  for (const n of ['10', '11', '12', '13', '14', '16']) assert.ok(css.includes(`.t-${n} { font-size: var(--text-`), `.t-${n} missing`);
});

// Phase 2 integration (2026-11-19): the browser check caught /analytics still
// showing a green "real data" chip when every channel's fetch had failed.
test('analytics: all-failed coverage is unavailable; partial says "N of M channels"', () => {
  const an = read('studio/app/analytics/page.js');
  assert.match(an, /!\(d\.coverage && !d\.coverage\.ok\?\.length\)/);
  assert.match(an, /channels<\/Chip> : <Chip tone="ok">real data<\/Chip>/);
});

test('StatCard renders "—" for an unknown value; analytics KPI tiles + search terms never fake 0/"real data"', () => {
  assert.match(read('studio/components/ui.js'), /value == null \? <span className="text-faint">—<\/span>/);
  const an = read('studio/app/analytics/page.js');
  noMatch(an, /real\?\.totals\?\.\w+ \?\? 0/);
  assert.match(an, /termsErr \? <Chip tone="bad">unavailable<\/Chip>/);
});
