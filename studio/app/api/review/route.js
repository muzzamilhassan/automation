// #106 Phase 4 T5 (S4) — /api/review: the approval desk's server side.
// Staff read + prepare; OWNER approves/rejects/picks (OQ-5: fail-closed
// approvals stay owner-only — the proxy matrix is only the first gate, the
// role is RE-CHECKED here per request).
//
//   GET  /api/review            → { scripts: [awaiting_review rows + dedupe verdict] }
//   GET  /api/review?id=<uuid>  → { script, sources, claims, disclosure }
//   POST  /api/review { action: 'approve', id, note, disclosure }  → owner-only.
//       Approve = status approved + dispatch channel-autopilot.yml
//       (channel=<slug>&resume=<job_id> — the /api/action pattern, D16);
//       a dispatch failure records an Action-required warning row (never a
//       silent approved-but-not-rendered; the owner re-triggers via
//       'redispatch'). AC-P4-21: WHERE the script requires disclosure, all
//       four official categories must be answered or approval is refused.
//   POST  /api/review { action: 'reject', id, note }               → owner-only.
//   POST  /api/review { action: 'redispatch', id }                 → owner-only.
//   GET  /api/review?thumb=1&id=<uuid>&idx=<n>  → owner+staff. The candidate's
//       bytes from the PRIVATE artifact store, resolved from the script row's
//       meta SERVER-SIDE (a raw client URL is never fetched — open-proxy
//       guard) and hash-verified before serving image/jpeg. /review's <img>
//       points here: private-store blob URLs need the token-authenticated
//       read, which a browser <img> cannot do.
//   POST  /api/review { action: 'pick-thumb', id, candidate }      → owner-only.
//       D18 post-upload swap: applies (thumbnails.set) before publishAt,
//       recorded-only after; unpicked = candidate 1 (M7). The candidate bytes
//       are read through the same token-authenticated primitive.
import { getUser, requireRole } from '@/lib/route-auth';
import { db, dbReady } from '@/lib/db.mjs';
import { adaptPostgres } from '@/lib/provider-routing';
import { makeScriptStore, adaptPostgresTransact } from '@/lib/script-store.mjs';
import { makeArtifactStore } from '@/lib/artifact-store.mjs';
import { makeWarningsStore, emitWarning } from '@/lib/warnings-store.mjs';
import { ENV } from '@/lib/data.mjs';
import { appendAudit } from '@/lib/audit';
import {
  approveScriptAndDispatch,
  dispatchResumeRun,
  resolvePickRequest,
  defaultCandidateIndex,
  parseRenderInput,
} from '@/lib/review-actions.mjs';
import { createAccessToken } from '@/lib/yt-token.mjs';

export const dynamic = 'force-dynamic';

const REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';

function store() {
  // T5f round 1: the transact rides here too — this desk only reads and
  // single-writes today, but a future saveScript through a dbClient-only
  // store would silently partial-persist (the pass-through default runs
  // non-atomic, autocommit). Same construction as getScriptStore.
  return makeScriptStore({ dbClient: adaptPostgres(db), transact: adaptPostgresTransact(db) }); // makeScriptStore takes the DEPS object (makeJobStore pattern) — not the bare client
}

// The durable-warning seam (round-1 BLOCKER 2): the approve AND redispatch
// paths emit through the real warnings store, with the push suppressed (the
// owner is IN the dashboard acting — a dispatch failure still gets its
// Action-required row; ntfy re-alerts are the dedupe's business).
function warnings() {
  return makeWarningsStore(adaptPostgres(db));
}

async function recordDispatchFailure(script, scriptId, detail) {
  await emitWarning(warnings(), {
    channel_id: script.channel_id,
    severity: 'action_required',
    code: 'approval_dispatch_failed',
    title: 'approval recorded but the resume dispatch FAILED — the video will not render until re-triggered',
    explanation: 'The owner approved the script and Studio tried to dispatch channel-autopilot.yml with resume=<job_id>, but GitHub rejected the dispatch. The approval row stands; nothing renders until the dispatch is re-triggered from /review.',
    evidence: `script ${scriptId}, job ${script.job_id ?? 'none'} — ${detail}`,
    recommended_action: 'Re-trigger the dispatch from Studio > Review (Redispatch). If it keeps failing, check the GITHUB_TOKEN server secret.',
    auto_verifiable: false,
    job_id: script.job_id ?? null,
    dedupe_key: `${script.channel_id}:approval_dispatch_failed`,
  }, { sendAlert: async () => ({ channel: 'none', ok: true }) });
}

export async function GET(req) {
  const user = await getUser(req);
  // staff read + prepare (OQ-5); clients get nothing here.
  if (!user || !['owner', 'staff'].includes(user.role)) return Response.json({ error: 'not signed in' }, { status: 401 });
  if (!dbReady) return Response.json({ ok: false, code: 'DB_DOWN', error: 'db unavailable' }, { status: 503 });
  const s = store();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  // T5b round 1: the thumbnail-candidate bytes. The URL/hash come from the
  // SCRIPT ROW's meta (server-side) — the client only names id+idx, never a
  // URL (a raw client URL would make this an open proxy for the artifact
  // store). PRIVATE store: the token-authenticated getBytes is the only read.
  if (url.searchParams.get('thumb') === '1') {
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });
    const idx = Number(url.searchParams.get('idx'));
    const g = await s.getScript(id);
    if (!g.ok) return Response.json({ error: g.error }, { status: 503 });
    if (!g.script) return Response.json({ error: 'not found' }, { status: 404 });
    const meta = parseRenderInput(g.script.meta) || {};
    const candidate = (meta.thumb_candidates || []).find((c) => Number(c.idx) === idx);
    if (!candidate?.url) return Response.json({ error: 'candidate not found' }, { status: 404 });
    const got = await makeArtifactStore().getBytes(candidate.url, { expectedHash: candidate.hash || undefined });
    if (!got.ok) return Response.json({ error: `candidate bytes unreadable: ${got.error}` }, { status: 404 });
    return new Response(new Uint8Array(got.bytes), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' },
    });
  }

  if (id) {
    const g = await s.getScript(id);
    if (!g.ok) return Response.json({ error: g.error }, { status: 503 });
    if (!g.script) return Response.json({ error: 'not found' }, { status: 404 });
    const meta = parseRenderInput(g.script.meta) || {};
    return Response.json({
      script: g.script,
      sources: g.sources,
      claims: g.claims,
      thumbCandidates: meta.thumb_candidates || [],
      thumbPick: meta.thumb_pick || null,
      defaultCandidate: defaultCandidateIndex(),
    });
  }
  const list = await s.pendingFor(null);
  if (!list.ok) return Response.json({ error: list.error }, { status: 503 });
  return Response.json({ scripts: list.scripts });
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  // Server-side owner re-check on EVERY action (the desk mutates production).
  if (!(await requireRole(req, ['owner']))) return Response.json({ error: 'owner only' }, { status: 403 });
  if (!dbReady) return Response.json({ error: 'db unavailable' }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const s = store();

  if (body.action === 'approve') {
    if (!body.id) return Response.json({ error: 'id required' }, { status: 400 });
    const r = await approveScriptAndDispatch({
      scriptStore: s,
      // BLOCKER 2 fix: the durable row is written from the ROUTE's own store —
      // a failed dispatch can never leave approved-but-never-rendered silent
      // (AC-P4-22; the row lands on /warnings with the Redispatch escape hatch).
      warningsStore: warnings(),
      emit: emitWarning,
      scriptId: body.id,
      by: user.email,
      note: body.note ?? null,
      disclosure: body.disclosure ?? null,
      token: TOKEN,
      repo: REPO,
      fetchImpl: fetch,
    });
    await appendAudit(user.email, 'review-approve',
      `${body.id}${r.dispatched ? ' · dispatched' : r.approved ? ` · APPROVED BUT DISPATCH FAILED (${r.error})` : ` · refused (${r.error})`}`);
    if (!r.ok && !r.approved) return Response.json({ error: r.error }, { status: 400 });
    if (!r.dispatched) return Response.json({ ok: true, approved: true, dispatched: false, warning: r.error }, { status: 202 });
    return Response.json({ ok: true, approved: true, dispatched: true });
  }

  if (body.action === 'reject') {
    if (!body.id) return Response.json({ error: 'id required' }, { status: 400 });
    const r = await s.reject(body.id, { by: user.email, note: body.note ?? null });
    if (!r.ok) {
      const status = r.reason === 'not_found' ? 404 : r.reason === 'not_open' ? 409 : 400;
      return Response.json({ error: r.error || r.reason }, { status });
    }
    await appendAudit(user.email, 'review-reject', `${body.id} · ${body.note ?? ''}`);
    return Response.json({ ok: true, rejected: true });
  }

  if (body.action === 'redispatch') {
    // The D16 escape hatch: an approved script whose dispatch failed is
    // re-triggered from the warning — the approval row already stands.
    const g = await s.getScript(body.id);
    if (!g.ok || !g.script) return Response.json({ error: 'script not found' }, { status: 404 });
    if (g.script.status !== 'approved') return Response.json({ error: 'script is not approved' }, { status: 409 });
    const dispatch = await dispatchResumeRun({ slug: g.script.channel_id, jobId: g.script.job_id, token: TOKEN, repo: REPO });
    if (!dispatch.ok) {
      // Same durable record as the approve path — never silent.
      await recordDispatchFailure(g.script, g.script.id, `re-dispatch rejected: ${dispatch.error}`);
      await appendAudit(user.email, 'review-redispatch', `${body.id} · FAILED (${dispatch.error})`);
      return Response.json({ error: dispatch.error }, { status: 502 });
    }
    await appendAudit(user.email, 'review-redispatch', `${body.id} · dispatched`);
    return Response.json({ ok: true, dispatched: true });
  }

  if (body.action === 'pick-thumb') {
    const g = await s.getScript(body.id);
    if (!g.ok || !g.script) return Response.json({ error: 'script not found' }, { status: 404 });
    const meta = parseRenderInput(g.script.meta) || {};
    const candidates = meta.thumb_candidates || [];
    if (!candidates.length) return Response.json({ error: 'no thumbnail candidates recorded for this script' }, { status: 409 });
    const pick = resolvePickRequest({
      candidate: Number(body.candidate),
      candidatesCount: candidates.length,
      publishedAt: g.script.publish_at,
      now: () => new Date(),
    });
    if (!pick.ok) return Response.json({ error: pick.error }, { status: 400 });

    let applied = false;
    let applyError = null;
    if (pick.apply) {
      // D18 post-upload swap: candidate 1 auto-set at upload; the pick calls
      // thumbnails.set again. No video yet = nothing to swap (candidate 1 is
      // still the auto-set default until upload).
      if (!g.script.video_id) {
        return Response.json({ error: 'video not uploaded yet — candidate 1 will be set at upload' }, { status: 409 });
      }
      const candidate = candidates.find((c) => Number(c.idx) === Number(body.candidate));
      if (!candidate?.url) {
        return Response.json({ error: 'candidate has no retrievable image' }, { status: 409 });
      }
      try {
        const accessToken = createAccessToken({ fetchImpl: fetch });
        const token = await accessToken(g.script.channel_id);
        // T5b round 1: the PRIVATE artifact store's bytes come through the
        // token-authenticated primitive (hash-verified) — a plain fetch of the
        // blob URL gets a 401, and fetching an arbitrary URL would be a proxy.
        const got = await makeArtifactStore().getBytes(candidate.url, { expectedHash: candidate.hash || undefined });
        if (!got.ok) throw new Error(`candidate bytes unreadable: ${got.error}`);
        const setRes = await fetch(
          `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(g.script.video_id)}`,
          { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(got.bytes) },
        );
        if (!setRes.ok) throw new Error(`thumbnails.set HTTP ${setRes.status}`);
        applied = true;
      } catch (e) {
        applyError = String((e && e.message) || e).slice(0, 140);
      }
    }
    await s.recordThumbPick(body.id, {
      candidate: Number(body.candidate),
      at: new Date().toISOString(),
      by: user.email,
      applied,
      note: applied ? pick.reason : (applyError ?? pick.reason),
    });
    await appendAudit(user.email, 'review-thumb-pick', `${body.id} · candidate ${body.candidate} · ${applied ? 'applied' : 'recorded only'}`);
    if (!applied && pick.apply) {
      return Response.json({ ok: true, applied: false, error: `swap failed: ${applyError} — pick recorded` }, { status: 202 });
    }
    return Response.json({ ok: true, applied, reason: pick.reason });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
