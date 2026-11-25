// CLAIM CHECK — no AI: does every number, name and quote in a script exist in its
// sources? (docs/qa/facts-first-qa.md). Pure. Strict on purpose: when unsure, the
// sentence is reported, and an unresolved report means a person must look.
import { sentences, words } from './fact-pack.mjs';
import { numbersIn } from './shown-numbers.mjs';

const MARK_RE = /\s*\[F(\d+)\]/g;
const UNIT = 'percent|per cent|million|billion|trillion|thousand|hundred|dollars?|cents|euros?|pounds?|years?|months?|weeks?|days?|hours?|minutes?|seconds?|times|people|households|families|companies|watts?|kilowatts?|megawatts?|gigawatts?|terawatts?|points?|basis points';
const SMALL = 'two|three|four|five|six|seven|eight|nine|ten';
const BIG = 'eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const ANY = `one|${SMALL}|${BIG}|hundred|thousand|million|billion|trillion`;
// a spelled-out quantity: anything from eleven up, or a small one with a unit. A whole
// run is taken ("two point two gigawatts", "one hundred thousand households").
const RUN = `(?:${ANY})(?:(?:[- ]and[- ]|[- ]point[- ]|[- ])(?:${ANY}|zero))*`;
const WORD_NUMBER_RE = new RegExp(`\\b(?:zero point )?${RUN}(?:[- ](?:${UNIT}))?\\b|\\b(?:a|half a) (?:hundred|thousand|million|billion|trillion)\\b`, 'gi');
const NEEDS_SOURCE_RE = new RegExp(`\\b(?:${BIG}|hundred|thousand|million|billion|trillion|point)\\b|\\b(?:one|${SMALL})[- ](?:${UNIT})\\b`, 'i');
const DIGIT_RE = /\d[\d,]*(?:\.\d+)?/g;
const IMAGINE_RE = /^["“]?(imagine|suppose|picture|say you|let's say|let us say)\b/i;
const ADVICE_RE = /\bhow to profit\b|\bguaranteed? (?:returns?|profits?|income|results?|wins?|gains?)|\bguaranteed to\b|\bcan'?t lose\b|\brisk[- ]free (?:returns?|profits?|money|trade)\b|\bget rich quick\b|\bdouble your money\b|\b(?:buy|sell|short|dump) (?:now|today|immediately|it before|your (?:stocks?|gold|shares))\b|\byou should (?:buy|sell|invest|short)\b|\b(?:will|going to|about to|may|could) (?:crash|collapse|skyrocket|explode)(?: \w+)? (?:tomorrow|today|tonight|next week|this week)\b/i;

const norm = (n) => String(n).replace(/,/g, '').replace(/\.0+$/, '');
export const digitsOf = (t) => (String(t ?? '').match(DIGIT_RE) || []).map(norm);
const lower = (t) => String(t ?? '').toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ');

// "Rule 3", "step 2", "number 4", "part one" — structure, not a statistic
const STRUCTURE_RE = /\b(?:rule|step|part|chapter|lesson|number|reason|sign|habit|stage|phase|level|tip|law|secret|mistake|principle)s?\s*#?\d+\b/gi;

// capitalised words that are not a name of someone or something
const NOT_NAMES = new Set('i ai us usa uk eu gdp ceo ipo api gpu cpu tv dna god earth internet english american americans america european europe western monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december'.split(' '));

/** Names used mid-sentence: runs of capitalised words that did not just start the sentence. */
export function namesIn(sentence) {
  const s = String(sentence ?? '').replace(MARK_RE, '');
  const out = [];
  const re = /(?<=[a-z0-9,;:'"”)]\s|—\s?|-\s)((?:[A-Z][A-Za-z0-9&'’.-]*)(?:\s+(?:of|the|and|&)\s+(?=[A-Z])|\s+)?(?:[A-Z][A-Za-z0-9&'’.-]*\s*)*)/g;
  for (const m of s.matchAll(re)) {
    const name = m[1].trim().replace(/[.,;:'’]+$/, '').replace(/['’]s$/, '');
    if (name && !name.split(/\s+/).every((w) => NOT_NAMES.has(w.toLowerCase().replace(/[^a-z]/g, '')))) out.push(name);
  }
  return out;
}

const quotesIn = (s) => [...String(s ?? '').matchAll(/["“]([^"”]{12,240})["”]/g)].map((m) => m[1].trim()).filter((q) => q.split(/\s+/).length >= 4);

/** Markers out, spacing tidy. */
export const stripMarkers = (t) => String(t ?? '').replace(MARK_RE, '').replace(/\s+([.,!?;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();

/**
 * One sentence against the pack.
 * @returns {{ problems: string[], source: number|null, factual: boolean }}
 */
export function checkSentence(sentence, pack, { title = false, example = false } = {}) {
  const facts = pack?.facts || [];
  const cited = [...String(sentence).matchAll(/\[F(\d+)\]/g)].map((m) => facts.find((f) => f.n === Number(m[1]))).filter(Boolean);
  const plain = stripMarkers(sentence);
  const body = plain.replace(STRUCTURE_RE, ' ');
  const problems = [];
  if (ADVICE_RE.test(plain)) problems.push('gives advice or predicts a market move');
  const imagined = !title && (example || IMAGINE_RE.test(plain));

  const nums = digitsOf(body);
  const wordNums = (body.match(WORD_NUMBER_RE) || []).filter((w) => NEEDS_SOURCE_RE.test(w));
  const counted = nums.length > 0 || wordNums.length > 0;
  let source = null;
  if (!imagined && counted) {
    // a number must be in the fact it cites; without a marker, in one fact about the
    // same thing (a small number is easy to hit by accident, so it needs more overlap)
    const topic = new Set(words(plain));
    const need = nums.length && nums.every((n) => Number(n) <= 31) && !wordNums.length ? 3 : 2;
    const near = facts.filter((f) => words(f.text).filter((w) => topic.has(w)).length >= need);
    const says = (f, n) => numbersIn(f.text).has(Number(n));
    const saysWords = (f, w) => [...numbersIn(w)].every((v) => numbersIn(f.text).has(v)) && numbersIn(w).size > 0;
    const pool = [...cited, ...near];
    const missing = nums.filter((n) => !pool.some((f) => says(f, n)));
    const missingWords = wordNums.filter((w) => !pool.some((f) => saysWords(f, w)));
    if (missing.length) problems.push(`number ${missing.join(', ')} is not in its source`);
    if (missingWords.length) problems.push(`"${missingWords[0]}" is not in its source`);
    if (!missing.length && !missingWords.length) {
      const f = pool.find((x) => nums.every((n) => says(x, n)) && wordNums.every((w) => saysWords(x, w))) || pool.find((x) => nums.some((n) => says(x, n)) || wordNums.some((w) => saysWords(x, w)));
      source = f ? f.source : null;
    }
  }
  const factual = counted && !imagined;
  const corpus = lower(pack?.corpus || '');
  if (!title) {
    const unknown = namesIn(plain).filter((n) => !corpus.includes(lower(n)));
    if (unknown.length) problems.push(`"${unknown[0]}" is not in the sources`);
    const badQuote = quotesIn(plain).find((q) => !corpus.includes(lower(q).replace(/[.,!?]+$/, '')));
    if (badQuote) problems.push(`quote "${badQuote.slice(0, 50)}" is not in the sources`);
  }
  return { problems, source, factual };
}

function walk(text, pack, where, rows) {
  const list = sentences(text);
  let example = 0; // an "Imagine …" example may run for the next sentence too
  return list.map((s) => {
    const r = checkSentence(s, pack, { example: example > 0 && namesIn(stripMarkers(s)).length === 0 });
    example = IMAGINE_RE.test(stripMarkers(s)) ? 1 : Math.max(0, example - 1);
    rows.push({ where, sentence: stripMarkers(s), ...r });
    return { s, ok: r.problems.length === 0 };
  });
}

const count = (t) => stripMarkers(t).split(/\s+/).filter(Boolean).length;

/**
 * The whole script. `repair` drops failing sentences (never the title) when enough
 * of every chapter is left; the returned script has no markers.
 * @returns {{ status: 'passed'|'failed', script: object, problems: string[], claims: Array<{claim,sourceIdx,verification}>, removed: number }}
 */
export function checkScript(script, pack, { repair = false, minChapterWords = 70, maxDropShare = 0.35 } = {}) {
  const rows = [];
  const t = checkSentence(script?.title || '', pack, { title: true });
  rows.push({ where: 'title', sentence: String(script?.title || ''), ...t });
  const intro = walk(script?.intro, pack, 'intro', rows);
  const chapters = (script?.chapters || []).map((c, i) => ({ c, list: walk(c?.text, pack, `chapter ${i + 1}`, rows) }));
  const outro = walk(script?.outro, pack, 'outro', rows);
  const bad = rows.filter((r) => r.problems.length);
  const problems = bad.map((r) => `${r.where}: "${r.sentence.slice(0, 80)}" — ${r.problems.join('; ')}`);

  const join = (list, keepAll) => stripMarkers(list.filter((x) => keepAll || x.ok).map((x) => x.s).join(' '));
  const all = { ...script, intro: join(intro, true), outro: join(outro, true), chapters: chapters.map(({ c, list }) => ({ ...c, title: stripMarkers(c?.title), text: join(list, true) })) };
  const toClaims = (list) => list.filter((r) => r.factual || r.problems.length).map((r) => ({
    claim: r.sentence.slice(0, 400),
    sourceIdx: r.source,
    verification: r.problems.length ? 'flagged' : r.source === null ? 'unverified' : 'verified',
  }));
  if (!bad.length) return { status: 'passed', script: all, problems: [], claims: toClaims(rows), removed: 0 };
  if (repair && !t.problems.length) {
    const total = rows.length - 1;
    const fixed = { ...all, intro: join(intro, false), outro: join(outro, false), chapters: chapters.map(({ c, list }) => ({ ...c, title: stripMarkers(c?.title), text: join(list, false) })) };
    const enough = fixed.intro && fixed.outro && bad.length <= total * maxDropShare && fixed.chapters.every((c) => count(c.text) >= minChapterWords);
    if (enough) return { status: 'passed', script: fixed, problems: [], claims: toClaims(rows.filter((r) => !r.problems.length)), removed: bad.length };
  }
  return { status: 'failed', script: all, problems, claims: toClaims(rows), removed: 0 };
}
