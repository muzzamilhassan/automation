// Facts-first documentary scripts (docs/qa/facts-first-qa.md): gather sourced facts,
// write from them, check every sentence, ask again with the named problems. All calls
// are injected, so the doc lane and a dry run use the same code.
import { buildFactPack, factPromptSection } from './fact-pack.mjs';
import { checkScript } from './claim-check.mjs';

export function queryPrompt({ theme, niche, label }) {
  return `A YouTube documentary channel ("${label}", niche: ${niche}) needs sources for an episode.
Episode theme: ${theme}
Return ONLY valid JSON: {"queries":["..."]} with 4 short web-search phrases (2-5 words each, real things: events, companies, people, concepts, reports) that would find encyclopedia or news pages with facts about this theme. No quotes inside the phrases.`;
}

export const validQueries = (p) => Array.isArray(p?.queries) && p.queries.filter((q) => typeof q === 'string' && q.trim().length > 2).length >= 2;

/**
 * @param {object} p
 * @param {string} p.prompt the script prompt (its JSON contract unchanged)
 * @param {(prompt: string) => Promise<object>} p.write one script generation (throws on total failure)
 * @param {(prompt: string) => Promise<object|null>} [p.ask] the small queries call
 * @returns {Promise<{ script: object, factCheck: object, sources: Array, claims: Array }>}
 */
export async function groundedScript({ prompt, theme, kit = {}, write, ask = async () => null, attempts = 3, pack = null, makePack = buildFactPack, log = () => {} }) {
  let facts = pack;
  if (!facts) {
    let queries = [];
    if (String(process.env.FACT_PACK_OFFLINE || '') !== '1') try {
      const q = await ask(queryPrompt({ theme, niche: kit.niche || '', label: kit.label || '' }));
      if (validQueries(q)) queries = q.queries.map((x) => String(x).trim()).filter(Boolean);
    } catch { /* fallback queries */ }
    try {
      facts = await makePack({ theme, queries, niches: kit.niches || [], log });
    } catch (e) {
      log(`[facts] gathering failed (${String((e && e.message) || e).slice(0, 80)}) — writing without numbers or names`);
      facts = { sources: [], facts: [], corpus: '' };
    }
  }
  // the channel's own name is always allowed
  const usable = { ...facts, corpus: `${facts.corpus}\n${kit.label || ''}` };
  const full = prompt + factPromptSection(usable);
  let best = null;
  let notes = '';
  for (let a = 1; a <= attempts; a++) {
    let raw;
    try {
      raw = await write(full + notes);
    } catch (e) {
      if (best) break; // a later rewrite failed: judge what we have
      throw e;
    }
    const r = checkScript(raw, usable, { repair: true });
    if (!best || r.status === 'passed' || r.problems.length < best.problems.length) best = r;
    if (r.status === 'passed') break;
    log(`[facts] attempt ${a}: ${r.problems.length} unsupported sentence(s) — ${r.problems[0]}`);
    notes = `\n\nA checker rejected these sentences of your last version. Rewrite the whole episode; fix or remove every one:\n${r.problems.slice(0, 14).map((x) => `- ${x}`).join('\n')}`;
  }
  const verified = best.claims.filter((c) => c.verification === 'verified').length;
  const factCheck = {
    status: best.status,
    facts: usable.facts.length,
    sources: usable.sources.length,
    verified,
    removed: best.removed,
    problems: best.problems.slice(0, 20),
    checkedAt: new Date().toISOString(),
  };
  log(`[facts] ${best.status === 'passed' ? 'PASSED' : 'FAILED'} — ${verified} claim(s) matched to ${usable.sources.length} source(s)${best.removed ? `, ${best.removed} unsupported sentence(s) removed` : ''}${best.problems.length ? `, ${best.problems.length} unresolved` : ''}`);
  return { script: best.script, factCheck, sources: usable.sources.map((s) => ({ url: s.url, title: s.title })), claims: best.claims.slice(0, 80) };
}
