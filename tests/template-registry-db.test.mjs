import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRegistryDb, getRegistryDb, adaptPostgres } from '../studio/lib/template-registry-db.js';

// ---------------------------------------------------------------------------
// Stub client contract (fixture seam — no live Neon in tests).
//
// The module calls the client as `client(sqlText, params)` and awaits an
// array of row objects (postgres.js-compatible positional-param style:
// $1..$n placeholders, snake_case column names on returned rows).
//
// The stub understands exactly the SQL shapes the registry DB layer emits
// (nothing more — so a passing test cannot be trivially green):
//   - CREATE TABLE IF NOT EXISTS <t> (...)          -> recorded, no-op
//   - ALTER TABLE <t> ADD COLUMN IF NOT EXISTS ...   -> recorded, no-op
//   - WITH swapped_out AS (UPDATE ...), upsert AS (INSERT ...), audit AS
//     (INSERT INTO template_assignment_audit ... SELECT ...) SELECT ... FROM audit
//     -> the Phase 5 swap: deactivates every OTHER active row matching the
//     WHERE (supports `= $n`, `= true`, and `<> $n`), upserts the new row,
//     writes the audit row (from_family = the replaced families joined with
//     ',' when several were replaced), returns the projected audit row
//   - SELECT [DISTINCT] <cols> FROM <t> [WHERE ...] -> filters stored rows
//     WHERE conditions supported: `<col> = $n` and `<col> = true|false`
//   - INSERT INTO <t> (cols) VALUES ($1..$n)
//     [ON CONFLICT (keycols) DO UPDATE SET col = $n ...] -> upsert keyed on
//     the ON CONFLICT columns (composite keys joined with NUL); without
//     ON CONFLICT the row is appended (template_assignment_audit)
//   - UPDATE <t> SET <col> = true|false WHERE ...   -> in-place update
//
// State is exposed for assertions: `tables` (Map table -> Map key -> row)
// and `calls` (every {sql, params} executed).
// ---------------------------------------------------------------------------

function makeStubClient() {
  const tables = new Map(); // table name -> Map(key -> row)
  const auditRows = [];
  const calls = [];
  let auditSeq = 0;

  const getStore = (table) => {
    if (!tables.has(table)) tables.set(table, new Map());
    return tables.get(table);
  };

  function run(sqlText, params) {
    const sql = sqlText.replace(/\s+/g, ' ').trim();

    if (/^CREATE TABLE/i.test(sql)) {
      calls.push({ sql, params });
      return [];
    }

    if (/^ALTER TABLE/i.test(sql)) {
      calls.push({ sql, params });
      return [];
    }

    // Phase 5 T1 (round 1) swap semantics (D19): the assign path deactivates
    // every OTHER active assignment of the channel, upserts the new row, AND
    // writes the audit row in ONE atomic statement (three data-modifying CTEs
    // — postgres.js pools connections, so BEGIN/COMMIT via unsafe() is not
    // reliably atomic; one statement is). The stub mirrors the statement's
    // semantics (the SQL text computes from_family/from_major itself):
    //   WITH swapped_out AS (UPDATE <t> SET active = false WHERE ... RETURNING family_id, pinned_major),
    //        upsert AS (INSERT INTO <t> (...) VALUES (...) ON CONFLICT ... RETURNING 1),
    //        audit AS (INSERT INTO template_assignment_audit (...) SELECT ... RETURNING from_family, from_major)
    //   SELECT from_family, from_major, ... AS swapped_families, ... AS swapped_major FROM audit
    const swapMatch = sql.match(
      /^WITH swapped_out AS \( ?UPDATE (\w+) SET active = false WHERE (.+?) RETURNING ([\w, ]+?) ?\), ?upsert AS \( ?INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)(?: ON CONFLICT \(([^)]+)\) DO UPDATE SET (.+?))? RETURNING 1 ?\), ?audit AS \( ?INSERT INTO template_assignment_audit \(actor, channel_id, family_id, from_family, from_major, to_major, action\) SELECT .+? RETURNING from_family, from_major ?\) SELECT .+?FROM audit$/i,
    );
    if (swapMatch) {
      calls.push({ sql, params });
      const table = swapMatch[1];
      const cols = swapMatch[5].split(',').map((c) => c.trim());
      const valuesTuple = swapMatch[6].split(',').map((v) => v.trim());
      const row = {};
      cols.forEach((c, i) => {
        const v = valuesTuple[i] ?? '';
        row[c] = /^\$\d+$/.test(v) ? params[Number(v.slice(1)) - 1]
          : v.toLowerCase() === 'true' ? true
          : v.toLowerCase() === 'false' ? false
          : null;
      });
      // 1) deactivate every OTHER active row of this channel, collect them
      //    (the audit CTE's string_agg sorts by family_id — mirror that)
      const conds = [...swapMatch[2].matchAll(/(\w+) (=|<>) (\$\d+|true|false)/gi)].map(([, col, op, val]) => {
        const v = /^\$\d+$/.test(val) ? params[Number(val.slice(1)) - 1]
          : val.toLowerCase() === 'true';
        return [col, op, v];
      });
      const swappedOut = [];
      const store0 = getStore(table);
      for (const [, existing] of store0) {
        if (conds.every(([c, op, v]) => (op === '=' ? existing[c] === v : existing[c] !== v))) {
          existing.active = false;
          swappedOut.push({ family_id: existing.family_id, pinned_major: existing.pinned_major });
        }
      }
      // 2) from_family/from_major — the SQL computes these against the
      //    statement snapshot: string_agg of the swapped rows, else the
      //    same-family PRIOR row (pre-upsert state), else null.
      const preStatePrior = [...store0.values()].find(
        (r) => r.channel_id === params[0] && r.family_id === params[1],
      );
      const sortedSwapped = [...swappedOut].sort((a, b) => String(a.family_id).localeCompare(String(b.family_id)));
      const swappedFamilies = sortedSwapped.length > 0 ? sortedSwapped.map((r) => r.family_id).join(',') : null;
      const swappedMajor = sortedSwapped.length > 0 ? sortedSwapped[0].pinned_major : null;
      const fromFamily = swappedFamilies !== null ? swappedFamilies : (preStatePrior ? params[1] : null);
      const fromMajor = swappedMajor !== null ? swappedMajor : (preStatePrior ? preStatePrior.pinned_major : null);
      // 3) upsert the new row (same merge semantics as the plain INSERT branch)
      const conflict = swapMatch[7];
      const store = getStore(table);
      if (conflict) {
        const keyCols = conflict.split(',').map((x) => x.trim());
        const key = keyCols.map((c) => String(row[c])).join('\u0000');
        const prev = store.get(key);
        const merged = prev ? { ...prev, ...row } : row;
        store.set(key, merged);
      } else {
        store.set(`row-${store.size}`, row);
      }
      // 4) the audit write rides inside the statement — record it in the same
      //    shape the plain audit INSERT branch produces, so auditRowsOf() sees it
      auditRows.push({
        id: ++auditSeq, at: new Date(),
        actor: params[4], channel_id: params[0], family_id: params[1],
        from_family: fromFamily, from_major: fromMajor, to_major: params[2], action: 'assign',
      });
      calls.push({
        sql: `INSERT INTO template_assignment_audit (actor, channel_id, family_id, from_family, from_major, to_major, action) VALUES ($1, $2, $3, $4, $5, $6, 'assign')`,
        params: [params[4], params[0], params[1], fromFamily, fromMajor, params[2]],
      });
      // 5) project the audit CTE's RETURNING + the swapped summary
      return [{ from_family: fromFamily, from_major: fromMajor, swapped_families: swappedFamilies, swapped_major: swappedMajor }];
    }

    const insertMatch = sql.match(/^INSERT INTO (\w+)/i);
    if (insertMatch) {
      calls.push({ sql, params });
      const table = insertMatch[1];
      const cols = (sql.match(/\(([^)]+)\)\s*VALUES/i) || [])[1]
        .split(',').map(c => c.trim());
      const valuesTuple = (sql.match(/VALUES\s*\(([^)]+)\)/i) || [])[1]
        .split(',').map(v => v.trim());
      const row = {};
      cols.forEach((c, i) => {
        const v = valuesTuple[i] ?? '';
        row[c] = /^\$\d+$/.test(v) ? params[Number(v.slice(1)) - 1]
          : v.toLowerCase() === 'true' ? true
          : v.toLowerCase() === 'false' ? false
          : null;
      });

      if (table === 'template_assignment_audit') {
        row.id = ++auditSeq;
        row.at = new Date();
        auditRows.push(row);
        return [row];
      }

      const store = getStore(table);
      const conflict = sql.match(/ON CONFLICT \(([^)]+)\)/i);
      if (conflict) {
        const keyCols = conflict[1].split(',').map(x => x.trim());
        const key = keyCols.map(c => String(row[c])).join('\u0000');
        const prev = store.get(key);
        const merged = prev ? { ...prev, ...row } : row;
        store.set(key, merged);
        return [merged];
      }
      store.set(`row-${store.size}`, row);
      return [row];
    }

    const selectMatch = sql.match(/^SELECT .*?FROM (\w+)/i);
    if (selectMatch) {
      calls.push({ sql, params });
      const table = selectMatch[1];
      const src = table === 'template_assignment_audit'
        ? auditRows
        : [...(tables.get(table)?.values() || [])];
      const conds = [...sql.matchAll(/(\w+) = (\$\d+|true|false)/gi)]
        .map(([, col, val]) => {
          const v = /^\$\d+$/.test(val) ? params[Number(val.slice(1)) - 1]
            : val.toLowerCase() === 'true';
          return [col, v];
        });
      return src.filter(r => conds.every(([c, v]) => r[c] === v));
    }

    const updateMatch = sql.match(/^UPDATE (\w+)/i);
    if (updateMatch) {
      calls.push({ sql, params });
      const table = updateMatch[1];
      const setClause = (sql.match(/SET (.*?) WHERE/i) || [])[1] || '';
      const setMatch = setClause.match(/(\w+) = (true|false)/i);
      const wherePart = sql.split(/WHERE/i)[1] || '';
      const conds = [...wherePart.matchAll(/(\w+) = (\$\d+|true|false)/gi)]
        .map(([, col, val]) => {
          const v = /^\$\d+$/.test(val) ? params[Number(val.slice(1)) - 1]
            : val.toLowerCase() === 'true';
          return [col, v];
        });
      const store = getStore(table);
      for (const [key, row] of store) {
        if (conds.every(([c, v]) => row[c] === v)) {
          if (setMatch) row[setMatch[1]] = setMatch[2].toLowerCase() === 'true';
        }
      }
      return [];
    }

    throw new Error(`stub client: unsupported SQL shape: ${sql.slice(0, 120)}`);
  }

  const clientFn = (sqlText, params = []) => Promise.resolve(run(sqlText, params));
  clientFn.tables = tables;
  clientFn.calls = calls;
  return clientFn;
}

// ---- fixtures ----

function makeValidMeta(version = '1.0.0') {
  return {
    version,
    niches: ['History stories'],
    formats: ['short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: ['distinct storyline per video'],
    safety: { required_sources: true, review_required: [] },
    deprecated: false,
    changelog: [{ version, date: '2026-10-26', note: 'initial' }],
  };
}

const FAMILY_A = 'documentary-frames';
const FAMILY_B = 'kinetic-quotes';
const FAMILY_C = 'photo-stories';

function families() {
  return [
    { familyId: FAMILY_A, name: 'Documentary Master Frames', registry: makeValidMeta('1.2.3') },
    { familyId: FAMILY_B, name: 'Kinetic Quote Cards', registry: makeValidMeta('2.0.0') },
  ];
}

// Third family for the swap tests only (never passed to the sync-count tests).
function swapFamilies() {
  return [
    ...families(),
    { familyId: FAMILY_C, name: 'Photo Stories', registry: makeValidMeta('1.0.0') },
  ];
}

// Column-aware audit reader: audit INSERT statements gained `from_family` in
// Phase 5 T1, while `unassignTemplate` keeps its original column list — read
// by column NAME, never by positional index.
function auditRowsOf(stub) {
  return stub.calls
    .filter((c) => /^INSERT INTO template_assignment_audit/i.test(c.sql))
    .map((c) => {
      const cols = (c.sql.match(/\(([^)]+)\)\s*VALUES/i) || [])[1].split(',').map((s) => s.trim());
      const values = (c.sql.match(/VALUES\s*\(([^)]+)\)/i) || [])[1].split(',').map((v) => v.trim());
      const row = {};
      cols.forEach((col, i) => {
        const v = values[i] ?? '';
        row[col] = /^\$\d+$/.test(v) ? c.params[Number(v.slice(1)) - 1]
          : /^'(.*)'$/.test(v) ? v.slice(1, -1)
          : null;
      });
      return row;
    });
}

// ---- ensureSchema ----

test('ensureSchema issues CREATE TABLE IF NOT EXISTS for all three tables', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.ensureSchema();
  const creates = stub.calls.filter(c => /^CREATE TABLE/i.test(c.sql));
  assert.equal(creates.length, 3, 'must emit three CREATE TABLE statements');
  const joined = creates.map(c => c.sql).join('\n');
  for (const t of ['template_registry_index', 'channel_template_assignments', 'template_assignment_audit']) {
    assert.ok(joined.includes(t), `schema must include table ${t}`);
    assert.ok(joined.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `${t} must use IF NOT EXISTS`);
  }
});

test('Phase 5 migration: the only additive column is template_assignment_audit.from_family, idempotent', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.ensureSchema();
  const alters = stub.calls.filter(c => /^ALTER TABLE/i.test(c.sql));
  assert.equal(alters.length, 1, 'exactly one additive ALTER — no index/assignments schema change (family_id stores the registry key; legacy rows already satisfy template_id == family_id)');
  assert.match(alters[0].sql, /^ALTER TABLE template_assignment_audit ADD COLUMN IF NOT EXISTS from_family text$/i, 'idempotent ADD COLUMN — safe to run on every boot, no backup pass needed');
});

// ---- syncRegistry ----

test('syncRegistry upserts new families and reports writes', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  const result = await db.syncRegistry(families());
  assert.equal(result.ok, true);
  assert.deepEqual(result.removedRefused, []);
  assert.deepEqual(result.skippedInvalid, []);
  assert.equal(result.writes, 2);
  assert.ok(result.synced.includes(FAMILY_A) && result.synced.includes(FAMILY_B));

  const index = stub.tables.get('template_registry_index');
  assert.equal(index.get(FAMILY_A).version, '1.2.3');
  assert.equal(index.get(FAMILY_A).major, 1);
  assert.equal(index.get(FAMILY_B).version, '2.0.0');
  assert.equal(index.get(FAMILY_B).major, 2);
});

test('syncRegistry is idempotent — identical input reports zero writes', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  const second = await db.syncRegistry(families());
  assert.equal(second.writes, 0, 'second identical sync must write nothing');
  assert.equal(second.ok, true);
  assert.deepEqual(second.synced, []);
});

test('syncRegistry upserts only the family whose content hash changed', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());

  const changed = [
    families()[0], // untouched
    { familyId: FAMILY_B, name: 'Kinetic Quote Cards', registry: makeValidMeta('2.0.1') }, // patch bump
  ];
  const result = await db.syncRegistry(changed);
  assert.equal(result.writes, 1, 'only the changed family is written');
  assert.deepEqual(result.synced, [FAMILY_B]);
  assert.equal(stub.tables.get('template_registry_index').get(FAMILY_B).version, '2.0.1');
  assert.equal(stub.tables.get('template_registry_index').get(FAMILY_A).version, '1.2.3', 'untouched family row must not change');
});

test('syncRegistry skips and reports invalid registry blocks', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  const result = await db.syncRegistry([
    families()[0],
    { familyId: 'broken-family', name: 'Broken', registry: { version: 'not-semver' } },
    { familyId: null, name: 'No Id', registry: makeValidMeta('1.0.0') },
  ]);
  assert.equal(result.ok, true, 'invalid blocks are skipped, not fatal');
  assert.equal(result.writes, 1);
  assert.equal(result.skippedInvalid.length, 2);
  assert.ok(result.skippedInvalid.some(s => s.familyId === 'broken-family'));
  assert.ok(!stub.tables.get('template_registry_index')?.has('broken-family'), 'invalid family must not reach the index');
});

test('syncRegistry refuses removal of indexed families with active assignments', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  await db.assignTemplate('chan-1', FAMILY_B, 2, 'tester');

  const result = await db.syncRegistry([families()[0]]); // FAMILY_B dropped from input
  assert.equal(result.ok, false);
  assert.deepEqual(result.removedRefused, [FAMILY_B]);
  assert.equal(result.writes, 0, 'unchanged family A must not rewrite');

  // both rows remain in the index (Phase 1: no removal at all)
  const index = stub.tables.get('template_registry_index');
  assert.ok(index.has(FAMILY_A) && index.has(FAMILY_B));
});

test('syncRegistry leaves unassigned-but-absent families untouched and ok', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families()); // no assignments made

  const result = await db.syncRegistry([families()[0]]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.removedRefused, []);
  const index = stub.tables.get('template_registry_index');
  assert.ok(index.has(FAMILY_B), 'family absent from input with no assignments stays in the index');
});

// ---- assignTemplate ----

test('assignTemplate resolves version in pinned major, writes assignment + audit', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());

  const r = await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester');
  assert.equal(r.ok, true);
  assert.equal(r.resolvedVersion, '1.2.3');
  assert.equal(r.majorUpdateAvailable, false, 'index holds one version per family (family_id PK), so no higher-major block exists for family A itself');
  assert.equal(r.fromMajor, null);

  const a = await db.getActiveAssignment('chan-1', FAMILY_A);
  assert.ok(a, 'active assignment must exist');
  assert.equal(a.pinned_major, 1);
  assert.equal(a.pinned_version, '1.2.3');
  assert.equal(a.assigned_by, 'tester');

  const auditRows = auditRowsOf(stub);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0].from_family, null, 'from_family null on first assignment (nothing replaced)');
  assert.equal(auditRows[0].from_major, null, 'from_major null on first assignment');
  assert.equal(auditRows[0].to_major, 1, 'to_major = 1');
  assert.equal(auditRows[0].action, 'assign');
});

test('assignTemplate fails closed when pinned major has no indexed version', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  const insertsBefore = stub.calls.filter(c => /^INSERT INTO/i.test(c.sql)).length;

  const r = await db.assignTemplate('chan-1', FAMILY_A, 9, 'tester');
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('no_version_in_major'));
  const insertsAfter = stub.calls.filter(c => /^INSERT INTO/i.test(c.sql)).length;
  assert.equal(insertsAfter - insertsBefore, 0, 'failed assignment must write nothing');
});

test('re-assignment over an active assignment is a SWAP: the audit chain records from_family + majors (D19)', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester');
  await db.assignTemplate('chan-1', FAMILY_B, 2, 'tester'); // SWAP: replaces A
  await db.unassignTemplate('chan-1', FAMILY_B, 'tester'); // deactivate the active B
  await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester'); // re-assign after unassign (A has an inactive prior row)

  const audits = auditRowsOf(stub).map((r) => ({
    action: r.action,
    fromFamily: r.from_family ?? null,
    from: r.from_major ?? null,
    to: r.to_major ?? null,
  }));
  assert.deepEqual(audits, [
    { action: 'assign', fromFamily: null, from: null, to: 1 }, // first assignment: nothing replaced
    { action: 'assign', fromFamily: FAMILY_A, from: 1, to: 2 }, // the swap: replaced A @ major 1
    { action: 'unassign', fromFamily: null, from: 2, to: null },
    { action: 'assign', fromFamily: FAMILY_A, from: 1, to: 1 }, // from previous pinned_major restored
  ]);
});

// ---- Phase 5 T1: swap semantics — one active assignment per channel (D19) ----

test('swap: assigning a different template over an active assignment deactivates the old row atomically', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(swapFamilies());

  const first = await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester');
  assert.equal(first.ok, true);
  const swap = await db.assignTemplate('chan-1', FAMILY_C, 1, 'tester');
  assert.equal(swap.ok, true);
  assert.deepEqual(swap.swappedFrom, { familyId: FAMILY_A, pinnedMajor: 1 }, 'the result names what the swap replaced');
  assert.equal(swap.fromFamily, FAMILY_A);

  // exactly ONE active row — and it is the NEW template
  const active = await db.listAssignments('chan-1');
  assert.equal(active.length, 1, 'a channel can never hold two active rows (D19)');
  assert.equal(active[0].family_id, FAMILY_C);
  assert.equal(active[0].pinned_major, 1);

  // the old row survives deactivated (history, not deletion)
  const allRows = [...stub.tables.get('channel_template_assignments').values()];
  assert.equal(allRows.length, 2);
  const oldRow = allRows.find((r) => r.family_id === FAMILY_A);
  assert.equal(oldRow.active, false, 'the replaced assignment is deactivated, never deleted');
});

test('swap: the audit row records the swap (actor, from_family, replaced major)', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(swapFamilies());
  await db.assignTemplate('chan-1', FAMILY_A, 1, 'owner@example.com');
  await db.assignTemplate('chan-1', FAMILY_C, 1, 'owner@example.com');

  const audits = auditRowsOf(stub);
  assert.equal(audits.length, 2);
  const swapRow = audits[1];
  assert.equal(swapRow.action, 'assign');
  assert.equal(swapRow.actor, 'owner@example.com');
  assert.equal(swapRow.channel_id, 'chan-1');
  assert.equal(swapRow.family_id, FAMILY_C, 'the assigned id is the NEW template');
  assert.equal(swapRow.from_family, FAMILY_A, 'from_family records the replaced template');
  assert.equal(swapRow.from_major, 1, 'from_major records the replaced pinned major');
  assert.equal(swapRow.to_major, 1);
});

test('swap: rapid double-assign boundary probe — still exactly one active row, each swap audited', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(swapFamilies());
  await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester');
  await db.assignTemplate('chan-1', FAMILY_B, 2, 'tester');
  const third = await db.assignTemplate('chan-1', FAMILY_C, 1, 'tester');

  assert.equal(third.ok, true);
  assert.deepEqual(third.swappedFrom, { familyId: FAMILY_B, pinnedMajor: 2 });
  const active = await db.listAssignments('chan-1');
  assert.equal(active.length, 1);
  assert.equal(active[0].family_id, FAMILY_C);

  const audits = auditRowsOf(stub).filter((r) => r.action === 'assign');
  assert.deepEqual(audits.map((r) => r.from_family), [null, FAMILY_A, FAMILY_B], 'each swap names what it replaced; the first assign replaced nothing');
});

test('swap: a legacy multi-active channel heals in one assign — from_family aggregates every replaced row', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(swapFamilies());
  // Pre-Phase-5 anomaly: two active rows for one channel (the drift-hold's
  // input). One assign must deactivate BOTH and name them both on the record.
  const store = new Map();
  stub.tables.set('channel_template_assignments', store);
  store.set(['chan-multi', FAMILY_A].join('\u0000'), {
    channel_id: 'chan-multi', family_id: FAMILY_A, pinned_major: 1, pinned_version: '1.2.3', assigned_by: 'owner', active: true,
  });
  store.set(['chan-multi', FAMILY_B].join('\u0000'), {
    channel_id: 'chan-multi', family_id: FAMILY_B, pinned_major: 2, pinned_version: '2.0.0', assigned_by: 'owner', active: true,
  });

  const r = await db.assignTemplate('chan-multi', FAMILY_C, 1, 'tester');
  assert.equal(r.ok, true);
  assert.equal(r.fromFamily, `${FAMILY_A},${FAMILY_B}`, 'from_family aggregates the replaced families (sorted join)');
  assert.deepEqual(r.swappedFrom, { familyId: `${FAMILY_A},${FAMILY_B}`, pinnedMajor: 1 });

  const active = await db.listAssignments('chan-multi');
  assert.equal(active.length, 1, 'the channel heals to exactly one active row');
  assert.equal(active[0].family_id, FAMILY_C);

  const swapAudit = auditRowsOf(stub).find((row) => row.channel_id === 'chan-multi');
  assert.equal(swapAudit.from_family, `${FAMILY_A},${FAMILY_B}`, 'the swap is on the record, all replaced rows named');
});

test('swap: a same-family re-assign is not a swap — from_family is the same id, from_major semantics unchanged', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester');
  const repin = await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester');

  assert.equal(repin.ok, true);
  assert.equal(repin.swappedFrom, null, 'no other template was replaced');
  assert.equal(repin.fromFamily, FAMILY_A, 'from_family mirrors the audit: the prior assignment was this same template');
  const audits = auditRowsOf(stub);
  assert.equal(audits[1].from_family, FAMILY_A);
  assert.equal(audits[1].from_major, 1, 'from_major keeps the pre-Phase-5 same-family semantics');
  const active = await db.listAssignments('chan-1');
  assert.equal(active.length, 1);
});

test('legacy pre-Phase-5 rows keep resolving (no orphaned assignments after T1)', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  // A row written before Phase 5: family_id == the family id == the registry
  // key (the dual meaning holds because template_id == family_id for legacy).
  const store = new Map();
  stub.tables.set('channel_template_assignments', store);
  const legacyKey = ['chan-legacy', FAMILY_A].join('\u0000');
  store.set(legacyKey, {
    channel_id: 'chan-legacy', family_id: FAMILY_A, pinned_major: 1, pinned_version: '1.2.3', assigned_by: 'owner', active: true,
  });

  const row = await db.getActiveAssignment('chan-legacy');
  assert.ok(row, 'the pre-Phase-5 row still resolves');
  assert.equal(row.family_id, FAMILY_A);
  // its id IS a registry key, so the loader resolves the same string:
  const { loadRegistryTemplates } = await import('../studio/lib/template-registry.js');
  const view = loadRegistryTemplates(
    [{ id: FAMILY_A, name: 'Documentary Master Frames', family: FAMILY_A, aspectRatios: ['16:9', '9:16'] }],
    { [FAMILY_A]: { ...makeValidMeta('1.2.3'), template_id: FAMILY_A } },
  );
  assert.deepEqual(view.invalid, []);
  assert.equal(view.templates[0].templateId, row.family_id, 'assignment id == registry key (identity invariant)');
});

// ---- unassignTemplate ----

test('unassignTemplate deactivates and audits; unassign with nothing active fails closed', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester');

  const r = await db.unassignTemplate('chan-1', FAMILY_A, 'tester');
  assert.equal(r.ok, true);
  assert.equal(await db.getActiveAssignment('chan-1', FAMILY_A), null, 'assignment must be inactive after unassign');
  assert.deepEqual(await db.listAssignments('chan-1'), [], 'active listing must exclude unassigned');

  const fail = await db.unassignTemplate('chan-1', FAMILY_A, 'tester');
  assert.equal(fail.ok, false, 'unassign with no active assignment must fail closed');
});

// ---- reads ----

test('listAssignments returns active rows for a channel (one per channel since D19 swaps)', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester');
  await db.assignTemplate('chan-2', FAMILY_A, 1, 'tester');
  await db.assignTemplate('chan-2', FAMILY_B, 2, 'tester'); // swaps chan-2's A — never two active rows

  const rows = await db.listAssignments('chan-1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].family_id, FAMILY_A);
  assert.equal(rows[0].pinned_major, 1);

  const chan2 = await db.listAssignments('chan-2');
  assert.equal(chan2.length, 1, 'D19: the swap deactivated the earlier family, never stacked');
  assert.equal(chan2[0].family_id, FAMILY_B);
});

test('listUsage returns active channels for a family', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester');
  await db.assignTemplate('chan-2', FAMILY_A, 1, 'tester');
  await db.assignTemplate('chan-3', FAMILY_B, 2, 'tester');

  const usage = await db.listUsage(FAMILY_A);
  assert.equal(usage.length, 2);
  assert.ok(usage.every(r => r.channel_id === 'chan-1' || r.channel_id === 'chan-2'));

  const usageB = await db.listUsage(FAMILY_B);
  assert.deepEqual(usageB.map(r => r.channel_id), ['chan-3']);
});

test('getRegistryDb and default export exist for production callers (lazy, not invoked in tests)', () => {
  assert.equal(typeof getRegistryDb, 'function');
  assert.equal(typeof makeRegistryDb, 'function');
});

test('adaptPostgres bridges a postgres.js unsafe()-style client to the positional contract', async () => {
  // Stub-level check of the adapter shape only: makeRegistryDb must work
  // when handed adaptPostgres({ unsafe }) and must route text + params
  // through unsafe(). The real NOT_TAGGED_CALL failure mode is proven live
  // at Task 11 E2E against real Neon — NOT simulated here.
  const seen = [];
  const fakePostgres = {
    unsafe: (text, params) => {
      seen.push({ text, params });
      return Promise.resolve([{ family_id: FAMILY_A, pinned_major: 1, pinned_version: '1.2.3', assigned_by: 'tester' }]);
    },
  };
  const db = makeRegistryDb(adaptPostgres(fakePostgres));
  const rows = await db.listAssignments('chan-1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].family_id, FAMILY_A);
  assert.equal(seen.length, 1);
  assert.ok(seen[0].text.includes('FROM channel_template_assignments'));
  assert.deepEqual(seen[0].params, ['chan-1']);
});
