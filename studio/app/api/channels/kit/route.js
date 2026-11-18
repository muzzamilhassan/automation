// 10-05 CHANNEL FACTORY — brand-kit generator (wizard step 3).
// Deterministic draft from the niche + label: identity fields, SEO tags,
// script rules, music mood. Fully editable by the user in the wizard before
// saving — the machine drafts, the human approves.
// #113 flavor B: when the request asks for AI and GROQ_API_KEY is set, the
// identity/SEO fields are drafted by the LLM instead (machine-drafts-human-
// approves preserved — the wizard shows each field as a reviewable
// suggestion with an explicit Apply). Failure or missing key falls back to
// the deterministic templates and the response says which path produced the
// draft. Every AI attempt lands in the audit log.
import { requireRole, getUser } from '@/lib/route-auth';
import { NICHE_MAP } from '@/lib/niches';
import { appendAudit } from '@/lib/audit';
import { llmKitDraft } from '@/lib/llm-kit';
import { enforceLimits } from '@/lib/rate-limit.mjs';

export const dynamic = 'force-dynamic';

const MOOD_FEELS = {
  calm: ['calming', 'mystical'],
  bright: ['bright', 'uplifting', 'grooving'],
  epic: ['epic', 'heroic', 'inspir'],
};
const MOOD_HINTS = {
  calm: ['stoic', 'stoicism', 'calm', 'old money', 'quiet', 'luxury', 'discipline', 'mindful', 'minimal'],
  epic: ['motivation', 'success', 'grind', 'mindset', 'discipline', 'strength'],
  bright: ['money', 'finance', 'invest', 'wealth', 'budget', 'business', 'productivity'],
};

const titleCase = (s) => String(s || '').replace(/\b[a-z]/g, (c) => c.toUpperCase());
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);

function detectMood(low) {
  for (const [mood, hints] of Object.entries(MOOD_HINTS)) {
    if (hints.some((h) => low.includes(h))) return mood;
  }
  return 'calm';
}

export async function POST(req) {
  if (!(await requireRole(req, ['owner']))) return Response.json({ error: 'not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { slug, niche, label, useLLM } = body;
  const nick = String(niche || '').trim();
  const lab = String(label || slug || 'new channel').trim();
  if (!nick) return Response.json({ error: 'niche is required' }, { status: 400 });

  // #113 — AI draft first when asked for and configured; deterministic
  // templates remain the guaranteed fallback (EARS 3). Both paths return the
  // same kit shape; `source` tells the wizard which one produced it so the
  // UI can show reviewable Apply actions (llm) or state the fallback (template).
  let llmDraft = null;
  let llmNote = '';
  if (useLLM) {
    // #121 RL-4: the AI draft is the expensive path (Groq, free tier) —
    // capped per actor. The deterministic fallback below is cheap and
    // deliberately stays unlimited.
    const actorUser = await getUser(req);
    const limited = await enforceLimits(actorUser, [{ bucket: 'llm-kit', limit: 10, windowSec: 3600 }]);
    if (limited) return limited;
    const actor = actorUser?.email || 'owner';
    if (!process.env.GROQ_API_KEY) {
      llmNote = 'no AI key configured';
      await appendAudit(actor, 'kit-llm-draft', `skipped: ${llmNote} · ${nick}`);
    } else {
      try {
        llmDraft = await llmKitDraft({ niche: nick, label: lab, slug });
        await appendAudit(actor, 'kit-llm-draft', `ok · ${nick}`);
      } catch (e) {
        llmNote = `AI draft failed (${String(e.message || e).slice(0, 80)})`;
        await appendAudit(actor, 'kit-llm-draft', `failed: ${llmNote} · ${nick}`);
      }
    }
  }

  const low = nick.toLowerCase();
  const words = low.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const mood = detectMood(low);
  const kwShort = words.slice(0, 2).join(' ') || low;

  const tagSet = new Set([low, ...words]);
  for (const suffix of ['explained', 'habits', 'for beginners', 'mindset', 'rules', 'motivation', 'guide', 'secrets']) {
    tagSet.add(`${low} ${suffix}`);
  }
  const tags = [...tagSet].slice(0, 12);

  const taglines = [
    'Play the long game.',
    'Quiet moves, loud results.',
    'Standards over storms.',
    'Discipline is freedom.',
    'Compound everything.',
  ];

  // 10-16 PRODUCT SCALE: resolve curated sub-niches from NICHE_MAP or smart-generate
  const foundMap = Object.entries(NICHE_MAP).find(([k]) => low.includes(k.toLowerCase()) || k.toLowerCase().includes(low));
  const subNiches = foundMap
    ? foundMap[1]
    : [
        low,
        ...words.map((w) => `${w} psychology`),
        ...words.map((w) => `${w} rules`),
        ...words.map((w) => `${w} habits`),
      ].slice(0, 6);

  const kit = {
    eyebrow: `${nick.toUpperCase()} // ${lab.toUpperCase()}`.slice(0, 60),
    tagline: taglines[hash(slug || lab) % taglines.length],
    keyword: low,
    kwShort,
    theme: nick,
    niches: subNiches,
    authority: `${titleCase(nick)} Wisdom`,
    tags,
    musicFeels: MOOD_FEELS[mood],
    mood,
    description: `${nick} in 60 seconds — the habits, rules, and quiet standards that compound. New Shorts every day. Subscribe for daily ${kwShort}.`.slice(0, 900),
    script: {
      targetSeconds: 32,
      points: 4,
      lineWords: '9-12',
      titleStyle: 'numbered listicle + stakes',
      titleExamples: '"7 Habits That Quietly Set You Apart", "The Rule Nobody Talks About"',
    },
  };

  if (!llmDraft) {
    // deterministic path (or AI fallback) — wizard fills as before, and says so
    return Response.json({ kit, source: 'template', ...(llmNote ? { note: llmNote } : {}) });
  }
  // AI path: LLM fields win where present; the deterministic kit stays the
  // base so keyword/theme/script/music fields always exist. voice/style are
  // SUGGESTIONS only — the wizard applies them on an explicit click.
  const merged = {
    ...kit,
    ...(llmDraft.eyebrow ? { eyebrow: llmDraft.eyebrow } : {}),
    ...(llmDraft.tagline ? { tagline: llmDraft.tagline } : {}),
    ...(llmDraft.description ? { description: llmDraft.description } : {}),
    ...(llmDraft.tags.length ? { tags: llmDraft.tags } : {}),
    ...(llmDraft.subNiches.length ? { niches: llmDraft.subNiches } : {}),
  };
  const suggestion = {
    ...(llmDraft.voice ? { voice: llmDraft.voice } : {}),
    ...(llmDraft.style ? { style: llmDraft.style } : {}),
  };
  return Response.json({ kit: merged, source: 'llm', suggestion });
}
