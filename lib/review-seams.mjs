// #106 Phase 4 T5b (S4) — the LANE-side review seams. channel-pipeline.mjs's
// T5 gate decides (run / hold / resume); THIS module is what the child lanes
// (yt-daily / yt-deepdive / longvideo/shorts-clips) call to close the FULL
// approval loop:
//
//   SEAM 1 — generate-only: saveGeneratedScript persists the generated script
//            (status awaiting_review, the COMPLETE structured render input)
//            BEFORE any render; a resumed run finds it via findResumableScript
//            and renders from storedInputOf — the stored JSON, never a fresh
//            generation (D4: re-generation is impossible by construction; the
//            resume path in yt-daily has NO generate call to make).
//   SEAM 2 — thumbnail candidates: emitThumbCandidates shelves the N rendered
//            variants as `thumb_candidate` artifact bytes + job index rows and
//            records meta.thumb_candidates [{idx,url}] on the script row — the
//            exact shape /api/review GET?id= serves and /review renders.
//   SEAM 3 — video_id write-back (D14): the upload sites hold both videoId and
//            job_id, so THEY write scripts.video_id via writeBackVideoId —
//            job-linked lookup first, channel+latest-approved fallback, never
//            cross-kind, silent no-op for the non-gated legacy path.
//
// House patterns: lib/upload-intents.mjs / lib/review-gate.mjs — injected
// seams, never-throw, { ok } results; imports NOTHING at module scope, so a
// lane's dynamic `import('./lib/review-seams.mjs')` is side-effect free and
// the flag-off legacy path stays byte-identical.

export function flagOn(v) {
  return ['1', 'true'].includes(String(v ?? '').toLowerCase());
}

/**
 * D18/OQ-4: the candidate COUNT is template DATA (`review_thumb_pick` on the
 * registry meta — the same config surface the T5 gate reads). truthy = the
 * N=3 default; a finite number is honored (clamped 1..6); anything else = 1 =
 * today's single candidate, byte-identical (AC-P4-23).
 */
export function thumbCandidateCount(meta) {
  const v = meta?.review_thumb_pick;
  if (!v) return 1;
  if (Number.isFinite(v)) return Math.max(1, Math.min(6, Math.trunc(v)));
  return 3;
}

// ---------------------------------------------------------------------------
// #106 Phase 5 T2c — DETERMINISTIC DISCLAIMERS (spec D4 / AC-P5-4, Ruling 5).
// The narration keeps creative freedom; the DESCRIPTION carries compliance
// (machine-written, zero LLM risk) and the SAVE checks it. Fixed texts live in
// the template's registry block (`safety.disclaimers`) — the same template_id
// chain the assignment/brain/review gates resolve. Never prompt-hoped.
// ---------------------------------------------------------------------------

/** Trim+drop junk entries; null when nothing usable remains. */
function disclaimerList(list) {
  const clean = (Array.isArray(list) ? list : []).map((d) => String(d ?? '').trim()).filter(Boolean);
  return clean.length ? clean : null;
}

/**
 * The template's fixed disclaimer texts, resolved through the template_id
 * chain (REGISTRY_META[templateId].safety.disclaimers — the registry KEY, the
 * one string of the D19 invariant). Null = nothing declared = every consumer
 * keeps today's byte-identical behavior (the legacy 7 declare none). Lazy
 * dynamic import keeps this module import-free at scope (house rule); an
 * unreadable registry fail-opens to null — the same posture as the engine's
 * resolveTemplateId (no meta, no gate).
 */
export async function declaredDisclaimers(templateId) {
  if (!templateId) return null;
  try {
    const { REGISTRY_META } = await import('../studio/lib/template-registry.data.js');
    return disclaimerList(REGISTRY_META?.[templateId]?.safety?.disclaimers);
  } catch {
    return null;
  }
}

/**
 * The MACHINE append (never the LLM): each fixed text verbatim onto the end
 * of the upload DESCRIPTION, one per line in declared order. No declared
 * disclaimers = the input returned unchanged (byte-identical).
 */
export function appendDisclaimers(description, disclaimers) {
  const list = disclaimerList(disclaimers);
  if (!list) return description;
  return `${String(description ?? '')}\n\n${list.join('\n')}`;
}

function redact(e) {
  return String(e && e.message ? e.message : e).slice(0, 200);
}

/**
 * SEAM 1 (generate-only). Persist ONE surviving generated script. The caller
 * has ALREADY run the dedupe gates (the brain's D5/D6 walk inside the
 * generator + the lane's title gate) — a BLOCKED script never reaches here,
 * and a corrupt one is refused BEFORE any SQL (the store's one-transaction
 * save then makes script+input atomic). Returns { ok, id } | { ok:false, error }.
 *
 * #106 T5c: the DOC lane (yt-deepdive) saves through the same seam — the
 * episode maps to hook=title, points=chapters ({title, line: text}),
 * closing=outro, plus the cold-open `intro` which rides in full_render_input
 * ONLY when present (a short script has none — its stored shape stays
 * byte-identical, pinned by the AC-P4-17 deep-equal).
 *
 * #106 Phase 5 T2c — the contains() SAVE GATE (D4/AC-P5-4): where the script's
 * template declares disclaimers (registry meta safety.disclaimers, resolved
 * through the template_id chain), the save verifies the RECORD CARRIES the
 * machine-appended block — full_render_input.disclaimer_block, built right
 * here from the declared list — and each declared text must be present IN THE
 * BLOCK, or the save FAILS (fail-closed, nothing persisted; same posture as
 * "a dup-blocked script is never saved").
 *
 * T5e fix (found by the live MR pilot, run 41482343689): the NARRATION IS
 * NEVER SEARCHED. Compliance is the DESCRIPTION's machine-append (zero LLM
 * risk) — a freshly generated narration naturally lacks the fixed text, and
 * that is BY DESIGN (D4 creative freedom); the earlier narration-or-append
 * payload composition inverted the contract and made every honest save look
 * refusal-shaped. The block is built unconditionally in code for declaring
 * templates, so the gate passes by construction; its refusal branch is the
 * tripwire on a block that is missing or does not cover the declared list
 * (QA Row 10 boundary probe). `disclaimers` overrides the machine-append list
 * — the injected seam (tests; absent = resolve the chain). The narration text
 * is NEVER mutated; the block rides the record so /review sees the disclaimer
 * line (D4) and T5d's resume ships the stored block verbatim. No declared
 * disclaimers = no gate, no new key — byte-identical record.
 */
export async function saveGeneratedScript({
  scriptStore, channelId,
  templateId = null, templateVersion = null,
  kind = 'short', title = null,
  script, seed = null, themes = null,
  publishAt = null, slotDate = null, slotIdx = null, jobId = null,
  disclaimers,
} = {}) {
  try {
    if (!scriptStore) return { ok: false, error: 'script_store_unavailable' };
    const hook = typeof script?.hook === 'string' ? script.hook.trim() : '';
    const points = Array.isArray(script?.points) ? script.points : [];
    if (!hook || points.length === 0) return { ok: false, error: 'script_shape_unusable (a blocked/fallback generation is never saved)' };
    const closing = typeof script?.closing === 'string' ? script.closing : '';
    const thumbHeadline = typeof script?.thumbHeadline === 'string' ? script.thumbHeadline : '';
    const intro = typeof script?.intro === 'string' ? script.intro : '';
    const text = [hook, ...points.map((p) => p?.line || ''), closing].filter(Boolean).join('\n\n');
    // T2c gate, T5e structural fix (D4): declared = the registry truth; the
    // record's machine-appended disclaimer_block is built HERE from the
    // append list (default: the declared list itself, appended unconditionally
    // at the upload sites). The gate verifies the BLOCK covers every declared
    // text — deterministic, machine-built, never the LLM's prose. The
    // narration is NEVER searched (a fresh generation naturally lacks the
    // fixed text; creative freedom per D4).
    const declared = await declaredDisclaimers(templateId);
    const appended = disclaimers === undefined ? declared : disclaimerList(disclaimers);
    const disclaimerBlock = appended ? appended.join('\n') : '';
    const missing = disclaimerList(declared)?.filter((d) => !disclaimerBlock.includes(d)) || [];
    if (missing.length) {
      return {
        ok: false,
        error: `disclaimer_missing (${missing.join(' | ')}): the template declares fixed disclaimers but the record's machine-appended disclaimer_block does not cover them (D4/AC-P5-4) — save refused, nothing persisted`,
      };
    }
    const fullRenderInput = {
      hook, points, closing, thumbHeadline,
      ...(intro ? { intro } : {}),
      ...(disclaimerBlock ? { disclaimer_block: disclaimerBlock } : {}),
      seed: seed ?? null, themes: themes ?? null, publishAt: publishAt ?? null,
      // P5 round 1 (the live desk gap): every generate-only hold IS a
      // review-class script — this seam only runs when the gate GATED the
      // channel (finance/medical are disclosure-relevant), and the
      // AI-illustrated production style applies across the portfolio (the
      // owner's style answers: scenes Yes, voice Yes). Without this key
      // /review skips the four-category checklist entirely and Approve
      // enables UNANSWERED. Unconditional on purpose: the flag can only ADD
      // a gate to an approval, never remove one. The disclaimer gate (T2c/
      // T5e) reads the separate disclaimer_block key — unaffected.
      disclosure: { synthetic_media_required: true },
    };
    const saved = await scriptStore.saveScript({
      channelId,
      templateId: templateId ?? null,
      templateVersion: templateVersion ?? null,
      kind,
      title: title ?? null,
      fullRenderInput,
      text,
      status: 'awaiting_review',
      jobId: jobId ?? null,
      slotDate: slotDate ?? null,
      slotIdx: Number.isInteger(slotIdx) ? slotIdx : null,
      publishAt: publishAt ?? null,
    });
    if (!saved.ok) return { ok: false, error: saved.error || saved.reason || 'save_failed' };
    return { ok: true, id: saved.id, fullRenderInput, text };
  } catch (e) {
    return { ok: false, error: redact(e) };
  }
}

/**
 * SEAM 1 (resume side, pure). Parse a script row's stored full_render_input
 * (pg jsonb arrives as an object, the string form is tolerated) and validate
 * it is USABLE for a render: a real hook and at least one point with words.
 * Null = "no usable stored input" — the caller must refuse to re-generate.
 */
export function storedInputOf(row) {
  if (!row) return null;
  let input = row.full_render_input;
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch { return null; }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const hook = typeof input.hook === 'string' ? input.hook.trim() : '';
  const points = Array.isArray(input.points) ? input.points : [];
  if (!hook || points.length === 0) return null;
  if (!points.every((p) => p && typeof p === 'object' && String(p.line || p.title || '').trim().length > 0)) return null;
  return input;
}

/**
 * SEAM 1 (resume side). The approval lookup: the dispatched job's APPROVED
 * script first (a job that generated several slots has one row per slot and
 * newest-by-created_at is not necessarily the approved one), then the
 * legacy-shaped latestForJob status-checked, then the channel's
 * latest-approved. A store READ error returns { ok:false } — the caller reads
 * that as "cannot prove the approval" (fail-closed), never "generate fresh".
 */
export async function findResumableScript({ scriptStore, jobId, channelId }) {
  try {
    if (!scriptStore) return { ok: false, error: 'script_store_unavailable' };
    if (jobId) {
      if (typeof scriptStore.latestApprovedForJob === 'function') {
        const r = await scriptStore.latestApprovedForJob(jobId);
        if (!r.ok) return { ok: false, error: r.error || 'latestApprovedForJob_failed' };
        if (r.script) return { ok: true, script: r.script, via: 'job' };
      }
      if (typeof scriptStore.latestForJob === 'function') {
        const r = await scriptStore.latestForJob(jobId);
        if (!r.ok) return { ok: false, error: r.error || 'latestForJob_failed' };
        if (r.script && r.script.status === 'approved') return { ok: true, script: r.script, via: 'job' };
      }
    }
    if (typeof scriptStore.latestApproved === 'function') {
      const r = await scriptStore.latestApproved(channelId);
      if (!r.ok) return { ok: false, error: r.error || 'latestApproved_failed' };
      if (r.script && r.script.status === 'approved') return { ok: true, script: r.script, via: 'channel' };
    }
    return { ok: true, script: null };
  } catch (e) {
    return { ok: false, error: redact(e) };
  }
}

/**
 * SEAM 3 (D14). Called by every lane's post-upload SUCCESS path — the only
 * code that holds both the returned videoId and the job id. Resolves the
 * script (job-linked first — trusted by construction, the store found it BY
 * this job), then the channel+latest-approved fallback — which is SCOPED
 * (T5b round 1): an unrelated approved script (different slot day AND
 * different job) is never retired with THIS video's id, or the S5 win-rate
 * join would attribute a never-reviewed script's text to someone else's
 * video and the real script could never ship. The fallback consumes only a
 * same-slot (slot_date === slotDate) or same-job (job_id === jobId) row.
 * The kind guard keeps a doc upload from stamping a short script row.
 * NEVER throws and stays SILENT when nothing matches — the non-gated legacy
 * path (no script rows) keeps its exact log.
 */
export async function writeBackVideoId({ scriptStore, channelId, jobId = null, kind = null, videoId, slotDate = null, log = () => {} } = {}) {
  try {
    if (!scriptStore || !videoId) return { ok: true, consumed: false };
    let row = null;
    let viaFallback = false;
    if (jobId && typeof scriptStore.latestForJob === 'function') {
      const r = await scriptStore.latestForJob(jobId);
      if (r.ok && r.script) row = r.script;
    }
    if (!row && typeof scriptStore.latestApproved === 'function') {
      const r = await scriptStore.latestApproved(channelId);
      if (r.ok && r.script) {
        const sameSlot = !!slotDate && r.script.slot_date === slotDate;
        const sameJob = !!jobId && r.script.job_id === jobId;
        if (sameSlot || sameJob) {
          row = r.script;
          viaFallback = true;
        } else {
          // an unrelated approved script — NEVER consume it with this video
          return { ok: true, consumed: false, skippedUnrelated: true };
        }
      }
    }
    if (!row || row.status !== 'approved') return { ok: true, consumed: false };
    if (kind && row.kind && row.kind !== kind) return { ok: true, consumed: false, skippedKindMismatch: true };
    const mc = await scriptStore.markConsumed(row.id, videoId);
    if (mc.ok) {
      log(`video_id write-back: script ${row.id} -> consumed (${videoId})${viaFallback ? ' [same-slot fallback]' : ''}`);
      return { ok: true, consumed: true, id: row.id };
    }
    if (mc.error) log(`WARN video_id write-back degraded (non-fatal): ${mc.error}`);
    return { ok: true, consumed: false };
  } catch (e) {
    log(`WARN video_id write-back degraded (non-fatal): ${redact(e)}`);
    return { ok: true, consumed: false };
  }
}

/**
 * SEAM 2 (D18/AC-P4-23). Shelf the rendered variant buffers as
 * `thumb_candidate` artifact bytes, index them on the job, and record
 * meta.thumb_candidates [{idx, url}] on the script row when one exists (the
 * ungated/doc lanes have no row — the artifact index still holds them).
 * Per-variant fail-soft: a degraded candidate is skipped, the render never
 * blocks. Candidate 1 is the auto-set default (M7) — the caller uploads it.
 */
export async function emitThumbCandidates({
  thumbs, artifacts, jobs = null, jobId = null, step = null,
  scriptStore = null, scriptId = null, log = () => {},
} = {}) {
  try {
    const list = (Array.isArray(thumbs) ? thumbs : []).filter((t) => t && t.length);
    if (!artifacts || typeof artifacts.putBytes !== 'function' || list.length === 0) {
      return { ok: true, candidates: [] };
    }
    const candidates = [];
    for (let i = 0; i < list.length; i++) {
      try {
        const put = await artifacts.putBytes('thumb_candidate', list[i], { contentType: 'image/jpeg' });
        if (!put?.ok) continue;
        candidates.push({ idx: i + 1, url: put.blob_url ?? null, hash: put.hash });
        if (jobs && typeof jobs.indexArtifact === 'function' && jobId) {
          await jobs.indexArtifact(jobId, {
            step: step ?? 'render',
            kind: 'thumb_candidate',
            contentHash: put.hash,
            blobUrl: put.blob_url ?? null,
            size: list[i].length,
            meta: { idx: i + 1 },
          });
        }
      } catch (e) {
        log(`thumb candidate ${i + 1} degraded (non-fatal): ${redact(e)}`);
      }
    }
    if (scriptId && scriptStore && typeof scriptStore.recordThumbCandidates === 'function' && candidates.length) {
      // hash rides along: the /review thumb route verifies the bytes it reads
      // back from the PRIVATE store (getBytes expectedHash) before serving
      const rec = await scriptStore.recordThumbCandidates(scriptId, candidates.map(({ idx, url, hash }) => ({ idx, url, hash })));
      if (!rec?.ok) log(`thumb candidates not recorded on the script (${rec?.error || rec?.reason || 'not_open'}) — the artifact index still holds them`);
    }
    return { ok: true, candidates };
  } catch (e) {
    log(`thumb candidates degraded (non-fatal): ${redact(e)}`);
    return { ok: true, candidates: [] };
  }
}
