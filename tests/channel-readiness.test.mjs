// "100% ready before anything publishes" (owner, 2026-11-21, FEEDBACK item K).
// A channel publishes only when all 7 checklist items are set through panel
// data (the registry entry + its kit, the cadence row, the template mirror) —
// never from the static brand files. One pure module answers it for the
// engine (discover + pipeline + sweeper) and the panel (chips, checklist,
// Resume lock, flow 409).
// Spec + QA: docs/qa/channel-readiness-qa.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  READINESS_TOTAL,
  READINESS_KEYS,
  STORY_SHAPES,
  channelReadiness,
  readinessFor,
  readinessLine,
  missingLabels,
  parseStoryShape,
  hasChaptersForShape,
  storyShapeOfKit,
} from '../studio/lib/channel-readiness.mjs';

// A channel the owner has fully set up in the panel (7/7).
const readyEntry = (over = {}) => ({
  slug: 'demo-channel',
  label: 'Demo Channel',
  niche: 'Personal finance rules',
  tokenSecretSaved: true,
  cron: '21 3 * * *',
  active: true,
  autopilot: true,
  ...over,
  kit: {
    templateId: 'myth-vs-money',
    templateVersion: '1.0.0',
    storyShape: 'template',
    description: 'Money rules that quietly build wealth.',
    tags: ['personal finance', 'money tips'],
    voice: 'bm_daniel',
    thumbTemplates: ['price-fight', 'ledger', 'coinflip'],
    slots: ['00:05'],
    longSlot: '22:30',
    gateCron: '21 3 * * *',
    ...(over.kit || {}),
  },
});
const readySchedule = () => ({ docDays: ['Thu', 'Sun'], shortDays: ['Mon', 'Tue'] });
const item = (r, key) => r.items.find((i) => i.key === key);

describe('R1 — shape of the answer', () => {
  test('a fully set-up channel is ready 7/7 with seven named items in checklist order', () => {
    const r = channelReadiness({ entry: readyEntry(), schedule: readySchedule() });
    assert.equal(r.ready, true);
    assert.equal(r.done, 7);
    assert.equal(r.total, 7);
    assert.equal(READINESS_TOTAL, 7);
    assert.deepEqual(r.items.map((i) => i.key), ['youtube', 'template', 'storyShape', 'details', 'voice', 'thumbnails', 'schedule']);
    assert.deepEqual(READINESS_KEYS, r.items.map((i) => i.key));
    for (const i of r.items) {
      assert.equal(i.ok, true, i.key);
      assert.equal(typeof i.label, 'string');
      assert.ok(i.label.length > 0 && i.label.length <= 40, `short label: ${i.label}`);
      assert.equal(i.fix, '', 'a done item has no fix text');
    }
    assert.deepEqual(missingLabels(r), []);
  });

  test('every missing item carries plain fix text naming the panel place, plus where it opens', () => {
    const r = channelReadiness({ entry: { slug: 'empty-one' }, schedule: null });
    assert.equal(r.ready, false);
    assert.equal(r.done, 0);
    const places = Object.fromEntries(r.items.map((i) => [i.key, i.place]));
    assert.deepEqual(places, {
      youtube: 'connect', template: 'templates', storyShape: 'templates', details: 'edit', voice: 'edit', thumbnails: 'thumbnails', schedule: 'schedule',
    });
    for (const i of r.items) {
      assert.equal(i.ok, false, i.key);
      assert.match(i.fix, / — /, `fix names where to go: ${i.fix}`);
      assert.doesNotMatch(i.fix, /kit\.|cron|json|registry/i, `no developer words: ${i.fix}`);
    }
    assert.equal(item(r, 'template').fix, 'Pick a template — Channel › Templates');
    assert.equal(item(r, 'details').href, '/channels/add?edit=empty-one');
    assert.equal(item(r, 'voice').href, '/channels/add?edit=empty-one');
    assert.equal(item(r, 'youtube').href, '/channels/add');
    assert.equal(item(r, 'schedule').href, null, 'drawer places open a drawer, not a page');
  });
});

describe('R2 — fail closed', () => {
  for (const [name, entry] of [
    ['undefined', undefined], ['null', null], ['a string', 'money-rulebook'], ['an array', [readyEntry()]],
    ['no slug', { ...readyEntry(), slug: '' }], ['a number slug', { ...readyEntry(), slug: 7 }],
  ]) {
    test(`an unreadable entry (${name}) is not ready`, () => {
      const r = channelReadiness({ entry, schedule: readySchedule() });
      assert.equal(r.ready, false);
      assert.equal(r.done, 0);
      assert.equal(r.total, 7);
      assert.equal(r.items.length, 7);
    });
  }

  test('a malformed kit (string / array) counts as empty, never throws', () => {
    for (const kit of ['oops', [1, 2], 42]) {
      const r = channelReadiness({ entry: { ...readyEntry(), kit }, schedule: readySchedule() });
      assert.equal(r.ready, false);
      assert.equal(item(r, 'template').ok, false);
      assert.equal(item(r, 'youtube').ok, true, 'top-level facts still count');
    }
  });

  test('a getter that throws inside the entry still yields a not-ready answer', () => {
    const evil = readyEntry();
    Object.defineProperty(evil, 'kit', { get() { throw new Error('boom'); } });
    const r = channelReadiness({ entry: evil, schedule: readySchedule() });
    assert.equal(r.ready, false);
    assert.equal(r.total, 7);
  });

  test('no arguments at all', () => {
    assert.equal(channelReadiness().ready, false);
    assert.equal(channelReadiness({}).ready, false);
  });
});

describe('R3 — item 1: YouTube connected', () => {
  test('only tokenSecretSaved === true counts', () => {
    for (const v of [false, undefined, 'true', 1]) {
      const r = channelReadiness({ entry: readyEntry({ tokenSecretSaved: v }), schedule: readySchedule() });
      assert.equal(item(r, 'youtube').ok, false, String(v));
      assert.equal(r.ready, false);
    }
  });
});

describe('R4 — item 2: template assigned', () => {
  test('kit.templateId (the registry mirror the engine can read) counts', () => {
    const r = channelReadiness({ entry: readyEntry({ kit: { templateId: '' } }), schedule: readySchedule() });
    assert.equal(item(r, 'template').ok, false);
    const r2 = channelReadiness({ entry: readyEntry({ kit: { templateId: null } }), schedule: readySchedule() });
    assert.equal(item(r2, 'template').ok, false);
    const r3 = channelReadiness({ entry: readyEntry({ kit: { templateId: '   ' } }), schedule: readySchedule() });
    assert.equal(item(r3, 'template').ok, false);
  });

  test('an explicit assignment argument wins over the kit mirror (null = none)', () => {
    const none = channelReadiness({ entry: readyEntry(), schedule: readySchedule(), assignment: null });
    assert.equal(item(none, 'template').ok, false);
    const row = channelReadiness({ entry: readyEntry({ kit: { templateId: '' } }), schedule: readySchedule(), assignment: { family_id: 'myth-vs-money' } });
    assert.equal(item(row, 'template').ok, true, 'a DB assignment row (family_id) counts');
    const obj = channelReadiness({ entry: readyEntry({ kit: { templateId: '' } }), schedule: readySchedule(), assignment: { templateId: 'x' } });
    assert.equal(item(obj, 'template').ok, true);
  });
});

describe('R5 — item 3: story shape chosen', () => {
  test('hasChapters true/false counts; storyShape "template" counts; nothing else does', () => {
    const cases = [
      [{ storyShape: undefined, hasChapters: true }, true],
      [{ storyShape: undefined, hasChapters: false }, true],
      [{ storyShape: 'template', hasChapters: null }, true],
      [{ storyShape: undefined, hasChapters: null }, false],
      [{ storyShape: undefined, hasChapters: undefined }, false],
      [{ storyShape: 'full', hasChapters: undefined }, false], // the engine reads hasChapters only
      [{ storyShape: 'Template', hasChapters: undefined }, false],
      [{ storyShape: undefined, hasChapters: 'true' }, false],
    ];
    for (const [kit, want] of cases) {
      const r = channelReadiness({ entry: readyEntry({ kit }), schedule: readySchedule() });
      assert.equal(item(r, 'storyShape').ok, want, JSON.stringify(kit));
    }
  });

  test('parseStoryShape / hasChaptersForShape / storyShapeOfKit', () => {
    assert.deepEqual(STORY_SHAPES, ['template', 'full', 'chapters']);
    assert.deepEqual(parseStoryShape('template'), { ok: true, value: 'template' });
    assert.deepEqual(parseStoryShape('full'), { ok: true, value: 'full' });
    assert.deepEqual(parseStoryShape('chapters'), { ok: true, value: 'chapters' });
    assert.equal(parseStoryShape('story').ok, false);
    assert.equal(parseStoryShape(null).ok, false);
    assert.match(parseStoryShape('x').error, /storyShape/);
    assert.equal(hasChaptersForShape('template'), null);
    assert.equal(hasChaptersForShape('full'), false);
    assert.equal(hasChaptersForShape('chapters'), true);
    assert.equal(storyShapeOfKit({ hasChapters: true }), 'chapters');
    assert.equal(storyShapeOfKit({ hasChapters: false }), 'full');
    assert.equal(storyShapeOfKit({ storyShape: 'template', hasChapters: null }), 'template');
    assert.equal(storyShapeOfKit({}), null, 'nothing chosen yet');
    assert.equal(storyShapeOfKit(null), null);
  });
});

describe('R6 — item 4: niche, description and tags', () => {
  test('all three are needed; the fix names exactly what is missing', () => {
    const noDesc = channelReadiness({ entry: readyEntry({ kit: { description: '' } }), schedule: readySchedule() });
    assert.equal(item(noDesc, 'details').ok, false);
    assert.equal(item(noDesc, 'details').fix, 'Add a description — Edit profile');
    const noTags = channelReadiness({ entry: readyEntry({ kit: { tags: [] } }), schedule: readySchedule() });
    assert.equal(item(noTags, 'details').fix, 'Add tags — Edit profile');
    const none = channelReadiness({ entry: readyEntry({ niche: '', kit: { description: ' ', tags: ['  '] } }), schedule: readySchedule() });
    assert.equal(item(none, 'details').fix, 'Add a niche, a description and tags — Edit profile');
  });

  test('kit.niche stands in for the top-level niche', () => {
    const r = channelReadiness({ entry: readyEntry({ niche: '', kit: { niche: 'Stoic wisdom' } }), schedule: readySchedule() });
    assert.equal(item(r, 'details').ok, true);
  });

  test("the channel's own YouTube description and keywords (registry data) count, like the engine", () => {
    const r = channelReadiness({
      entry: readyEntry({ ytDescription: 'From YouTube.', ytKeywords: '"old money" habits', kit: { description: '', tags: [] } }),
      schedule: readySchedule(),
    });
    assert.equal(item(r, 'details').ok, true);
    const junkKeywords = channelReadiness({ entry: readyEntry({ ytKeywords: 'a b', kit: { tags: [] } }), schedule: readySchedule() });
    assert.equal(item(junkKeywords, 'details').ok, false, 'keywords the engine would drop do not count');
  });
});

describe('R7 — item 5: voice chosen', () => {
  test('entry.voice or kit.voice (the engine order); blank does not count', () => {
    assert.equal(item(channelReadiness({ entry: readyEntry({ kit: { voice: '' } }), schedule: readySchedule() }), 'voice').ok, false);
    assert.equal(item(channelReadiness({ entry: readyEntry({ voice: 'am_michael', kit: { voice: '' } }), schedule: readySchedule() }), 'voice').ok, true);
    assert.equal(item(channelReadiness({ entry: readyEntry({ voice: '  ', kit: { voice: undefined } }), schedule: readySchedule() }), 'voice').ok, false);
  });
});

describe('R8 — item 6: thumbnail designs (2–5)', () => {
  test('2 to 5 distinct designs count', () => {
    const t = (thumbTemplates) => item(channelReadiness({ entry: readyEntry({ kit: { thumbTemplates } }), schedule: readySchedule() }), 'thumbnails');
    assert.equal(t(['a']).ok, false);
    assert.equal(t(['a', 'b']).ok, true);
    assert.equal(t(['a', 'b', 'c', 'd', 'e']).ok, true);
    assert.equal(t(['a', 'b', 'c', 'd', 'e', 'f']).ok, false);
    assert.equal(t(['a', 'b', 'c', 'd', 'e', 'f']).fix, 'Keep 5 or fewer thumbnail designs — Channel › Thumbnails');
    assert.equal(t(['a', 'a']).ok, false, 'duplicates count once');
    assert.equal(t(['a', '', ' ']).ok, false, 'blanks never count');
    assert.equal(t('a,b').ok, false, 'not a list');
    assert.equal(t([]).fix, 'Pick 2 to 5 thumbnail designs — Channel › Thumbnails');
  });
});

describe('R9 — item 7: full schedule', () => {
  test('needs an upload day, a Shorts time, a long-video time and a start time', () => {
    const s = (entry, schedule = readySchedule()) => item(channelReadiness({ entry, schedule }), 'schedule');
    assert.equal(s(readyEntry()).ok, true);
    assert.equal(s(readyEntry(), { docDays: [], shortDays: [] }).fix, 'Set upload days — Channel › Schedule');
    assert.equal(s(readyEntry(), null).ok, false, 'no schedule row = no upload days');
    assert.equal(s(readyEntry(), { docDays: ['Funday'] }).ok, false, 'only real day names count');
    assert.equal(s(readyEntry(), { shortDays: ['Wed'] }).ok, true, 'one Shorts day is enough');
    assert.equal(s(readyEntry({ kit: { slots: [] } })).fix, 'Set the Shorts go-public time — Channel › Schedule');
    assert.equal(s(readyEntry({ kit: { slots: ['25:00'] } })).ok, false, 'a bad time does not count');
    assert.equal(s(readyEntry({ kit: { longSlot: '' } })).fix, 'Set the long-video go-public time — Channel › Schedule');
    assert.equal(s(readyEntry({ cron: '', kit: { gateCron: '' } })).fix, 'Set the autopilot start time — Channel › Schedule');
    assert.equal(s(readyEntry({ cron: '*/5 * * * *', kit: { gateCron: '' } })).ok, false, 'only the daily start form counts');
    assert.equal(s(readyEntry({ cron: '', kit: { gateCron: '13 2 * * *' } })).ok, true, 'kit.gateCron is the durable copy');
    assert.equal(
      s(readyEntry({ cron: '', kit: { slots: [], longSlot: '', gateCron: '' } }), {}).fix,
      'Set upload days, the Shorts go-public time, the long-video go-public time and the autopilot start time — Channel › Schedule',
    );
  });

  test('top-level slots win over kit.slots (the engine order)', () => {
    const s = (entry) => item(channelReadiness({ entry, schedule: readySchedule() }), 'schedule');
    assert.equal(s(readyEntry({ slots: ['21:00'], kit: { slots: [] } })).ok, true);
    assert.equal(s(readyEntry({ slots: [], kit: { slots: ['21:00'] } })).ok, true, 'an empty top-level list falls through');
    assert.equal(s(readyEntry({ slots: ['nope'], kit: { slots: ['21:00'] } })).ok, false, 'the engine would use the bad top-level list');
  });
});

describe('R10 — readinessFor reads the engine files', () => {
  const registry = { channels: [readyEntry(), { slug: 'half', tokenSecretSaved: true }] };
  const cadence = { 'demo-channel': readySchedule() };

  test('finds the entry and its cadence row by slug', () => {
    assert.equal(readinessFor({ registry, cadence, slug: 'demo-channel' }).ready, true);
    const half = readinessFor({ registry, cadence, slug: 'half' });
    assert.equal(half.ready, false);
    assert.equal(half.done, 1);
  });

  test('unknown slug, broken registry or broken cadence = not ready', () => {
    assert.equal(readinessFor({ registry, cadence, slug: 'nope' }).ready, false);
    assert.equal(readinessFor({ registry: null, cadence, slug: 'demo-channel' }).ready, false);
    assert.equal(readinessFor({ registry: { channels: 'x' }, cadence, slug: 'demo-channel' }).ready, false);
    assert.equal(readinessFor({ registry, cadence: null, slug: 'demo-channel' }).ready, false);
    assert.equal(readinessFor({ registry, cadence: 'x', slug: 'demo-channel' }).ready, false);
  });
});

describe('R11 — the engine log line', () => {
  test('names the channel, the score and every missing item', () => {
    const r = channelReadiness({ entry: readyEntry({ kit: { templateId: '', voice: '' } }), schedule: readySchedule() });
    assert.equal(
      readinessLine('demo-channel', r),
      '[readiness] demo-channel: NOT READY to publish (5/7) — missing: Video template picked; Voice chosen — skipped (finish it in the panel)',
    );
    const ok = channelReadiness({ entry: readyEntry(), schedule: readySchedule() });
    assert.equal(readinessLine('demo-channel', ok), '[readiness] demo-channel: ready to publish (7/7)');
  });
});

describe('R12 — the module stays pure (Studio deploys without the repo root)', () => {
  test('no imports at all', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('studio/lib/channel-readiness.mjs', 'utf8');
    assert.doesNotMatch(src, /^\s*import\s/m);
    assert.doesNotMatch(src, /require\(/);
  });

  test('no per-channel names in the code (owner: no static maps)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('studio/lib/channel-readiness.mjs', 'utf8');
    assert.doesNotMatch(src, /money-rulebook|quotequarry|investors-compass|debt-free-doctrine|yt-bot/);
  });
});
