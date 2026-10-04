// Channels connected through the Studio wizard (yt-mcp/studio-channels.json).
import { isAuthed } from '@/lib/route-auth';
import { readRegistry, REGISTRY_MODE, hasGithubToken } from '@/lib/channels-registry';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!(await isAuthed(req))) return Response.json({ error: 'not signed in' }, { status: 401 });
  try {
    const reg = await readRegistry();
    return Response.json({ channels: reg.channels || [], mode: REGISTRY_MODE, canWriteSecrets: hasGithubToken() });
  } catch (e) {
    return Response.json({ error: e.message, channels: [] }, { status: 502 });
  }
}
