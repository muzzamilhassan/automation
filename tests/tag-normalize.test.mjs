// live fix wave B2 (T4-07) — ONE pure tag normaliser for the wizard draft
// path AND the SEO-tags input. EARS:
//   WHEN tags arrive as a list whose items contain commas, the system SHALL
//     split them so every comma piece is its own tag.
//   The system SHALL trim, lowercase and de-duplicate tags, and drop empty
//     pieces and fragments shorter than 2 characters.
//   The system SHALL cap tags at the YouTube limit (500 characters, counted
//     the YouTube way) and at TAG_LIMITS.maxCount tags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTags, tagsToField, tagCharCount, TAG_LIMITS } from '../studio/lib/tag-normalize.mjs';

test('T4-07: list items that contain commas are split into separate tags', () => {
  const out = normalizeTags(['timeless wisdom, self-mastery & human psychology', 'timeless wisdom, self-mastery explained']);
  assert.deepEqual(out, ['timeless wisdom', 'self-mastery & human psychology', 'self-mastery explained']);
});

test('T4-07: the 18-tag duplicate case from the live test collapses to unique tags', () => {
  const field = 'timeless wisdom, self-mastery & human psychology, timeless, wisdom, self, mastery, human, psychology, timeless wisdom, self-mastery & human psychology explained, timeless wisdom, self-mastery & human psychology habits, timeless wisdom, self-mastery & human psychology for beginners, timeless wisdom, self-mastery & human psychology mindset, timeless wisdom, self-mastery & human psychology rules';
  const out = normalizeTags(field);
  assert.equal(out.filter((t) => t === 'timeless wisdom').length, 1, '"timeless wisdom" appears once, not 6 times');
  assert.equal(new Set(out).size, out.length, 'no duplicates at all');
  assert.ok(out.length <= TAG_LIMITS.maxCount);
});

test('T4-07: trims, lowercases, dedupes case-insensitively, drops empties and 1-char fragments', () => {
  assert.deepEqual(normalizeTags('  Money ,money, MONEY ,, a, #Habits,   quiet   luxury  '), ['money', 'habits', 'quiet luxury']);
  assert.deepEqual(normalizeTags(''), []);
  assert.deepEqual(normalizeTags(null), []);
  assert.deepEqual(normalizeTags([' ', ',', 'x']), []);
});

test('T4-07: YouTube-style character count — commas between tags, quotes around multi-word tags', () => {
  assert.equal(tagCharCount(['money']), 5);
  assert.equal(tagCharCount(['money', 'quiet luxury']), 5 + 1 + 12 + 2);
  assert.equal(tagCharCount([]), 0);
});

test('T4-07: capped at 500 characters and at the max tag count', () => {
  const many = Array.from({ length: 40 }, (_, i) => `tag number ${i}`);
  const capped = normalizeTags(many);
  assert.equal(capped.length, TAG_LIMITS.maxCount);
  const long = Array.from({ length: 14 }, (_, i) => `${'x'.repeat(40)} ${i}`);
  const out = normalizeTags(long);
  assert.ok(tagCharCount(out) <= TAG_LIMITS.maxChars, `count ${tagCharCount(out)} must be <= 500`);
  assert.ok(out.length < long.length, 'tags past the 500-char budget are dropped, not cut mid-word');
  assert.equal(TAG_LIMITS.maxChars, 500);
});

test('T4-07: an explicit smaller maxCount is honoured', () => {
  assert.equal(normalizeTags('a1, b1, c1, d1', { maxCount: 2 }).length, 2);
});

test('T4-07: tagsToField gives the comma field the wizard input shows', () => {
  assert.equal(tagsToField(['Money', 'money', 'quiet luxury, old money']), 'money, quiet luxury, old money');
  assert.equal(tagsToField(''), '');
});
