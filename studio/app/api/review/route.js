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
//   POST  /api/review { action: 'pick-thumb', id, candidate }      → owner-only.
//       D18 post-upload swap: applies (thumbnails.set) before publishAt,
//       recorded-only after; unpicked = candidate 1 (M7).
import { getUser, requireRole } from '@/lib/route-auth';
import { db, dbReady } from '@/lib/db.mjs';
import { adaptPostgres } from '@/lib/provider-routing';
import { makeScriptStore } from '@/lib/script-store.mjs';
import { makeWarningsStore } from '@/lib/warnings-store.mjs';
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
  return makeScriptStore(adaptPostgres(db));
}

export async function GET(req) {
  const user = await getUser(req);
  // staff read + prepare (OQ-5); clients get nothing here.
  if (!user || !['owner', 'staff'].includes(user.role)) return Response.json({ error: 'not signed in' }, { status: 401 });
  if (!dbReady) return Response.json({ scripts: [], error: 'db unavailable' });
  const s = store();
  const id = new URL(req.url).searchParams.get('id');
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
      const warnings = makeWarningsStore(adaptPostgres(db));
      const { emitWarning } = await import('@/lib/warnings-store.mjs');
      await emitWarning(warnings, {
        channel_id: g.script.channel_id,
        severity: 'action_required',
        code: 'approval_dispatch_failed',
        title: 're-dispatch of an approved script FAILED — still not rendering',
        explanation: 'The owner re-triggered the resume dispatch for an approved script, but GitHub rejected it again. The approval stands; nothing renders until a dispatch succeeds.',
        evidence: `script ${g.script.id}, job ${g.script.job_id ?? 'none'} — ${dispatch.error}`,
        recommended_action: 'Check the GITHUB_TOKEN server secret and dispatch again from Studio > Review.',
        auto_verifiable: false,
        job_id: g.script.job_id ?? null,
        dedupe_key: `${g.script.channel_id}:approval_dispatch_failed`,
      }, { sendAlert: async () => ({ channel: 'none', ok: true }) });
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
        const img = await fetch(candidate.url);
        if (!img.ok) throw new Error(`candidate fetch HTTP ${img.status}`);
        const bytes = Buffer.from(await img.arrayBuffer());
        const setRes = await fetch(
          `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(g.script.video_id)}`,
          { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: bytes },
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
