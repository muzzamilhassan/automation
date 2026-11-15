import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWarningsStore, emitWarning, makeAlertDigest, SEVERITIES, PUBLISHING_PATH_CODES } from '../lib/warnings-store.mjs';
import { PROBES, probeParkedChannels, probeChannelToken, tokenForChannel } from '../lib/warnings-probe.mjs';

// ---------------------------------------------------------------------------
// Phase 4 T4 (Batch A) — S3 warnings table + emitters + parked-channel probes.
// Spec: docs/superpowers/specs/2026-10-30-phase4-review-queue-analytics-spec.md
// D9-D12, D25; AC-P4-11..15; review findings 1 (parking deadlock) + 10 (H9
// emitter→severity constraint). Severity ladder + hard-block list per
// research/platform-youtube-policy-compliance-2026-10-24.md §4.1-4.3.
//
// All tests run against INJECTED seams (db client / fetch / token source /
// alert) — no live Neon, no live YouTube, no real ntfy (house pattern:
// tests/ai-adapter.test.mjs).
// ---------------------------------------------------------------------------

// In-memory warnings "database" driven by the same SQL shapes the store
// issues — records every call so tests can assert on SQL + effects.
function makeWarningsDb({ fail = false } = {}) {
  const calls = [];
  let seq = 1;
  const rows = [];
  const client = async (sql, params) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (fail) throw new Error('db down');
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('CREATE ') || s.startsWith('DO ') || s.startsWith('ALTER ')) return [];
    if (s.startsWith('SELECT id, state FROM warnings WHERE dedupe_key')) {
      return rows
        .filter((r) => r.dedupe_key === params[0] && r.state !== 'resolved')
        .map((r) => ({ id: r.id, state: r.state }));
    }
    if (s.startsWith('SELECT state FROM warnings WHERE id')) {
      const r = rows.find((x) => x.id === params[0]);
      return r ? [{ id: r.id, state: r.state }] : [];
    }
    if (s.startsWith('INSERT INTO warnings')) {
      const m = s.match(/INSERT INTO warnings \(([^)]*)\)/);
      assert.ok(m, `unexpected INSERT shape: ${s.slice(0, 60)}`);
      const cols = m[1].split(',').map((c) => c.trim());
      const row = {
        id: seq++, state: 'open', auto_verifiable: false, blocks_publishing: false,
        acknowledged_by: null, acknowledged_at: null,
        resolved_by: null, resolved_at: null, resolve_note: null,
        last_checked_at: null, job_id: null,
      };
      cols.forEach((c, i) => { row[c] = params[i]; });
      rows.push(row);
      return [{ id: row.id }];
    }
    if (s.startsWith('SELECT id, auto_verifiable FROM warnings WHERE channel_id')) {
      const r = rows
        .filter((x) => x.channel_id === params[0] && x.code === params[1] && x.state !== 'resolved')
        .sort((a, b) => b.id - a.id)[0];
      return r ? [{ id: r.id, auto_verifiable: r.auto_verifiable }] : [];
    }
    if (s.includes('last_checked_at = now()')) {
      const r = rows.find((x) => x.id === params[0]);
      if (!r) return [];
      r.last_checked_at = new Date().toISOString();
      if (s.includes('evidence = COALESCE') && params[1]) r.evidence = params[1];
      return [{ id: r.id }];
    }
    if (s.includes("state = 'acknowledged'")) {
      const r = rows.find((x) => x.id === params[1]);
      if (!r || r.state === 'resolved') return [];
      r.state = 'acknowledged';
      r.acknowledged_by = params[0];
      r.acknowledged_at = new Date().toISOString();
      return [{ id: r.id }];
    }
    if (s.includes("state = 'resolved'")) {
      const r = rows.find((x) => x.id === params[2]);
      if (!r || r.state === 'resolved') return [];
      r.state = 'resolved';
      r.resolved_by = params[0];
      r.resolve_note = params[1];
      r.resolved_at = new Date().toISOString();
      return [{ id: r.id }];
    }
    if (s.startsWith('SELECT * FROM warnings WHERE blocks_publishing')) {
      let out = rows.filter((x) => x.blocks_publishing === true && x.state !== 'resolved');
      if (s.includes('AND channel_id = $1')) out = out.filter((x) => x.channel_id === params[0]);
      return out;
    }
    throw new Error(`fake db: unexpected sql: ${s.slice(0, 80)}`);
  };
  client.calls = calls;
  client.rows = rows;
  return client;
}

// A blocking-severity row with the policy citation already attached (the
// shape every publishing-path emitter must produce per §4.2/D9).
function tokenRevokedFields(over = {}) {
  return {
    channel_id: 'quotequarry',
    severity: 'blocking',
    code: 'token_revoked',
    title: 'OAuth token revoked — channel parked',
    explanation: 'YouTube rejected the refresh token; uploads are impossible until re-auth.',
    evidence: 'googleapis 401 {"error":"invalid_grant"}',
    policy_quote: 'If the request fails with invalid_grant, the refresh token has been revoked.',
    policy_url: 'https://developers.google.com/identity/protocols/oauth2',
    quote_fetched_at: '2026-10-30T00:00:00.000Z',
    auto_verifiable: true,
    blocks_publishing: true,
    ...over,
  };
}

const noopAlert = async () => ({ channel: 'none', ok: true });
function alertRecorder() {
  const sends = [];
  const fn = async (a) => { sends.push(a); return { channel: 'ntfy', ok: true }; };
  fn.sends = sends;
  return fn;
}

// ---- severity ladder + emitter allowlist constants (policy §4.1 / H9) ----

test('severity ladder is EXACTLY spec D9 / policy §4.1 — no invented rungs', () => {
  // D9 verbatim: "severity (Blocking | Action-required | Warning | Advisory |
  // Informational — the §4.1 ladder)". Account suspension folds into blocking
  // (D10 hard-block list); uploadStatus=terminated is action_required (§4.1).
  // Membership is what the store validates — rank is never compared in code;
  // the park contract is blocks_publishing, never a severity chip.
  assert.deepEqual(SEVERITIES, ['advisory', 'warning', 'action_required', 'blocking', 'informational']);
  assert.equal(SEVERITIES.includes('critical'), false);
});

test('publishing-path allowlist is exactly the spec H9 list', () => {
  assert.deepEqual([...PUBLISHING_PATH_CODES].sort(), ['token_revoked', 'upload_failed', 'verify_publication_missing']);
});

// ---- schema-on-write + the D9 ladder migration (makeUsageWriter pattern) ----

test('schema-on-write: the first write ensures the warnings schema exactly once, D9 columns', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  await store.openWarning(tokenRevokedFields());
  await store.openWarning(tokenRevokedFields());
  const creates = db.calls.filter((c) => c.sql.startsWith('CREATE TABLE IF NOT EXISTS warnings'));
  assert.equal(creates.length, 1, 'ensure-schema must run once for N writes (memoized)');
  const ddl = creates[0].sql;
  assert.match(ddl, /dedupe_key TEXT NOT NULL/);
  assert.match(ddl, /policy_quote TEXT/);
  assert.match(ddl, /policy_url TEXT/);
  assert.match(ddl, /explanation TEXT/);
  assert.match(ddl, /informational/);
  assert.doesNotMatch(ddl, /critical/);
  assert.doesNotMatch(ddl, /quote_fetched_at[^,]*DEFAULT/i, 'quote_fetched_at is the CALLER-provided fetch date, never DEFAULT now()');
  const uq = db.calls.filter((c) => c.sql.includes('warnings_dedupe_open_uq'));
  assert.equal(uq.length, 1, 'partial unique index (open-window dedupe) created with the schema');
  assert.match(uq[0].sql, /WHERE state <> 'resolved'/);
});

test('D9 ladder migration: a pre-review table with the deviant rung is re-constrained idempotently', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  await store.openWarning(tokenRevokedFields());
  await store.openWarning(tokenRevokedFields());
  const dos = db.calls.filter((c) => c.sql.startsWith('DO '));
  const mig = dos.find((c) => c.sql.includes('pg_constraint'));
  assert.ok(mig, 'severity-CHECK migration (DO block over pg_constraint) runs with the schema');
  assert.match(mig.sql, /informational/);
  assert.doesNotMatch(mig.sql, /'critical'/, 'the new constraint is the D9 set only');
  const renames = dos.filter((c) => c.sql.includes('RENAME COLUMN'));
  assert.equal(renames.length, 1, 'column renames run once per process (guarded, idempotent)');
  assert.match(renames[0].sql, /official_quote TO policy_quote/);
  assert.match(renames[0].sql, /official_source TO policy_url/);
  assert.match(renames[0].sql, /detail TO explanation/);
  assert.match(renames[0].sql, /quote_fetched_at/, 'stale DEFAULT now() on quote_fetched_at is dropped in the same pass');
});

test('audit 2026-11-13 #4: the migration drops the live NOT NULL on quote_fetched_at (most warnings have no policy quote)', async () => {
  // Live Neon (PG 18.7) carried warnings_quote_fetched_at_not_null, so every
  // insert with quote_fetched_at = null failed: no row, dedupe never matched,
  // and every re-fire paged again (~180 ntfy pushes per nightly reconcile).
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  await store.openWarning({ channel_id: 'money-rulebook', severity: 'advisory', code: 'upload_orphan', title: 'untracked upload' });
  const mig = db.calls.find((c) => c.sql.startsWith('DO ') && c.sql.includes('RENAME COLUMN'));
  assert.ok(mig, 'the column-migration DO block runs');
  assert.match(mig.sql, /ALTER TABLE warnings ALTER COLUMN quote_fetched_at DROP NOT NULL;/);
  const create = db.calls.find((c) => c.sql.startsWith('CREATE TABLE IF NOT EXISTS warnings'));
  assert.doesNotMatch(create.sql, /quote_fetched_at timestamptz NOT NULL/i);
});

test('audit 2026-11-13 #4: makeAlertDigest collects pushes and sends ONE summary per run', async () => {
  const sent = alertRecorder();
  const digest = makeAlertDigest({ send: sent, title: 'Upload reconcile', max: 3 });
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  for (let i = 1; i <= 5; i++) {
    const r = await emitWarning(store, { channel_id: 'money-rulebook', severity: 'advisory', code: 'upload_orphan', title: `orphan ${i}`, dedupe_key: `mr:orphan:${i}` }, { sendAlert: digest.sendAlert });
    assert.equal(r.ok, true);
    assert.equal(r.alert.channel, 'digest', 'per-warning push is deferred into the digest');
  }
  assert.equal(sent.sends.length, 0, 'nothing is pushed until flush');
  const out = await digest.flush();
  assert.equal(sent.sends.length, 1, 'exactly one push per run');
  assert.equal(out.count, 5);
  assert.match(sent.sends[0].title, /Upload reconcile: 5 new warning/);
  assert.match(sent.sends[0].text, /orphan 1/);
  assert.match(sent.sends[0].text, /\+2 more/, 'long lists are truncated with a count');
  assert.match(sent.sends[0].text, /\/warnings/, 'points at the Studio warnings page for the full list');
  // a deduped re-fire never reaches the digest
  await emitWarning(store, { channel_id: 'money-rulebook', severity: 'advisory', code: 'upload_orphan', title: 'orphan 1', dedupe_key: 'mr:orphan:1' }, { sendAlert: digest.sendAlert });
  assert.equal((await digest.flush()).count, 0, 'flush resets; deduped re-fires add nothing');
  assert.equal(sent.sends.length, 1, 'an empty digest sends nothing');
});

test('audit 2026-11-13 #4: the digest says when the store was unavailable (ntfy fallback must not hide it)', async () => {
  const sent = alertRecorder();
  const digest = makeAlertDigest({ send: sent, title: 'Upload reconcile' });
  const store = makeWarningsStore(makeWarningsDb({ fail: true }));
  await emitWarning(store, { channel_id: 'quotequarry', severity: 'advisory', code: 'upload_orphan', title: 'orphan x' }, { sendAlert: digest.sendAlert });
  await digest.flush();
  assert.match(sent.sends[0].text, /warnings store unavailable/);
});

test('audit 2026-11-13 #4: the nightly reconcile routes every warning through one digest and flushes it once', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('scripts/upload-reconcile.mjs', 'utf8');
  assert.match(src, /makeAlertDigest\(/);
  assert.match(src, /emitWarning: emitDigested/, 'reconcileChannel must get the digest-wrapped emitter');
  assert.doesNotMatch(src, /^\s*emitWarning,\s*$/m, 'the raw per-warning emitter must not be passed');
  const flush = src.indexOf('digest.flush()');
  assert.ok(flush > src.indexOf('for (const slug of slugs)'), 'flush runs after the channel loop');
  assert.equal(src.split('digest.flush()').length - 1, 1, 'exactly one flush per run');
});

// ---- idempotent dedupe (L4 / D7: re-found condition updates, never duplicates) ----

test('openWarning is idempotent per open condition: same channel+code twice yields ONE row', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const first = await store.openWarning(tokenRevokedFields());
  assert.equal(first.ok, true);
  assert.equal(first.deduped, false);
  const second = await store.openWarning(tokenRevokedFields({ evidence: 'googleapis 401 again' }));
  assert.equal(second.ok, true);
  assert.equal(second.deduped, true, 'the same OPEN condition never creates a second row');
  assert.equal(second.id, first.id, 're-fire returns the existing row id');
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].evidence, 'googleapis 401 again', 'evidence refreshes in place');
  assert.equal(db.calls.filter((c) => c.sql.startsWith('INSERT INTO warnings')).length, 1);
});

test('openWarning allows a NEW episode after the previous row resolved', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const first = await store.openWarning(tokenRevokedFields());
  await store.resolve(first.id, { by: 'owner', note: 're-authed' });
  const second = await store.openWarning(tokenRevokedFields());
  assert.equal(second.ok, true);
  assert.equal(second.deduped, false, 'a RESOLVED row no longer owns the dedupe key');
  assert.equal(db.rows.length, 2);
});

// ---- H9 emitter→severity constraint (review finding 10, AC-P4-12) ----

test('AC-P4-12: analytics_scope_missing CANNOT set blocks_publishing — rejected, no row, NO push', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const alert = alertRecorder();
  const r = await emitWarning(store, {
    channel_id: 'quotequarry',
    severity: 'blocking',
    code: 'analytics_scope_missing',
    title: 'yt-analytics.readonly not granted',
    blocks_publishing: true, // the exact violation: production must never park over an analytics read
  }, { sendAlert: alert });
  assert.equal(r.ok, false);
  assert.match(r.error, /blocks_publishing/);
  assert.equal(db.rows.length, 0, 'no row may exist with a non-publishing-path code blocking publishing');
  assert.equal(alert.sends.length, 0, 'a REJECTED write is a caller bug, not an incident — no ntfy');
  assert.match(r.alert.detail, /write rejected/);
});

test('AC-P4-12: a job-step failure code cannot park production either', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const r = await store.openWarning({
    channel_id: 'quotequarry', severity: 'blocking', code: 'render_step_failed',
    title: 'render failed', blocks_publishing: true,
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /blocks_publishing/);
});

test('AC-P4-12: allowlisted token_revoked CAN set blocks_publishing and lands blocking', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const r = await store.openWarning(tokenRevokedFields());
  assert.equal(r.ok, true);
  assert.equal(db.rows[0].blocks_publishing, true);
  assert.equal(db.rows[0].severity, 'blocking');
});

// ---- IMPORTANT: the severity door (blocking is unrepresentable off the
// hard-block path; the park predicate is blocks_publishing, never chips) ----

test('severity door: a BLOCKING row for a non-allowlist code is rejected even without blocks_publishing', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const r = await store.openWarning({
    channel_id: 'quotequarry', severity: 'blocking', code: 'analytics_scope_missing',
    title: 'no analytics scope', // no blocks_publishing asked — still rejected
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /blocking_severity_requires_publishing_path_code/);
  assert.equal(db.rows.length, 0);
});

test('severity door: a blocking row WITHOUT blocks_publishing is rejected (park predicate keys on blocks_publishing)', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const r = await store.openWarning(tokenRevokedFields({ blocks_publishing: undefined }));
  assert.equal(r.ok, false);
  assert.match(r.error, /blocking_severity_requires_blocks_publishing/);
});

test('blocks_publishing=true requires blocking severity (§4.1: blocking is the only publish-blocked rung)', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const r = await store.openWarning(tokenRevokedFields({ severity: 'advisory' }));
  assert.equal(r.ok, false);
  assert.match(r.error, /severity/);
  const r2 = await store.openWarning(tokenRevokedFields({ severity: 'informational' }));
  assert.equal(r2.ok, false);
});

test('D9 §4.2: blocking rows require policy_quote + policy_url (official only, never a blog)', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const noQuote = await store.openWarning(tokenRevokedFields({ policy_quote: '' }));
  assert.equal(noQuote.ok, false);
  assert.match(noQuote.error, /citation/);
  const noSource = await store.openWarning(tokenRevokedFields({ policy_url: '' }));
  assert.equal(noSource.ok, false);
  assert.match(noSource.error, /citation/);
  // Lower rungs may land without a citation (policy heuristics stay unblocked)
  const advisory = await store.openWarning({
    channel_id: 'quotequarry', severity: 'advisory', code: 'handle_diff_detected', title: 'handle changed upstream',
  });
  assert.equal(advisory.ok, true);
});

test('severity/code/title are validated before any SQL runs', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  assert.match((await store.openWarning(tokenRevokedFields({ severity: 'mega' }))).error, /severity/);
  assert.match((await store.openWarning(tokenRevokedFields({ code: '' }))).error, /code/);
  assert.match((await store.openWarning(tokenRevokedFields({ title: null }))).error, /title/);
  assert.match((await store.openWarning(tokenRevokedFields({ channel_id: '' }))).error, /channel_id/);
  assert.equal(db.rows.length, 0);
  assert.equal(db.calls.some((c) => c.sql.startsWith('INSERT')), false);
});

// ---- acknowledge / resolve audit (AC-P4-15, D11) ----

test('acknowledge records who+when but leaves the warning open (never self-unblocks)', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const w = await store.openWarning(tokenRevokedFields());
  const r = await store.acknowledge(w.id, { by: 'staff-person' });
  assert.equal(r.ok, true);
  assert.equal(db.rows[0].state, 'acknowledged');
  assert.equal(db.rows[0].acknowledged_by, 'staff-person');
  assert.ok(db.rows[0].acknowledged_at);
  const stillParking = await store.openBlockingFor('quotequarry');
  assert.equal(stillParking.rows.length, 1, 'acknowledge must not unblock a revoked token (D11)');
});

test('resolve records resolved_by + note (manual resolves audited, never silent)', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const w = await store.openWarning(tokenRevokedFields());
  await store.resolve(w.id, { by: 'owner', note: 're-authed via oauth-reauth.mjs' });
  assert.equal(db.rows[0].state, 'resolved');
  assert.equal(db.rows[0].resolved_by, 'owner');
  assert.equal(db.rows[0].resolve_note, 're-authed via oauth-reauth.mjs');
  assert.ok(db.rows[0].resolved_at);
  const parking = await store.openBlockingFor('quotequarry');
  assert.equal(parking.rows.length, 0, 'resolved warning un-parks the channel');
});

test('acknowledge/resolve distinguish not_found vs not_open for the T5 UI', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const w = await store.openWarning(tokenRevokedFields());
  assert.equal((await store.resolve(999, { by: 'owner', note: 'x' })).reason, 'not_found');
  assert.equal((await store.acknowledge(999, { by: 'owner' })).reason, 'not_found');
  await store.resolve(w.id, { by: 'owner', note: 'done' });
  assert.equal((await store.acknowledge(w.id, { by: 'staff' })).reason, 'not_open');
  assert.equal((await store.resolve(w.id, { by: 'owner', note: 'again' })).reason, 'not_open');
  assert.equal(db.rows[0].resolve_note, 'done', 'a not_open call mutates nothing');
});

// ---- parking predicate (AC-P4-13) ----

test('openBlockingFor returns only open blocks_publishing rows for the channel', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  await store.openWarning(tokenRevokedFields());
  await store.openWarning({
    channel_id: 'quotequarry', severity: 'informational', code: 'quota_trending', title: 'quota trending toward limit',
  });
  await store.openWarning({
    channel_id: 'investors-compass', severity: 'blocking', code: 'upload_failed',
    title: 'upload rejected', policy_quote: 'q', policy_url: 's', blocks_publishing: true,
  });
  const qq = await store.openBlockingFor('quotequarry');
  assert.equal(qq.rows.length, 1);
  assert.equal(qq.rows[0].code, 'token_revoked');
  const all = await store.openBlockingFor(null);
  assert.equal(all.rows.length, 2, 'no-channel filter enumerates every parked channel (nightly probe)');
});

// ---- autoResolveIf (AC-P4-14/15) ----

test('autoResolveIf resolves an auto-verifiable open warning with the audit trail', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const w = await store.openWarning(tokenRevokedFields());
  const r = await store.autoResolveIf({ channel_id: 'quotequarry', code: 'token_revoked', by: 'probe' });
  assert.equal(r.ok, true);
  assert.equal(r.resolved, true);
  assert.equal(db.rows.find((x) => x.id === w.id).resolved_by, 'probe');
});

test('AC-P4-15: a NON-auto-verifiable blocking row never auto-unparks', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const w = await store.openWarning(tokenRevokedFields({ auto_verifiable: false }));
  const r = await store.autoResolveIf({ channel_id: 'quotequarry', code: 'token_revoked', by: 'probe' });
  assert.equal(r.resolved, false);
  assert.match(r.reason, /not_auto_verifiable/);
  assert.equal(db.rows.find((x) => x.id === w.id).state, 'open');
});

test('autoResolveIf with no matching open warning resolves nothing', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const r = await store.autoResolveIf({ channel_id: 'ghost', code: 'token_revoked', by: 'probe' });
  assert.equal(r.ok, true);
  assert.equal(r.resolved, false);
  assert.match(r.reason, /no_open_warning/);
});

// ---- never-throw writers (AC-P4-5 degradation posture) ----

test('never-throw: a dead DB returns { ok:false } on every writer/reader path', async () => {
  const store = makeWarningsStore(makeWarningsDb({ fail: true }));
  const w = await store.openWarning(tokenRevokedFields());
  assert.equal(w.ok, false);
  assert.ok(w.error);
  assert.equal(w.rejected, undefined, 'a DB failure is not a validation rejection');
  assert.equal((await store.acknowledge(1, { by: 'x' })).ok, false);
  assert.equal((await store.resolve(1, { by: 'x', note: 'n' })).ok, false);
  assert.equal((await store.openBlockingFor('quotequarry')).ok, false);
  assert.equal((await store.autoResolveIf({ channel_id: 'c', code: 'token_revoked' })).ok, false);
  assert.equal((await store.markChecked(1)).ok, false);
});

test('never-throw: emitWarning still alerts when the STORE fails, and never throws', async () => {
  const store = makeWarningsStore(makeWarningsDb({ fail: true }));
  const alert = alertRecorder();
  const r = await emitWarning(store, tokenRevokedFields(), { sendAlert: alert });
  assert.equal(r.ok, false);
  assert.equal(r.rejected, undefined);
  assert.equal(alert.sends.length, 1, 'ntfy is the fallback channel when the DB is dark (AC-P4-5)');
  assert.match(alert.sends[0].title, /token_revoked/);
  assert.match(alert.sends[0].text, /warnings store unavailable/);
});

// ---- emitWarning: write-and-alert, built from the WRITE RESULT (D11, AC-P4-11) ----

test('emitWarning writes the row AND fires the push on first open (AC-P4-11)', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const alert = alertRecorder();
  const r = await emitWarning(store, tokenRevokedFields(), { sendAlert: alert });
  assert.equal(r.ok, true);
  assert.equal(r.deduped, false);
  assert.equal(alert.sends.length, 1);
  assert.match(alert.sends[0].text, /quotequarry/);
  assert.match(alert.sends[0].text, /invalid_grant/);
  assert.match(alert.sends[0].text, /PUBLISHING BLOCKED/, 'the suffix renders only from a landed blocks_publishing row');
});

test('emitWarning does NOT re-alert on a deduped re-fire (once per park episode, D11)', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const alert = alertRecorder();
  await emitWarning(store, tokenRevokedFields(), { sendAlert: alert });
  const second = await emitWarning(store, tokenRevokedFields({ evidence: 'still dead' }), { sendAlert: alert });
  assert.equal(second.deduped, true);
  assert.equal(alert.sends.length, 1, 'probe activity must not re-alert per run');
  assert.equal(db.rows.length, 1);
});

test('emitWarning: a park-capable code fired WITHOUT blocks_publishing renders no PUBLISHING BLOCKED suffix', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const alert = alertRecorder();
  const r = await emitWarning(store, tokenRevokedFields({
    severity: 'action_required', // allowlist code, lower rung, no park
    blocks_publishing: false,
    auto_verifiable: false,
  }), { sendAlert: alert });
  assert.equal(r.ok, true);
  assert.doesNotMatch(alert.sends[0].text, /PUBLISHING BLOCKED/);
});

// ---- parked-channel probes (AC-P4-13/14, review finding 1: no deadlock) ----

function makeFetchStub(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const rule = routes.find((r) => String(url).includes(r.match));
    if (!rule) throw new Error(`fetch stub: unexpected url ${String(url)}`);
    return {
      ok: (rule.status || 200) >= 200 && (rule.status || 200) < 300,
      status: rule.status || 200,
      json: async () => rule.body ?? {},
    };
  };
  fn.calls = calls;
  return fn;
}

const okRefresh = { match: 'oauth2.googleapis.com/token', body: { access_token: 'at-123' } };
const okChannels = { match: 'googleapis.com/youtube/v3/channels', body: { items: [{ id: 'UCx' }] } };

test('probeChannelToken passes on refresh + 1-unit channels.list, both under a 15s abort timeout', async () => {
  const fetchImpl = makeFetchStub([okRefresh, okChannels]);
  const r = await probeChannelToken({ refreshToken: 'rt', clientId: 'id', clientSecret: 'sec', fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(fetchImpl.calls.length, 2);
  assert.match(fetchImpl.calls[1].url, /channels\?part=snippet&mine=true/);
  assert.match(fetchImpl.calls[0].init.body, /grant_type=refresh_token/);
  assert.ok(fetchImpl.calls[0].init.signal instanceof AbortSignal, 'refresh fetch carries AbortSignal.timeout');
  assert.ok(fetchImpl.calls[1].init.signal instanceof AbortSignal, 'channels.list fetch carries AbortSignal.timeout');
});

test('probeChannelToken fails closed when the refresh is still rejected (invalid_grant)', async () => {
  const fetchImpl = makeFetchStub([{ match: 'oauth2.googleapis.com/token', status: 400, body: { error: 'invalid_grant' } }]);
  const r = await probeChannelToken({ refreshToken: 'rt', clientId: 'id', clientSecret: 'sec', fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'refresh');
  assert.equal(fetchImpl.calls.length, 1, 'no YouTube call is spent on a dead token');
});

test('AC-P4-14: probeParkedChannels resolves a passed token probe with resolved_by=probe', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  await store.openWarning(tokenRevokedFields());
  const fetchImpl = makeFetchStub([okRefresh, okChannels]);
  const r = await probeParkedChannels({
    store, clientId: 'id', clientSecret: 'sec', fetchImpl,
    tokenFor: () => 'rt',
  });
  assert.equal(r.ok, true);
  assert.equal(r.checked, 1);
  assert.equal(r.results[0].passed, true);
  assert.equal(r.results[0].resolved, true);
  assert.equal(db.rows[0].state, 'resolved');
  assert.equal(db.rows[0].resolved_by, 'probe');
  assert.ok(db.rows[0].last_checked_at, 'last_checked stamped even on the happy path');
});

test('AC-P4-13: a failing probe leaves the warning open and stamps last_checked', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  await store.openWarning(tokenRevokedFields());
  const fetchImpl = makeFetchStub([{ match: 'oauth2.googleapis.com/token', status: 400, body: {} }]);
  const r = await probeParkedChannels({ store, clientId: 'i', clientSecret: 's', fetchImpl, tokenFor: () => 'rt' });
  assert.equal(r.results[0].passed, false);
  assert.equal(db.rows[0].state, 'open', 'channel stays parked');
  assert.ok(db.rows[0].last_checked_at);
});

test('AC-P4-15 + QA row 16: unmapped codes are neither probed NOR stamped — they stay open', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  const w = await store.openWarning({
    channel_id: 'quotequarry', severity: 'action_required', code: 'review_gating_inactive',
    title: 'registry drift — gate cannot resolve assignment',
  });
  const fetchImpl = makeFetchStub([]);
  const r = await probeParkedChannels({ store, clientId: 'i', clientSecret: 's', fetchImpl, tokenFor: () => 'rt' });
  assert.equal(r.checked, 0, 'no probe exists for review_gating_inactive — nothing runs');
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(db.rows[0].state, 'open');
  assert.equal(db.rows.find((x) => x.id === w.id).last_checked_at, null, 'not stamped — only mapped+verifiable rows get check stamps');
});

test('probeParkedChannels continues past a channel with no resolvable token', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  await store.openWarning(tokenRevokedFields());
  await store.openWarning(tokenRevokedFields({ channel_id: 'money-rulebook' }));
  const fetchImpl = makeFetchStub([okRefresh, okChannels]);
  const r = await probeParkedChannels({
    store, clientId: 'i', clientSecret: 's', fetchImpl,
    tokenFor: (slug) => (slug === 'quotequarry' ? 'rt' : null),
  });
  assert.equal(r.checked, 2);
  assert.equal(r.results.find((x) => x.channel_id === 'quotequarry').passed, true);
  assert.equal(r.results.find((x) => x.channel_id === 'money-rulebook').reason, 'no_refresh_token');
  assert.equal(db.rows.find((x) => x.channel_id === 'money-rulebook').state, 'open');
});

test('probeParkedChannels only probes rows marked auto_verifiable with a mapped probe', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  await store.openWarning(tokenRevokedFields({ auto_verifiable: false }));
  const fetchImpl = makeFetchStub([]);
  const r = await probeParkedChannels({ store, clientId: 'i', clientSecret: 's', fetchImpl, tokenFor: () => 'rt' });
  assert.equal(r.checked, 0);
  assert.equal(fetchImpl.calls.length, 0);
});

test('probeParkedChannels accepts a single channelId (matrix lane / "re-check now" scoping)', async () => {
  const db = makeWarningsDb();
  const store = makeWarningsStore(db);
  await store.openWarning(tokenRevokedFields());
  await store.openWarning(tokenRevokedFields({ channel_id: 'money-rulebook' }));
  const fetchImpl = makeFetchStub([okRefresh, okChannels]);
  const r = await probeParkedChannels({
    store, channelId: 'money-rulebook', clientId: 'i', clientSecret: 's', fetchImpl, tokenFor: () => 'rt',
  });
  assert.equal(r.checked, 1);
  assert.equal(r.results[0].channel_id, 'money-rulebook');
});

test('probe map exposes token_revoked and nothing else until Batch B adds probes', () => {
  assert.deepEqual(Object.keys(PROBES), ['token_revoked']);
});

// ---- token resolution (env first, vault file fallback — yt-daily channelAuth pattern) ----

test('tokenForChannel reads YT_TOKEN_<SLUG> env JSON, dashes to underscores', () => {
  const env = { YT_TOKEN_QUOTEQUARRY: JSON.stringify({ refresh_token: 'env-rt' }) };
  assert.equal(tokenForChannel('quotequarry', { env, fsImpl: { existsSync: () => false, readFileSync: () => '' } }), 'env-rt');
  assert.equal(tokenForChannel('investors-compass', { env: { YT_TOKEN_INVESTORS_COMPASS: '{"refresh_token":"rt2"}' }, fsImpl: { existsSync: () => false } }), 'rt2');
});

test('tokenForChannel falls back to yt-mcp/channels/<slug>/token.json, returns null when absent', () => {
  const fsImpl = {
    existsSync: (p) => /channels[\\/]money-rulebook[\\/]token\.json$/.test(p),
    readFileSync: () => JSON.stringify({ refresh_token: 'file-rt' }),
  };
  assert.equal(tokenForChannel('money-rulebook', { env: {}, fsImpl }), 'file-rt');
  assert.equal(tokenForChannel('ghost', { env: {}, fsImpl }), null);
  assert.equal(tokenForChannel('bad', { env: { YT_TOKEN_BAD: 'not-json{' }, fsImpl: { existsSync: () => false } }), null);
});
