import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeScriptStore, SCRIPT_STATUSES, CLAIM_VERIFICATIONS } from '../lib/script-store.mjs';

// ---------------------------------------------------------------------------
// #106 Phase 4 T5 (S4) — script store: scripts / script_sources / script_claims.
// Spec: docs/superpowers/specs/2026-10-30-phase4-review-queue-analytics-spec.md
// D14 (tables + video_id write-back owner), D13 (sources/claims contract),
// AC-P4-17 (persisted BEFORE render, full structured render input).
//
// House pattern: tests/warnings-store.test.mjs — every seam injected (SQL
// client), no live Neon in unit CI. The fake is TRANSACTIONAL: writes issued
// between BEGIN and COMMIT are staged and applied only on COMMIT — a
// ROLLBACK (or a mid-transaction failure) discards them, so the tests can
// prove the ONE-TRANSACTION save (D14: "with sources+claims in ONE
// transaction").
// ---------------------------------------------------------------------------

function makeScriptDb({ fail = false, failOn = null } = {}) {
  const calls = [];
  let seq = 1;
  const tables = { scripts: [], script_sources: [], script_claims: [] };
  let inTx = false;
  let staged = [];
  const applied = { scripts: [], script_sources: [], script_claims: [] };

  const client = async (sql, params) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (fail) throw new Error('db down');
    const s = sql.replace(/\s+/g, ' ').trim();
    if (failOn && s.includes(failOn)) throw new Error(`forced failure at: ${failOn}`);
    if (s === 'BEGIN') { inTx = true; staged = []; return []; }
    if (s === 'COMMIT') {
      for (const { t, row } of staged) applied[t].push(row);
      tables.scripts = [...applied.scripts];
      tables.script_sources = [...applied.script_sources];
      tables.script_claims = [...applied.script_claims];
      inTx = false; staged = [];
      return [];
    }
    if (s === 'ROLLBACK') { inTx = false; staged = []; return []; }
    if (s.startsWith('CREATE ') || s.startsWith('DO ') || s.startsWith('ALTER ')) return [];

    let m = s.match(/^INSERT INTO (scripts|script_sources|script_claims) \(([^)]*)\)/);
    if (m) {
      const cols = m[2].split(',').map((c) => c.trim());
      const row = { id: seq++, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      cols.forEach((c, i) => { if (!['created_at', 'updated_at'].includes(c)) row[c] = params[i]; });
      if (inTx) staged.push({ t: m[1], row });
      else applied[m[1]].push(row);
      const view = inTx ? staged : [];
      if (!inTx) tables[m[1]] = applied[m[1]];
      return [{ id: row.id }];
    }
    if (s.startsWith('SELECT') && s.includes('FROM scripts s LEFT JOIN dedupe_verdicts')) {
      let rows = tables.scripts.filter((r) => r.status === 'awaiting_review');
      if (s.includes('AND s.channel_id = $1')) rows = rows.filter((r) => r.channel_id === params[0]);
      return rows.map((r) => ({ ...r, dedupe_verdict: 'pass', dedupe_score: 0.1 }));
    }
    if (s.startsWith('SELECT') && s.includes('FROM scripts WHERE id = $1')) {
      const r = tables.scripts.find((x) => x.id === params[0]);
      return r ? [r] : [];
    }
    if (s.startsWith('SELECT') && s.includes('FROM script_sources WHERE script_id')) {
      return tables.script_sources.filter((r) => r.script_id === params[0]);
    }
    if (s.startsWith('SELECT') && s.includes('FROM script_claims WHERE script_id')) {
      return tables.script_claims.filter((r) => r.script_id === params[0]);
    }
    if (s.startsWith('SELECT') && s.includes('FROM scripts WHERE job_id = $1 AND status')) {
      return tables.scripts
        .filter((r) => r.job_id === params[0] && r.status === 'approved')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 1);
    }
    if (s.startsWith('SELECT') && s.includes('FROM scripts WHERE job_id = $1')) {
      return tables.scripts
        .filter((r) => r.job_id === params[0])
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 1);
    }
    if (s.startsWith('SELECT') && s.includes("status = 'approved'")) {
      const rows = tables.scripts
        .filter((r) => r.channel_id === params[0] && r.status === 'approved')
        .sort((a, b) => b.id - a.id);
      return rows.slice(0, 1);
    }
    if (s.startsWith('SELECT') && s.includes('FROM scripts WHERE channel_id = $1 AND slot_date = $2')) {
      return tables.scripts
        .filter((r) => r.channel_id === params[0] && r.slot_date === params[1])
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (s.startsWith('UPDATE scripts SET status')) {
      const id = params[0];
      const pool = inTx ? staged.map((x) => x.row) : tables.scripts;
      const r = pool.find((x) => x.id === id);
      if (!r) return [];
      // Branch on the SET clause (the first status literal in the statement) —
      // the WHERE guard of a later transition can mention an earlier status.
      if (s.includes("SET status = 'approved'")) {
        if (r.status !== 'awaiting_review') return [];
        r.status = 'approved'; r.approval_by = params[1]; r.approval_at = params[2]; r.approval_note = params[3];
      } else if (s.includes("SET status = 'rejected'")) {
        if (r.status !== 'awaiting_review') return [];
        r.status = 'rejected'; r.rejected_by = params[1]; r.rejected_at = params[2]; r.rejected_note = params[3];
      } else if (s.includes("SET status = 'consumed'")) {
        if (r.status !== 'approved') return [];
        r.status = 'consumed'; r.video_id = params[1]; r.updated_at = params[2];
      }
      return [{ id: r.id }];
    }
    if (s.startsWith('UPDATE scripts SET meta')) {
      const r = tables.scripts.find((x) => x.id === params[0]);
      if (!r) return [];
      r.meta = params[1];
      return [{ id: r.id }];
    }
    throw new Error(`fake db: unexpected sql: ${s.slice(0, 90)}`);
  };
  client.calls = calls;
  client.tables = tables;
  return client;
}

const BASE = {
  channelId: 'quotequarry',
  templateId: 'finance-explainers',
  templateVersion: '1.0.0',
  kind: 'shorts',
  title: 'The Compound Interest Lie',
  text: 'HOOK: everyone says compound interest...\nPOINTS: ...\nCLOSING: ...',
  fullRenderInput: {
    hook: 'everyone says compound interest is your friend',
    points: ['point 1', 'point 2'],
    closing: 'follow for part 2',
    thumbHeadline: 'THE COMPOUND LIE',
    seed: 'desk:abc',
    themes: ['compound growth'],
    publishAt: '2026-11-01T15:00:00Z',
  },
  sources: [
    { url: 'https://example.com/a', title: 'Source A', snippet: 'rates compound...' },
    { url: 'https://example.com/b', title: 'Source B', snippet: 'bank fees...' },
  ],
  claims: [
    { claim: 'average savings rate is 4%', sourceIdx: 0, verification: 'verified' },
    { claim: 'banks profit from idle cash', sourceIdx: 1, verification: 'unverified' },
    { claim: 'inflation eats 3%/yr', sourceIdx: null, verification: 'flagged' },
  ],
  jobId: 'job-1',
  dedupeVerdictId: 41,
  slotDate: '2026-10-31',
  slotIdx: 0,
  publishAt: '2026-11-01T15:00:00Z',
};

// ---------------------------------------------------------------------------
// schema-on-write + D14 shape
// ---------------------------------------------------------------------------

describe('#106 T5 script store — schema-on-write (D14)', () => {
  test('the first write ensures all three D14 tables exactly once, with the pinned vocabularies', async () => {
    const db = makeScriptDb();
    const store = makeScriptStore({ dbClient: db });
    await store.saveScript(BASE);
    await store.saveScript(BASE);
    const creates = db.calls.filter((c) => c.sql.startsWith('CREATE TABLE IF NOT EXISTS scripts'));
    assert.equal(creates.length, 1, 'ensure-schema memoized for N writes');
    const ddl = creates[0].sql;
    for (const col of ['channel_id', 'template_id', 'template_version', 'kind', 'title', 'full_render_input jsonb', 'text', 'status', 'video_id', 'approval_by', 'approval_at', 'approval_note', 'job_id', 'dedupe_verdict_id', 'slot_date', 'publish_at', 'meta']) {
      assert.ok(ddl.includes(col), `scripts DDL carries ${col}`);
    }
    assert.match(ddl, /'draft','awaiting_review','approved','rejected','consumed'/);
    for (const t of ['script_sources', 'script_claims']) {
      assert.equal(db.calls.filter((c) => c.sql.startsWith(`CREATE TABLE IF NOT EXISTS ${t}`)).length, 1, `${t} ensured with the schema`);
    }
    const claimsDdl = db.calls.find((c) => c.sql.startsWith('CREATE TABLE IF NOT EXISTS script_claims')).sql;
    assert.match(claimsDdl, /source_id/, 'claims link their source (nullable — unsourced claims exist)');
    assert.match(claimsDdl, /'verified','unverified','flagged'/);
  });
});

// ---------------------------------------------------------------------------
// transactional save (D14: sources + claims in ONE transaction)
// ---------------------------------------------------------------------------

describe('#106 T5 script store — transactional saveScript (AC-P4-17)', () => {
  test('saveScript writes script + sources + claims in ONE transaction and lands awaiting_review', async () => {
    const db = makeScriptDb();
    const store = makeScriptStore({ dbClient: db });
    const r = await store.saveScript(BASE);
    assert.equal(r.ok, true);
    const sqls = db.calls.map((c) => c.sql);
    assert.equal(sqls.filter((s) => s === 'BEGIN').length, 1, 'exactly one transaction');
    assert.equal(sqls.filter((s) => s === 'COMMIT').length, 1);
    assert.ok(sqls.indexOf('BEGIN') < sqls.findIndex((s) => s.startsWith('INSERT INTO scripts')), 'BEGIN precedes the writes');
    assert.ok(sqls.lastIndexOf('INSERT INTO script_claims') < sqls.indexOf('COMMIT'), 'all writes precede COMMIT');
    assert.equal(db.tables.scripts.length, 1);
    assert.equal(db.tables.scripts[0].status, 'awaiting_review', 'a saved gated script starts awaiting_review');
    assert.equal(db.tables.script_sources.length, 2);
    assert.equal(db.tables.script_claims.length, 3);
    // full render input persisted COMPLETE (resume must never re-generate — D4/D14)
    const stored = JSON.parse(db.tables.scripts[0].full_render_input);
    assert.equal(stored.hook, BASE.fullRenderInput.hook);
    assert.deepEqual(stored.points, BASE.fullRenderInput.points);
    assert.equal(stored.thumbHeadline, BASE.fullRenderInput.thumbHeadline);
    assert.equal(stored.seed, BASE.fullRenderInput.seed);
    assert.deepEqual(stored.themes, BASE.fullRenderInput.themes);
    assert.equal(stored.publishAt, BASE.fullRenderInput.publishAt);
    assert.equal(db.tables.scripts[0].job_id, 'job-1', 'linked to the job (D14)');
    assert.equal(db.tables.scripts[0].dedupe_verdict_id, 41, 'linked to the Phase 3 dedupe verdict (D14)');
  });

  test('claim→source links resolve by index; an unsourced claim carries source_id NULL', async () => {
    const db = makeScriptDb();
    const store = makeScriptStore({ dbClient: db });
    await store.saveScript(BASE);
    const src = db.tables.script_sources;
    const claims = db.tables.script_claims;
    assert.equal(claims[0].source_id, src[0].id, 'claim 0 -> source A');
    assert.equal(claims[1].source_id, src[1].id, 'claim 1 -> source B');
    assert.equal(claims[2].source_id, null, 'claim 2 has no source');
    assert.equal(claims[2].verification, 'flagged');
    assert.equal(src[0].url, 'https://example.com/a');
    assert.equal(src[0].snippet, 'rates compound...');
  });

  test('a mid-transaction failure ROLLBACKs the whole save — no partial script row', async () => {
    const db = makeScriptDb({ failOn: 'INSERT INTO script_sources' });
    const store = makeScriptStore({ dbClient: db });
    const r = await store.saveScript(BASE);
    assert.equal(r.ok, false);
    assert.ok(r.error);
    assert.equal(db.calls.some((c) => c.sql === 'ROLLBACK'), true, 'ROLLBACK emitted through the client');
    assert.equal(db.tables.scripts.length, 0, 'the script row never committed');
    assert.equal(db.tables.script_sources.length, 0);
    assert.equal(db.tables.script_claims.length, 0);
  });

  test('validation rejects before any SQL: channel required, claim verification in vocabulary, source urls required', async () => {
    const db = makeScriptDb();
    const store = makeScriptStore({ dbClient: db });
    assert.match((await store.saveScript({ ...BASE, channelId: '' })).error, /channel/);
    assert.match((await store.saveScript({ ...BASE, claims: [{ claim: 'x', verification: 'true' }] })).error, /verification/);
    assert.match((await store.saveScript({ ...BASE, sources: [{ url: '', title: 'no url' }] })).error, /url/);
    assert.match((await store.saveScript({ ...BASE, claims: [{ claim: 'x', sourceIdx: 9, verification: 'verified' }] })).error, /source/);
    assert.equal(db.calls.some((c) => c.sql.startsWith('INSERT')), false, 'rejected saves never touch SQL');
    assert.match((await store.saveScript({ ...BASE, status: 'bogus' })).error, /status/);
  });
});

// ---------------------------------------------------------------------------
// approve / reject (D16) + pendingFor (the /review list) + write-back seam (D14)
// ---------------------------------------------------------------------------

describe('#106 T5 script store — approval lifecycle (D16) + video_id write-back (D14)', () => {
  async function saved(db) {
    const store = makeScriptStore({ dbClient: db });
    const r = await store.saveScript(BASE);
    assert.equal(r.ok, true);
    return { store, id: r.id };
  }

  test('approve records approval_by/at/note; a second approve is not_open; unknown id is not_found', async () => {
    const db = makeScriptDb();
    const { store, id } = await saved(db);
    const r = await store.approve(id, { by: 'owner', note: 'sources check out' });
    assert.equal(r.ok, true);
    const row = db.tables.scripts.find((x) => x.id === id);
    assert.equal(row.status, 'approved');
    assert.equal(row.approval_by, 'owner');
    assert.equal(row.approval_note, 'sources check out');
    assert.ok(row.approval_at);
    const again = await store.approve(id, { by: 'owner' });
    assert.equal(again.ok, false);
    assert.equal(again.reason, 'not_open', 'the T5 UI distinction (mirrors warnings-store)');
    assert.equal((await store.approve('nope', { by: 'owner' })).reason, 'not_found');
  });

  test('reject records rejected_by/at/note and the script can never be approved afterwards', async () => {
    const db = makeScriptDb();
    const { store, id } = await saved(db);
    const r = await store.reject(id, { by: 'owner', note: 'claim 3 is fabricated' });
    assert.equal(r.ok, true);
    const row = db.tables.scripts.find((x) => x.id === id);
    assert.equal(row.status, 'rejected');
    assert.equal(row.rejected_note, 'claim 3 is fabricated');
    const late = await store.approve(id, { by: 'owner' });
    assert.equal(late.ok, false, 'a rejected script never uploads (D17 lane terminal)');
  });

  test('pendingFor lists awaiting_review scripts with the dedupe verdict joined; approve removes it from pending', async () => {
    const db = makeScriptDb();
    const { store, id } = await saved(db);
    const list = await store.pendingFor(null);
    assert.equal(list.ok, true);
    assert.equal(list.scripts.length, 1);
    assert.equal(list.scripts[0].dedupe_verdict, 'pass', 'Phase 3 verdict joined (AC-P4-20)');
    assert.equal(list.scripts[0].channel_id, 'quotequarry');
    const mine = await store.pendingFor('money-rulebook');
    assert.equal(mine.scripts.length, 0, 'channel filter');
    await store.approve(id, { by: 'owner' });
    assert.equal((await store.pendingFor(null)).scripts.length, 0);
  });

  test('getScript returns the record with its sources and claims (the side-by-side review payload)', async () => {
    const db = makeScriptDb();
    const { store, id } = await saved(db);
    const g = await store.getScript(id);
    assert.equal(g.ok, true);
    assert.equal(g.script.id, id);
    assert.equal(g.sources.length, 2);
    assert.equal(g.claims.length, 3);
    assert.equal((await store.getScript('missing')).script, null);
  });

  test('markConsumed writes the video_id back (D14: the upload sites own the write — this is the seam) and retires the row', async () => {
    const db = makeScriptDb();
    const { store, id } = await saved(db);
    await store.approve(id, { by: 'owner' });
    const latest = await store.latestApproved('quotequarry');
    assert.equal(latest.ok, true);
    assert.equal(latest.script.id, id, 'the write-back call site finds the approved script');
    const c = await store.markConsumed(id, 'vid_abc123');
    assert.equal(c.ok, true);
    const row = db.tables.scripts.find((x) => x.id === id);
    assert.equal(row.status, 'consumed');
    assert.equal(row.video_id, 'vid_abc123');
    const wrong = await store.markConsumed(id, 'vid_again');
    assert.equal(wrong.ok, false, 'consumed is terminal');
  });

  test('recordThumbPick merges the pick into meta (D18) but ONLY for an uploaded (approved/consumed) script — round-1 minor 11', async () => {
    const db = makeScriptDb();
    const { store, id } = await saved(db);
    const early = await store.recordThumbPick(id, { candidate: 2, at: '2026-10-31T10:00:00Z', by: 'owner', applied: true });
    assert.equal(early.ok, false, 'an awaiting script has no video to swap — the pick is refused');
    assert.equal(early.reason, 'not_open');
    await store.approve(id, { by: 'owner' });
    const r = await store.recordThumbPick(id, { candidate: 2, at: '2026-10-31T10:00:00Z', by: 'owner', applied: true });
    assert.equal(r.ok, true);
    assert.equal(db.tables.scripts.find((x) => x.id === id).meta, JSON.stringify({ thumb_pick: { candidate: 2, at: '2026-10-31T10:00:00Z', by: 'owner', applied: true } }));
  });

  test('scriptsForSlot returns the newest record for channel+slot (the gate slot lookup)', async () => {
    const db = makeScriptDb();
    const store = makeScriptStore({ dbClient: db });
    await store.saveScript(BASE);
    const r = await store.scriptsForSlot('quotequarry', '2026-10-31');
    assert.equal(r.ok, true);
    assert.equal(r.scripts.length, 1);
    assert.equal(r.scripts[0].status, 'awaiting_review');
  });
});

// ---------------------------------------------------------------------------
// #106 T5b — the resume lookups + the thumb-candidate record (SEAM 1/2)
// ---------------------------------------------------------------------------

describe('#106 T5b script store — latestApprovedForJob + recordThumbCandidates', () => {
  // local save helper (the T5 suites keep theirs suite-scoped)
  async function savedLocal(db, over = {}) {
    const store = makeScriptStore({ dbClient: db });
    const r = await store.saveScript({ ...BASE, ...over });
    assert.equal(r.ok, true);
    return { store, id: r.id };
  }

  test('latestApprovedForJob returns the job\'s newest APPROVED row only — a generate-only job with several slot rows resumes THE APPROVED one', async () => {
    const db = makeScriptDb();
    const store = makeScriptStore({ dbClient: db });
    await store.saveScript({ ...BASE, jobId: 'job-A', title: 'slot 0' });
    await store.saveScript({ ...BASE, jobId: 'job-A', title: 'slot 1' });
    const noneYet = await store.latestApprovedForJob('job-A');
    assert.equal(noneYet.ok, true);
    assert.equal(noneYet.script, null, 'nothing approved yet — no resume');
    // approve the SECOND row by id (title-keyed — never order-dependent)
    const rows = await store.scriptsForSlot('quotequarry', '2026-10-31');
    const target = rows.scripts.find((s) => s.title === 'slot 1');
    await store.approve(target.id, { by: 'owner' });
    const r = await store.latestApprovedForJob('job-A');
    assert.equal(r.script.id, target.id, 'the approved row is the one found — regardless of created_at order');
    assert.equal(r.script.status, 'approved');
    const other = await store.latestApprovedForJob('job-B');
    assert.equal(other.script, null, 'a different job never leaks its rows');
  });

  test('recordThumbCandidates writes meta.thumb_candidates [{idx,url}] (the /review page shape) for an uploaded script only', async () => {
    const db = makeScriptDb();
    const { store, id } = await savedLocal(db);
    const early = await store.recordThumbCandidates(id, [{ idx: 1, url: 'u1' }]);
    assert.equal(early.ok, false, 'candidates exist only where a render happened — awaiting scripts take none');
    assert.equal(early.reason, 'not_open');
    await store.approve(id, { by: 'owner' });
    const r = await store.recordThumbCandidates(id, [{ idx: 1, url: 'u1' }, { idx: 2, url: 'u2' }, { idx: 3, url: null }]);
    assert.equal(r.ok, true);
    const meta = JSON.parse(db.tables.scripts.find((x) => x.id === id).meta);
    assert.deepEqual(meta.thumb_candidates, [{ idx: 1, url: 'u1' }, { idx: 2, url: 'u2' }, { idx: 3, url: null }]);
    const empty = await store.recordThumbCandidates(id, []);
    assert.equal(empty.ok, false, 'an empty candidate list is a caller bug, not a wipe');
  });

  test('the dead-DB posture covers the new methods ({ ok:false }, never a throw)', async () => {
    const store = makeScriptStore({ dbClient: makeScriptDb({ fail: true }) });
    assert.equal((await store.latestApprovedForJob('j')).ok, false);
    assert.equal((await store.recordThumbCandidates('x', [{ idx: 1, url: 'u' }])).ok, false);
  });
});

// ---------------------------------------------------------------------------
// never-throw (house posture)
// ---------------------------------------------------------------------------

describe('#106 T5 script store — never-throw degradation (AC-P4-5 posture)', () => {
  test('a dead DB returns { ok:false } on every path and never throws', async () => {
    const store = makeScriptStore({ dbClient: makeScriptDb({ fail: true }) });
    assert.equal((await store.saveScript(BASE)).ok, false);
    assert.equal((await store.approve('x', { by: 'o' })).ok, false);
    assert.equal((await store.reject('x', { by: 'o' })).ok, false);
    assert.equal((await store.pendingFor(null)).ok, false);
    assert.equal((await store.getScript('x')).ok, false);
    assert.equal((await store.latestApproved('c')).ok, false);
    assert.equal((await store.scriptsForSlot('c', 'd')).ok, false);
    assert.equal((await store.markConsumed('x', 'v')).ok, false);
    assert.equal((await store.recordThumbPick('x', {})).ok, false);
    assert.equal((await store.latestApprovedForJob('x')).ok, false);
  });

  test('SCRIPT_STATUSES / CLAIM_VERIFICATIONS are the D14 vocabularies', () => {
    assert.deepEqual([...SCRIPT_STATUSES].sort(), ['approved', 'awaiting_review', 'consumed', 'draft', 'rejected']);
    assert.deepEqual([...CLAIM_VERIFICATIONS].sort(), ['flagged', 'unverified', 'verified']);
  });
});
