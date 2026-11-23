// Creator City — Station drawer (research §5 item 7, 2026-11-23). The pure
// station → settings mapping, the live-data facts, the "Last 5" history
// shaping (studio/lib/station-settings.mjs) and the Neon read seam
// (makeJobsRead().loadStationHistory, studio/lib/jobs-read.mjs) with an
// injected fake client. EARS criteria in the test names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATION_SETTINGS, settingsFor, factSources, stationFacts, reviewGateOf,
  historyRows, historyView, historyUrl, parseHistoryQuery, HISTORY_LIMIT,
  panelSources, panelSourceOf, sourceState, panelAccess, factsFailed, OWNER_ONLY,
} from '../studio/lib/station-settings.mjs';
import { makeJobsRead } from '../studio/lib/jobs-read.mjs';
import { STATIONS, STATION_KEYS, STATE_WORD } from '../studio/lib/stations.mjs';

const MANAGE_KEYS = ['schedule', 'templates', 'thumbnails', 'voice', 'keys', 'routing']; // ChannelDrawers CHANNEL_DRAWERS keys

// ------------------------------------------------------------ the mapping
test('WHEN any of the 7 stations is asked for THEN it has a title (its station label), sections and a manage section', () => {
  assert.deepEqual(Object.keys(STATION_SETTINGS).sort(), [...STATION_KEYS].sort());
  for (const { key, label } of STATIONS) {
    const s = settingsFor(key);
    assert.equal(s.key, key);
    assert.equal(s.title, label);
    assert.ok(Array.isArray(s.sections) && s.sections.length >= 1, key);
    assert.ok(s.manageSection === null || MANAGE_KEYS.includes(s.manageSection), key);
  }
});

test('WHEN an unknown station is asked for THEN settingsFor answers null (never a guessed station)', () => {
  assert.equal(settingsFor('nope'), null);
  assert.equal(settingsFor(undefined), null);
  assert.equal(settingsFor('__proto__'), null);
});

test('WHEN a station reuses an existing setting THEN it points at the existing Manage drawer / panel, never a new one', () => {
  for (const key of STATION_KEYS) {
    for (const sec of settingsFor(key).sections) {
      assert.ok(['facts', 'panel', 'actions'].includes(sec.kind), `${key}: ${sec.kind}`);
      if (sec.kind === 'panel') assert.ok(MANAGE_KEYS.includes(sec.drawer), `${key} panel ${sec.drawer}`);
      if (sec.kind === 'actions') {
        for (const a of sec.items) {
          assert.ok(['manage', 'link', 'edit'].includes(a.type), `${key}: ${a.type}`);
          if (a.type === 'manage') assert.ok(MANAGE_KEYS.includes(a.drawer), `${key}: ${a.drawer}`);
          if (a.type === 'link') assert.match(a.href, /^\/[a-z]/);
          assert.ok(typeof a.label === 'string' && a.label.length <= 20, `${key}: short label`);
        }
      }
    }
  }
  assert.equal(settingsFor('voice').sections.find((s) => s.kind === 'panel').drawer, 'voice');
  assert.equal(settingsFor('upload').sections.find((s) => s.kind === 'panel').drawer, 'schedule');
  const drawersOf = (k) => settingsFor(k).sections.filter((s) => s.kind === 'actions').flatMap((s) => s.items).filter((a) => a.type === 'manage').map((a) => a.drawer);
  assert.deepEqual(drawersOf('script').sort(), ['routing', 'templates']);
  assert.deepEqual(drawersOf('render'), ['templates']);
  assert.deepEqual(drawersOf('thumbnail'), ['thumbnails']);
  assert.ok(drawersOf('approval').includes('templates'), 'the review gate follows the assigned template');
  const linksOf = (k) => settingsFor(k).sections.filter((s) => s.kind === 'actions').flatMap((s) => s.items).filter((a) => a.type === 'link').map((a) => a.href);
  assert.ok(linksOf('topic').includes('/topics'));
  assert.ok(linksOf('approval').includes('/review'));
});

test('WHEN a station shows facts THEN factSources names only the live sources it needs', () => {
  assert.deepEqual(factSources('topic'), ['profile']);
  assert.deepEqual(factSources('script'), ['profile']);
  assert.deepEqual(factSources('approval'), ['templates']);
  assert.deepEqual(factSources('render'), ['templates']);
  assert.deepEqual(factSources('thumbnail'), ['profile']);
  assert.deepEqual(factSources('voice'), [], 'the embedded VoicePanel loads its own data');
  assert.deepEqual(factSources('upload'), [], 'the embedded SchedulePanel loads its own data');
  assert.deepEqual(factSources('nope'), []);
});

// ------------------------------------------------------------- the facts
const ok = (data) => ({ status: 'ok', data });
const profile = (channel) => ok({ ok: true, channel });
const templatesBody = (assignments, templates) => ok({ assignments, templates });
const tpl = (templateId, reviewRequired = [], over = {}) => ({ templateId, name: `T ${templateId}`, registry: { version: '1.2.0', safety: { review_required: reviewRequired } }, ...over });
const asg = (familyId, over = {}) => ({ channel_id: 'mr', family_id: familyId, pinned_major: 1, pinned_version: '1.2.0', ...over });
const value = (facts, label) => facts.find((f) => f.label === label);

test('WHEN the profile loads THEN topic shows the niche and the sub-niches from the kit', () => {
  const f = stationFacts('topic', { profile: profile({ niche: 'Personal finance', kit: { niches: ['Budgeting', 'Debt'] } }) });
  assert.equal(value(f, 'Niche').value, 'Personal finance');
  assert.equal(value(f, 'Sub-niches').value, 'Budgeting · Debt');
});

test('WHEN no niche is set THEN topic says "Not set" with a warn tone (never a made-up niche)', () => {
  const f = stationFacts('topic', { profile: profile({ niche: '', kit: {} }) });
  assert.equal(value(f, 'Niche').value, 'Not set');
  assert.equal(value(f, 'Niche').tone, 'warn');
  assert.equal(value(f, 'Sub-niches'), undefined, 'no empty sub-niche row');
});

test('WHEN a source is still loading or failed THEN its facts say so (null = loading, "Couldn\'t load" = error)', () => {
  const loading = stationFacts('topic', { profile: { status: 'loading' } });
  assert.equal(loading.length, 1);
  assert.equal(loading[0].value, null);
  const failed = stationFacts('render', { templates: { status: 'error' } });
  assert.equal(failed.length, 1);
  assert.equal(failed[0].value, 'Couldn’t load');
  assert.equal(failed[0].tone, 'bad');
  // a 2xx body that is not the expected shape is an error too
  assert.equal(stationFacts('topic', { profile: ok({ ok: false }) })[0].tone, 'bad');
  assert.equal(stationFacts('approval', { templates: ok({ nope: 1 }) })[0].tone, 'bad');
});

test('WHEN the story shape is picked THEN script shows it; WHEN untouched THEN "Not picked" (warn)', () => {
  assert.equal(value(stationFacts('script', { profile: profile({ kit: { hasChapters: true } }) }), 'Story shape').value, 'Chapters');
  assert.equal(value(stationFacts('script', { profile: profile({ kit: { hasChapters: false } }) }), 'Story shape').value, 'Full story');
  assert.equal(value(stationFacts('script', { profile: profile({ kit: { storyShape: 'template' } }) }), 'Story shape').value, 'Template default');
  const unset = value(stationFacts('script', { profile: profile({ kit: {} }) }), 'Story shape');
  assert.equal(unset.value, 'Not picked');
  assert.equal(unset.tone, 'warn');
});

test('WHEN thumbnail designs are set THEN thumbnail shows how many take turns; WHEN none THEN "Automatic"', () => {
  assert.equal(value(stationFacts('thumbnail', { profile: profile({ kit: { thumbTemplates: ['a', 'b', 'c'] } }) }), 'Designs').value, '3 take turns');
  assert.equal(value(stationFacts('thumbnail', { profile: profile({ kit: {} }) }), 'Designs').value, 'Automatic');
});

test('WHEN a template is assigned THEN render shows its name and the version the next video uses', () => {
  const f = stationFacts('render', { templates: templatesBody([asg('doc-x')], [tpl('doc-x')]) });
  assert.equal(value(f, 'Template').value, 'T doc-x · v1.2.0');
});

test('WHEN no template is assigned THEN render says "None assigned" (warn)', () => {
  const f = stationFacts('render', { templates: templatesBody([], [tpl('doc-x')]) });
  assert.equal(value(f, 'Template').value, 'None assigned');
  assert.equal(value(f, 'Template').tone, 'warn');
});

// ------------------------------------------------------- the review gate
test('WHEN the assigned template lists review topics THEN the approval station "asks you first"', () => {
  const g = reviewGateOf({ assignments: [asg('doc-x')], templates: [tpl('doc-x', ['finance'])] });
  assert.equal(g.asks, true);
  assert.deepEqual(g.reasons, ['finance']);
  const f = stationFacts('approval', { templates: templatesBody([asg('doc-x')], [tpl('doc-x', ['finance'])]) });
  assert.equal(value(f, 'Asks you first').value, 'Yes · finance');
});

test('WHEN the assigned template lists no review topics THEN the approval station runs on its own', () => {
  const g = reviewGateOf({ assignments: [asg('doc-x')], templates: [tpl('doc-x', [])] });
  assert.equal(g.asks, false);
  assert.equal(value(stationFacts('approval', { templates: templatesBody([asg('doc-x')], [tpl('doc-x')]) }), 'Asks you first').value, 'No');
});

test('WHEN no template is assigned THEN the approval station runs on its own (legacy channels run ungated)', () => {
  const g = reviewGateOf({ assignments: [], templates: [tpl('doc-x', ['finance'])] });
  assert.equal(g.asks, false);
  assert.equal(g.why, 'no_template');
  assert.equal(value(stationFacts('approval', { templates: templatesBody([], []) }), 'Asks you first').value, 'No · no template');
});

test('WHEN the assigned template is missing from the registry THEN the gate holds (fail-closed, same as the engine)', () => {
  const g = reviewGateOf({ assignments: [asg('gone')], templates: [tpl('doc-x')] });
  assert.equal(g.asks, true);
  assert.equal(g.why, 'template_missing');
  const f = value(stationFacts('approval', { templates: templatesBody([asg('gone')], []) }), 'Asks you first');
  assert.equal(f.value, 'Yes · template not found');
  assert.equal(f.tone, 'warn');
});

// ------------------------------------------------------------ the history
const T0 = Date.parse('2026-11-23T09:00:00.000Z');
const at = (min) => new Date(T0 + min * 60_000).toISOString();
const row = (jobId, status, startMin, over = {}) => ({ job_id: jobId, idx: 53, name: 'station:voice', status, started_at: at(startMin), finished_at: status === 'running' ? null : at(startMin + 2), error: null, ...over });

test('WHEN history rows arrive THEN each becomes { jobId, state, startedAt, durationSec, error } newest first, at most 5', () => {
  const rows = [row('a', 'succeeded', 0), row('b', 'failed', 60, { error: 'TTS crashed\nstack…' }), row('c', 'succeeded', 120), row('d', 'skipped', 180, { error: 'auto: review gate off' }), row('e', 'succeeded', 240), row('f', 'succeeded', 300)];
  const out = historyRows(rows, { now: T0 + 1000 * 60_000 });
  assert.equal(out.length, HISTORY_LIMIT);
  assert.deepEqual(out.map((r) => r.jobId), ['f', 'e', 'd', 'c', 'b']);
  const b = out.find((r) => r.jobId === 'b');
  assert.equal(b.state, 'failed');
  assert.equal(b.error, 'TTS crashed');
  assert.equal(b.durationSec, 120);
  assert.equal(b.startedAt, at(60));
  assert.equal(out.find((r) => r.jobId === 'd').state, 'skipped');
});

test('WHEN a station is still running THEN its duration ticks against now', () => {
  const [r] = historyRows([row('a', 'running', 0)], { now: T0 + 90_000 });
  assert.equal(r.state, 'running');
  assert.equal(r.durationSec, 90);
});

test('WHEN the newest approval row is a review hold THEN it reads "Needs you"; an OLDER hold reads Skipped "Held for your OK" (never a stale ask)', () => {
  const held = (jobId, min) => row(jobId, 'skipped', min, { name: 'station:approval', idx: 52, error: 'held: awaiting_review' });
  const out = historyRows([held('old', 0), row('mid', 'succeeded', 60, { name: 'station:approval', idx: 52 }), held('new', 120)], { now: T0 + 200 * 60_000 });
  assert.equal(out[0].jobId, 'new');
  assert.equal(out[0].state, 'needs_you');
  assert.equal(out[0].error, null, 'a hold is not an error');
  assert.equal(out[0].note, 'Waiting for your OK');
  const old = out.find((r) => r.jobId === 'old');
  assert.equal(old.state, 'skipped');
  assert.equal(old.note, 'Held for your OK');
  assert.equal(old.error, null);
});

test('WHEN a held/auto-skipped step has no started_at THEN its time falls back to finished_at, then the job start (never "—")', () => {
  const noStart = row('a', 'skipped', 0, { name: 'station:approval', idx: 52, started_at: null, error: 'auto: gate off' });
  assert.equal(historyRows([noStart])[0].startedAt, at(2), 'finished_at');
  const neither = { ...noStart, finished_at: null, job_started_at: new Date(T0 + 5 * 60_000) };
  assert.equal(historyRows([neither])[0].startedAt, at(5), 'the job start (postgres hands back a Date)');
  assert.equal(historyRows([{ ...neither, job_started_at: null }])[0].startedAt, null);
  // and the newest-first order uses the same fallback time
  const out = historyRows([row('old', 'succeeded', 0), { ...neither, job_id: 'new', job_started_at: at(60) }]);
  assert.deepEqual(out.map((r) => r.jobId), ['new', 'old']);
});

test('WHEN an approval row is an automatic pass THEN it says "No approval needed", not an error', () => {
  const [r] = historyRows([row('a', 'skipped', 0, { name: 'station:approval', idx: 52, error: 'auto: review gate unavailable' })]);
  assert.equal(r.state, 'skipped');
  assert.equal(r.note, 'No approval needed');
  assert.equal(r.error, null);
});

test('WHEN rows are junk or missing THEN historyRows returns [] (never throws)', () => {
  assert.deepEqual(historyRows(null), []);
  assert.deepEqual(historyRows([null, 1, 'x']), []);
});

test('WHEN the history body is ok THEN historyView is ok with rows; anything else is an error (never "nothing ran")', () => {
  const v = historyView({ ok: true, rows: [{ jobId: 'a', state: 'done', startedAt: at(0), durationSec: 42, error: null }] });
  assert.equal(v.kind, 'ok');
  assert.equal(v.rows[0].word, STATE_WORD.done);
  assert.equal(v.rows[0].tone, 'ok');
  assert.equal(v.rows[0].duration, '42s');
  assert.equal(historyView({ ok: true, rows: [] }).kind, 'empty');
  assert.equal(historyView({ ok: false }).kind, 'error');
  assert.equal(historyView(null).kind, 'error');
  assert.equal(historyView({ ok: true }).kind, 'error');
  // a state outside the fixed words reads "Not tracked"
  assert.equal(historyView({ ok: true, rows: [{ jobId: 'a', state: 'weird' }] }).rows[0].word, STATE_WORD.unknown);
});

test('WHEN the drawer asks for history THEN the URL carries the channel and the station, encoded', () => {
  assert.equal(historyUrl('money-rulebook', 'voice'), '/api/stations/history?channel=money-rulebook&station=voice');
  assert.equal(historyUrl('a b', 'voice'), '/api/stations/history?channel=a%20b&station=voice');
  assert.equal(historyUrl('', 'voice'), null);
  assert.equal(historyUrl('mr', 'nope'), null);
});

// --------------------------------------------------------- query validation
const qs = (s) => new URLSearchParams(s);

test('WHEN channel and station are valid THEN parseHistoryQuery accepts them', () => {
  assert.deepEqual(parseHistoryQuery(qs('channel=money-rulebook&station=voice')), { ok: true, channel: 'money-rulebook', station: 'voice' });
});

test('WHEN channel or station is missing or malformed THEN parseHistoryQuery refuses with a reason', () => {
  assert.equal(parseHistoryQuery(qs('station=voice')).reason, 'channel_required');
  assert.equal(parseHistoryQuery(qs('channel=mr')).reason, 'station_required');
  assert.equal(parseHistoryQuery(qs('channel=../etc&station=voice')).reason, 'bad_channel');
  assert.equal(parseHistoryQuery(qs(`channel=${'a'.repeat(70)}&station=voice`)).reason, 'bad_channel');
  assert.equal(parseHistoryQuery(qs('channel=mr&station=__proto__')).reason, 'bad_station');
  assert.equal(parseHistoryQuery(qs('channel=mr&station=Voice')).reason, 'bad_station');
  assert.equal(parseHistoryQuery(null).reason, 'channel_required');
});

// ------------------------------------------------------- Neon read seam
function fakeClient(rows = [], { fail = null } = {}) {
  const calls = [];
  const fn = async (sql, params) => {
    calls.push({ sql, params });
    if (fail) throw fail;
    return rows;
  };
  fn.calls = calls;
  return fn;
}

test('WHEN station history is loaded THEN ONE query reads that channel\'s station:<key> rows, newest first, limit 5, pending excluded', async () => {
  const client = fakeClient([row('a', 'succeeded', 0)]);
  const out = await makeJobsRead(client).loadStationHistory({ channel: 'money-rulebook', station: 'voice' });
  assert.equal(out.length, 1);
  assert.equal(client.calls.length, 1);
  const { sql, params } = client.calls[0];
  assert.match(sql, /FROM job_steps s\s+JOIN jobs j ON j\.id = s\.job_id/);
  assert.match(sql, /WHERE j\.channel = \$1 AND s\.name = \$2 AND s\.status <> 'pending'/);
  assert.match(sql, /ORDER BY COALESCE\(s\.started_at, s\.finished_at, j\.started_at\) DESC/);
  assert.match(sql, /LIMIT \$3/);
  assert.deepEqual(params, ['money-rulebook', 'station:voice', 5]);
});

test('WHEN a limit is passed THEN it is clamped to 1..20', async () => {
  const client = fakeClient([]);
  const read = makeJobsRead(client);
  await read.loadStationHistory({ channel: 'mr', station: 'voice', limit: 999 });
  await read.loadStationHistory({ channel: 'mr', station: 'voice', limit: 0 });
  assert.equal(client.calls[0].params[2], 20);
  assert.equal(client.calls[1].params[2], 1);
});

test('WHEN the station key is unknown THEN loadStationHistory throws before any query (a typo fails loudly)', async () => {
  const client = fakeClient([]);
  await assert.rejects(() => makeJobsRead(client).loadStationHistory({ channel: 'mr', station: 'nope' }), /unknown station/);
  assert.equal(client.calls.length, 0);
});

test('WHEN the DB throws THEN loadStationHistory throws (route answers 503); WHEN the table is missing THEN []', async () => {
  await assert.rejects(() => makeJobsRead(fakeClient([], { fail: new Error('boom') })).loadStationHistory({ channel: 'mr', station: 'voice' }), /boom/);
  const missing = Object.assign(new Error('relation "job_steps" does not exist'), { code: '42P01' });
  assert.deepEqual(await makeJobsRead(fakeClient([], { fail: missing })).loadStationHistory({ channel: 'mr', station: 'voice' }), []);
});

test('jobs-read keeps its existing exports (loadToday, loadRuns) alongside loadStationHistory', () => {
  const r = makeJobsRead(fakeClient([]));
  assert.equal(typeof r.loadToday, 'function');
  assert.equal(typeof r.loadRuns, 'function');
  assert.equal(typeof r.loadStationHistory, 'function');
});

// ------------------------------------------------- access (401/403) mapping
test('WHEN a source answers 401 or 403 THEN it is "denied"; 2xx is ok with its body; anything else is an error', () => {
  assert.deepEqual(sourceState(401, { error: 'x' }), { status: 'denied' });
  assert.deepEqual(sourceState(403, null), { status: 'denied' });
  assert.deepEqual(sourceState(200, { ok: true }), { status: 'ok', data: { ok: true } });
  assert.deepEqual(sourceState(500, {}), { status: 'error' });
  assert.deepEqual(sourceState(502, {}), { status: 'error' });
  assert.deepEqual(sourceState(undefined), { status: 'error' });
});

test('WHEN a fact source is denied THEN the fact reads a neutral "Owner only" (muted, not the red error) and no Retry is offered', () => {
  const f = stationFacts('topic', { profile: { status: 'denied' } });
  assert.deepEqual(f, [{ label: 'Channel settings', value: OWNER_ONLY, tone: 'muted' }]);
  assert.equal(OWNER_ONLY, 'Owner only');
  assert.equal(factsFailed('topic', { profile: { status: 'denied' } }), false);
});

test('WHEN a fact source really failed (error or malformed) THEN factsFailed offers Retry; ok/loading never do', () => {
  assert.equal(factsFailed('topic', { profile: { status: 'error' } }), true);
  assert.equal(factsFailed('render', { templates: ok({ nope: 1 }) }), true);
  assert.equal(factsFailed('topic', { profile: profile({ niche: 'x' }) }), false);
  assert.equal(factsFailed('topic', {}), false);
  assert.equal(factsFailed('voice', { profile: { status: 'error' } }), false, 'voice has no facts');
});

test('WHEN a station embeds a panel THEN its read API is probed: voice → profile, upload → schedule', () => {
  assert.deepEqual(panelSources('voice'), ['profile']);
  assert.deepEqual(panelSources('upload'), ['schedule']);
  assert.deepEqual(panelSources('render'), []);
  assert.equal(panelSourceOf('voice'), 'profile');
  assert.equal(panelSourceOf('schedule'), 'schedule');
  assert.equal(panelSourceOf('__proto__'), null);
});

test('WHEN the panel probe is loading/denied/ok/error THEN the panel waits / shows "Owner only" / mounts (it shows its own error + Retry)', () => {
  assert.equal(panelAccess(undefined), 'loading');
  assert.equal(panelAccess({ status: 'loading' }), 'loading');
  assert.equal(panelAccess({ status: 'denied' }), 'denied');
  assert.equal(panelAccess({ status: 'ok', data: {} }), 'ok');
  assert.equal(panelAccess({ status: 'error' }), 'ok');
});
