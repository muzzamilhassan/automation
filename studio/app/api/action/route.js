// Studio buttons trigger REAL runs through GitHub Actions (workflow_dispatch).
// Works the same locally and on Vercel — nothing runs on the web server itself.
// The workflows are the same ones the daily crons use, so dedupe/state rules apply.
import { ENV } from '../../../lib/data.mjs';
import { registryChannels } from '../../../lib/channels-registry.js';
import { getUser } from '@/lib/route-auth';
import { slugsForUser } from '@/lib/access';
import { appendAudit } from '../../../lib/audit.js';

export const dynamic = 'force-dynamic';

const REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';

// action (+ optional slug) → workflow file + inputs. yt-daily/deepdive run the
// GENERIC autopilot for EVERY channel — the per-channel legacy workflows were
// deleted in a1ebac4 (#77), so dispatching them was a guaranteed GitHub 404.
const MAP = {
  'yt-daily': (slug) => ({ workflow: 'channel-autopilot.yml', inputs: { channel: slug }, channelRun: true }),
  'deepdive': (slug) => ({ workflow: 'channel-autopilot.yml', inputs: { channel: slug }, channelRun: true }), // episodes follow docDay inside the channel run; legacy uploader disabled 10-05
  'force-doc': (slug) => ({ workflow: 'channel-autopilot.yml', inputs: { channel: slug, force_doc: '1' }, channelRun: true }),
  'ig-crosspost': () => ({ workflow: 'ig-slot-poster.yml', inputs: {} }),
  'tiktok': () => ({ retired: true }), // the workflow was deleted; the button answers a clean 400 instead of a GitHub 404
  'fb-crosspost': () => ({ workflow: 'fb-now.yml', inputs: { job: 'reels' } }),
  'fb-images': () => ({ workflow: 'fb-now.yml', inputs: { job: 'posters' } }),
};

export async function POST(req) {
  // 10-08 RBAC: run buttons = owner + staff; the actor goes to the audit log.
  // 10-08 P2 CLIENT ROLE: clients may run ONLY their own channel's pipeline.
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch { }
  if (user.role === 'client') {
    if (!['yt-daily', 'deepdive'].includes(body.action || '')) {
      return Response.json({ error: 'your role does not allow this' }, { status: 403 });
    }
    const owned = await slugsForUser(user).catch(() => null);
    if (!owned || !owned.includes(body.slug || '')) {
      return Response.json({ error: 'not your channel' }, { status: 403 });
    }
  } else if (!['owner', 'staff'].includes(user.role)) {
    return Response.json({ error: 'not signed in' }, { status: 401 });
  }
  const actor = user.email;
  const fn = MAP[body.action];
  if (!fn) return Response.json({ error: 'unknown action' }, { status: 400 });
  const slug = body.slug || '';
  if (!TOKEN) return Response.json({ error: 'server has no GITHUB_TOKEN' }, { status: 500 });
  await appendAudit(actor, 'produce', `${body.action}${slug ? ' · ' + slug : ''}`);

  // 10-31 T1a (#106): ONE target for the run buttons — channel-autopilot.yml
  // for EVERY channel (legacy 4 + wizard alike). Registry membership stays as
  // the unknown-slug guard, now enforced for every channel; body.topup
  // (positive integer) heals N slots through the autopilot's topup input.
  const spec = fn(slug);
  if (spec.retired) return Response.json({ error: 'workflow retired' }, { status: 400 });
  if (spec.channelRun) {
    const inRegistry = await registryChannels()
      .then((l) => l.some((c) => c.slug === slug))
      .catch(() => false);
    if (!inRegistry) return Response.json({ error: 'unknown channel' }, { status: 400 });
    if (body.topup != null) {
      if (!Number.isInteger(body.topup) || body.topup < 1) {
        return Response.json({ error: 'topup must be a positive integer' }, { status: 400 });
      }
      spec.inputs.topup = String(body.topup);
    }
    if (['yt-daily', 'deepdive'].includes(body.action) && (body.forceDoc === true || body.forceDoc === '1' || body.force_doc === '1')) {
      spec.inputs.force_doc = '1';
    }
  }
  const { workflow, inputs } = spec;
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
