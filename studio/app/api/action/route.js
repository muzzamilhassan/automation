// Studio buttons trigger REAL runs through GitHub Actions (workflow_dispatch).
// Works the same locally and on Vercel — nothing runs on the web server itself.
// The workflows are the same ones the daily crons use, so dedupe/state rules apply.
import { ENV } from '../../../lib/data.mjs';
import { requireRole } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

const REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';

const SLUGS = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'];

// action (+ optional slug) → workflow file + inputs
const MAP = {
  'yt-daily': (slug) => ({ workflow: `channel-${slug}.yml`, inputs: {} }),
  'deepdive': (slug) => ({ workflow: 'longform-upload.yml', inputs: { channel: slug } }),
  'ig-crosspost': () => ({ workflow: 'ig-slot-poster.yml', inputs: {} }),
  'tiktok': () => ({ workflow: 'tiktok-post.yml', inputs: {} }),
  'fb-crosspost': () => ({ workflow: 'fb-now.yml', inputs: { job: 'reels' } }),
  'fb-images': () => ({ workflow: 'fb-now.yml', inputs: { job: 'posters' } }),
};

export async function POST(req) {
  // 10-08 RBAC: run buttons = owner + staff; the actor goes to the audit log
  const actor = await requireRole(req, ['owner', 'staff']);
  if (!actor) return Response.json({ error: 'not signed in' }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch { }
  const fn = MAP[body.action];
  if (!fn) return Response.json({ error: 'unknown action' }, { status: 400 });
  const slug = body.slug || '';
  if (['yt-daily', 'deepdive'].includes(body.action) && !SLUGS.includes(slug)) {
    return Response.json({ error: 'unknown channel' }, { status: 400 });
  }
  if (!TOKEN) return Response.json({ error: 'server has no GITHUB_TOKEN' }, { status: 500 });
  console.log(`[audit] ${actor} → dispatch ${body.action}${slug ? ' ' + slug : ''}`);

  const { workflow, inputs } = fn(slug);
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'quarry-studio',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main', inputs }),
  });

  if (res.status === 204) {
    return Response.json({ started: true, via: 'github-actions', workflow });
  }
  const text = await res.text();
  return Response.json({ error: `github ${res.status}: ${text.slice(0, 140)}` }, { status: 502 });
}
