// Template DRAFT approvals — the panel-side control surface for the staged
// bot templates (studio/lib/template-bot-drafts/, R3-isolated). The studio
// runs serverless (Vercel): it CANNOT write repo files directly, but it CAN
// commit through the GitHub contents API — the same owner-token pattern as
// channels-registry writeRepoJSON and review-actions dispatchResumeRun.
//
//   approve → append the draft entry to studio/lib/template-registry.data.js
//             via a GitHub commit (the R4 front door, formerly CLI --approve)
//   reject  → delete the draft file via a GitHub commit + drop its preview row
//   every action lands a row in the Neon template_approvals queue (audit +
//   idempotency + status), so the panel always shows what happened.
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.env.GITHUB_REPO || 'muzzamilhassan/automation';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '';
const resolveDraftsDir = () => {
  const direct = path.join(process.cwd(), 'lib', 'template-bot-drafts');
  return fs.existsSync(direct) ? direct : path.join(process.cwd(), 'studio', 'lib', 'template-bot-drafts');
};
const REG_PATH = 'studio/lib/template-registry.data.js';
// the SAME anchor the CLI --approve uses (scripts/template-bot.mjs) — entries
// are inserted just above this marker line, so both paths interleave safely.
const MARKER = "  // ---- REMOVED 2026-11-04 (owner-approved catalog cleanup): 'quote-cards-premium'";

const ghHeaders = () => ({
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'quarry-studio',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
});

export function hasGithubToken() {
  return Boolean(TOKEN);
}

export async function ensureApprovalsTable(sql) {
  await sql`CREATE TABLE IF NOT EXISTS template_approvals (
    id serial PRIMARY KEY,
    template_id text NOT NULL,
    action text NOT NULL,           -- 'approve' | 'reject'
    status text NOT NULL DEFAULT 'pending',  -- pending | applied | failed
    detail text,
    created_at timestamptz DEFAULT now(),
    applied_at timestamptz
  )`;
}

/** The staged drafts on THIS deploy (they ship in the bundle), joined with
 * their Neon preview renders + the latest approval action per id. */
export async function listDrafts(sql) {
  let rows = [];
  const draftsDir = resolveDraftsDir();
  try {
    rows = fs.readdirSync(draftsDir).filter((f) => f.endsWith('.json'));
  } catch {
    rows = [];
  }
  let samples = {};
  let actions = {};
  try {
    const pv = await sql`SELECT template_id, mp4_url, poster_url, rendered_at FROM template_previews WHERE template_id LIKE 'draft-%'`;
    for (const r of pv) {
      const enc = encodeURIComponent(r.template_id);
      samples[r.template_id] = {
        mp4: r.mp4_url ? `/api/template-previews/media?id=${enc}&kind=mp4` : null,
        poster: r.poster_url ? `/api/template-previews/media?id=${enc}&kind=poster` : null,
        renderedAt: r.rendered_at,
      };
    }
  } catch { /* db unavailable — drafts still list, previews just absent */ }
  try {
    const ap = await sql`SELECT DISTINCT ON (template_id) template_id, action, status, created_at
      FROM template_approvals ORDER BY template_id, created_at DESC`;
    for (const r of ap) actions[r.template_id] = { action: r.action, status: r.status, at: r.created_at };
  } catch { /* table not created yet — first visit */ }
  const drafts = [];
  for (const f of rows) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(draftsDir, f), 'utf8'));
      const pres = d.doc_presentation || {};
      const act = actions[d.template_id];
      if (act && act.action === 'reject') continue; // rejected drafts leave the inbox
      drafts.push({
        templateId: d.template_id,
        file: f,
        niches: d.niches || [],
        theme: pres.theme || null,
        style: pres.style || null,
        voice: pres.voice || null,
        musicMood: pres.music_mood || null,
        brand: pres.brand || null,
        badge: pres.badge || null,
        eyebrow: pres.eyebrow || null,
        titles: d.story_structure?.title_patterns || [],
        disclaimer: d.safety?.disclaimers?.[0] || null,
        preview: samples[`draft-${d.template_id}`] || null,
        approval: act || null,
      });
    } catch { /* a malformed file never breaks the inbox */ }
  }
  return drafts;
}

/** The R4 front door, from the panel: append the draft entry to the registry
 * data via a GitHub commit. Idempotent — an id already in the registry is a
 * no-op success. @returns {Promise<{ok, already?: boolean, sha?: string, error?: string}>} */
export async function commitDraftApproval(draft) {
  if (!TOKEN) return { ok: false, error: 'server has no GITHUB_TOKEN/GITHUB_PAT' };
  try {
    const cur = await fetch(`https://api.github.com/repos/${REPO}/contents/${REG_PATH}?ref=main`, { headers: ghHeaders() });
    if (!cur.ok) return { ok: false, error: `registry read failed: ${cur.status}` };
    const j = await cur.json();
    const reg = Buffer.from(j.content, 'base64').toString('utf8');
    if (reg.includes(`'${draft.template_id}':`)) return { ok: true, already: true, sha: j.sha };
    if (!reg.includes(MARKER)) return { ok: false, error: 'registry marker missing — the data file drifted from the script anchor' };
    const entrySource = '  ' + JSON.stringify(draft, null, 2).replace(/\n/g, '\n  ') + ',';
    const next = reg.replace(MARKER, entrySource + '\n\n' + MARKER);
    const put = await fetch(`https://api.github.com/repos/${REPO}/contents/${REG_PATH}`, {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify({
        message: `registry: approve template ${draft.template_id} (studio drafts inbox)\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`,
        content: Buffer.from(next, 'utf8').toString('base64'),
        sha: j.sha,
        branch: 'main',
      }),
    });
    if (!put.ok) return { ok: false, error: `registry commit failed: ${put.status} ${String(await put.text()).slice(0, 120)}` };
    const pj = await put.json();
    return { ok: true, sha: pj.commit?.sha };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 140) };
  }
}

/** Reject = the draft file leaves the repo (GitHub commit) so nothing lingers
 * locally or remotely. @returns {Promise<{ok, already?: boolean, error?: string}>} */
export async function commitDraftDeletion(file) {
  if (!TOKEN) return { ok: false, error: 'server has no GITHUB_TOKEN/GITHUB_PAT' };
  try {
    const repoPath = `studio/lib/template-bot-drafts/${file}`;
    const cur = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}?ref=main`, { headers: ghHeaders() });
    if (cur.status === 404) return { ok: true, already: true }; // already gone (a local cleanup beat us to it)
    if (!cur.ok) return { ok: false, error: `draft read failed: ${cur.status}` };
    const j = await cur.json();
    const del = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}`, {
      method: 'DELETE',
      headers: ghHeaders(),
      body: JSON.stringify({
        message: `registry: reject draft ${file} (studio drafts inbox)\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`,
        sha: j.sha,
        branch: 'main',
      }),
    });
    if (!del.ok) return { ok: false, error: `draft delete failed: ${del.status} ${String(await del.text()).slice(0, 120)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 140) };
  }
}

/** The audit/idempotency queue. status: applied | pending | failed. */
export async function enqueueApproval(sql, { templateId, action, status, detail }) {
  await ensureApprovalsTable(sql);
  const rows = await sql`INSERT INTO template_approvals (template_id, action, status, detail)
    VALUES (${templateId}, ${action}, ${status}, ${detail || null}) RETURNING id`;
  return rows[0]?.id;
}

export async function markApplied(sql, id, sha) {
  await sql`UPDATE template_approvals SET status = 'applied', applied_at = now(), detail = ${sha || null} WHERE id = ${id}`;
}

export async function deletePreviewRow(sql, templateId) {
  await sql`DELETE FROM template_previews WHERE template_id = ${`draft-${templateId}`}`;
}
