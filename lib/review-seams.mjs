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

function redact(e) {
  return String(e && e.message ? e.message : e).slice(0, 200);
}

/**
 * SEAM 1 (generate-only). Persist ONE surviving generated script. The caller
 * has ALREADY run the dedupe gates (the brain's D5/D6 walk inside the
 * generator + the lane's title gate) — a BLOCKED script never reaches here,
 * and a corrupt one is refused BEFORE any SQL (the store's one-transaction
 * save then makes script+input atomic). Returns { ok, id } | { ok:false, error }.
 */
export async function saveGeneratedScript({
  scriptStore, channelId,
  templateId = null, templateVersion = null,
  kind = 'short', title = null,
  script, seed = null, themes = null,
  publishAt = null, slotDate = null, slotIdx = null, jobId = null,
} = {}) {
  try {
    if (!scriptStore) return { ok: false, error: 'script_store_unavailable' };
    const hook = typeof script?.hook === 'string' ? script.hook.trim() : '';
    const points = Array.isArray(script?.points) ? script.points : [];
    if (!hook || points.length === 0) return { ok: false, error: 'script_shape_unusable (a blocked/fallback generation is never saved)' };
    const closing = typeof script?.closing === 'string' ? script.closing : '';
    const thumbHeadline = typeof script?.thumbHeadline === 'string' ? script.thumbHeadline : '';
    const fullRenderInput = { hook, points, closing, thumbHeadline, seed: seed ?? null, themes: themes ?? null, publishAt: publishAt ?? null };
    const text = [hook, ...points.map((p) => p?.line || ''), closing].filter(Boolean).join('\n\n');
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
 * script (job-linked first, channel+latest-approved fallback — the resumed
 * run's job id differs from the held job that owns the script row), guards
 * the kind (a doc upload must never stamp a short script row), and retires
 * the record to `consumed`. NEVER throws and stays SILENT when nothing
 * matches — the non-gated legacy path (no script rows) keeps its exact log.
 */
export async function writeBackVideoId({ scriptStore, channelId, jobId = null, kind = null, videoId, log = () => {} } = {}) {
  try {
    if (!scriptStore || !videoId) return { ok: true, consumed: false };
    let row = null;
    if (jobId && typeof scriptStore.latestForJob === 'function') {
      const r = await scriptStore.latestForJob(jobId);
      if (r.ok && r.script) row = r.script;
    }
    if (!row && typeof scriptStore.latestApproved === 'function') {
      const r = await scriptStore.latestApproved(channelId);
      if (r.ok && r.script) row = r.script;
    }
    if (!row || row.status !== 'approved') return { ok: true, consumed: false };
    if (kind && row.kind && row.kind !== kind) return { ok: true, consumed: false, skippedKindMismatch: true };
    const mc = await scriptStore.markConsumed(row.id, videoId);
    if (mc.ok) {
      log(`video_id write-back: script ${row.id} -> consumed (${videoId})`);
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
      const rec = await scriptStore.recordThumbCandidates(scriptId, candidates.map(({ idx, url }) => ({ idx, url })));
      if (!rec?.ok) log(`thumb candidates not recorded on the script (${rec?.error || rec?.reason || 'not_open'}) — the artifact index still holds them`);
    }
    return { ok: true, candidates };
  } catch (e) {
    log(`thumb candidates degraded (non-fatal): ${redact(e)}`);
    return { ok: true, candidates: [] };
  }
}
