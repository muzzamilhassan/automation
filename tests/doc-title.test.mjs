// Doc titles were `${title} | ${authority}`.slice(0, 95) — cut mid-word on
// YouTube ("… | Investing psychology & marke", investors-compass 2026-11-15).
// docTitleFor keeps the suffix only when it fits YouTube's 100-char limit,
// else drops it, else trims the title at a word boundary with an ellipsis.
// Spec + QA: docs/qa/doc-title-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { docTitleFor, YT_TITLE_MAX } from '../lib/titles.mjs';

test('YouTube title limit is 100 characters', () => {
  assert.equal(YT_TITLE_MAX, 100);
});

test('short title keeps the authority suffix', () => {
  assert.equal(docTitleFor('The Illusion of a Risk-Free Trade', 'Market Wisdom'), 'The Illusion of a Risk-Free Trade | Market Wisdom');
});

test('a suffix that would overflow is dropped whole — never cut mid-word', () => {
  const title = 'The Illusion of a ‘Risk‑Free’ Trade: What Buffett Would Never Do';
  const out = docTitleFor(title, 'Investing psychology & market wisdom Wisdom');
  assert.equal(out, title);
  assert.ok(out.length <= 100);
});

test('an over-long title is trimmed at a word boundary with an ellipsis', () => {
  const title = 'Why '.repeat(30).trim();
  const out = docTitleFor(title, 'Market Wisdom');
  assert.ok(out.length <= 100, out.length);
  assert.ok(out.endsWith('…'));
  assert.doesNotMatch(out, /Wh…$/, 'not cut inside a word');
});

test('no authority -> just the title', () => {
  assert.equal(docTitleFor('A Title', undefined), 'A Title');
  assert.equal(docTitleFor('A Title', ''), 'A Title');
});

test('wiring: yt-deepdive builds every doc title through docTitleFor', () => {
  const src = fs.readFileSync('yt-deepdive.mjs', 'utf8');
  assert.doesNotMatch(src, /\$\{script\.title\} \| \$\{b\.authority\}/, 'no raw concatenation left');
  assert.match(src, /const docTitle = docTitleFor\(script\.title, b\.authority\)/);
});
