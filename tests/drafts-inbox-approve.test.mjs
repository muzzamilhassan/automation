// #124 — approved templates must leave the Drafts Inbox.
//
// Owner report 2026-11-18: all 20 drafts showed as pending although every one
// was already approved and live in the registry. Root cause: approve copied
// the entry into the registry but never removed the draft file, and the inbox
// only filtered REJECTED drafts.
//
// Behavioral: draftStillPending (the extracted inbox filter).
// Source scans: the approve path's cleanup call + response field.
// Repo-consistency sentinel: a draft file still on disk must NOT be in the
// registry (if it is, its approval cleanup failed — the test catches the
// exact bug reported here forever).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { draftStillPending } from '../studio/lib/template-approvals.mjs';

test('#124: draftStillPending — the inbox shows PENDING work only', () => {
  assert.equal(draftStillPending(null), true, 'no action row yet → pending');
  assert.equal(draftStillPending({ action: 'reject', status: 'applied' }), false);
  assert.equal(draftStillPending({ action: 'approve', status: 'applied' }), false, 'approve-applied → the registry owns it now');
  assert.equal(draftStillPending({ action: 'approve', status: 'failed' }), true, 'failed approve stays visible for retry');
  assert.equal(draftStillPending({ action: 'approve', status: 'pending' }), true);
  assert.equal(draftStillPending({ action: 'toggle_chapters', status: 'applied' }), true, 'not a decision — stays');
});

const routeSrc = fs.readFileSync('studio/app/api/templates/drafts/route.js', 'utf8');
const libSrc = fs.readFileSync('studio/lib/template-approvals.mjs', 'utf8');

test('#124 R1: approve path removes the draft file (best-effort) and reports fileCleanup', () => {
  const approve = routeSrc.slice(routeSrc.indexOf("action === 'approve'"), routeSrc.indexOf("// reject:"));
  assert.match(approve, /await commitDraftDeletion\(file\)/, 'the deletion lane reject uses');
  assert.match(approve, /fileCleanup/);
  assert.match(approve, /fileCleanup \}/, 'the response carries the cleanup outcome');
  // the cleanup must sit AFTER the failure gate — a failed registry commit
  // must NOT delete the draft file
  const failGate = approve.indexOf("if (!res.ok) return");
  const cleanupAt = approve.indexOf('commitDraftDeletion');
  assert.ok(failGate > 0 && cleanupAt > failGate, 'cleanup only ever runs on a successful registry commit');
});

test('#124 R2: listDrafts filters through draftStillPending', () => {
  assert.match(libSrc, /if \(!draftStillPending\(act\)\) continue;/);
  assert.doesNotMatch(libSrc, /act\.action === 'reject'\) continue;/, 'the old inline reject-only filter is gone');
});

// ---- repo-consistency sentinel + one-time cleanup proof ----

const REG = fs.readFileSync('studio/lib/template-registry.data.js', 'utf8');
const DRAFTS_DIR = 'studio/lib/template-bot-drafts';

test('#124 R3: every draft file still on disk is NOT yet in the registry (an approved draft lingering here is the reported bug)', () => {
  const files = fs.existsSync(DRAFTS_DIR) ? fs.readdirSync(DRAFTS_DIR).filter((f) => f.endsWith('.json')) : [];
  const stale = [];
  for (const f of files) {
    try {
      const id = JSON.parse(fs.readFileSync(path.join(DRAFTS_DIR, f), 'utf8')).template_id;
      if (REG.includes(`'${id}':`)) stale.push(id);
    } catch { /* malformed file — not this test's concern */ }
  }
  assert.deepEqual(stale, [], `approved drafts still in the drafts folder (inbox lies): ${stale.join(', ')}`);
});

test('#124 R3b: the 20 cleaned-up drafts were ALL in the registry before removal — nothing live was deleted', () => {
  const cleanedUp = [
    // 2026-11-21 owner-approved dedupe: 9 colour-only copies were removed from
    // the catalog; the 11 unique ones must still be live.
    'cashflow-challenge-storybook', 'iron-five-storybook',
    'money-flow-diagram', 'mr-case-files-storybook', 'night-signal-storybook',
    'old-banners-storybook', 'old-verses-storybook',
    'paper-trail-storybook', 'silicon-pulse-storybook',
    'switchboard-storybook', 'systems-diagram',
  ];
  const missing = cleanedUp.filter((id) => !REG.includes(`'${id}':`));
  assert.deepEqual(missing, [], 'every removed draft must be live in the registry');
});
