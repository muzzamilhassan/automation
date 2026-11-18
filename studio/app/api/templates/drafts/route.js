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
  if (!templateId || !['approve', 'reject', 'toggle_chapters'].includes(action)) {
    return Response.json({ error: 'need templateId + action(approve|reject|toggle_chapters)' }, { status: 400 });
  }
  if (!/^[\w-]+$/.test(String(templateId))) {
    return Response.json({ error: 'bad templateId' }, { status: 400 });
  }
  const file = `${templateId}.json`;
  const directPath = path.join(process.cwd(), 'lib', 'template-bot-drafts', file);
  const studioPath = path.join(process.cwd(), 'studio', 'lib', 'template-bot-drafts', file);
  const draftPath = fs.existsSync(directPath) ? directPath : (fs.existsSync(studioPath) ? studioPath : directPath);
  let draft = null;
  try {
    draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
  } catch {
    return Response.json({ error: `draft not found on this deploy: ${file}` }, { status: 404 });
  }

  // Dynamic has_chapters toggle: switch between Chapters (true) and Full Story (false)
  if (action === 'toggle_chapters') {
    const isChapters = Boolean(body.hasChapters);
    if (!draft.story_structure) draft.story_structure = {};
    draft.story_structure.has_chapters = isChapters;
    draft.story_structure.narrative_format = isChapters ? 'chapters' : 'full_story';
    draft.story_structure.format_label = isChapters ? 'Chapter Breakdown (Numbered Parts)' : 'Full Story (Continuous Narrative)';
    draft.story_structure.sections = isChapters
      ? ['cold_open', 'chapters:10', 'exhibits', 'outro']
      : ['cold_open', 'hook_escalation', 'deep_investigation', 'verdict_payoff', 'outro'];
    draft.story_structure.format_description = isChapters
      ? 'Structured 10-part chapter breakdown with numbered milestone cards and explicit section divides.'
      : 'Full continuous narrative documentary arc — seamless story progression with zero chapter dividers.';
    try {
      fs.writeFileSync(draftPath, JSON.stringify(draft, null, 2), 'utf8');
      if (fs.existsSync(studioPath) && studioPath !== draftPath) {
        fs.writeFileSync(studioPath, JSON.stringify(draft, null, 2), 'utf8');
      }
    } catch (e) {
      return Response.json({ error: `failed to save draft toggle: ${e.message}` }, { status: 500 });
    }
    return Response.json({
      ok: true,
      templateId,
      hasChapters: isChapters,
      narrativeFormat: draft.story_structure.narrative_format,
      formatLabel: draft.story_structure.format_label,
      sections: draft.story_structure.sections,
    });
  }

  const { default: postgres } = await import('postgres');
  const url = process.env.DATABASE_URL;
  if (!url) return Response.json({ error: 'db unavailable' }, { status: 503 });
  const sql = postgres(url, { max: 1, idle_timeout: 5 });
  try {
    if (action === 'approve') {
      if (body.hasChapters !== undefined) {
        const isChapters = Boolean(body.hasChapters);
        if (!draft.story_structure) draft.story_structure = {};
        draft.story_structure.has_chapters = isChapters;
        draft.story_structure.narrative_format = isChapters ? 'chapters' : 'full_story';
        draft.story_structure.format_label = isChapters ? 'Chapter Breakdown (Numbered Parts)' : 'Full Story (Continuous Narrative)';
        draft.story_structure.sections = isChapters
          ? ['cold_open', 'chapters:10', 'exhibits', 'outro']
          : ['cold_open', 'hook_escalation', 'deep_investigation', 'verdict_payoff', 'outro'];
        draft.story_structure.format_description = isChapters
          ? 'Structured 10-part chapter breakdown with numbered milestone cards and explicit section divides.'
          : 'Full continuous narrative documentary arc — seamless story progression with zero chapter dividers.';
        try { fs.writeFileSync(draftPath, JSON.stringify(draft, null, 2), 'utf8'); } catch {}
      }
      const res = await commitDraftApproval(draft);
      const id = await enqueueApproval(sql, {
        templateId, action, status: res.ok ? 'applied' : 'failed',
        detail: res.ok ? (res.already ? 'already in registry' : (res.sha || 'committed')) : res.error,
      });
      if (res.ok && id) await markApplied(sql, id, res.sha);
      if (!res.ok) return Response.json({ error: res.error, queued: id }, { status: 502 });
      // #124 R1: an approved template's job is done — its content lives in the
      // registry now. Remove the draft file the same way reject does
      // (best-effort; the applied-approve filter in listDrafts keeps the inbox
      // honest even if this cleanup fails until the next deploy).
      let fileCleanup = 'absent';
      try {
        const del = await commitDraftDeletion(file);
        fileCleanup = del.ok ? (del.already ? 'absent' : 'deleted') : `failed: ${String(del.error).slice(0, 80)}`;
      } catch (e) {
        fileCleanup = `failed: ${String(e.message || e).slice(0, 80)}`;
      }
      try { await deletePreviewRow(sql, templateId); } catch { /* previews optional */ }
      return Response.json({ ok: true, already: Boolean(res.already), sha: res.sha || null, fileCleanup });
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
