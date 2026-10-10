// F5 — A/B swap-testing. Start an experiment: commit 2-3 variant JPGs to
// thumbnails/tests/ + experiment state to yt-mcp/thumb-tests.json, attach
// variant A immediately. The hourly thumb-ab.yml workflow swaps when due.
import { getUser } from '@/lib/route-auth';
import { appendAudit } from '@/lib/audit';
import { readRepoJSON, writeRepoJSON } from '@/lib/channels-registry';
import { attachThumb } from '@/lib/yt-attach';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STATE = 'yt-mcp/thumb-tests.json';
const DIR = 'thumbnails/tests';

// Commit a binary file to the repo via the Contents API (base64).
async function putRepoFile(path, buffer, message) {
  const { ENV } = await import('@/lib/data.mjs');
  const token = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'quarry-studio' };
  const repo = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
  const body = { message, content: buffer.toString('base64'), branch: 'main' };
  const cur = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=main`, { headers });
  if (cur.ok) body.sha = (await cur.json()).sha;
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`commit ${path} failed: HTTP ${r.status}`);
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user || !['owner', 'staff'].includes(user.role)) return Response.json({ error: 'not allowed' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const { slug, videoId, title = '', intervalHours = 48, variants = [] } = body || {};
    if (!slug || !videoId) return Response.json({ error: 'slug and videoId required' }, { status: 400 });
    if (!Array.isArray(variants) || variants.length < 2 || variants.length > 3) {
      return Response.json({ error: 'need 2-3 variant dataURLs' }, { status: 400 });
    }
    const interval = [1, 6, 12, 24, 48, 72].includes(Number(intervalHours)) ? Number(intervalHours) : 48;
    const bufs = variants.map((d) => {
      if (!/^data:image\/jpeg;base64,/.test(d)) throw new Error('variants must be JPEG dataURLs');
      const b = Buffer.from(d.split(',')[1], 'base64');
      if (b.length > 2 * 1024 * 1024) throw new Error('variant exceeds 2MB');
      return b;
    });

    const letters = ['a', 'b', 'c'];
    for (let i = 0; i < bufs.length; i++) {
      await putRepoFile(`${DIR}/${videoId}-${letters[i]}.jpg`, bufs[i], `thumb-test: ${videoId} variant ${letters[i]}`);
    }
    const state = (await readRepoJSON(STATE)) || {};
    const now = new Date().toISOString();
    state[videoId] = {
      slug, title: String(title).slice(0, 120),
      variants: bufs.map((_, i) => `${DIR}/${videoId}-${letters[i]}.jpg`),
      intervalHours: interval,
      started: now, current: 0, ended: null,
      periods: [{ variant: 0, from: now }],
    };
    await writeRepoJSON(STATE, state, `thumb-test: ${videoId} started (${bufs.length} variants, ${interval}h)`);
    await attachThumb(slug, videoId, bufs[0]);
    try { await appendAudit(user.email, 'thumbnail A/B started', `${slug} · ${videoId} · ${bufs.length} variants · ${interval}h`); } catch { }
    return Response.json({ ok: true, videoId, variants: bufs.length, intervalHours: interval });
  } catch (e) {
    return Response.json({ error: e.message?.slice(0, 140) || 'start failed' }, { status: 500 });
  }
}
