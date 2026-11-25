// docs/qa/facts-first-qa.md — every number, name and quote needs a source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentences, pageText, factSentences, buildFactPack, factPromptSection, fallbackQueries, words } from '../lib/fact-pack.mjs';
import { checkSentence, checkScript, namesIn, stripMarkers } from '../lib/claim-check.mjs';
import { groundedScript } from '../lib/grounded-script.mjs';

const PACK = {
  sources: [{ url: 'https://www.iea.org/x', title: 'IEA' }, { url: 'https://example.org/g', title: 'Google blog' }],
  facts: [
    { n: 1, text: 'Data centres accounted for around 1.5% of the world’s electricity consumption in 2024, or 415 terawatt-hours (TWh).', source: 0 },
    { n: 2, text: 'A typical AI-focused data centre consumes as much electricity as 100,000 households.', source: 0 },
    { n: 3, text: 'We estimate the median Gemini Apps text prompt uses 0.24 watt-hours of energy.', source: 1 },
  ],
};
PACK.corpus = PACK.facts.map((f) => f.text).join(' ') + ' International Energy Agency. Google published a report. Marcus Aurelius wrote "You have power over your mind" in his notes.';
const probs = (s, o) => checkSentence(s, PACK, o).problems;

test('sentences: abbreviations and decimals stay whole', () => {
  assert.deepEqual(sentences('It used 0.24 watt-hours. Dr. Smith agreed. The U.S. grid grew.'), ['It used 0.24 watt-hours.', 'Dr. Smith agreed.', 'The U.S. grid grew.']);
});

test('facts are copied word for word, about the topic, and never page furniture', () => {
  const t = 'Data centers used 415 terawatt-hours of electricity in 2024. Subscribe to our newsletter for 5 tips on electricity data centers. Cats are nice animals to have at home always.';
  assert.deepEqual(factSentences(t, words('data centers electricity')), ['Data centers used 415 terawatt-hours of electricity in 2024.']);
  assert.match(pageText('<nav><p>menu menu menu menu menu menu menu menu menu menu menu menu menu</p></nav><p>The grid &amp; the bill: a long enough paragraph to be kept as text for the reader here.</p>'), /^The grid & the bill/);
  assert.deepEqual(fallbackQueries('Build it around "How Data Centers Drain Power" today', ['ai money']), ['data centers drain power', 'ai money']);
});

test('a supported number passes and is tied to its source', () => {
  const r = checkSentence('In 2024, data centres used about 415 terawatt-hours. [F1]', PACK);
  assert.deepEqual(r.problems, []);
  assert.equal(r.source, 0);
  assert.equal(checkSentence('A single data centre can use the electricity of 100,000 households. [F2]', PACK).problems.length, 0);
});

test('invented numbers are caught: digits, money, percentages, spelled-out amounts, wrong citation', () => {
  for (const s of [
    'OpenAI’s model uses 0.5 kWh per 1,000 tokens.',
    'The deal added a $1.5 billion overhead.',
    'Energy rose 42% last year. [F1]',
    'It costs two million dollars a day.',
    'A New England family cut spending by 22 percent.',
    'In 2023 the bill doubled.',
  ]) assert.ok(probs(s).length > 0, s);
});

test('spelled-out numbers count: true ones pass, invented ones do not', () => {
  assert.deepEqual(probs('A typical data centre uses as much electricity as one hundred thousand households. [F2]'), []);
  assert.deepEqual(probs('Data centres took one point five percent of the electricity of the world. [F1]'), []);
  for (const s of ['It cost eleven billion dollars.', 'They hired forty two engineers.', 'Sales rose three times over.', 'It uses two point two gigawatts. [F1]']) assert.ok(probs(s).length, s);
  for (const s of ['Two friends walked in.', 'One question is tiny.', 'The FDIC guarantee covered depositors.'].slice(0, 2)) assert.deepEqual(probs(s), [], s);
  assert.equal(checkSentence('The bank kept its guarantee to savers.', { ...PACK, corpus: 'bank' }).problems.length, 0, 'a guarantee is not a promise of profit');
});

test('a marker alone does not make a sentence a verified claim', () => {
  assert.equal(checkSentence('This matters to everyone. [F1]', PACK).factual, false);
});

test('invented names and quotes are caught; sourced ones pass', () => {
  assert.match(probs('The popular app AskMeNow charges users for this.')[0] || '', /AskMeNow/);
  assert.match(probs('Shares of KPI Green Energy rose after that.')[0] || '', /KPI Green Energy/);
  assert.deepEqual(probs('Then Google published its report.'), []);
  assert.match(probs('He said "the market always pays the patient man" that night.')[0] || '', /quote/);
  assert.deepEqual(probs('He wrote "You have power over your mind" in his notes.'), []);
  assert.deepEqual(namesIn('The bill arrives on Monday in America.'), []);
});

test('plain explanation, structure numbers and Imagine-examples pass', () => {
  for (const s of ['One question is tiny, but nobody asks just one.', 'Rule 3 is about patience.', 'Imagine you save $100 every month for 10 years.', 'So who pays for all of this?']) assert.deepEqual(probs(s), [], s);
});

test('advice and market predictions are refused, in the title too', () => {
  assert.match(probs('Why Gold May Crash Tomorrow—and How to Profit', { title: true })[0] || '', /advice/);
  assert.ok(probs('You should buy gold before it moves.').length);
  assert.ok(probs('Why Gold Could Outrun Tech in 2019', { title: true }).length, 'a year without a source in the title');
});

const filler = 'The power moves through the grid and into the building where the chips are waiting for the next question to arrive. ';
const chapter = (extra = '') => ({ title: 'The meter', text: `${filler.repeat(5)}${extra}` });
const GOOD = { title: 'Who Pays for AI?', intro: 'A question is never free. Someone holds the receipt.', chapters: [1, 2, 3, 4, 5].map(() => chapter('In 2024, data centres used about 415 terawatt-hours. [F1]')), outro: 'Subscribe to follow the money. See you next time.' };

test('a whole script: markers removed, claims listed with their sources', () => {
  const r = checkScript(structuredClone(GOOD), PACK);
  assert.equal(r.status, 'passed', r.problems.join('\n'));
  assert.doesNotMatch(JSON.stringify(r.script), /\[F\d/);
  assert.ok(r.claims.every((c) => c.verification === 'verified' && c.sourceIdx === 0));
  assert.equal(stripMarkers('Up 5%. [F1][F2]'), 'Up 5%.');
});

test('repair drops a bad sentence when enough is left; otherwise it fails and names it', () => {
  const one = structuredClone(GOOD);
  one.chapters[2].text += ' A Texas family saved $420 in a season.';
  const r = checkScript(one, PACK, { repair: true });
  assert.equal(r.status, 'passed');
  assert.equal(r.removed, 1);
  assert.doesNotMatch(r.script.chapters[2].text, /Texas/);
  assert.equal(checkScript(one, PACK).status, 'failed');
  const gutted = structuredClone(GOOD);
  gutted.chapters[0].text = 'Profits rose 42% at one firm. Costs fell 19% at another. Sales hit $3 billion.';
  const g = checkScript(gutted, PACK, { repair: true });
  assert.equal(g.status, 'failed');
  assert.match(g.problems[0], /chapter 1/);
  const badTitle = { ...structuredClone(GOOD), title: 'How 42% Vanished Overnight' };
  assert.equal(checkScript(badTitle, PACK, { repair: true }).status, 'failed', 'a title is never silently changed');
});

test('an empty pack allows no numbers and no names', () => {
  const none = { sources: [], facts: [], corpus: '' };
  assert.ok(checkSentence('It used 415 units.', none).problems.length);
  assert.deepEqual(checkSentence('It used a lot of power.', none).problems, []);
  assert.match(factPromptSection(none), /no numbers and no names/);
});

test('groundedScript: re-asks with the named problems, then passes; keeps the best when it never does', async () => {
  const prompts = [];
  const bad = structuredClone(GOOD);
  bad.title = 'How 42% Vanished';
  const ok = await groundedScript({ prompt: 'WRITE', theme: 't', kit: { label: 'X' }, pack: PACK, write: async (p) => { prompts.push(p); return structuredClone(prompts.length === 1 ? bad : GOOD); } });
  assert.equal(ok.factCheck.status, 'passed');
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /\[F1\] Data centres/);
  assert.match(prompts[1], /rejected these sentences[\s\S]*number 42/);
  assert.ok(ok.claims.length && ok.sources.length === 2);
  const never = await groundedScript({ prompt: 'W', theme: 't', pack: PACK, attempts: 2, write: async () => structuredClone(bad) });
  assert.equal(never.factCheck.status, 'failed');
  assert.ok(never.factCheck.problems.length);
});

test('buildFactPack: Wikipedia + news, dead sources skipped, offline = empty', async () => {
  const calls = [];
  const res = (b, ok = true) => ({ ok, text: async () => b });
  const fetchImpl = async (u) => {
    calls.push(u);
    if (u.includes('list=search')) return res(JSON.stringify({ query: { search: [{ title: 'Data center' }] } }));
    if (u.includes('prop=extracts')) return res(JSON.stringify({ query: { pages: { 1: { title: 'Data center', extract: `Data centers used 415 terawatt-hours of electricity in 2024. ${'Data centers are buildings that hold many computers and cooling machines. '.repeat(8)}` } } } }));
    if (u.includes('gdeltproject')) return res(JSON.stringify({ articles: [{ url: 'https://news.example/a', domain: 'news.example', title: 'Power' }, { url: 'https://dead.example/b', domain: 'dead.example', title: 'x' }] }));
    if (u.includes('news.example')) return res(`<p>${'The utility said data centers drove electricity demand up by 12 percent in the state last year. '.repeat(12)}</p>`);
    throw new Error('down');
  };
  const pack = await buildFactPack({ theme: 'data centers electricity demand', queries: ['data center electricity', 'power demand'], fetchImpl, sleep: async () => {}, env: {} });
  assert.deepEqual(pack.sources.map((s) => s.url), ['https://en.wikipedia.org/wiki/Data_center', 'https://news.example/a']);
  assert.ok(pack.facts.some((f) => /415/.test(f.text)) && pack.facts.some((f) => /12 percent/.test(f.text)));
  assert.equal((await buildFactPack({ theme: 'x', fetchImpl: async () => { throw new Error('network'); }, sleep: async () => {}, env: {} })).facts.length, 0);
  const before = calls.length;
  assert.deepEqual((await buildFactPack({ theme: 'x', fetchImpl, env: { FACT_PACK_OFFLINE: '1' } })).facts, []);
  assert.equal(calls.length, before);
});
