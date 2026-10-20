// #100 — per-channel production scheduling (cadence): docDays, shortDays,
// shortsSource. Stored in yt-mcp/cadence.json via the repo — the engine merges
// this overlay LAST in lib/brand-resolve.mjs, so Studio edits reach the daily
// runs without touching kit code. Writes: owner + staff only (this controls
// production); clients read their own channel. Quota projection blocks saves
// that would stack a day past the shared 10k-unit pool (#99 constants).
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug } from '@/lib/access';
import { readRepoJSON, writeRepoJSON } from '@/lib/channels-registry';
import { appendAudit } from '@/lib/audit';
import { validateSchedule, projection } from '@/lib/schedule-projection';

export const dynamic = 'force-dynamic';

const FILE = 'yt-mcp/cadence.json';

const loadFile = async () => (await readRepoJSON(FILE)) || {};

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  const e = (await loadFile())[slug] || {};
  const { docDays = [], shortDays = [], shortsSource = 'generated' } = e;
  return Response.json({ slug, schedule: { docDays, shortDays, shortsSource }, projection: projection({ docDays, shortDays }) });
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  // scheduling controls production — owner + staff only (clients: read-only)
  if (!['owner', 'staff'].includes(user.role)) {
    return Response.json({ error: 'only owner and staff can change scheduling' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const { slug, ...schedule } = body || {};
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });

  const v = validateSchedule(schedule);
  if (!v.ok) return Response.json({ error: v.errors.join('; ') }, { status: 400 });
  const proj = projection(v.clean);
  if (proj.blocked) {
    return Response.json({
      error: `blocked: the busiest day would use ${proj.worstDayUnits} of the shared ${10000 - 100} unit daily pool (${proj.worstDayUploads} uploads) — spread the days or lower the cadence`,
      projection: proj,
    }, { status: 400 });
  }

  const file = await loadFile();
  file[slug] = {
    ...(file[slug] || {}),
    ...v.clean,
    updated: new Date().toISOString(),
    updatedBy: user.email,
  };
  await writeRepoJSON(FILE, file, `schedule: ${slug} cadence updated (#100)`);
  try { await appendAudit(user.email, 'channel schedule set', slug); } catch { }
  return Response.json({ ok: true, slug, schedule: v.clean, projection: proj, warnings: v.warnings });
}
