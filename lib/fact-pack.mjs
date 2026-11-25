// FACT PACK — sourced sentences a documentary script is allowed to use
// (docs/qa/facts-first-qa.md, owner 2026-11-25: "facts first").
//
// Every fact is one sentence copied WORD FOR WORD from a page we fetched, so a
// fact can never be invented here: Wikipedia (API) and news articles found with
// GDELT (both free, no key). Best-effort by contract: a source that fails is
// skipped, and an empty pack means "use no numbers and no names" — never "anything
// goes" (lib/claim-check.mjs decides). FACT_PACK_OFFLINE=1 = no network.

const UA = 'Mozilla/5.0 (compatible; QuarryFactPack/1.0)';
export const MAX_FACTS = 34;
const PER_SOURCE = 7;
const STOP = new Set('the a an and or of to in on for with from by at as is are was were be been it its this that these those their they them we you your our he she his her not no but than then into over about how why what who when where which will would can could should may might more most very just one'.split(' '));

export const words = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9%$. ]+/g, ' ').split(/\s+/).map((w) => w.replace(/^[.]+|[.]+$/g, '')).filter((w) => w.length > 2 && !STOP.has(w));

/** Plain sentences (abbreviations and decimals kept whole). */
export function sentences(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\b(Mr|Mrs|Ms|Dr|St|vs|etc|e\.g|i\.e|U\.S|U\.K|Inc|Corp|Co|Ltd|No)\./g, (m) => m.replace(/\./g, '\u0001'))
    .split(/(?<=[.!?]["”’)]?)\s+(?=["“‘(]?[A-Z0-9$])/)
    .map((s) => s.replace(/\u0001/g, '.').trim())
    .filter(Boolean);
}

/** HTML page → readable text of its paragraphs. */
export function pageText(html) {
  const body = String(html ?? '').replace(/<(script|style|noscript|svg|header|footer|nav|aside|form)[\s\S]*?<\/\1>/gi, ' ');
  const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]);
  const decode = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;|&ndash;/g, '-').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&[a-z]+;/g, ' ');
  return paras.map(decode).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 60).join('\n');
}

const hasFigure = (s) => /\d/.test(s);

/** Usable fact sentences of one text, best first: about the topic, with a figure, readable aloud. */
export function factSentences(text, topicWords, limit = PER_SOURCE) {
  const topic = new Set(topicWords);
  return sentences(text)
    .filter((s) => s.length >= 40 && s.length <= 280 && /[.!?]["”’)]?$/.test(s) && !/[{}<>|]|https?:|cookie|subscribe|sign up|newsletter|copyright|all rights/i.test(s))
    .map((s, i) => ({ s, i, score: words(s).filter((w) => topic.has(w)).length * 2 + (hasFigure(s) ? 2 : 0) }))
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
}

async function getText(fetchImpl, url, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctl.signal });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function wikipedia(fetchImpl, query, count = 2) {
  const api = 'https://en.wikipedia.org/w/api.php?format=json&action=query';
  const raw = await getText(fetchImpl, `${api}&list=search&srlimit=${count}&srsearch=${encodeURIComponent(query)}`);
  let titles = [];
  try { titles = JSON.parse(raw).query.search.map((x) => x.title).filter((t) => !/disambiguation|^List of/i.test(t)); } catch { return []; }
  const out = [];
  for (const title of titles) {
    const page = await getText(fetchImpl, `${api}&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`);
    try {
      const p = Object.values(JSON.parse(page).query.pages)[0];
      const text = String(p.extract || '').replace(/={2,}[^=\n]+={2,}/g, '\n');
      if (text.length > 400) out.push({ url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, title: `${p.title} — Wikipedia`, text: text.slice(0, 60000) });
    } catch { /* skipped */ }
  }
  return out;
}

async function news(fetchImpl, query, sleep, count = 3) {
  let list = await getText(fetchImpl, `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(`${query} sourcelang:english`)}&mode=artlist&format=json&maxrecords=12&sort=hybridrel&timespan=3m`, 20000);
  if (!list) { await sleep(8000); list = await getText(fetchImpl, `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(`${query} sourcelang:english`)}&mode=artlist&format=json&maxrecords=12&sort=hybridrel&timespan=3m`, 20000); } // busy: one more try
  await sleep(6000); // GDELT asks for at most one request every 5 seconds
  let arts = [];
  try { arts = JSON.parse(list).articles || []; } catch { return []; }
  const seen = new Set();
  const out = [];
  for (const a of arts) {
    if (out.length >= count) break;
    if (!/^https?:\/\//.test(a?.url || '') || seen.has(a.domain)) continue;
    seen.add(a.domain);
    const text = pageText(await getText(fetchImpl, a.url));
    if (text.length > 800) out.push({ url: a.url, title: String(a.title || a.domain).slice(0, 160), text: text.slice(0, 30000), date: String(a.seendate || '').slice(0, 8) });
  }
  return out;
}

/** Search phrases from a theme when the AI gave none. */
export function fallbackQueries(theme, niches = []) {
  const quoted = [...String(theme ?? '').matchAll(/"([^"]{6,90})"/g)].map((m) => m[1]);
  const base = quoted[0] || String(theme ?? '');
  return [...new Set([words(base).slice(0, 5).join(' '), ...(Array.isArray(niches) ? niches.slice(0, 2) : [])].map((q) => String(q).trim()).filter(Boolean))];
}

/**
 * @returns {Promise<{ sources: Array<{url,title}>, facts: Array<{n,text,source}>, corpus: string }>}
 *   facts[].source = index into sources; corpus = all fetched text (name checks)
 */
export async function buildFactPack({ theme, queries = [], niches = [], fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {}, env = process.env } = {}) {
  const empty = { sources: [], facts: [], corpus: '' };
  if (String(env?.FACT_PACK_OFFLINE || '') === '1') return empty;
  const qs = (Array.isArray(queries) && queries.length ? queries : fallbackQueries(theme, niches)).map((q) => String(q).slice(0, 80)).slice(0, 5);
  const topic = [...new Set(words([theme, ...qs].join(' ')))];
  const pages = [];
  for (const q of qs) pages.push(...await wikipedia(fetchImpl, q));
  for (const q of qs.slice(0, 2)) pages.push(...await news(fetchImpl, q, sleep));
  const byUrl = [...new Map(pages.map((p) => [p.url, p])).values()];
  const sources = [];
  const facts = [];
  const used = new Set();
  for (const p of byUrl) {
    if (facts.length >= MAX_FACTS) break;
    const picked = factSentences(p.text, topic).filter((s) => !used.has(s.toLowerCase())).slice(0, MAX_FACTS - facts.length);
    if (!picked.length) continue;
    sources.push({ url: p.url, title: p.title });
    for (const s of picked) {
      used.add(s.toLowerCase());
      facts.push({ n: facts.length + 1, text: s, source: sources.length - 1 });
    }
  }
  log(`[facts] ${facts.length} facts from ${sources.length} source(s) (${byUrl.length} page(s) read; queries: ${qs.join(' | ')})`);
  return { sources, facts, corpus: byUrl.map((p) => `${p.title}\n${p.text}`).join('\n') };
}

/** The prompt block that goes after the script instructions. */
export function factPromptSection(pack) {
  const rules = [
    'FACT RULES (a checker rejects every violation):',
    '- Write NO digit, percentage, money amount, year, statistic or quantity unless it is in a FACT below. Write numbers as DIGITS, exactly as the FACT writes them (never spelled out, never rounded).',
    '- After a sentence that uses a fact, put its marker, like [F3]. Two facts: [F3][F7].',
    '- Name a company, person, product, study or place ONLY if it appears in the FACTS. No invented people, families, apps or companies.',
    '- No quotation marks around words someone said, unless that exact quote is in a FACT.',
    '- No predictions and no advice to buy, sell or invest. Never promise results.',
    '- The title follows the same rules (no marker needed in the title).',
    '- You may explain ideas, causes and consequences in your own words without numbers. For a made-up example start the sentence with "Imagine".',
  ];
  if (!pack?.facts?.length) return `\n\n${[...rules, 'FACTS: none were found. Use no numbers and no names at all.'].join('\n')}`;
  return `\n\n${rules.join('\n')}\nFACTS:\n${pack.facts.map((f) => `[F${f.n}] ${f.text}`).join('\n')}`;
}
