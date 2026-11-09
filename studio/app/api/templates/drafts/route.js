// The drafts inbox API — the panel surface for the staged bot templates
// (studio/lib/template-bot-drafts/). GET lists them with previews + approval
// state; POST commits the owner's decision to GitHub (approve = registry
// append, reject = draft deletion) and audits each action in the Neon
// template_approvals queue. Owner-only: this is the R4 registry front door,
// previously CLI-only (--approve).
import fs from 'node:fs';
import path from 'node:path';
import { getUser } from '@/lib/route-auth';
import {
  listDrafts, commitDraftApproval, commitDraftDeletion,
  enqueueApproval, markApplied, deletePreviewRow,
} from '@/lib/template-approvals';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req);
  if (!user || !['owner', 'staff'].includes(user.role)) return Response.json({ error: 'not signed in' }, { status: 401 });
  const { default: postgres } = await import('postgres');
  const url = process.env.DATABASE_URL;
  if (!url) return Response.json({ error: 'db unavailable' }, { status: 503 });
  const sql = postgres(url, { max: 1, idle_timeout: 5 });
  try {
    const drafts = await listDrafts(sql);
    return Response.json({ drafts });
  } catch (e) {
    return Response.json({ error: String(e.message || e).slice(0, 140) }, { status: 500 });
  } finally {
    await sql.end();
  }
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user || user.role !== 'owner') return Response.json({ error: 'owner only' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { templateId, action } = body;
  if (!templateId || !['approve', 'reject'].includes(action)) {
    return Response.json({ error: 'need templateId + action(approve|reject)' }, { status: 400 });
  }
  if (!/^[\w-]+$/.test(String(templateId))) {
    return Response.json({ error: 'bad templateId' }, { status: 400 });
  }
  const file = `${templateId}.json`;
  const draftPath = path.join(process.cwd(), 'lib', 'template-bot-drafts', file);
  let draft = null;
  try {
    draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
  } catch {
    return Response.json({ error: `draft not found on this deploy: ${file}` }, { status: 404 });
  }

  const { default: postgres } = await import('postgres');
  const url = process.env.DATABASE_URL;
  if (!url) return Response.json({ error: 'db unavailable' }, { status: 503 });
  const sql = postgres(url, { max: 1, idle_timeout: 5 });
  try {
    if (action === 'approve') {
      const res = await commitDraftApproval(draft);
      const id = await enqueueApproval(sql, {
        templateId, action, status: res.ok ? 'applied' : 'failed',
        detail: res.ok ? (res.already ? 'already in registry' : (res.sha || 'committed')) : res.error,
      });
      if (res.ok && id) await markApplied(sql, id, res.sha);
      if (!res.ok) return Response.json({ error: res.error, queued: id }, { status: 502 });
      try { await deletePreviewRow(sql, templateId); } catch { /* previews optional */ }
      return Response.json({ ok: true, already: Boolean(res.already), sha: res.sha || null });
    }
    // reject: the draft file leaves the repo + its preview row drops
    const res = await commitDraftDeletion(file);
    const id = await enqueueApproval(sql, {
      templateId, action, status: res.ok ? 'applied' : 'failed',
      detail: res.ok ? (res.already ? 'file already absent' : 'deleted from repo') : res.error,
    });
    if (res.ok) { try { await deletePreviewRow(sql, templateId); } catch { /* previews optional */ } }
    if (!res.ok) return Response.json({ error: res.error, queued: id }, { status: 502 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e.message || e).slice(0, 140) }, { status: 500 });
  } finally {
    await sql.end();
  }
}
