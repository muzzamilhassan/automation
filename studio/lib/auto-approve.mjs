// Auto-approve a script the owner did not answer (docs/qa/facts-first-qa.md A1–A7,
// owner 2026-11-25: "the script wait just 2 hours … rather it auto approved").
// ONE pure answer, shared by the engine (scripts/auto-approve.mjs) and the panel.
// A script goes through only when every checked claim has a source; anything else
// waits for the owner. Per channel: kit.autoApproveHours (0 = always wait for me).

export const AUTO_APPROVE_DEFAULT_HOURS = 2;
export const AUTO_APPROVE_CHOICES = Object.freeze([0, 1, 2, 4, 8, 24]);
export const AUTO_APPROVE_BY = 'auto-approve';
const STALE_HOURS = 48; // an old script is never picked up out of the blue
const H = 3600_000;

/** kit → hours (0 = off). Anything unreadable → the default. */
export function autoApproveHours(kit) {
  const v = kit && typeof kit === 'object' ? kit.autoApproveHours : undefined;
  return AUTO_APPROVE_CHOICES.includes(v) ? v : AUTO_APPROVE_DEFAULT_HOURS;
}

/** Server validation → { ok, value } | { ok: false, error }. */
export function parseAutoApproveHours(v) {
  const n = Number(v);
  return AUTO_APPROVE_CHOICES.includes(n) ? { ok: true, value: n } : { ok: false, error: `autoApproveHours must be one of ${AUTO_APPROVE_CHOICES.join(', ')}` };
}

function inputOf(script) {
  let f = script?.full_render_input;
  if (typeof f === 'string') { try { f = JSON.parse(f); } catch { f = null; } }
  return f && typeof f === 'object' ? f : null;
}

/** The facts verdict the save recorded: 'passed' | 'failed' | 'none'. */
export function factsOf(script) {
  const fc = inputOf(script)?.factCheck;
  if (!fc || typeof fc !== 'object') return { verdict: 'none', sources: 0, verified: 0, problems: [] };
  return {
    verdict: fc.status === 'passed' ? 'passed' : 'failed',
    sources: Number(fc.sources) || 0,
    verified: Number(fc.verified) || 0,
    problems: Array.isArray(fc.problems) ? fc.problems : [],
  };
}

/**
 * @param {object} p
 * @param {object} p.script awaiting_review row with full_render_input
 * @param {object|null} p.channel registry entry ({ autopilot, active, kit })
 * @param {string|null} [p.pausedUntil] YYYY-MM-DD from the channel's state
 * @param {boolean} [p.alreadyApproved] the channel already has an approved script on its way
 * @returns {{ action: 'approve'|'wait'|'needs_you'|'skip', reason: string, at?: string }}
 */
export function decideAutoApprove({ script, channel, pausedUntil = null, alreadyApproved = false, now = new Date() }) {
  if (!script || script.status !== 'awaiting_review') return { action: 'skip', reason: 'not waiting for review' };
  if (script.kind !== 'doc') return { action: 'skip', reason: 'not a long video' };
  if (!channel || channel.autopilot === false || channel.active === false) return { action: 'skip', reason: 'the channel is off' };
  if (pausedUntil && String(pausedUntil) >= now.toISOString().slice(0, 10)) return { action: 'skip', reason: 'the channel is paused' };
  const hours = autoApproveHours(channel.kit);
  if (!hours) return { action: 'skip', reason: 'this channel always waits for you' };
  const created = new Date(script.created_at).getTime();
  if (!Number.isFinite(created)) return { action: 'skip', reason: 'no creation time' };
  const age = now.getTime() - created;
  if (age > STALE_HOURS * H) return { action: 'skip', reason: 'too old to approve on its own' };
  const f = factsOf(script);
  if (f.verdict === 'none') return { action: 'skip', reason: 'written before facts were checked' };
  if (f.verdict !== 'passed' || f.problems.length) return { action: 'needs_you', reason: f.problems[0] || 'facts could not be verified' };
  if (!f.sources) return { action: 'needs_you', reason: 'no sources were found for this topic' };
  const at = new Date(created + hours * H).toISOString();
  if (age < hours * H) return { action: 'wait', reason: `auto-approves at ${at}`, at };
  if (alreadyApproved) return { action: 'wait', reason: 'another approved video of this channel is still being made', at };
  return { action: 'approve', reason: `not answered for ${hours} hour${hours === 1 ? '' : 's'}; every number has a source`, at };
}

/** One plain line for the Review page, '' when there is nothing to say. */
export function autoApproveLine(script, kit, now = new Date(), clock = (iso) => iso) {
  if (script?.status !== 'awaiting_review' || script?.kind !== 'doc') return '';
  const f = factsOf(script);
  const hours = autoApproveHours(kit);
  if (f.verdict === 'none') return 'Facts were not checked (written before the check existed). It waits for you.';
  if (f.verdict !== 'passed' || f.problems.length) return `${f.problems.length || 'Some'} sentence${f.problems.length === 1 ? '' : 's'} could not be matched to a source. It waits for you.`;
  if (!f.sources) return 'No sources were found for this topic. It waits for you.';
  if (!hours) return `Facts checked against ${f.sources} source${f.sources === 1 ? '' : 's'}. This channel always waits for you.`;
  const at = new Date(new Date(script.created_at).getTime() + hours * H);
  if (Number.isNaN(at.getTime())) return '';
  return at <= now ? `Facts checked against ${f.sources} sources. Being approved now.` : `Facts checked against ${f.sources} source${f.sources === 1 ? '' : 's'}. If you don't answer, it is approved at ${clock(at.toISOString())}.`;
}
