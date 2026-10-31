// #106 Phase 4 T5 (S4) — the review gate (spec D15-D17, AC-P4-18/19).
//
// ONE question decides gating (D15): is the channel's ASSIGNED template's
// `safety.review_required` list non-empty? Membership-driven ONLY — generator
// risk flags sharpen the review UI but never gate, so a flag the generator
// failed to emit can never silently un-gate a finance channel (M2).
//
// FAIL-CLOSED ON UNREADABLE STATE (C2, review finding 2): IF the
// registry/assignment state is unreadable (DB unreachable, assignment row
// missing for an assigned channel) THEN the slot is HELD — with one carve-out:
// channels with NO registry assignment at all (legacy channels) run ungated
// exactly as today. The mechanism that tells those apart when the DB is dark
// is the LAST-KNOWN-ASSIGNMENT CACHE in the channel state file
// (yt-mcp/state/<slug>.json, `reviewGate` key): every readable resolution
// writes { assigned, gated, checkedAt }, and the cache answers gating through
// DB blips. A channel with NO cache at all holds (fail-closed covers even a
// missing cache).
//
// DRIFT (M3, review finding 3): an assignment the gate cannot resolve (family
// missing from the registry meta) writes the dedicated `review_gating_inactive`
// Action-required warning row so the condition is visible on /warnings, not
// just in logs — and holds (conservative), caching gated=true so later blips
// stay held until the assignment is fixed.
//
// TIMEOUT (M4/D17/AC-P4-19): a held script must be approved before its slot's
// publishAt, else by end-of-day. Enforcement is two-fold: the run-start check
// (evaluateReviewGate) and the nightly sweep (sweepReviewTimeouts — wired by
// scripts/review-sweep.mjs). On timeout: one Action-required `review_timeout`
// warning row and the slot is skipped — the script is RETAINED awaiting_review
// (retain-and-resume: a later approval resumes at render without re-spend;
// the sweep never consumes or rejects).
//
// NO CHANNEL NAMES, NO NICHE MAPS IN CODE (D15): everything comes from the
// injected registry meta + assignment rows (no-static-maps owner directive).
//
// House pattern: lib/warnings-probe.mjs / lib/job-store.mjs — injected seams,
// never-throw, emitted warnings ride T4's emitWarning (write-and-alert; the
// store's dedupe keeps one alert per open episode). This module imports
// NOTHING at module scope — every dependency (registry db, script store,
// warnings store, emitter) is injected, so the pipeline's flag-on import is
// side-effect free.

// resolveGating returns { state, familyId?, reviewRequired?, cacheUpdate?,
// viaCache?, failClosed?, unreadable? }; state: ungated | gated | drift.
export async function resolveGating({
  slug,
  registryDb,
  templateMeta,
  cache = null,
  now = () => new Date(),
  log = () => {},
} = {}) {
  const stamp = () => new Date(now()).toISOString();
  // The registry layer is resolved through a THUNK so its construction (which
  // throws without DATABASE_URL) is the C2 unreadable path, never a crash.
  let db = null;
  try {
    db = typeof registryDb === 'function' ? await registryDb() : registryDb;
  } catch (e) {
    log(`[review] registry unavailable (${String((e && e.message) || e).slice(0, 90)}) — the last-known-assignment cache decides (C2)`);
    db = null;
  }

  const unreadable = () => {
    if (cache && cache.assigned === true && cache.gated === true) {
      return { state: 'gated', viaCache: true, unreadable: true };
    }
    if (cache && (cache.assigned === false || cache.gated === false)) {
      return { state: 'ungated', viaCache: true, unreadable: true };
    }
    // No cache at all — fail-closed covers even a missing cache (D15b).
    return { state: 'gated', viaCache: false, failClosed: true, unreadable: true };
  };

  if (!db || typeof db.getActiveAssignment !== 'function') return unreadable();

  let row = null;
  try {
    row = await db.getActiveAssignment(slug);
  } catch (e) {
    log(`[review] assignment unreadable (${String((e && e.message) || e).slice(0, 90)}) — the cache decides (C2)`);
    return unreadable();
  }

  if (!row) {
    // No registry assignment at all: legacy channel — ungated, and the cache
    // records that so a later DB blip preserves the legacy behavior.
    return { state: 'ungated', cacheUpdate: { assigned: false, gated: false, checkedAt: stamp() } };
  }

  const familyId = row.family_id;
  const meta = typeof templateMeta === 'function' ? templateMeta(familyId) : null;
  const reviewRequired = meta && Array.isArray(meta?.safety?.review_required) ? meta.safety.review_required : null;
  if (reviewRequired === null) {
    // M3 drift: the gate cannot resolve the assignment's template — visible
    // on /warnings, and cached CONSERVATIVE (gated) so blips stay held.
    log(`[review] drift: assignment ${familyId} not resolvable in the registry meta — review gating inactive for this channel`);
    return { state: 'drift', familyId, cacheUpdate: { assigned: true, gated: true, checkedAt: stamp() } };
  }
  if (reviewRequired.length === 0) {
    return { state: 'ungated', familyId, reviewRequired, cacheUpdate: { assigned: true, gated: false, checkedAt: stamp() } };
  }
  return { state: 'gated', familyId, reviewRequired, cacheUpdate: { assigned: true, gated: true, checkedAt: stamp() } };
}

// D17 deadline: the slot's publishAt, else END-OF-DAY of the slot date
// (else created_at + 24h when not even the slot date is known). Null when
// nothing parseable exists (no timeout can be proven — never time out).
export function slotDeadline(script, now = () => new Date()) {
  const t = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  };
  if (script?.publish_at) {
    const p = t(script.publish_at);
    if (p !== null) return p;
  }
  if (script?.slot_date && /^\d{4}-\d{2}-\d{2}$/.test(String(script.slot_date))) {
    const eod = t(`${script.slot_date}T23:59:59Z`);
    if (eod !== null) return eod;
  }
  const c = t(script?.created_at);
  return c === null ? null : c + 24 * 3600_000;
}

async function emitRow(emit, warningsStore, fields, log) {
  if (typeof emit !== 'function' || !warningsStore) return null;
  try {
    return await emit(warningsStore, fields);
  } catch (e) {
    log(`[review] WARN warning row degraded (non-fatal): ${String((e && e.message) || e).slice(0, 100)}`);
    return null;
  }
}

/**
 * THE gate (D15/AC-P4-18) — consumed by channel-pipeline.mjs's T5 block.
 * Returns { ok, action: 'run'|'hold', reason, gating, script? } — the CALLER
 * owns the hold mechanics (skip the slot, record the job step, exit 0).
 * A script-store failure returns { ok:false } (AC-P4-5: a dead store never
 * darkens production — the pipeline logs and continues); assignment-state
 * unreadability holds INSIDE the gate (C2 is about the gate's own state,
 * not the store).
 */
export async function evaluateReviewGate({
  slug,
  slotDate,
  scriptStore,
  registryDb,
  templateMeta,
  cache = null,
  saveCache = null,
  warningsStore = null,
  emit = null,
  jobId = null,
  now = () => new Date(),
  log = () => {},
} = {}) {
  try {
    if (!scriptStore) return { ok: false, error: 'script_store_unavailable' };
    const gating = await resolveGating({ slug, registryDb, templateMeta, cache, now, log });
    if (gating.cacheUpdate && typeof saveCache === 'function') {
      try {
        await saveCache(gating.cacheUpdate);
      } catch (e) {
        log(`[review] WARN cache write degraded (non-fatal): ${String((e && e.message) || e).slice(0, 100)}`);
      }
    }

    if (gating.state === 'drift') {
      await emitRow(emit, warningsStore, {
        channel_id: slug,
        severity: 'action_required',
        code: 'review_gating_inactive',
        title: 'review gating inactive — assignment cannot be resolved',
        explanation: 'The channel has a template assignment, but the review gate cannot resolve it against the registry (template missing or its safety block unreadable). Review gating is INACTIVE for this condition and the slot is HELD fail-closed until the assignment is fixed in Studio > Templates.',
        evidence: `family_id ${gating.familyId ?? 'unknown'} unresolvable at ${new Date(now()).toISOString()}`,
        recommended_action: 'Re-assign the template in Studio > Template Registry (or unassign the channel) — the gate resumes on the next run.',
        auto_verifiable: false,
        job_id: jobId,
        dedupe_key: `${slug}:review_gating_inactive`,
      }, log);
      return { ok: true, action: 'hold', reason: 'drift', gating, script: null };
    }

    if (gating.unreadable) {
      await emitRow(emit, warningsStore, {
        channel_id: slug,
        severity: 'action_required',
        code: 'review_state_unreadable',
        title: 'review gate state unreadable — slot held fail-closed',
        explanation: 'The template-assignment store could not be read, so the gate cannot prove this channel is ungated. Per the fail-closed rule the slot is HELD (no production) until the registry is reachable again.',
        evidence: gating.failClosed
          ? 'assignment unreadable AND no last-known-assignment cache — fail-closed hold'
          : `assignment unreadable — held via the last-known-assignment cache (checked ${cache?.checkedAt ?? 'unknown'})`,
        recommended_action: 'Check the registry database; the next readable run clears this and the cache decides (legacy channels resume ungated).',
        auto_verifiable: false,
        job_id: jobId,
        dedupe_key: `${slug}:review_state_unreadable`,
      }, log);
      return {
        ok: true,
        action: 'hold',
        reason: gating.failClosed ? 'unreadable_no_cache' : 'unreadable_cached',
        gating,
        script: null,
      };
    }

    if (gating.state === 'ungated') {
      const reason = gating.viaCache ? 'legacy_cached' : (gating.cacheUpdate?.assigned === false ? 'ungated_legacy' : 'review_required_empty');
      return { ok: true, action: 'run', reason, gating, script: null };
    }

    // GATED — the approval state of today's slot decides (AC-P4-18/19).
    const slot = await scriptStore.scriptsForSlot(slug, slotDate);
    if (!slot.ok) return { ok: false, error: slot.error };
    const scripts = slot.scripts ?? [];
    const newest = scripts.length ? scripts[0] : null;

    // M4 run-start half: an awaiting script past its deadline warns + the
    // slot stays skipped — the script is RETAINED (retain-and-resume).
    const nowMs = new Date(now()).getTime();
    let timedOut = 0;
    for (const s of scripts.filter((x) => x.status === 'awaiting_review')) {
      const deadline = slotDeadline(s, now);
      if (deadline !== null && deadline < nowMs) {
        timedOut++;
        await emitRow(emit, warningsStore, {
          channel_id: slug,
          severity: 'action_required',
          code: 'review_timeout',
          title: `approval window passed — script "${String(s.title ?? s.id).slice(0, 60)}" still awaiting review`,
          explanation: 'The held script was not approved before its slot publishAt (else end-of-day). The slot is skipped for the day (a missing video is free) and the script is RETAINED awaiting_review — approving it later resumes at render without re-spend.',
          evidence: `script ${s.id} awaiting since ${s.created_at}, deadline ${new Date(deadline).toISOString()} passed at ${new Date(nowMs).toISOString()}`,
          recommended_action: 'Approve or reject at Studio > Review; approval resumes the run at render (publishAt recomputed from the kit slots).',
          auto_verifiable: false,
          job_id: s.job_id ?? jobId,
          dedupe_key: `${slug}:review_timeout:${s.id}`,
        }, log);
      }
    }

    const status = newest?.status ?? 'none';
    if (newest && status === 'approved') {
      return { ok: true, action: 'run', reason: 'approved', gating, script: newest, timedOut };
    }
    if (newest && status === 'rejected') {
      // The lane terminal: a rejected script never uploads; the slot is done
      // for today. The owner already acted — no fresh alert.
      return { ok: true, action: 'hold', reason: 'rejected', gating, script: newest, timedOut };
    }
    const reason = newest && status === 'awaiting_review' ? 'awaiting_review' : 'no_approved_script';
    await emitRow(emit, warningsStore, {
      channel_id: slug,
      severity: 'action_required',
      code: 'review_hold',
      title: `script held for review — slot ${slotDate} skipped`,
      explanation: newest
        ? 'The generated script is awaiting_review; nothing renders, uploads, or schedules until an approval row exists (D15 fail-closed).'
        : 'The channel is review-gated but no approved script exists for today\'s slot — production is held (fail-closed) until the generation seam lands an approved record.',
      evidence: newest ? `script ${newest.id} awaiting_review (slot ${slotDate})` : `no script record for slot ${slotDate}`,
      recommended_action: 'Approve at Studio > Review — approval dispatches the resume run; the slot publishes at the next recomputed slot time.',
      auto_verifiable: false,
      job_id: newest?.job_id ?? jobId,
      dedupe_key: `${slug}:review_hold:${slotDate}`,
    }, log);
    return { ok: true, action: 'hold', reason, gating, script: newest, timedOut };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 200) };
  }
}

/**
 * M4 nightly half (AC-P4-19): every awaiting script past its deadline — every
 * channel — gets one review_timeout warning; the scripts are RETAINED
 * awaiting_review (retain-and-resume: the sweep NEVER approves, rejects, or
 * consumes). Wired by scripts/review-sweep.mjs.
 */
export async function sweepReviewTimeouts({
  scriptStore,
  warningsStore = null,
  emit = null,
  now = () => new Date(),
  log = () => {},
} = {}) {
  try {
    if (!scriptStore) return { ok: false, error: 'script_store_unavailable' };
    const pending = await scriptStore.pendingFor(null);
    if (!pending.ok) return { ok: false, error: pending.error };
    const nowMs = new Date(now()).getTime();
    const timedOut = [];
    for (const s of pending.scripts ?? []) {
      const deadline = slotDeadline(s, now);
      if (deadline === null || deadline >= nowMs) continue;
      timedOut.push(s.id);
      await emitRow(emit, warningsStore, {
        channel_id: s.channel_id,
        severity: 'action_required',
        code: 'review_timeout',
        title: `approval window passed — script "${String(s.title ?? s.id).slice(0, 60)}" still awaiting review`,
        explanation: 'The held script was not approved before its slot publishAt (else end-of-day). The slot was skipped (a missing video is free) and the script is RETAINED awaiting_review — approving it later resumes at render without re-spend.',
        evidence: `script ${s.id} awaiting since ${s.created_at}, deadline ${new Date(deadline).toISOString()} passed at ${new Date(nowMs).toISOString()}`,
        recommended_action: 'Approve or reject at Studio > Review; approval resumes the run at render (publishAt recomputed from the kit slots).',
        auto_verifiable: false,
        job_id: s.job_id ?? null,
        dedupe_key: `${s.channel_id}:review_timeout:${s.id}`,
      }, log);
    }
    return { ok: true, timedOut: timedOut.length, scripts: timedOut };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 200) };
  }
}

export default evaluateReviewGate;
