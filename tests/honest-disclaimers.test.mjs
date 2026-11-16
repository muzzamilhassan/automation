// Option B2a (owner 2026-11-16; audit cg-01). Finance templates declare
// disclaimers like "Market commentary from cited sources; not financial
// advice." and the doc generator saves sources: [] — so every upload claimed
// sources that did not exist. appendDisclaimers now rewrites the "from cited
// sources" claim into honest wording when the video has no recorded sources,
// and lists the sources when it does. Spec + QA: docs/qa/honest-disclaimers-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendDisclaimers, honestDisclaimer } from '../lib/review-seams.mjs';

test('honestDisclaimer rewrites a cited-sources claim, keeps "not financial advice"', () => {
  const out = honestDisclaimer('Market commentary from cited sources; not financial advice.');
  assert.doesNotMatch(out, /cited sources/i);
  assert.match(out, /general education/);
  assert.match(out, /verify before acting/);
  assert.match(out, /not financial advice/);
});

test('honestDisclaimer handles "summarized from cited sources" and leaves other text alone', () => {
  assert.doesNotMatch(honestDisclaimer('Science summarized from cited sources.'), /cited sources/i);
  assert.equal(honestDisclaimer('Not financial advice.'), 'Not financial advice.');
});

test('no sources -> the appended disclaimers make no cited-sources claim', () => {
  const d = appendDisclaimers('Desc', ['Market commentary from cited sources; not financial advice.']);
  assert.match(d, /^Desc\n\n/);
  assert.doesNotMatch(d, /cited sources/i);
});

test('with sources -> disclaimers verbatim plus a Sources list', () => {
  const d = appendDisclaimers('Desc', ['Market commentary from cited sources; not financial advice.'], {
    sources: [{ title: 'Fed — Consumer Credit G.19', url: 'https://www.federalreserve.gov/releases/g19/current/' }],
  });
  assert.match(d, /Market commentary from cited sources; not financial advice\./);
  assert.match(d, /Sources:\n- Fed — Consumer Credit G\.19 — https:\/\/www\.federalreserve\.gov\/releases\/g19\/current\//);
});

test('no declared disclaimers -> description unchanged (byte-identical, as before)', () => {
  assert.equal(appendDisclaimers('Desc', null), 'Desc');
  assert.equal(appendDisclaimers('Desc', []), 'Desc');
});
