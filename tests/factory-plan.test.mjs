// "Ask the factory" (2026-11-23, research/creator-city-agent-factory-2026-11-23.md
// §5 item 9 + owner decision d) — the pure planner studio/lib/factory-plan.mjs.
// EARS: the AI only fills {channel, lane, topic}; code builds the fixed 7-step
// plan; anything off-schema or naming a channel outside the real list is
// rejected; one sanitiser serves the panel and the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeFactoryTopic, normalizeLane, factoryTopicFor, factoryChannels, buildFactoryPrompt,
  parseFactoryReply, ruleParse, buildPlan, revalidatePlan, laneBlocker, dispatchInputs, slotPublishISO,
  slotScriptBlocker, FACTORY_TOPIC_MAX,
} from '../studio/lib/factory-plan.mjs';
import { STATION_KEYS } from '../studio/lib/stations.mjs';
import { nextSlotISO } from '../lib/schedule.mjs';
import fs from 'node:fs';

const REGISTRY = {
  channels: [
    { slug: 'money-rulebook', label: 'The Money Rulebook', active: true, kit: { templateId: 'gated-t', slots: ['00:05'], longSlot: '22:30' } },
    { slug: 'quotequarry', label: 'Quote Quarry', kit: { templateId: 'open-t', slots: ['09:00', '15:00'] } },
    { slug: 'switched-off', label: 'Switched Off', active: false, kit: {} },
  ],
};
const CADENCE = { 'money-rulebook': { shortsSource: 'clips' }, quotequarry: { shortsSource: 'generated' } };
const META = { 'gated-t': { safety: { review_required: ['finance'] } }, 'open-t': { safety: { review_required: [] } } };
const CHANNELS = factoryChannels(REGISTRY, CADENCE, META);
const NOON = new Date('2026-11-23T12:00:00Z'); // a Monday

test('EARS: the channel list is the real registry list — switched-off channels never appear', () => {
  assert.deepEqual(CHANNELS.map((c) => c.slug), ['money-rulebook', 'quotequarry']);
  const mr = CHANNELS[0];
  assert.equal(mr.shortsSource, 'clips');
  assert.equal(mr.reviewGate, true);
  assert.equal(mr.longSlot, '22:30');
  assert.equal(CHANNELS[1].reviewGate, false);
  assert.equal(factoryChannels(null, null).length, 0);
});

test('EARS: the sanitiser strips control chars, newlines, quotes and backslashes, and caps the length', () => {
  assert.equal(sanitizeFactoryTopic('credit-card\nfloat\t"tricks"'), 'credit-card float tricks');
  const LS = String.fromCharCode(0x2028); // Unicode line separator
  const NUL = String.fromCharCode(0);
  assert.equal(sanitizeFactoryTopic("it's `rm -rf /` \ “smart”" + NUL + 'x' + LS + 'y'), 'its rm -rf / smart x y');
  assert.equal(sanitizeFactoryTopic('--force everything'), 'force everything');
  assert.equal(sanitizeFactoryTopic('x'.repeat(500)).length, FACTORY_TOPIC_MAX);
  assert.equal(sanitizeFactoryTopic('  '), '');
  assert.equal(sanitizeFactoryTopic('ab'), '');
  assert.equal(sanitizeFactoryTopic(42), '');
  assert.equal(sanitizeFactoryTopic(null), '');
});

test('EARS: the engine reads FACTORY_TOPIC only for its own lane; unset env = null (every lane picks its own topic)', () => {
  assert.equal(factoryTopicFor('short', {}), null);
  assert.equal(factoryTopicFor('doc', {}), null);
  assert.equal(factoryTopicFor('doc', { FACTORY_TOPIC: 'float', FACTORY_LANE: 'doc' }), 'float');
  assert.equal(factoryTopicFor('short', { FACTORY_TOPIC: 'float', FACTORY_LANE: 'doc' }), null);
  assert.equal(factoryTopicFor('short', { FACTORY_TOPIC: 'float' }), 'float', 'blank lane = short');
  assert.equal(factoryTopicFor('short', { FACTORY_TOPIC: 'a\nb"c' }), 'a bc');
  assert.equal(factoryTopicFor('short', { FACTORY_TOPIC: '  ' }), null);
  assert.equal(normalizeLane('DOC'), 'doc');
  assert.equal(normalizeLane('long'), null);
});

test('EARS: the prompt lists only real channel slugs and asks for exactly three keys', () => {
  const { system, user } = buildFactoryPrompt({ text: 'Make a Money Rulebook video about float', channels: CHANNELS });
  assert.match(system, /money-rulebook \(The Money Rulebook\)/);
  assert.doesNotMatch(system, /switched-off/);
  assert.match(system, /"channel": string, "lane": "short" \| "doc", "topic": string/);
  assert.match(user, /json/);
});

test('EARS: a valid AI reply is accepted; the topic comes back sanitised', () => {
  const r = parseFactoryReply('{"channel":"money-rulebook","lane":"doc","topic":"credit-card \\"float\\""}', CHANNELS);
  assert.deepEqual(r, { ok: true, value: { channel: 'money-rulebook', lane: 'doc', topic: 'credit-card float' } });
  const blank = parseFactoryReply({ channel: '', lane: '', topic: 'float' }, CHANNELS);
  assert.deepEqual(blank.value, { channel: null, lane: null, topic: 'float' });
});

test('EARS: an off-schema AI reply is rejected — never trusted', () => {
  const bad = [
    'not json',
    '[]',
    '{"channel":"money-rulebook","lane":"doc"}',
    '{"channel":"money-rulebook","lane":"doc","topic":"x y z","steps":[]}',
    '{"channel":"money-rulebook","lane":"doc","topic":5}',
    '{"channel":"made-up-channel","lane":"doc","topic":"float"}',
    '{"channel":"switched-off","lane":"doc","topic":"float"}',
    '{"channel":"money-rulebook","lane":"livestream","topic":"float"}',
    '{"channel":"money-rulebook","lane":"doc","topic":"\\n"}',
  ];
  for (const raw of bad) assert.equal(parseFactoryReply(raw, CHANNELS).ok, false, raw);
});

test('EARS: without the AI, simple sentences are planned by rules', () => {
  const a = ruleParse('Make a Money Rulebook video about credit-card float', CHANNELS);
  assert.deepEqual(a.value, { channel: 'money-rulebook', lane: null, topic: 'credit-card float' });
  const b = ruleParse('Make a documentary for the money rulebook on index funds.', CHANNELS);
  assert.deepEqual(b.value, { channel: 'money-rulebook', lane: 'doc', topic: 'index funds' });
  const c = ruleParse('quote quarry short about stoic mornings', CHANNELS);
  assert.deepEqual(c.value, { channel: 'quotequarry', lane: 'short', topic: 'stoic mornings' });
  const d = ruleParse('something about nothing', CHANNELS);
  assert.equal(d.value.channel, null);
  assert.equal(ruleParse('', CHANNELS).ok, false);
});

test('EARS: the plan is the fixed 7 stations in order, built by code', () => {
  const r = buildPlan({ channel: 'quotequarry', lane: 'short', topic: 'stoic mornings' }, CHANNELS, { now: NOON });
  assert.equal(r.ok, true);
  assert.deepEqual(r.plan.steps.map((s) => s.key), [...STATION_KEYS]);
  assert.equal(r.plan.steps.length, 7);
  assert.match(r.plan.steps[0].note, /Given by you: stoic mornings/);
  // yt-daily puts the topic in slot INDEX 0 (09:00), not the next clock slot
  assert.equal(r.plan.when, 'next slot tomorrow 09:00 UTC');
  assert.equal(r.plan.publishAt, '2026-11-24T09:00:00Z');
  assert.match(r.plan.steps[2].note, /no review gate/);
  assert.ok(r.plan.warnings.some((w) => /first Short/.test(w)));
});

test('EARS: a clips-source channel always plans a documentary, and the gated script waits for the owner', () => {
  const r = buildPlan({ channel: 'money-rulebook', lane: 'short', topic: 'float' }, CHANNELS, { now: NOON });
  assert.equal(r.plan.lane, 'doc');
  assert.equal(r.plan.when, 'next slot today 22:30 UTC');
  assert.equal(r.plan.publishAt, '2026-11-23T22:30:00Z');
  assert.match(r.plan.steps.find((s) => s.key === 'approval').note, /waits for your OK/);
  assert.ok(r.plan.warnings.some((w) => /clips/.test(w)));
  const blank = buildPlan({ channel: 'money-rulebook', lane: null, topic: 'float' }, CHANNELS, { now: NOON });
  assert.equal(blank.plan.lane, 'doc');
});

test('EARS: no channel or an unknown channel gives a plain reason, no plan', () => {
  assert.match(buildPlan({ channel: null, lane: 'doc', topic: 'float' }, CHANNELS).error, /Say which channel/);
  assert.equal(buildPlan({ channel: 'made-up', lane: 'doc', topic: 'float' }, CHANNELS).ok, false);
  assert.equal(buildPlan({ channel: 'quotequarry', lane: 'doc', topic: '' }, CHANNELS).ok, false);
});

test('EARS: Start rebuilds the plan from the three fields only — client steps are ignored, bad input refused', () => {
  const ok = revalidatePlan({ channel: 'money-rulebook', lane: 'doc', topic: 'float', steps: [{ key: 'evil' }] }, CHANNELS, { now: NOON });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.plan.steps.map((s) => s.key), [...STATION_KEYS]);
  assert.deepEqual(dispatchInputs(ok.plan), { channel: 'money-rulebook', topic: 'float', lane: 'doc' });
  assert.equal(revalidatePlan({ channel: 'made-up', lane: 'doc', topic: 'float' }, CHANNELS).ok, false);
  assert.equal(revalidatePlan({ channel: 'money-rulebook', lane: 'doc', topic: 'float"; rm -rf /' }, CHANNELS).ok, false);
  assert.equal(revalidatePlan({ channel: 'money-rulebook', lane: 'doc', topic: 'x'.repeat(161) }, CHANNELS).ok, false);
  assert.equal(revalidatePlan({ channel: 'money-rulebook', lane: 'long', topic: 'float' }, CHANNELS).ok, false);
  assert.equal(revalidatePlan({ channel: 'money-rulebook', lane: 'short', topic: 'float' }, CHANNELS).ok, false, 'a clips channel cannot start a short');
  assert.equal(revalidatePlan(null, CHANNELS).ok, false);
});

test('EARS: a run that would do nothing today is refused with a plain reason', () => {
  assert.equal(laneBlocker({ lane: 'doc', label: 'MR', state: {}, now: NOON }), null);
  assert.equal(laneBlocker({ lane: 'short', label: 'QQ', state: null, now: NOON }), null);
  assert.match(laneBlocker({ lane: 'short', label: 'QQ', state: { lastRunDate: '2026-11-23' }, now: NOON }), /already made today/);
  assert.match(laneBlocker({ lane: 'short', label: 'QQ', state: {}, now: new Date('2026-11-22T12:00:00Z') }), /Sunday/);
  assert.match(laneBlocker({ lane: 'doc', label: 'MR', state: { pausedUntil: '2026-11-30' }, now: NOON }), /paused until/);
});

test('EARS: the plan time is the ENGINE time — slotPublishISO matches lib/schedule.mjs nextSlotISO (35-min lead) everywhere', () => {
  const slots = ['00:05', '09:00', '12:20', '12:40', '15:00', '22:30', '23:59'];
  for (let t = Date.parse('2026-11-23T00:00:00Z'); t < Date.parse('2026-11-25T00:00:00Z'); t += 7 * 60_000) {
    const now = new Date(t);
    for (const hhmm of slots) assert.equal(slotPublishISO(hhmm, now), nextSlotISO(hhmm, now), `${hhmm} @ ${now.toISOString()}`);
  }
  assert.equal(slotPublishISO('25:00', NOON), null);
  assert.equal(slotPublishISO(undefined, NOON), null);
  // yt-daily's own copy (the Shorts publishAt) is the same rule as lib/schedule.mjs
  const NL = String.fromCharCode(10);
  const body = (src, name) => src.slice(src.indexOf(`function ${name}(`)).split(`${NL}}${NL}`)[0].replace(/^export /, '');
  const daily = fs.readFileSync('yt-daily.mjs', 'utf8');
  assert.equal(body(daily, 'nextSlotISO'), body(fs.readFileSync('lib/schedule.mjs', 'utf8'), 'nextSlotISO'));
  assert.match(daily, /const publishAt = nextSlotISO\(b\.slots\[i\]\);/);
});

test('EARS: a documentary is refused when this channel’s doc already shipped today', () => {
  assert.match(laneBlocker({ lane: 'doc', label: 'MR', state: { deepdiveDate: '2026-11-23' }, now: NOON }), /already shipped today’s documentary/);
  assert.equal(laneBlocker({ lane: 'doc', label: 'MR', state: { deepdiveDate: '2026-11-22' }, now: NOON }), null);
  assert.equal(laneBlocker({ lane: 'short', label: 'QQ', state: { deepdiveDate: '2026-11-23' }, now: NOON }), null);
});

test('EARS: a script already on today’s slot (waiting, approved or rejected) refuses Start — the topic would be dropped', () => {
  const at = (status, mins) => ({ status, created_at: new Date(NOON.getTime() - mins * 60_000).toISOString() });
  assert.equal(slotScriptBlocker({ scripts: [], label: 'MR' }), null);
  assert.equal(slotScriptBlocker({ scripts: [at('consumed', 5)], label: 'MR' }), null);
  assert.equal(slotScriptBlocker({ scripts: [at('draft', 5)], label: 'MR' }), null);
  assert.match(slotScriptBlocker({ scripts: [at('awaiting_review', 5)], label: 'MR' }), /already has a script waiting for your OK/);
  assert.match(slotScriptBlocker({ scripts: [at('approved', 5)], label: 'MR' }), /already has an approved script/);
  assert.match(slotScriptBlocker({ scripts: [at('rejected', 5)], label: 'MR' }), /rejected/);
  // newest first, like the gate (scriptsForSlot orders created_at DESC)
  assert.equal(slotScriptBlocker({ scripts: [at('consumed', 1), at('awaiting_review', 50)], label: 'MR' }), null);
  assert.match(slotScriptBlocker({ scripts: null, label: 'MR' }), /couldn’t check/i);
});

test('EARS: a factory documentary never claims to re-make Shorts; a gated generated channel warns the day’s Shorts wait for the review', () => {
  const reg = { channels: [{ slug: 'gen', label: 'Gen', kit: { templateId: 'gated-t', slots: ['09:00'], longSlot: '20:00' } }] };
  const chans = factoryChannels(reg, { gen: { shortsSource: 'generated' } }, META);
  const r = buildPlan({ channel: 'gen', lane: 'doc', topic: 'float' }, chans, { now: NOON });
  assert.equal(r.plan.lane, 'doc');
  assert.ok(!r.plan.warnings.some((w) => /made again|forced/i.test(w)));
  assert.ok(r.plan.warnings.some((w) => /only the documentary/.test(w)));
  assert.ok(r.plan.warnings.some((w) => /Shorts for today wait/.test(w)));
});
