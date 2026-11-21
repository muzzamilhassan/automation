// 10-08 FLOW CONTROL — the per-channel Autopilot ON/OFF switch.
// PATCH { slug, on: true|false }
// OFF writes BOTH: registry autopilot=false (autopilot discovery + sweeper
// skip) AND state pausedUntil=2099-12-31 (yt-daily/yt-deepdive hard-stop even
// if invoked directly). ON clears both. Already-scheduled videos still publish
// (they live on YouTube) — pause never recalls anything.
// 2026-11-21: ON answers 409 (with the missing items) until the channel is
// 7/7 ready to publish — studio/lib/channel-readiness.mjs.
import { getUser } from '@/lib/route-auth';
import { slugsForUser } from '@/lib/access';
import { readRepoJSON, writeRepoJSON, setChannelAutopilot } from '@/lib/channels-registry';
import { appendAudit } from '@/lib/audit';
import { readinessFor, missingLabels } from '@/lib/channel-readiness.mjs';

export const dynamic = 'force-dynamic';

const FAR = '2099-12-31';

export async function PATCH(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const actor = user.email;

  const body = await req.json().catch(() => ({}));
  const { slug, on } = body;
  if (!slug || typeof on !== 'boolean') return Response.json({ error: 'need slug + on(boolean)' }, { status: 400 });

  // 10-08 P2 CLIENT ROLE: clients may pause/resume ONLY their own channels
  // (parse the body FIRST — referencing `slug` before this destructure threw
  // a TDZ ReferenceError and every client PATCH became a 500; issue #46)
  if (user.role === 'client') {
    const owned = await slugsForUser(user).catch(() => null);
    if (!owned || !owned.includes(slug)) return Response.json({ error: 'not your channel' }, { status: 403 });
  } else if (!['owner', 'staff'].includes(user.role)) {
    return Response.json({ error: 'not signed in' }, { status: 401 });
  }

  // 0. Owner 2026-11-21 ("100% ready before anything publishes"): Resume is
  // refused until all 7 panel items are set. Checked from the SAME engine
  // files the autopilot reads (registry + cadence), before any write. Pausing
  // is never checked. Fail closed: no readable answer = no Resume.
  if (on) {
    let readiness;
    try {
      const [registry, cadence] = await Promise.all([
        readRepoJSON('yt-mcp/studio-channels.json'),
        readRepoJSON('yt-mcp/cadence.json'),
      ]);
      readiness = readinessFor({ registry, cadence, slug });
    } catch (e) {
      return Response.json({ error: `Couldn't check if this channel is ready to publish — try again (${String(e?.message || e).slice(0, 80)})` }, { status: 503 });
    }
    if (!readiness.ready) {
      return Response.json({
        error: `Not ready to publish (${readiness.done}/${readiness.total}). Missing: ${missingLabels(readiness).join(', ')}.`,
        missing: missingLabels(readiness),
        readiness,
      }, { status: 409 });
    }
  }

  // 1. registry flag (wizard channels; legacy 4 simply have no entry) —
  // setChannelAutopilot updates the DB and syncs the engine's discovery file
  let registryTouched = false;
  try {
    const reg = (await readRepoJSON('yt-mcp/studio-channels.json')) || { channels: [] };
    if ((reg.channels || []).some((c) => c.slug === slug)) {
      await setChannelAutopilot(slug, on);
      registryTouched = true;
    }
  } catch (e) {
    return Response.json({ error: `registry: ${e.message}` }, { status: 502 });
  }

  // 2. engine hard-stop in the channel state (merge with the live state file —
  // CI keeps real publishing data in there, never overwrite blind)
  try {
    const stPath = `yt-mcp/state/${slug}.json`;
    const st = (await readRepoJSON(stPath)) || {};
    if (on) delete st.pausedUntil;
    else st.pausedUntil = FAR;
    await writeRepoJSON(stPath, st, `flow: ${slug} ${on ? 'resumed' : 'paused'} (${actor})`);
  } catch (e) {
    return Response.json({ error: `state: ${e.message}` }, { status: 502 });
  }

  console.log(`[audit] ${actor} → autopilot ${on ? 'ON' : 'OFF'} for ${slug}${registryTouched ? '' : ' (legacy channel)'}`);
  await appendAudit(actor, on ? 'flow-resume' : 'flow-pause', slug);
  return Response.json({ ok: true, slug, on });
}
