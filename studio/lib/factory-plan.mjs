// "Ask the factory" (research/creator-city-agent-factory-2026-11-23.md §5
// item 9 + owner decision d, 2026-11-23). The owner types ONE sentence
// ("Make a Money Rulebook video about credit-card float"); the panel shows a
// PLAN first and nothing happens until the owner presses Start.
//
// The AI (Groq, free) only turns the sentence into three fields —
// { channel, lane, topic } — and this module decides everything else:
//   - the reply must match a strict schema (no extra keys, right types);
//   - the channel must be a slug from the REAL channel list passed in (the
//     model is never trusted with a slug it invented);
//   - the steps are the FIXED 7 stations (lib/stations.mjs), built here —
//     the model never writes steps;
//   - the topic is sanitised (control chars, quotes, newlines stripped,
//     length capped) before it can reach a shell, a workflow input or a prompt.
// When Groq is unavailable, ruleParse() plans simple sentences by itself.
//
// The engine imports this file too (channel-pipeline.mjs, yt-daily.mjs,
// yt-deepdive.mjs read FACTORY_TOPIC / FACTORY_LANE through factoryTopicFor),
// so the panel and the engine share ONE sanitiser. Pure: the only import is
// the pure station list. No I/O of its own (withDispatchInputs only wraps the
// fetch it is given); never throws on bad input.
import { STATIONS } from './stations.mjs';

export const FACTORY_TEXT_MAX = 300; // the owner's sentence
export const FACTORY_TOPIC_MAX = 160; // the workflow input (channel-autopilot.yml `topic`)
export const FACTORY_TOPIC_MIN = 3;
export const FACTORY_LANES = Object.freeze(['short', 'doc']);
export const REPLY_KEYS = Object.freeze(['channel', 'lane', 'topic']);

const HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The sanitiser's character classes are built from char codes so no editor
// or tool can turn escapes into raw line separators (a literal U+2028 inside
// a regex literal is a syntax error).
const cc = (...codes) => String.fromCharCode(...codes);
// C0 + DEL + C1 controls (newlines and tabs included) and the Unicode line/paragraph separators.
const CONTROL_RE = new RegExp(`[${cc(0)}-${cc(0x1f)}${cc(0x7f)}-${cc(0x9f)}${cc(0x2028, 0x2029)}]`, 'g');
// Every quote kind (straight double/single, backtick, curly, low-9, guillemets) and the backslash (escaped pair).
const QUOTE_RE = new RegExp(`[${cc(0x22, 0x27, 0x60, 0x5c, 0x5c, 0x2018, 0x2019, 0x201a, 0x201b, 0x201c, 0x201d, 0x201e, 0x201f, 0xab, 0xbb)}]`, 'g');

/**
 * The one sanitiser for a factory topic (panel + engine). Strips control
 * characters (incl. newlines/tabs and the Unicode line separators), every
 * quote kind and backslashes, collapses whitespace, drops leading dashes
 * (never read as a CLI flag) and caps the length. '' when nothing usable is left.
 */
export function sanitizeFactoryTopic(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw
    .replace(CONTROL_RE, ' ')
    .replace(QUOTE_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^-+\s*/, '');
  if (s.length > FACTORY_TOPIC_MAX) s = s.slice(0, FACTORY_TOPIC_MAX).trim();
  return s.length >= FACTORY_TOPIC_MIN ? s : '';
}

/** 'short' | 'doc' | null (anything else). */
export function normalizeLane(raw) {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return FACTORY_LANES.includes(s) ? s : null;
}

/**
 * The engine's read of the dispatch: the sanitised FACTORY_TOPIC when it is
 * meant for `lane` (FACTORY_LANE; blank = 'short'), else null. Unset env =
 * null, so every lane keeps picking its own topic.
 */
export function factoryTopicFor(lane, env = {}) {
  const topic = sanitizeFactoryTopic(env.FACTORY_TOPIC);
  if (!topic) return null;
  const want = normalizeLane(env.FACTORY_LANE) || 'short';
  return want === lane ? topic : null;
}

// ---------------------------------------------------------------------------
// The real channel list (from the engine registry + cadence the run reads)
// ---------------------------------------------------------------------------

/**
 * Channel descriptors the planner may choose from: one per registry channel
 * that is not switched off. `templateMeta` is the template registry meta map
 * (REGISTRY_META) — used only to say honestly whether the script waits for
 * the owner's OK (review gate = the template's safety.review_required list).
 */
export function factoryChannels(registry, cadence, templateMeta = null) {
  const list = Array.isArray(registry?.channels) ? registry.channels : [];
  const out = [];
  for (const c of list) {
    if (!isObj(c) || typeof c.slug !== 'string' || !c.slug.trim() || c.active === false) continue;
    const kit = isObj(c.kit) ? c.kit : {};
    const cad = isObj(cadence) && isObj(cadence[c.slug]) ? cadence[c.slug] : {};
    const tid = typeof kit.templateId === 'string' ? kit.templateId : null;
    const meta = tid && isObj(templateMeta) ? templateMeta[tid] : null;
    const req = meta && isObj(meta.safety) && Array.isArray(meta.safety.review_required) ? meta.safety.review_required : null;
    out.push({
      slug: c.slug,
      label: String(c.label || kit.label || c.slug),
      shortsSource: cad.shortsSource === 'clips' ? 'clips' : 'generated',
      docDays: Array.isArray(cad.docDays) ? cad.docDays : [],
      shortDays: Array.isArray(cad.shortDays) ? cad.shortDays : [],
      reviewGate: req === null ? null : req.length > 0,
      // engine order (lib/brand-resolve.mjs: top-level list, else kit.slots) — index 0 is the factory Short's slot
      slots: (Array.isArray(c.slots) && c.slots.length ? c.slots : Array.isArray(kit.slots) ? kit.slots : []).filter((t) => typeof t === 'string').map((t) => t.trim()),
      longSlot: typeof kit.longSlot === 'string' && HHMM_RE.test(kit.longSlot.trim()) ? kit.longSlot.trim() : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The AI half: what we ask, and what we accept
// ---------------------------------------------------------------------------

export function buildFactoryPrompt({ text, channels }) {
  const list = (channels || []).map((c) => `${c.slug} (${c.label})`).join('; ');
  const system = [
    'You turn ONE request from a YouTube channel owner into a production plan.',
    'Return STRICT JSON only (no markdown, no commentary) with exactly these keys:',
    '{"channel": string, "lane": "short" | "doc", "topic": string}',
    `channel = one slug from this exact list, or "" when the request names none: ${list || '(none)'};`,
    'lane = "doc" for a documentary / long video / episode, "short" for a Short, "" when the request does not say;',
    `topic = the subject of the video in plain words, at most ${FACTORY_TOPIC_MAX} characters, no quotes.`,
    'Never add other keys. Never invent a channel.',
  ].join(' ');
  const user = `Request: ${String(text || '').slice(0, FACTORY_TEXT_MAX)}\nReply with the json object only.`;
  return { system, user };
}

/**
 * Strict check of the model's reply. Returns { ok:true, value:{channel,lane,topic} }
 * (channel/lane may be null when the reply left them blank) or { ok:false, error }.
 */
export function parseFactoryReply(raw, channels) {
  let j = raw;
  if (typeof raw === 'string') {
    try { j = JSON.parse(raw); } catch { return { ok: false, error: 'reply is not JSON' }; }
  }
  if (!isObj(j)) return { ok: false, error: 'reply is not an object' };
  const keys = Object.keys(j);
  const extra = keys.filter((k) => !REPLY_KEYS.includes(k));
  if (extra.length) return { ok: false, error: `unexpected key: ${extra[0]}` };
  for (const k of REPLY_KEYS) {
    if (!(k in j)) return { ok: false, error: `missing key: ${k}` };
    if (typeof j[k] !== 'string') return { ok: false, error: `${k} must be a string` };
  }
  let channel = null;
  if (j.channel.trim()) {
    const hit = (channels || []).find((c) => c.slug === j.channel.trim());
    if (!hit) return { ok: false, error: 'channel is not one of your channels' };
    channel = hit.slug;
  }
  let lane = null;
  if (j.lane.trim()) {
    lane = normalizeLane(j.lane);
    if (!lane) return { ok: false, error: 'lane must be short or doc' };
  }
  const topic = sanitizeFactoryTopic(j.topic);
  if (!topic) return { ok: false, error: 'no usable topic' };
  return { ok: true, value: { channel, lane, topic } };
}

// ---------------------------------------------------------------------------
// The no-AI half: simple sentences, deterministic
// ---------------------------------------------------------------------------

const norm = (s) => ` ${String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

function channelNames(c) {
  const label = norm(c.label).trim();
  const names = [label, label.replace(/^the /, ''), norm(c.slug.replace(/-/g, ' ')).trim()];
  return [...new Set(names.filter((n) => n.length >= 3))];
}

/**
 * Plans "Make a <channel> <short|documentary> about <topic>" style sentences
 * without the AI. Returns the same shape as parseFactoryReply.
 */
export function ruleParse(text, channels) {
  const raw = typeof text === 'string' ? text.slice(0, FACTORY_TEXT_MAX) : '';
  const hay = norm(raw);
  let channel = null;
  let best = 0;
  let matched = '';
  for (const c of channels || []) {
    for (const n of channelNames(c)) {
      if (n.length > best && hay.includes(` ${n} `)) { channel = c.slug; best = n.length; matched = n; }
    }
  }
  let lane = null;
  if (/\b(documentar(y|ies)|doc|docs|episode|long[- ]?form|long video|deep[- ]?dive)\b/i.test(raw)) lane = 'doc';
  else if (/\b(shorts?)\b/i.test(raw)) lane = 'short';

  let topic = '';
  const about = /\b(?:about|on the topic of|covering|explaining|on)\s+(.+)$/i.exec(raw);
  if (about) topic = about[1];
  else {
    topic = raw.replace(/^\s*(please\s+)?(make|create|produce|do|build|write)\s+(me\s+)?(an?\s+)?/i, '');
    if (matched) topic = topic.replace(new RegExp(`\\b(the\\s+)?${matched.split(' ').join('[^a-z0-9]+')}\\b`, 'i'), ' ');
    topic = topic.replace(/\b(documentar(y|ies)|doc|episode|shorts?|video)\b/gi, ' ');
  }
  topic = sanitizeFactoryTopic(topic.replace(/[.!?]+\s*$/, ''));
  if (!topic) return { ok: false, error: 'no usable topic' };
  return { ok: true, value: { channel, lane, topic } };
}

// ---------------------------------------------------------------------------
// The plan (built by code over the FIXED 7 stations)
// ---------------------------------------------------------------------------

/**
 * The ENGINE's publish time for a slot — the same rule as lib/schedule.mjs
 * nextSlotISO (yt-daily's Shorts publishAt) and yt-deepdive's doc publishAt:
 * today at HH:MM UTC unless that is within 35 minutes, else tomorrow. Studio
 * deploys without the repo root, so the rule is mirrored here and pinned
 * equal to lib/schedule.mjs by tests/factory-plan.test.mjs. null = bad slot.
 */
export function slotPublishISO(hhmm, now = new Date(), days = []) {
  if (typeof hhmm !== 'string' || !HHMM_RE.test(hhmm.trim())) return null;
  const [h, m] = hhmm.trim().split(':').map(Number);
  // 2026-11-25: only on the channel's own days (lib/publish-days.mjs nextSlotOnDays)
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const list = (Array.isArray(days) ? days : []).filter((x) => names.includes(x));
  for (let i = 0; list.length && i <= 7; i++) {
    const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, h, m, 0));
    if (list.includes(names[at.getUTCDay()]) && at.getTime() > now.getTime() + 35 * 60 * 1000) return at.toISOString().replace(/\.\d+Z$/, 'Z');
  }
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0));
  if (d <= new Date(now.getTime() + 35 * 60 * 1000)) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

// '2026-11-24T09:00:00Z' → 'tomorrow 09:00 UTC' (relative to now's UTC day)
function slotWords(iso, now) {
  const day = iso.slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const word = day === today ? 'today' : day === tomorrow ? 'tomorrow' : day;
  return `${word} ${iso.slice(11, 16)} UTC`;
}

function approvalNote(gate) {
  if (gate === true) return 'The script waits for your OK at Review — nothing is voiced or rendered before that';
  if (gate === false) return 'This channel has no review gate — the script goes straight on';
  return 'Waits for your OK at Review if this channel has the review gate';
}

/**
 * The plan card. `pick` = {channel, lane, topic} (already validated);
 * `channels` = the real list. Returns { ok:true, plan } or { ok:false, error }
 * with a plain-English reason.
 */
export function buildPlan(pick, channels, { now = new Date(), source = 'rules' } = {}) {
  if (!isObj(pick)) return { ok: false, error: 'Nothing to plan.' };
  const list = Array.isArray(channels) ? channels : [];
  if (!pick.channel) {
    return { ok: false, error: `Say which channel — for example "Make a ${list[0]?.label || '<channel name>'} video about …".` };
  }
  const ch = list.find((c) => c.slug === pick.channel);
  if (!ch) return { ok: false, error: 'That channel is not one of your channels.' };
  const topic = sanitizeFactoryTopic(pick.topic);
  if (!topic) return { ok: false, error: 'Say what the video is about.' };
  const warnings = [];
  let lane = normalizeLane(pick.lane);
  if (ch.shortsSource === 'clips') {
    if (lane === 'short') warnings.push(`${ch.label}'s Shorts are clips cut from its documentary, so this becomes a documentary (the Shorts follow from it).`);
    lane = 'doc';
  } else if (!lane) {
    lane = 'short';
  }
  // the exact slot the engine uses: a doc publishes at longSlot, the factory
  // Short takes slot INDEX 0 (yt-daily nextSlotISO(b.slots[0]))
  const publishAt = slotPublishISO(lane === 'doc' ? ch.longSlot : ch.slots[0], now, lane === 'doc' ? ch.docDays : ch.shortDays);
  const when = publishAt ? `next slot ${slotWords(publishAt, now)}` : null;
  if (lane === 'doc') {
    warnings.push('This run makes only the documentary — today’s Shorts run on their normal schedule.');
    if (ch.shortsSource !== 'clips' && ch.reviewGate !== false) {
      warnings.push(`Until you approve or reject this script, ${ch.label}’s Shorts for today wait too (the review gate holds the day’s slot).`);
    }
    if (ch.reviewGate !== false && publishAt) warnings.push('After your approval the documentary renders, then goes public at the next doc slot after that.');
  } else if (ch.slots.length > 1) {
    warnings.push(`Your topic takes the first Short slot; the channel’s other ${ch.slots.length - 1} slot(s) today use researched topics as usual.`);
  }

  const NOTES = {
    topic: `Given by you: ${topic}`,
    script: lane === 'doc' ? 'The AI writes the documentary script' : 'The AI writes the Short’s script',
    approval: approvalNote(ch.reviewGate),
    voice: 'The voiceover is recorded',
    render: lane === 'doc' ? 'The documentary is built' : 'The Short is built',
    thumbnail: 'A thumbnail is made and set',
    upload: when ? `Uploaded to YouTube, public at the ${when}` : 'Uploaded to YouTube at the channel’s next slot',
  };
  const steps = STATIONS.map((s) => ({ key: s.key, label: s.label, note: NOTES[s.key] }));
  return {
    ok: true,
    plan: { channel: ch.slug, channelLabel: ch.label, lane, topic, steps, when, publishAt, warnings, reviewGate: ch.reviewGate, source },
  };
}

/**
 * Start re-validation (server side): rebuild the plan from ONLY the three
 * fields the owner saw — client-sent steps/notes/warnings are ignored.
 */
export function revalidatePlan(input, channels, opts = {}) {
  if (!isObj(input)) return { ok: false, error: 'No plan to start.' };
  if (typeof input.channel !== 'string' || typeof input.topic !== 'string' || typeof input.lane !== 'string') {
    return { ok: false, error: 'The plan is incomplete — plan it again.' };
  }
  const lane = normalizeLane(input.lane);
  if (!lane) return { ok: false, error: 'The plan’s video type is not short or doc — plan it again.' };
  if (input.topic.length > FACTORY_TOPIC_MAX) return { ok: false, error: `The topic is longer than ${FACTORY_TOPIC_MAX} characters.` };
  const topic = sanitizeFactoryTopic(input.topic);
  if (!topic || topic !== input.topic.trim()) return { ok: false, error: 'The topic has characters the factory does not accept — plan it again.' };
  const built = buildPlan({ channel: input.channel, lane, topic }, channels, opts);
  if (!built.ok) return built;
  if (built.plan.lane !== lane) return { ok: false, error: 'The plan changed — plan it again.' };
  return built;
}

/**
 * Plain reason the run would do nothing today (null = fine). `state` is the
 * channel's engine state file (yt-mcp/state/<slug>.json) or null.
 */
export function laneBlocker({ lane, label, state, now = new Date() }) {
  const today = now.toISOString().slice(0, 10);
  const s = isObj(state) ? state : {};
  if ((s.pausedUntil || '') >= today && s.pausedUntil) return `${label} is paused until ${s.pausedUntil} — nothing would be made.`;
  // the doc lane's own guard (yt-deepdive: deepdiveDate === today → skip) —
  // a second documentary the same day never runs, so the topic would be lost
  if (lane === 'doc' && s.deepdiveDate === today) return `${label} already shipped today’s documentary — a second one never runs the same day. Try again tomorrow.`;
  if (lane === 'short') {
    if (now.getUTCDay() === 0) return 'Sunday is the Shorts break day — nothing would be made today. Ask for a documentary, or try tomorrow.';
    if (s.lastRunDate === today || s.healedDate === today) return `${label} already made today’s Shorts — a Short run would do nothing until tomorrow. Ask for a documentary instead, or try tomorrow.`;
  }
  return null;
}

/**
 * Plain reason Start must refuse because of the review gate's SLOT (null =
 * fine). The gate reads today's slot newest-first (scriptsForSlot): a newest
 * script that is waiting, approved or rejected decides the run, so no new
 * script is written and the factory topic would be silently dropped.
 * `scripts` = the slot rows newest first; null = the store could not be read.
 */
export function slotScriptBlocker({ scripts, label }) {
  if (!Array.isArray(scripts)) return `Couldn’t check ${label}’s scripts for today right now (the database didn’t answer) — try again in a minute.`;
  const newest = scripts[0];
  switch (newest?.status) {
    case 'awaiting_review':
      return `Today’s slot for ${label} already has a script waiting for your OK — approve or reject it at Review, or try tomorrow.`;
    case 'approved':
      return `Today’s slot for ${label} already has an approved script — try tomorrow, or after it publishes.`;
    case 'rejected':
      return `You rejected today’s script for ${label}, so today’s slot is closed — try tomorrow.`;
    default:
      return null;
  }
}

/** The workflow inputs for a validated plan — exactly these three, nothing free-form. */
export function dispatchInputs(plan) {
  return { channel: plan.channel, topic: plan.topic, lane: plan.lane };
}

/**
 * fetch seam for the shared dispatcher (studio/lib/review-actions.mjs
 * dispatchResumeRun — headers, 204 check, never throws). It sends
 * { ref, inputs: { channel } } when no job id is given; this adds the
 * factory's validated inputs to that exact request body.
 */
export function withDispatchInputs(inputs, fetchImpl = fetch) {
  return (url, opts = {}) => {
    const payload = JSON.parse(opts.body);
    return fetchImpl(url, { ...opts, body: JSON.stringify({ ...payload, inputs: { ...payload.inputs, ...inputs } }) });
  };
}
