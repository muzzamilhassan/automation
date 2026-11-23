// #126 (S-1/S-2) — the fake bell alerts + the static September roadmap page
// are replaced by LIVE data from /api/warnings + /api/review.
//
// Sentinels anchor to CODE SHAPES (import/export/usage), never prose —
// comments naming the deleted symbols must not trip them (house lesson).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => fs.readFileSync(p, 'utf8');
const shellSrc = read('studio/components/shell/AppShell.js');
const homeSrc = read('studio/app/page.js');
const tasksSrc = read('studio/app/tasks/page.js');
const siteSrc = read('studio/lib/site-data.js');
const hookSrc = read('studio/components/use-open-warnings.js');

// code-shape sentinel: an identifier counts as "used" only as a bare code
// identifier — comments AND string literals are stripped first ('ROADMAP' as
// a template chip label in the demo route is data, not the deleted symbol).
const stripComments = (src) => src
  .replace(/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g, "''");
const codeUses = (src, sym) => {
  const code = stripComments(src);
  return code.includes(`import {`) && code.includes(sym) && code.includes(sym) // import or usage
    ? (code.match(new RegExp(`\\b${sym}\\b`, 'g')) || []).length
    : (code.match(new RegExp(`\\b${sym}\\b`, 'g')) || []).length;
};

test('#126 R1: the bell renders real open warnings with severity icons, channel + honest empty state', () => {
  assert.match(shellSrc, /function Notifications\(\{ open, onClose, warnings \}\)/);
  assert.match(shellSrc, /warnings\.rows \|\| \[\]/);
  assert.match(shellSrc, /Nothing needs attention/);
  assert.match(shellSrc, /SEV_ICON\[w\.severity\]/); // P0-9 refresh: real severity keys
  assert.match(shellSrc, /w\.channel_id/);
  assert.match(shellSrc, /See all alerts <ArrowRight/); // live fix wave C1 (T2-21): one name, "Alerts"
});

test('#126 R2: the topbar badge shows the REAL count and hides for clients/failures (no fake number)', () => {
  // live fix wave A4: the badge is THE one count (needsYou: alerts + approvals)
  assert.match(shellSrc, /warningsCanSee && bellCount \? \(/);
  assert.match(shellSrc, /const bellCount = needsYou\(\{ rows: openWarningRows, awaiting \}\)\.count/);
  assert.match(shellSrc, /status unknown/);
  assert.match(shellSrc, /useOpenWarnings\(\)/);
  assert.ok(!/\bALERTS\b/.test(stripComments(shellSrc)), 'ALERTS extinct in AppShell code');
});

// Feedback round 1 (D, 2026-11-19): real problems are LISTED only in the bell +
// Inbox. Home keeps the one-line verdict (a count, linking to /warnings), never
// a warning list; clients never see problems; an error still reads unknown.
test('#126 R3: home shows the verdict line linking to /warnings — no warning list, clients see none', async () => {
  const code = stripComments(homeSrc);
  // the verdict is fed by the live hook's status + rows, and links via verdictHref
  assert.match(homeSrc, /warnings: \{ status: warnStatus, rows: openWarningRows \}/);
  assert.match(homeSrc, /const href = verdictHref\(verdict\)/);
  const { deriveVerdict, verdictHref } = await import('../studio/lib/cockpit-verdict.mjs');
  const ch = [{ slug: 'a', label: 'A', slots: [], todayVideos: 1 }];
  const ok = { status: 'ok', count: 0 };
  // open problems → the line says "N things need you" and links to /warnings
  const v = deriveVerdict({ channels: ch, warnings: { status: 'ok', rows: [{ severity: 'blocking' }] }, review: ok });
  assert.equal(v.kind, 'needs_you');
  assert.equal(verdictHref(v), '/warnings');
  // clients (forbidden) never see problems
  const client = deriveVerdict({ channels: ch, warnings: { status: 'forbidden', rows: [{ severity: 'blocking' }] }, review: { status: 'forbidden', count: null } });
  assert.equal(client.kind, 'all_good');
  assert.equal(verdictHref(client), null);
  // the error state still says status unknown — never an all-clear
  const down = deriveVerdict({ channels: ch, warnings: { status: 'error', rows: [] }, review: ok });
  assert.equal(down.kind, 'unknown');
  assert.match(down.headline, /status unknown/);
  assert.match(down.sub, /not an all-clear/);
  // NO warning list on home: the old card's shapes are gone
  assert.doesNotMatch(code, /openWarningRows\.(slice|map)\(/);
  assert.doesNotMatch(code, /verdict\.items\.map\(/);
  assert.doesNotMatch(homeSrc, /Needs attention|All probes are quiet/);
  assert.ok(!/\bALERTS\b/.test(code) && !/ALERT_ICON/.test(code), 'static alert data extinct in home page');
});

test('#126 R4: /tasks is a LIVE board — warnings + approvals + resolved, honest denied state', () => {
  assert.match(tasksSrc, /fetch\('\/api\/warnings'\)/);
  assert.match(tasksSrc, /fetch\('\/api\/review'\)/);
  assert.match(tasksSrc, /Open warnings/);
  assert.match(tasksSrc, /Awaiting your approval/);
  assert.match(tasksSrc, /Recently resolved/);
  assert.match(tasksSrc, /Owner \/ staff only/);
  assert.match(tasksSrc, /\$\{need\.count\} things need you/); // live fix wave A4: the shared needsYou number
  assert.ok(!/from '@\/lib\/site-data'/.test(tasksSrc), 'tasks reads no static site data');
});

test('#126 R5: ALERTS + ROADMAP exports are gone from site-data; zero code uses remain repo-wide', () => {
  assert.ok(!/export const (ALERTS|ROADMAP)\b/.test(siteSrc), 'exports deleted from site-data.js');
  const offenders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(js|mjs|jsx)$/.test(f.name)) {
        const code = stripComments(read(p));
        if (/\b(ALERTS|ROADMAP)\b/.test(code)) offenders.push(p);
      }
    }
  };
  walk('studio/app');
  walk('studio/components');
  walk('studio/lib');
  assert.deepEqual(offenders, [], 'the static alert/roadmap symbols must stay extinct (code shapes only)');
});

test('#126: the hook contract — canSee=false for clients/failures (call sites hide, never fake)', () => {
  // P0-2 refresh: status contract — DB-down is 'error' (unknown), never quiet
  assert.match(hookSrc, /status: 'error'/);
  assert.match(hookSrc, /status: 'ok'/);
  assert.match(hookSrc, /status: 'forbidden'/);
  assert.match(hookSrc, /fetch\('\/api\/warnings'\)/);
});
