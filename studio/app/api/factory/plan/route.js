// "Ask the factory" (2026-11-23, research/creator-city-agent-factory-2026-11-23.md
// §5 item 9 + owner decision d) — POST { text } → { plan, note? }.
// NO side effects: nothing is dispatched or written; the owner sees the plan
// and nothing happens until they press Start (/api/factory/start).
// The free AI (Groq — the same client as the kit autofill, lib/llm-kit.js)
// only fills { channel, lane, topic }; lib/factory-plan.mjs rejects any
// off-schema reply or a channel outside the real list, and builds the fixed
// 7-step plan itself. No key / AI failure / rejected reply → the
// deterministic rule parser plans simple sentences.
// Owner only: the proxy (lib/route-roles.js) AND this route, fail-closed.
import { getUser } from '@/lib/route-auth';
import { appendAudit } from '@/lib/audit';
import { enforceLimits } from '@/lib/rate-limit.mjs';
import { groqChat } from '@/lib/llm-kit';
import { FACTORY_TEXT_MAX, buildFactoryPrompt, parseFactoryReply, ruleParse, buildPlan } from '@/lib/factory-plan.mjs';
import { loadFactorySetup, setupFailed } from '../factory-setup';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  if (user.role !== 'owner') return Response.json({ error: 'only the owner can ask the factory' }, { status: 403 });
  // the AI call is the expensive part (Groq free tier) — capped per actor
  const limited = await enforceLimits(user, [
    { bucket: 'factory-plan', limit: 20, windowSec: 3600 },
    { bucket: 'factory-plan', limit: 60, windowSec: 86400 },
  ]);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return Response.json({ error: 'Type what you want made — e.g. "Make a <channel> video about <topic>".' }, { status: 400 });
  if (text.length > FACTORY_TEXT_MAX) return Response.json({ error: `Keep it to one sentence (${FACTORY_TEXT_MAX} characters max).` }, { status: 400 });

  let channels;
  try {
    ({ channels } = await loadFactorySetup());
  } catch (e) {
    return setupFailed(e);
  }
  if (!channels.length) return Response.json({ error: 'No channels found to make videos for.' }, { status: 409 });

  let pick = null;
  let source = 'rules';
  let note = null;
  if (process.env.GROQ_API_KEY) {
    try {
      const raw = await groqChat(buildFactoryPrompt({ text, channels }), { maxTokens: 1500 });
      const r = parseFactoryReply(raw, channels);
      if (r.ok) {
        pick = r.value;
        source = 'ai';
      } else {
        note = `The AI's answer was not usable (${r.error}) — planned by simple rules instead.`;
      }
    } catch (e) {
      console.error('[factory-plan] groq', String(e?.message || e).slice(0, 200));
      note = 'The AI planner is unavailable right now — planned by simple rules instead.';
    }
  } else {
    note = 'No AI key configured — planned by simple rules.';
  }
  // the rules fill what the AI left blank (or plan everything without it)
  const rules = ruleParse(text, channels);
  if (!pick) pick = rules.ok ? rules.value : null;
  else if (!pick.channel && rules.ok && rules.value.channel) pick = { ...pick, channel: rules.value.channel };
  if (!pick) {
    return Response.json({ error: 'Couldn’t find a topic in that. Try: "Make a <channel> video about <topic>".', note }, { status: 422 });
  }

  const built = buildPlan(pick, channels, { source });
  if (!built.ok) return Response.json({ error: built.error, note }, { status: 422 });
  try {
    await appendAudit(user.email, 'factory-plan', `${source} · ${built.plan.channel} · ${built.plan.lane}`);
  } catch { }
  return Response.json({ plan: built.plan, ...(note ? { note } : {}) });
}
