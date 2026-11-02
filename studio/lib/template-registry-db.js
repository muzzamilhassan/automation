// Template registry DB layer (issue #102 Phase 1, Task 5).
// Sync the registry index, assign/unassign channel templates, audit every
// change. The client is injected via the `makeRegistryDb(client)` factory so
// tests run against an in-memory stub — no live Neon in unit tests.
//
// Client contract (postgres.js-compatible positional style):
//   `client(sqlText, params)` -> Promise<rowObject[]>
// Rows use snake_case column names; parameters use $1..$n placeholders
// (never string-interpolated — SQL-injection safe by construction).
// Production callers get the real client lazily via getRegistryDb().

import { createHash } from 'node:crypto';
import { validateRegistryMeta, resolveAssignment } from './template-registry.js';

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

// Stable JSON: object keys sorted recursively, so the same registry block
// always hashes identically regardless of key insertion order.
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function contentHash(registry) {
  return createHash('sha256').update(stableStringify(registry)).digest('hex');
}

function majorOf(version) {
  return parseInt(version.split('.')[0], 10);
}

// The swap statement (Phase 5 T1, D19) — ONE atomic statement:
//   swapped_out: deactivate every OTHER active assignment of the channel,
//                returning what was replaced;
//   upsert:      land the new assignment row (active=true).
// The audit row is NOT part of this statement (round 2, live-Neon finding):
// the round-1 variant computed the audit values in SQL (string_agg subqueries
// over the CTE) and postgres.js choked CLIENT-SIDE before ever reaching
// Postgres — an args-serialization quirk (`q.args.forEach is not a function`)
// the in-memory stub cannot see (it does not parse SQL). The audit values are
// therefore computed in JS and inserted by a SECOND, plain statement (see
// assignTemplate). Shapes verified green against live Neon: the bare CTE
// (P1), +the upsert CTE (P2), this exact 2-CTE + plain final SELECT.
// $1 channelId, $2 familyId, $3 pinnedMajor, $4 pinnedVersion, $5 actor,
// $6 assignedAt.
const SWAP_ASSIGN_SQL = `WITH swapped_out AS (
  UPDATE channel_template_assignments SET active = false
  WHERE channel_id = $1 AND active = true AND family_id <> $2
  RETURNING family_id, pinned_major
), upsert AS (
  INSERT INTO channel_template_assignments
    (channel_id, family_id, pinned_major, pinned_version, assigned_by, assigned_at, active)
  VALUES ($1, $2, $3, $4, $5, $6, true)
  ON CONFLICT (channel_id, family_id) DO UPDATE SET
    pinned_major = $3, pinned_version = $4, assigned_by = $5, assigned_at = $6, active = true
  RETURNING 1
)
SELECT family_id, pinned_major FROM swapped_out`;

export function makeRegistryDb(client) {
  if (typeof client !== 'function') {
    throw new TypeError('makeRegistryDb: client must be a function (sqlText, params) -> Promise<rows>');
  }

  async function ensureSchema() {
    // STORAGE DECISION (Phase 5 T1, spec D1/D19 — the identity split): every
    // id column below is named `family_id` but stores the registry KEY (the
    // template_id). The dual meaning is safe ONLY because for every
    // pre-Phase-5 row template_id == family_id (the legacy 7 keep their
    // identity), so those rows need ZERO migration — no column is added,
    // dropped, or rewritten, and CREATE TABLE IF NOT EXISTS stays
    // byte-identical. (Expected once-only writes, not migrations: on the
    // FIRST post-T1 sync the 7 index rows get their hash-driven ON CONFLICT
    // update because the blocks gained template_id — same PK, harmless.)
    // The visual family of a synced entry is readable from meta_json
    // (`family` field), and the only NEW fact the schema must store — which
    // template a SWAP replaced — gets the single additive column `from_family`
    // on the audit table (idempotent ALTER below; ADD COLUMN IF NOT EXISTS
    // never modifies or drops existing values, so no backup pass is required;
    // existing audit rows keep NULL because no swap ever happened before
    // Phase 5).
    await client(`CREATE TABLE IF NOT EXISTS template_registry_index (
      family_id text PRIMARY KEY,
      version text NOT NULL,
      major integer NOT NULL,
      meta_hash text NOT NULL,
      meta_json jsonb NOT NULL,
      deprecated boolean NOT NULL DEFAULT false,
      synced_at timestamptz NOT NULL DEFAULT now()
    )`, []);
    await client(`CREATE TABLE IF NOT EXISTS channel_template_assignments (
      channel_id text NOT NULL,
      family_id text NOT NULL,
      pinned_major integer NOT NULL,
      pinned_version text NOT NULL,
      assigned_by text NOT NULL,
      assigned_at timestamptz NOT NULL DEFAULT now(),
      active boolean NOT NULL DEFAULT true,
      PRIMARY KEY (channel_id, family_id)
    )`, []);
    await client(`CREATE TABLE IF NOT EXISTS template_assignment_audit (
      id bigserial PRIMARY KEY,
      at timestamptz NOT NULL DEFAULT now(),
      actor text NOT NULL,
      channel_id text NOT NULL,
      family_id text NOT NULL,
      from_major integer,
      to_major integer,
      action text NOT NULL
    )`, []);
    await client('ALTER TABLE template_assignment_audit ADD COLUMN IF NOT EXISTS from_family text', []);
  }

  /**
   * Sync catalog families into the registry index. Upserts only rows whose
   * content hash changed (idempotent: same input twice -> zero writes).
   * Phase 1 has NO removal at all: families absent from the input stay in
   * the index untouched. As a guard, if an absent family still has an
   * active channel assignment the sync reports it in `removedRefused` with
   * ok:false (removal would strand the channel) — nothing is deleted.
   * @param {Array<{familyId: string, name?: string, registry: object, hash?: string}>} families
   */
  async function syncRegistry(families) {
    if (!Array.isArray(families)) {
      throw new TypeError('syncRegistry: families must be an array');
    }

    const skippedInvalid = [];
    const valid = [];
    for (const fam of families) {
      if (fam === null || typeof fam !== 'object' || !isNonEmptyString(fam.familyId)) {
        skippedInvalid.push({ familyId: fam?.familyId ?? null, reason: 'missing familyId', errors: [] });
        continue;
      }
      const v = validateRegistryMeta(fam.registry);
      if (!v.ok) {
        skippedInvalid.push({ familyId: fam.familyId, reason: 'invalid registry block', errors: v.errors });
        continue;
      }
      valid.push({
        familyId: fam.familyId,
        registry: fam.registry,
        hash: isNonEmptyString(fam.hash) ? fam.hash : contentHash(fam.registry),
      });
    }

    const existingRows = await client('SELECT family_id, meta_hash FROM template_registry_index', []);
    const existing = new Map(existingRows.map(r => [r.family_id, r.meta_hash]));

    const activeRows = await client('SELECT DISTINCT family_id FROM channel_template_assignments WHERE active = true', []);
    const activelyAssigned = new Set(activeRows.map(r => r.family_id));

    const inputIds = new Set(valid.map(f => f.familyId));
    const removedRefused = [];
    for (const [familyId] of existing) {
      if (!inputIds.has(familyId) && activelyAssigned.has(familyId)) removedRefused.push(familyId);
    }

    const synced = [];
    let writes = 0;
    for (const fam of valid) {
      if (existing.get(fam.familyId) === fam.hash) continue; // unchanged -> zero write (idempotency)
      await client(
        `INSERT INTO template_registry_index (family_id, version, major, meta_hash, meta_json, deprecated, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (family_id) DO UPDATE SET
           version = $2, major = $3, meta_hash = $4, meta_json = $5, deprecated = $6, synced_at = $7`,
        [fam.familyId, fam.registry.version, majorOf(fam.registry.version), fam.hash,
          JSON.stringify(fam.registry), fam.registry.deprecated === true, new Date()],
      );
      writes++;
      synced.push(fam.familyId);
    }

    return { ok: removedRefused.length === 0, synced, skippedInvalid, removedRefused, writes };
  }

  async function getActiveAssignmentRow(channelId, familyId) {
    const rows = await client(
      `SELECT channel_id, family_id, pinned_major, pinned_version, assigned_by
       FROM channel_template_assignments
       WHERE channel_id = $1 AND family_id = $2 AND active = true`,
      [channelId, familyId],
    );
    return rows[0] || null;
  }

  /**
   * Assign a channel to a template within a pinned major — with Phase 5 SWAP
   * semantics (D19): assigning over a DIFFERENT active assignment deactivates
   * that row atomically (one active assignment per channel, enforced HERE so
   * the review gate's multi-row drift-hold becomes unreachable from this
   * path), and the audit row records the swap via `from_family`.
   *
   * `familyId` is the registry KEY (== template_id; for legacy rows it equals
   * the family id — dual meaning documented at ensureSchema). Resolves the
   * current indexed version inside that major via resolveAssignment
   * (fail-closed: no version in the pinned major -> no writes). Writes the
   * assignment (upsert, active=true) and an audit row (action 'assign';
   * from_family/from_major null on a first assignment, the replaced row's
   * id/major on a swap — ALL replaced ids comma-joined (sorted) when a legacy
   * multi-active channel heals in one assign — and the same id/prior major on
   * a same-family re-pin).
   *
   * Atomicity / statement layout (round 2, live-Neon finding): the swap
   * (deactivate + upsert) is ONE statement — data-modifying CTEs; postgres.js
   * pools connections, so BEGIN-via-unsafe is not reliably atomic and the
   * transactional API (sql.begin) is not part of this layer's positional
   * client contract. The audit row is a SECOND, plain statement: postgres.js
   * chokes client-side on the round-1 single-statement variant (SQL-computed
   * audit values over a CTE — an args-serialization quirk, never reaching
   * Postgres), so the audit values are computed HERE in JS. A crash between
   * the two statements = a swap without its audit row — exactly the posture
   * pre-Phase-5 shipped (insert then audit), accepted as not-a-regression.
   */
  async function assignTemplate(channelId, familyId, pinnedMajor, actor) {
    if (!isNonEmptyString(channelId) || !isNonEmptyString(familyId)
      || !Number.isInteger(pinnedMajor) || !isNonEmptyString(actor)) {
      return { ok: false, errors: ['assignTemplate: requires channelId, familyId, integer pinnedMajor, actor'] };
    }

    // Pass every indexed block: resolveAssignment filters by familyId itself,
    // and the wider view lets it report majorUpdateAvailable across majors.
    const indexRows = await client('SELECT family_id, version FROM template_registry_index', []);
    const blocks = indexRows.map(r => ({ familyId: r.family_id, version: r.version }));
    const resolved = resolveAssignment({ familyId, pinned_major: pinnedMajor }, blocks);
    if (!resolved.ok) return { ok: false, errors: resolved.errors };

    // from_major (pre-Phase-5 semantics kept): the channel's previous
    // pinned_major for this family if a row exists at all (active or not — a
    // re-assign after unassign still records what it moved from), null on
    // first assignment. Read BEFORE the swap (snapshot-consistent for the
    // same-family row, which the swap's UPDATE excludes anyway).
    const priorRows = await client(
      'SELECT pinned_major FROM channel_template_assignments WHERE channel_id = $1 AND family_id = $2',
      [channelId, familyId],
    );

    // SWAP (atomic single statement): deactivate every OTHER active
    // assignment of this channel and upsert the new row; the deactivated rows
    // come back so the audit can name what was replaced.
    const swappedOut = await client(
      SWAP_ASSIGN_SQL,
      [channelId, familyId, pinnedMajor, resolved.resolvedVersion, actor, new Date()],
    );

    // from_family/from_major computed in JS (see the round-2 note above):
    // the replaced assignment(s) — comma-joined sorted ids when several were
    // replaced, else the same-family prior row's id/major, else null.
    const sortedSwapped = [...swappedOut].sort((a, b) => String(a.family_id).localeCompare(String(b.family_id)));
    const swapped = sortedSwapped.length > 0;
    const fromMajor = swapped
      ? sortedSwapped[0].pinned_major
      : (priorRows.length > 0 ? priorRows[0].pinned_major : null);
    const fromFamily = swapped
      ? sortedSwapped.map((r) => r.family_id).join(',')
      : (priorRows.length > 0 ? familyId : null);

    await client(
      `INSERT INTO template_assignment_audit (actor, channel_id, family_id, from_family, from_major, to_major, action)
       VALUES ($1, $2, $3, $4, $5, $6, 'assign')`,
      [actor, channelId, familyId, fromFamily, fromMajor, pinnedMajor],
    );

    return {
      ok: true,
      channelId,
      familyId,
      pinnedMajor,
      resolvedVersion: resolved.resolvedVersion,
      majorUpdateAvailable: resolved.majorUpdateAvailable,
      fromMajor,
      fromFamily,
      swappedFrom: swapped ? { familyId: fromFamily, pinnedMajor: sortedSwapped[0].pinned_major } : null,
    };
  }

  /**
   * Deactivate a channel's assignment and write an audit row
   * (action 'unassign', to_major null). Fail-closed when nothing is active.
   */
  async function unassignTemplate(channelId, familyId, actor) {
    if (!isNonEmptyString(channelId) || !isNonEmptyString(familyId) || !isNonEmptyString(actor)) {
      return { ok: false, error: 'unassignTemplate: requires channelId, familyId, actor' };
    }

    const current = await getActiveAssignmentRow(channelId, familyId);
    if (!current) return { ok: false, error: 'no_active_assignment' };

    await client(
      'UPDATE channel_template_assignments SET active = false WHERE channel_id = $1 AND family_id = $2',
      [channelId, familyId],
    );
    await client(
      `INSERT INTO template_assignment_audit (actor, channel_id, family_id, from_major, to_major, action)
       VALUES ($1, $2, $3, $4, $5, 'unassign')`,
      [actor, channelId, familyId, current.pinned_major, null],
    );

    return { ok: true };
  }

  /** All active assignments for a channel. */
  async function listAssignments(channelId) {
    return client(
      `SELECT channel_id, family_id, pinned_major, pinned_version, assigned_by, assigned_at
       FROM channel_template_assignments
       WHERE channel_id = $1 AND active = true`,
      [channelId],
    );
  }

  /** All active assignments of a family (which channels use it). */
  async function listUsage(familyId) {
    return client(
      `SELECT channel_id, family_id, pinned_major, pinned_version, assigned_at
       FROM channel_template_assignments
       WHERE family_id = $1 AND active = true`,
      [familyId],
    );
  }

  /**
   * Single active assignment for a channel; pass familyId to narrow to that
   * family, otherwise the first active row. Returns null when none active.
   */
  async function getActiveAssignment(channelId, familyId) {
    if (isNonEmptyString(familyId)) {
      return getActiveAssignmentRow(channelId, familyId);
    }
    const rows = await client(
      `SELECT channel_id, family_id, pinned_major, pinned_version, assigned_by
       FROM channel_template_assignments
       WHERE channel_id = $1 AND active = true`,
      [channelId],
    );
    return rows[0] || null;
  }

  return {
    ensureSchema,
    syncRegistry,
    assignTemplate,
    unassignTemplate,
    listAssignments,
    listUsage,
    getActiveAssignment,
  };
}

/**
 * Bridge a real postgres.js `sql` function to the positional client contract
 * this module uses. postgres.js REJECTS positional calls
 * (`client(sqlText, params)` → NOT_TAGGED_CALL: Query not called as a tagged
 * template literal); `sql.unsafe(text, params)` is its documented escape
 * hatch for pre-built parameterized queries. Still injection-safe: the text
 * contains only placeholders, the values travel in `params`.
 */
export function adaptPostgres(sql) {
  return (text, params) => sql.unsafe(text, params);
}

/**
 * Production entry point (Tasks 6/7/9). Lazy-imports db.mjs so importing
 * this module never touches the DB layer — unit tests and non-Neon machines
 * stay safe until this is actually called. Throws fail-closed when the
 * database is not configured.
 */
export async function getRegistryDb() {
  const { db, dbReady } = await import('./db.mjs');
  if (!dbReady || !db) {
    throw new Error('registry db: DATABASE_URL missing / db not ready — cannot construct registry DB layer');
  }
  return makeRegistryDb(adaptPostgres(db));
}

export default getRegistryDb;
