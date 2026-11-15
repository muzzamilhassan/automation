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
import { summarizeClips, withoutBrokenClips } from '@/lib/clip-queue.mjs';

export const dynamic = 'force-dynamic';

const ROOT = path.resolve(process.cwd(), '..');
const SLUG_RE = /^[a-z0-9-]+$/i;

// Local mode can also use a clip's local file; cloud mode never sees runner files.
const qcOpts = {
  fileExists: (f) => {
    if (MODE !== 'local') return false;
    try { return fs.existsSync(path.resolve(ROOT, String(f))); } catch { return false; }
  },
};

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
  // admin-panel review #4: the same rule post-next uses (Release-archived
  // clips with asset + lastRunId are ready, not broken)
  const { remaining, broken } = summarizeClips(q, qcOpts);

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

  // admin-panel review #4: remove ONLY broken clips (was clips: [] — every
  // clip, posted and ready ones included). doneRuns / lastRunId untouched.
  const filePath = `yt-mcp/state/${slug}.json`;
  const st = await readRepoJSON(filePath);
  let removed = 0;
  if (st && st.clipQueue) {
    const before = Array.isArray(st.clipQueue.clips) ? st.clipQueue.clips.length : 0;
    const kept = withoutBrokenClips(st.clipQueue, qcOpts);
    removed = before - kept.length;
    if (removed > 0) {
      st.clipQueue = { ...st.clipQueue, clips: kept };
      await writeRepoJSON(filePath, st, `clip-queue: removed ${removed} broken clip(s) for ${slug}`);
    }
  }

  try { await appendAudit(user.email, 'clip-queue clear broken', `${slug}: removed ${removed}`); } catch { }
  return Response.json({ ok: true, slug, removed });
}
