// "100% ready before anything publishes" (owner, 2026-11-21) — the panel's
// read of the 7-item checklist. It reads the SAME two files the autopilot
// reads after checkout (yt-mcp/studio-channels.json + yt-mcp/cadence.json)
// and answers with the shared module, so the chip, the checklist, the Resume
// lock and the engine can never disagree.
//   GET ?slug=<slug> → { slug, readiness }
//   GET              → { channels: { [slug]: readiness } } (a client: own channels only)
// A failed read is a 502 — the panel then shows "unknown", never a guess.
// Spec + QA: docs/qa/channel-readiness-qa.md.
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug, slugsForUser } from '@/lib/access';
import { readRepoJSON } from '@/lib/channels-registry';
import { readinessFor } from '@/lib/channel-readiness.mjs';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (slug && !(await canAccessChannelSlug(user, slug))) {
    return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  }

  let registry;
  let cadence;
  try {
    [registry, cadence] = await Promise.all([
      readRepoJSON('yt-mcp/studio-channels.json'),
      readRepoJSON('yt-mcp/cadence.json'),
    ]);
  } catch (e) {
    return Response.json({ error: `couldn't read the channel setup right now (${String(e?.message || e).slice(0, 80)})` }, { status: 502 });
  }

  if (slug) return Response.json({ slug, readiness: readinessFor({ registry, cadence, slug }) });

  const all = (Array.isArray(registry?.channels) ? registry.channels : []).map((c) => c?.slug).filter((s) => typeof s === 'string' && s);
  const allowed = await slugsForUser(user).catch(() => []); // null = owner/staff (everything)
  const slugs = allowed === null ? all : all.filter((s) => (allowed || []).includes(s));
  const channels = Object.fromEntries(slugs.map((s) => [s, readinessFor({ registry, cadence, slug: s })]));
  return Response.json({ channels });
}
