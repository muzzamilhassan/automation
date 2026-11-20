// Live fix wave C1 (T1-28, T4-19): one way to show a channel's name and
// initials in the shell. Pure helper (studio/lib/channel-display.mjs) so any
// page can reuse it later. QA: docs/qa/live-fix-wave-c1-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelDisplayName, channelInitials, displayChannel, isKnownChannelSlug } from '../studio/lib/channel-display.mjs';

test('T1-28 EARS: WHEN a stored label is ALL CAPS THEN the shell shows it in Title Case', () => {
  assert.equal(channelDisplayName('THE MONEY RULEBOOK'), 'The Money Rulebook');
  assert.equal(channelDisplayName('QUOTE QUARRY'), 'Quote Quarry');
  assert.equal(channelDisplayName("INVESTOR'S COMPASS"), "Investor's Compass");
  assert.equal(channelDisplayName('DEBT-FREE DOCTRINE'), 'Debt-Free Doctrine');
  // small joining words stay small unless they start the name
  assert.equal(channelDisplayName('THE ART OF THE DEAL'), 'The Art of the Deal');
  assert.equal(channelDisplayName('  SLEEP   ARCHITECT '), 'Sleep Architect');
});

test('T1-28 EARS: WHEN a stored label is mixed case THEN it is shown exactly as stored', () => {
  assert.equal(channelDisplayName('Debt-Free Doctrine'), 'Debt-Free Doctrine');
  assert.equal(channelDisplayName('QuoteQuarry'), 'QuoteQuarry');
  assert.equal(channelDisplayName('Deep Work OS'), 'Deep Work OS');
  assert.equal(channelDisplayName('yt-bot'), 'yt-bot');
});

test('channelDisplayName: empty or odd input falls back to the slug, never throws', () => {
  assert.equal(channelDisplayName('', 'money-rulebook'), 'money-rulebook');
  assert.equal(channelDisplayName(null, 'qq'), 'qq');
  assert.equal(channelDisplayName(undefined), '');
  assert.equal(channelDisplayName('123 456'), '123 456', 'no letters → unchanged');
});

test('T1-28 EARS: initials come from significant words, skipping "The"', () => {
  assert.equal(channelInitials('THE MONEY RULEBOOK'), 'MR');
  assert.equal(channelInitials('The Money Rulebook'), 'MR');
  assert.equal(channelInitials('QUOTE QUARRY'), 'QQ');
  assert.equal(channelInitials("INVESTOR'S COMPASS"), 'IC');
  assert.equal(channelInitials('Debt-Free Doctrine'), 'DF');
  assert.equal(channelInitials('QuoteQuarry'), 'QQ', 'camelCase words count');
  assert.equal(channelInitials('The Art of the Deal'), 'AD');
});

test('channelInitials: one word gives its first two letters; empty falls back to the slug', () => {
  assert.equal(channelInitials('Longevity'), 'LO');
  assert.equal(channelInitials('', 'yt-bot'), 'YB');
  assert.equal(channelInitials('The'), 'TH', 'a name that is only "The" still gets initials');
  assert.equal(channelInitials('', ''), '');
  assert.equal(channelInitials(null), '');
});

test('displayChannel: a brand row gets a display label + short, other fields kept', () => {
  const row = { slug: 'money-rulebook', label: 'THE MONEY RULEBOOK', short: 'TH', accent: '#fff' };
  assert.deepEqual(displayChannel(row), { slug: 'money-rulebook', label: 'The Money Rulebook', short: 'MR', accent: '#fff' });
  assert.deepEqual(displayChannel({ slug: 'x' }), { slug: 'x', label: 'x', short: 'X' });
  assert.equal(displayChannel(null), null);
});

test('T1-24: isKnownChannelSlug — a channel page exists for any brand or registry slug', () => {
  const legacy = { quotequarry: { label: 'QUOTE QUARRY' }, 'old-brand': { active: false } };
  const registry = [{ slug: 'yt-bot', status: 'paused', active: false }, { slug: 'money-rulebook' }];
  assert.equal(isKnownChannelSlug('quotequarry', legacy, registry), true);
  assert.equal(isKnownChannelSlug('old-brand', legacy, registry), true, 'a dormant brand still has a page');
  assert.equal(isKnownChannelSlug('yt-bot', legacy, registry), true, 'a paused registry channel still has a page');
  assert.equal(isKnownChannelSlug('not-a-real-channel', legacy, registry), false);
  assert.equal(isKnownChannelSlug('', legacy, registry), false);
  assert.equal(isKnownChannelSlug('__proto__', legacy, registry), false);
  assert.equal(isKnownChannelSlug('constructor', {}, []), false);
  assert.equal(isKnownChannelSlug('x', null, null), false);
});

test('short-token all-caps labels are acronyms/handles and stay as typed (YT-BOT, not Yt-Bot)', async () => {
  const { channelDisplayName } = await import('../studio/lib/channel-display.mjs');
  assert.equal(channelDisplayName('YT-BOT'), 'YT-BOT');
  assert.equal(channelDisplayName('THE MONEY RULEBOOK'), 'The Money Rulebook');
});
