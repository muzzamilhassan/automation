// #106 Phase 4 T5 (S4) — review approval actions (spec D16/D18, AC-P4-21/22/23).
// Canonical Studio-side logic behind /api/review: the approve→dispatch
// contract (H6/D16), the OFFICIAL synthetic-media disclosure checklist
// (AC-P4-21), and the post-upload thumbnail-pick semantics (D18/M7).
//
// APPROVE → CI CONTRACT (D16, review finding 7): approval dispatches
// channel-autopilot.yml with channel=<slug>&resume=<job_id> via the SAME
// workflow-dispatch pattern as studio/app/api/action/route.js (same
// GITHUB_TOKEN/GITHUB_PAT env, owner-only, audited). A dispatch FAILURE
// writes an Action-required warning row — an approval can never silently
// become "approved but never rendered"; the approval row STANDS and the
// owner re-triggers from the warning (Redispatch on /review).
//
// DISCLOSURE (AC-P4-21): WHERE the script requires disclosure, approval is
// IMPOSSIBLE until every item of the four-category synthetic-media checklist
// is answered. The wording is the OFFICIAL text, quoted verbatim from
// support.google.com/youtube/answer/14328491 as captured in
// research/platform-topic-discovery-script-qa-2026-10-24.md §5.7 (fetched
// 2026-10-24) — never a paraphrase (developer-policy duty, §4.3).
//
// THUMBNAILS (D18 as amended, review finding 4): candidates cannot precede a
// blocked render, so the upload proceeds with candidate 1 set automatically
// and the owner picks ANY TIME BEFORE publishAt (the pick calls
// thumbnails.set again to replace it); after publishAt the pick is RECORDED
// for win-rate data but not retro-applied. UNPICKED = candidate 1 — an
// explicit default, not a gap (M7).
export const DISCLOSURE_CATEGORIES = {
  source: 'https://support.google.com/youtube/answer/14328491',
  citedFrom: 'research/platform-topic-discovery-script-qa-2026-10-24.md §5.7',
  items: [
    { id: 'real_person', text: 'Makes a real person appear to say or do something they didn\'t do' },
    { id: 'alters_footage', text: 'Alters footage of a real event or place' },
    { id: 'realistic_scene', text: 'Generates a realistic scene that didn\'t actually occur' },
    { id: 'music_focus', text: 'Creates music that\'s the main focus of the video' },
  ],
};

/** Parse the stored full_render_input jsonb (string or object) safely. */
export function parseRenderInput(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** D13 contract: the script's own disclosure flag decides whether the
 * checklist gates approval — nothing else. */
export function disclosureRequired(fullRenderInput) {
  return parseRenderInput(fullRenderInput)?.disclosure?.synthetic_media_required === true;
}

/** AC-P4-21: every one of the four official categories must be ANSWERED
 * (a boolean — yes or no both count; silence does not). */
export function disclosureAnswersComplete(answers) {
  if (!answers || typeof answers !== 'object') return false;
  return DISCLOSURE_CATEGORIES.items.every((i) => typeof answers[i.text] === 'boolean');
}

/**
 * Dispatch channel-autopilot.yml (channel + resume=job_id) — the /api/action
 * route's exact request shape. 204 = accepted. Never throws.
 * @returns {Promise<{ok: boolean, status?: number, error?: string}>}
 */
export async function dispatchResumeRun({ slug, jobId, token, repo, fetchImpl = fetch } = {}) {
  if (!token) return { ok: false, status: 0, error: 'server has no GITHUB_TOKEN' };
  const inputs = { channel: slug };
  if (jobId) inputs.resume = jobId;
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}/actions/workflows/channel-autopilot.yml/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'quarry-studio',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
    });
    if (res.status === 204) return { ok: true };
    return { ok: false, status: res.status, error: `github ${res.status}: ${String(await res.text()).slice(0, 140)}` };
  } catch (e) {
    return { ok: false, status: 0, error: String((e && e.message) || e).slice(0, 140) };
  }
}

/**
 * THE approve action (D16/AC-P4-22): disclosure gate (AC-P4-21) → approve →
 * dispatch → warn on dispatch failure. On a dispatch failure the approval
 * row STANDS (the owner re-triggers from the warning — an approval may be
 * late-rendered, never silently dropped).
 * @returns {{ok, approved, dispatched, error?}}
 */
export async function approveScriptAndDispatch({
  scriptStore,
  warningsStore = null,
  emit = null,
  scriptId,
  by,
  note = null,
  disclosure = null,
  token,
  repo,
  fetchImpl = fetch,
  log = () => {},
} = {}) {
  const g = await scriptStore.getScript(scriptId);
  if (!g?.ok || !g.script) return { ok: false, approved: false, dispatched: false, error: 'script_not_found' };
  const script = g.script;

  if (disclosureRequired(script.full_render_input) && !disclosureAnswersComplete(disclosure)) {
    return {
      ok: false,
      approved: false,
      dispatched: false,
      error: 'disclosure checklist incomplete — all four official synthetic-media categories must be answered before approval (AC-P4-21)',
    };
  }

  const ap = await scriptStore.approve(scriptId, { by, note });
  if (!ap.ok) {
    return { ok: false, approved: false, dispatched: false, error: ap.error || ap.reason || 'approve_failed' };
  }

  const dispatch = await dispatchResumeRun({ slug: script.channel_id, jobId: script.job_id, token, repo, fetchImpl });
  if (!dispatch.ok) {
    // H6: the durable record behind a failed dispatch — never silent.
    if (emit && warningsStore) {
      try {
        await emit(warningsStore, {
          channel_id: script.channel_id,
          severity: 'action_required',
          code: 'approval_dispatch_failed',
          title: 'approval recorded but the resume dispatch FAILED — the video will not render until re-triggered',
          explanation: 'The owner approved the script and Studio tried to dispatch channel-autopilot.yml with resume=<job_id>, but GitHub rejected the dispatch. The approval row stands; nothing renders until the dispatch is re-triggered from /review.',
          evidence: `script ${scriptId}, job ${script.job_id ?? 'none'} — ${dispatch.error}`,
          recommended_action: 'Re-trigger the dispatch from Studio > Review (Redispatch). If it keeps failing, check the GITHUB_TOKEN server secret.',
          auto_verifiable: false,
          job_id: script.job_id ?? null,
          dedupe_key: `${script.channel_id}:approval_dispatch_failed`,
        }, { sendAlert: async () => ({ channel: 'none', ok: true }) });
      } catch (e) {
        log(`[review] WARN dispatch-failure row degraded (non-fatal): ${String((e && e.message) || e).slice(0, 100)}`);
      }
    }
    return { ok: false, approved: true, dispatched: false, error: dispatch.error };
  }
  return { ok: true, approved: true, dispatched: true, scriptId };
}

// ---------------------------------------------------------------------------
// Thumbnails (D18 as amended / M7)
// ---------------------------------------------------------------------------

/** M7: unpicked = candidate 1 — an explicit default, not a gap. */
export function defaultCandidateIndex() {
  return 1;
}

/**
 * A pick request resolves to apply-or-record-only:
 *   BEFORE publishAt -> apply (the thumbnails.set swap, ~50 units per swap);
 *   AFTER publishAt  -> recorded for win-rate data, NOT applied (D18);
 *   an out-of-range candidate -> rejected.
 * publishedAt null (not yet scheduled/uploaded) = still before publish —
 * applies (candidate 1 is auto-set at upload; an earlier pick just preempts).
 */
export function resolvePickRequest({ candidate, candidatesCount, publishedAt = null, now = () => new Date() } = {}) {
  if (!Number.isInteger(candidate) || candidate < 1 || !Number.isInteger(candidatesCount) || candidatesCount < 1 || candidate > candidatesCount) {
    return { ok: false, error: 'invalid_candidate' };
  }
  if (publishedAt) {
    const p = new Date(publishedAt);
    if (!Number.isNaN(p.getTime()) && p.getTime() < new Date(now()).getTime()) {
      return { ok: true, apply: false, reason: 'after_publish_recorded_only' };
    }
  }
  return { ok: true, apply: true, reason: 'swap_before_publish' };
}
