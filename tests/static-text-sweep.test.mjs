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
  assert.match(shellSrc, /open the warning triage →/);
});

test('#126 R2: the topbar badge shows the REAL count and hides for clients/failures (no fake number)', () => {
  assert.match(shellSrc, /warningsCanSee && openWarningRows\.length \? \(/);
  assert.match(shellSrc, /status unknown/);
  assert.match(shellSrc, /useOpenWarnings\(\)/);
  assert.ok(!/\bALERTS\b/.test(stripComments(shellSrc)), 'ALERTS extinct in AppShell code');
});

test('#126 R3: the home Needs-attention card is real + hidden for clients', () => {
  assert.match(homeSrc, /\{warningsCanSee \|\| warnStatus === 'error' \? \(/);
  assert.match(homeSrc, /warnStatus === 'error' \? \(/);
  assert.match(homeSrc, /openWarningRows\.length\} real problem/); // 2026-11-19: only real, grouped problems
  assert.match(homeSrc, /openWarningRows\.slice\(0, 4\)\.map/);
  assert.match(homeSrc, /href="\/warnings"/);
  assert.match(homeSrc, /All probes are quiet/);
  assert.ok(!/\bALERTS\b/.test(stripComments(homeSrc)) && !/ALERT_ICON/.test(stripComments(homeSrc)), 'static alert data extinct in home page');
});

test('#126 R4: /tasks is a LIVE board — warnings + approvals + resolved, honest denied state', () => {
  assert.match(tasksSrc, /fetch\('\/api\/warnings'\)/);
  assert.match(tasksSrc, /fetch\('\/api\/review'\)/);
  assert.match(tasksSrc, /Open warnings/);
  assert.match(tasksSrc, /Awaiting your approval/);
  assert.match(tasksSrc, /Recently resolved/);
  assert.match(tasksSrc, /Owner \/ staff only/);
  assert.match(tasksSrc, /\$\{total\} things need you/);
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
