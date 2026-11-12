// Per-channel clip queue inspection & manual clear for the Admin Panel.
// Reads/writes yt-mcp/state/<slug>.json via the dual-mode repo helper;
// owner + staff may clear queued clips (preserving doneRuns / lastRunId).
import fs from 'node:fs';
import path from 'node:path';
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug } from '@/lib/access';
import { readRepoJSON, writeRepoJSON } from '@/lib/channels-registry';
import { appendAudit } from '@/lib/audit';
import { MODE } from '@/lib/data.mjs';

export const dynamic = 'force-dynamic';

const ROOT = path.resolve(process.cwd(), '..');
const SLUG_RE = /^[a-z0-9-]+$/i;

function clipHasAsset(c) {
  if (!c) return false;
  if (c.url) return true;
  if (MODE === 'local' && c.file) {
    try {
      return fs.existsSync(path.resolve(ROOT, String(c.file)));
    } catch {
      return false;
    }
  }
  return false;
}

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (!(await canAccessChannelSlug(user, slug))) {
    return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  }
  if (!SLUG_RE.test(slug)) return Response.json({ error: 'invalid slug' }, { status: 400 });

  const st = await readRepoJSON(`yt-mcp/state/${slug}.json`).catch(() => null);
  const q = st && typeof st.clipQueue === 'object' ? st.clipQueue : null;
  if (!q) return Response.json({ ok: true, slug, clipQueue: null });

  const clips = Array.isArray(q.clips) ? q.clips : [];
  let remaining = 0;
  let broken = 0;
  for (const c of clips) {
    if (!c || c.postedAt) continue;
    if (clipHasAsset(c)) remaining += 1;
    else broken += 1;
  }

  return Response.json({
    ok: true,
    slug,
    clipQueue: {
      docTitle: q.docTitle || null,
      createdAt: q.createdAt || null,
      total: clips.length,
      remaining,
      broken,
      clips,
    },
  });
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  if (!['owner', 'staff'].includes(user.role)) {
    return Response.json({ error: 'only owner and staff can modify clip queue' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const { slug, action } = body || {};
  if (!(await canAccessChannelSlug(user, slug))) {
    return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  }
  if (!SLUG_RE.test(slug)) return Response.json({ error: 'invalid slug' }, { status: 400 });
  if (action !== 'clear') return Response.json({ error: 'unknown action' }, { status: 400 });

  const filePath = `yt-mcp/state/${slug}.json`;
  const st = await readRepoJSON(filePath);
  if (st && st.clipQueue) {
    st.clipQueue = { ...st.clipQueue, clips: [] };
    await writeRepoJSON(filePath, st, `clip-queue: cleared ${slug} clips`);
  }

  try { await appendAudit(user.email, 'clip-queue clear', slug); } catch { }
  return Response.json({ ok: true, slug });
}
