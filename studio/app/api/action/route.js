import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

const ROOT = path.resolve(process.cwd(), '..'); // scripts live in the repo root (studio/..)
const ACTIONS = {
  'yt-daily': { script: 'yt-daily.mjs', needsSlug: true },
  'deepdive': { script: 'yt-deepdive.mjs', needsSlug: true },
  'fb-crosspost': { script: 'fb-crosspost.mjs', needsSlug: false },
  'ig-crosspost': { script: 'ig-crosspost.mjs', needsSlug: false },
  'fb-images': { script: 'fb-images.mjs', needsSlug: false }
};

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { }
  const conf = ACTIONS[body.action];
  if (!conf) return Response.json({ error: 'unknown action' }, { status: 400 });
  const slug = body.slug || '';
  if (conf.needsSlug && !slug) return Response.json({ error: 'slug required' }, { status: 400 });

  const logDir = path.resolve(ROOT, 'studio-logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `${body.action}-${slug || 'all'}-${Date.now()}.log`);
  const out = fs.openSync(logFile, 'a');
  const child = spawn('node', [conf.script, ...(conf.needsSlug ? [slug] : []), ...(body.action === 'yt-daily' ? ['--force'] : [])], {
    cwd: ROOT, detached: true, stdio: ['ignore', out, out]
  });
  child.unref();
  fs.closeSync(out);
  return Response.json({ started: true, pid: child.pid, logFile });
}
