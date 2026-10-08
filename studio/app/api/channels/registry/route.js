// Channels connected through the Studio wizard (yt-mcp/studio-channels.json).
import { isAuthed, requireRole } from '@/lib/route-auth';
import { readRegistry, writeRepoJSON, REGISTRY_MODE, hasGithubToken, registryChannels, decryptJSON } from '@/lib/channels-registry';
import { ENV } from '@/lib/data.mjs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  // owner only — the registry contains encrypted channel tokens
  if (!(await requireRole(req, ['owner']))) return Response.json({ error: 'not signed in' }, { status: 401 });
  try {
    const reg = await readRegistry();
    return Response.json({ channels: reg.channels || [], mode: REGISTRY_MODE, canWriteSecrets: hasGithubToken() });
  } catch (e) {
    return Response.json({ error: e.message, channels: [] }, { status: 502 });
  }
}

// 10-08 DISCONNECT — removes a wizard channel from Studio completely:
// revokes the Google token (machine loses access immediately), deletes the
// GitHub secret, and removes the registry entry. Videos on the channel stay.
export async function DELETE(req) {
  const actor = await requireRole(req, ['owner']);
  if (!actor) return Response.json({ error: 'not signed in' }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug');
  if (!slug) return Response.json({ error: 'missing slug' }, { status: 400 });

  const reg = await readRegistry().catch(() => null);
  const entry = (reg?.channels || []).find((c) => c.slug === slug);
  if (!entry) return Response.json({ error: 'unknown slug' }, { status: 404 });

  // 1. revoke the refresh token at Google (best-effort) — the machine loses
  // access to the channel immediately
  let revoked = false;
  try {
    if (entry.tokenEnc) {
      const t = decryptJSON(entry.tokenEnc);
      if (t?.refresh_token) {
        const rr = await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: t.refresh_token }),
        });
        revoked = rr.ok;
      }
    }
  } catch { }

  // 2. delete the GitHub token secret (best-effort)
  let secretDeleted = false;
  const TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';
  const REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
  if (TOKEN && entry.tokenSecret) {
    try {
      const dr = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/${entry.tokenSecret}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'quarry-studio' },
      });
      secretDeleted = dr.ok || dr.status === 404;
    } catch { }
  }

  // 3. remove the registry entry
  const channels = (reg.channels || []).filter((c) => c.slug !== slug);
  await writeRepoJSON('yt-mcp/studio-channels.json', { channels }, `flow: disconnected ${slug} (${actor})`);

  console.log(`[audit] ${actor} → disconnected ${slug} (revoked: ${revoked}, secret deleted: ${secretDeleted})`);
  return Response.json({ ok: true, revoked, secretDeleted });
}
