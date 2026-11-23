// "Ask the factory" (2026-11-23) — POST { plan } → { ok, runUrl } after the
// owner pressed Start on the plan card.
// The plan is NOT trusted: only its channel / lane / topic are read, and
// lib/factory-plan.mjs rebuilds the plan from them against the REAL channel
// list. Then, in order, each with a plain reason on refusal:
//   1. the channel is 7/7 ready (lib/channel-readiness.mjs — the same rule the
//      engine applies; a not-ready channel never produces);
//   2. the lane would do something today (pause / Sunday / Shorts already
//      made / today's documentary already shipped);
//   3. today's review-gate slot is free — a script already waiting, approved
//      or rejected there decides the run and the topic would be dropped;
//   4. no run for this channel is already waiting (a second dispatch would
//      CANCEL the waiting one — channel-<slug> concurrency group);
// and only then channel-autopilot.yml is dispatched with exactly
// { channel, topic, lane } (workflow inputs; the topic travels as env and is
// sanitised again by the engine). Everything after — script, the review
// hold, voice, render, upload — is the channel's normal pipeline.
// Owner only: the proxy (lib/route-roles.js) AND this route, fail-closed.
import { getUser } from '@/lib/route-auth';
import { appendAudit } from '@/lib/audit';
import { enforceLimits } from '@/lib/rate-limit.mjs';
import { ENV } from '@/lib/data.mjs';
import { readRepoJSON } from '@/lib/channels-registry';
import { readinessFor, missingLabels, READINESS_TOTAL } from '@/lib/channel-readiness.mjs';
import { dispatchResumeRun, channelRunBusy } from '@/lib/review-actions.mjs';
import { getScriptStore } from '@/lib/script-store.mjs';
import { revalidatePlan, laneBlocker, slotScriptBlocker, dispatchInputs, withDispatchInputs } from '@/lib/factory-plan.mjs';
import { loadFactorySetup, setupFailed } from '../factory-setup';

export const dynamic = 'force-dynamic';

const REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  if (user.role !== 'owner') return Response.json({ error: 'only the owner can start the factory' }, { status: 403 });
  // a billable GitHub Actions run — the SAME 'dispatch' bucket as /api/action
  const limited = await enforceLimits(user, [
    { bucket: 'dispatch', limit: 10, windowSec: 3600 },
    { bucket: 'dispatch', limit: 30, windowSec: 86400 },
  ]);
  if (limited) return limited;
  if (!TOKEN) return Response.json({ error: 'The server has no GitHub token, so it cannot start runs.' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  let setup;
  try {
    setup = await loadFactorySetup();
  } catch (e) {
    return setupFailed(e);
  }
  const { registry, cadence, channels } = setup;

  const v = revalidatePlan(body.plan, channels);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
  const p = v.plan;
  const slug = p.channel;

  const readiness = readinessFor({ registry, cadence, slug });
  if (!readiness.ready) {
    const missing = missingLabels(readiness).join(', ') || 'unknown';
    return Response.json(
      { error: `${p.channelLabel} isn’t ready to publish yet (${readiness.done ?? 0}/${READINESS_TOTAL}) — missing: ${missing}. Finish it on the Channels page first.` },
      { status: 409 },
    );
  }

  let state = null;
  try {
    state = await readRepoJSON(`yt-mcp/state/${slug}.json`); // slug is from the real list (revalidatePlan)
  } catch {
    state = null; // unreadable state = no blocker known; the engine's own guards still apply
  }
  const blocked = laneBlocker({ lane: p.lane, label: p.channelLabel, state });
  if (blocked) return Response.json({ error: blocked }, { status: 409 });

  // the review gate reads today's slot (UTC date, the pipeline's `today`);
  // skipped only when the channel is known to be ungated (gate never looks)
  if (p.reviewGate !== false) {
    const today = new Date().toISOString().slice(0, 10);
    let scripts = null;
    try {
      const store = await getScriptStore();
      const slot = store ? await store.scriptsForSlot(slug, today) : null;
      scripts = slot?.ok ? slot.scripts ?? [] : null;
    } catch {
      scripts = null; // unreadable = refuse (the gate would hold the run too)
    }
    const slotBlocked = slotScriptBlocker({ scripts, label: p.channelLabel });
    if (slotBlocked) return Response.json({ error: slotBlocked }, { status: 409 });
  }

  const busy = await channelRunBusy({ slug, token: TOKEN, repo: REPO });
  if (busy.busy) {
    return Response.json(
      { error: `A run for ${p.channelLabel} is already ${busy.status === 'in_progress' ? 'running' : 'waiting'} — starting another now would cancel it. Try again after it finishes (Runs page).` },
      { status: 409 },
    );
  }

  const inputs = dispatchInputs(p);
  try {
    await appendAudit(user.email, 'factory-start', `${slug} · ${p.lane} · ${p.topic}`);
  } catch { }
  const dispatch = await dispatchResumeRun({ slug, token: TOKEN, repo: REPO, fetchImpl: withDispatchInputs(inputs) });
  if (!dispatch.ok) {
    return Response.json({ error: `GitHub did not start the run (${dispatch.error || 'unknown error'}). Nothing was started — try again.` }, { status: 502 });
  }
  return Response.json({ ok: true, plan: p, runUrl: '/runs' });
}
