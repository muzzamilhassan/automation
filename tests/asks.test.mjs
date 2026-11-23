// Creator City item 6 — Inbox "questions" (typed asks). The PURE rules in
// studio/lib/asks.mjs: every source → ask, dedupe/merge by source_key, and the
// expiry rules (24 h, warning closed, newer run moved past the station).
// EARS criteria in the test names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASK_TTL_MS, ASK_WARNING_CODES, ASK_KINDS, DISPATCH_ACTIONS,
  stationAsk, warningAsk, unpublishedScriptAsk, deriveAsks, staleAsks,
  presentAsk, parseAnswer, findOption, expiresLabel, titleScriptIds,
} from '../studio/lib/asks.mjs';
import { STATION_KEYS } from '../studio/lib/stations.mjs';

const NOW = Date.parse('2026-11-23T12:00:00.000Z');
const T0 = '2026-11-23T09:00:00.000Z';
const at = (min) => new Date(Date.parse(T0) + min * 60_000).toISOString();
const SID = '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b';
const SID2 = '11111111-2222-3333-4444-555555555555';

const job = (over = {}) => ({ id: 'j-1', channel: 'money-rulebook', status: 'failed', started_at: T0, finished_at: at(30), error: null, meta: { runId: '9' }, resumed_from_job_id: null, ...over });
const st = (key, status, over = {}) => ({ job_id: 'j-1', idx: 50 + STATION_KEYS.indexOf(key), name: `station:${key}`, status, started_at: at(1), finished_at: at(2), error: null, ...over });
const okThrough = (key) => STATION_KEYS.slice(0, STATION_KEYS.indexOf(key)).map((k) => st(k, 'succeeded'));
const warn = (over = {}) => ({ id: '41', channel_id: 'money-rulebook', severity: 'action_required', code: 'approved_not_published', title: 'approved video never published — "Why banks love debt"', evidence: `script ${SID} approved 2026-11-22T08:00:00.000Z for slot 2026-11-22; video_id still empty after 6h`, job_id: 'j-0', state: 'open', created_at: at(-600), ...over });
const today = (...entries) => new Map(entries.map((e) => [e.job?.channel || e.channel, { job: null, steps: [], scripts: [], intents: [], ...e }]));
const ids = (ask) => ask.options.map((o) => o.id);

// ------------------------------------------------------------- vocabulary
test('the ask vocabulary is the reference model: kinds retry_or_skip/confirm/choice; 24 h TTL; the four warning codes', () => {
  assert.deepEqual(ASK_KINDS, ['retry_or_skip', 'confirm', 'choice']);
  assert.equal(ASK_TTL_MS, 24 * 60 * 60 * 1000);
  assert.deepEqual([...ASK_WARNING_CODES].sort(), ['approval_dispatch_failed', 'approved_not_published', 'review_timeout', 'upload_failed']);
  assert.deepEqual([...DISPATCH_ACTIONS].sort(), ['redispatch_script', 'retry_resume']);
});

// ------------------------------------------------------------- station source
test('WHEN a finished run failed at a station THEN one retry_or_skip ask: Retry now · Skip today · Open run', () => {
  const steps = [...okThrough('voice'), st('voice', 'failed', { error: 'alignment too weak: 12/21 words heard\nstack…' })];
  const a = stationAsk({ job: job(), steps, scripts: [{ id: SID, job_id: 'j-1', status: 'approved', created_at: T0 }] }, { titles: { [SID]: 'Why banks love debt' } });
  assert.equal(a.source_key, 'station:j-1:voice');
  assert.equal(a.channel, 'money-rulebook');
  assert.equal(a.kind, 'retry_or_skip');
  assert.equal(a.title, 'Voice failed for “Why banks love debt”');
  assert.equal(a.body, 'alignment too weak: 12/21 words heard', 'first error line only');
  assert.deepEqual(ids(a), ['retry', 'skip', 'open']);
  assert.deepEqual(a.options[0], { id: 'retry', label: 'Retry now', action: 'retry_resume', args: { jobId: 'j-1' }, primary: true });
  assert.equal(a.options[1].action, 'dismiss');
  assert.equal(a.options[2].href, '/runs?run=9&channel=money-rulebook', 'opens THIS run (deep link)');
  assert.equal(a.options[2].action, undefined, 'a link option never runs a server action');
});

test('WHEN the run is still running THEN no station ask (the pipeline may still recover)', () => {
  assert.equal(stationAsk({ job: job({ status: 'running' }), steps: [st('voice', 'failed')] }), null);
});

test('WHEN no station failed (or only the owner rejected the script) THEN no station ask', () => {
  assert.equal(stationAsk({ job: job({ status: 'succeeded' }), steps: [...okThrough('upload'), st('upload', 'succeeded')] }), null);
  assert.equal(stationAsk({ job: job({ status: 'held' }), steps: [], scripts: [{ id: SID, job_id: 'j-1', status: 'rejected', created_at: T0 }] }), null, 'rejection is your choice, not a failure');
  assert.equal(stationAsk({ job: null, steps: [] }), null);
});

test('WHEN the upload itself failed (upload intent) THEN the ask reads Upload failed with Retry upload · Skip', () => {
  const steps = okThrough('upload');
  const a = stationAsk({ job: job(), steps, intents: [{ id: 'i1', job_id: 'j-1', status: 'failed', fail_reason: 'quotaExceeded', created_at: at(20) }] });
  assert.equal(a.source_key, 'station:j-1:upload');
  assert.equal(a.title, 'Upload failed');
  assert.equal(a.body, 'quotaExceeded');
  assert.deepEqual(a.options.map((o) => o.label), ['Retry upload', 'Skip', 'Open run']);
});

test('WHEN the video already uploaded but a later station failed THEN no Retry is offered (a resume could upload twice)', () => {
  const steps = [...okThrough('thumbnail'), st('thumbnail', 'failed', { error: 'thumbnails.set 403' }), st('upload', 'succeeded')];
  const a = stationAsk({ job: job({ status: 'partial' }), steps });
  assert.equal(a.kind, 'confirm');
  assert.ok(!a.options.some((o) => o.action === 'retry_resume'));
  assert.deepEqual(a.options.map((o) => o.label), ['Open run', 'Got it']);
  assert.equal(a.options[0].primary, true, 'primary first');
});

test('WHEN several stations failed THEN the ask names the FIRST failed one (the cause)', () => {
  const steps = [...okThrough('render'), st('render', 'failed', { error: 'SIGTERM' }), st('thumbnail', 'failed', { error: 'no frame' })];
  assert.equal(stationAsk({ job: job(), steps }).source_key, 'station:j-1:render');
});

test('WHEN the error line is empty THEN the body says so plainly (never blank)', () => {
  const a = stationAsk({ job: job(), steps: [...okThrough('render'), st('render', 'failed', { error: '' })] });
  assert.equal(a.body, 'No error line was recorded');
});

test('titleScriptIds lists the scripts whose titles a station ask needs (finished jobs with a failed station only)', () => {
  const t = today(
    { job: job(), steps: [st('voice', 'failed')], scripts: [{ id: SID, job_id: 'j-1', status: 'approved', created_at: T0 }] },
    { job: job({ id: 'j-2', channel: 'quotequarry', status: 'succeeded' }), steps: [st('upload', 'succeeded', { job_id: 'j-2' })], scripts: [{ id: SID2, job_id: 'j-2', status: 'consumed', created_at: T0 }] },
  );
  assert.deepEqual(titleScriptIds(t), [SID]);
});

// ------------------------------------------------------------- warning sources
test('WHEN approved_not_published is open THEN ask keyed by the SCRIPT: Retry now (redispatch) · Skip it (confirm)', () => {
  const a = warningAsk(warn());
  assert.equal(a.source_key, `script:${SID}:unpublished`);
  assert.equal(a.kind, 'retry_or_skip');
  assert.equal(a.title, 'Approved script never became a video');
  assert.equal(a.body, '“Why banks love debt”');
  assert.deepEqual(a.covers, ['41']);
  assert.deepEqual(a.options[0], { id: 'retry', label: 'Retry now', action: 'redispatch_script', args: { scriptId: SID }, primary: true });
  assert.equal(a.options[1].action, 'skip_approved_script');
  assert.equal(a.options[1].confirm.tone, 'danger');
});

test('WHEN approval_dispatch_failed is open THEN it is the SAME question as approved_not_published (one key)', () => {
  const a = warningAsk(warn({ id: '42', code: 'approval_dispatch_failed', title: 'approval recorded but the resume dispatch FAILED', evidence: `script ${SID}, job j-0 — github 500` }));
  assert.equal(a.source_key, `script:${SID}:unpublished`);
  assert.equal(a.options[0].action, 'redispatch_script');
});

test('WHEN review_timeout is open THEN a choice: Review now (link) · Skip it (reject, confirm)', () => {
  const a = warningAsk(warn({ id: '43', code: 'review_timeout', title: 'approval window passed — script "Gold vs cash" still awaiting review', evidence: `script ${SID2} awaiting since …` }));
  assert.equal(a.source_key, `script:${SID2}:review_timeout`);
  assert.equal(a.kind, 'choice');
  assert.equal(a.title, 'Approval window passed');
  assert.equal(a.body, '“Gold vs cash” still waits for you');
  assert.deepEqual(a.options[0], { id: 'review', label: 'Review now', href: `/review?id=${SID2}`, primary: true });
  assert.equal(a.options[1].action, 'reject_script');
  assert.deepEqual(a.options[1].args, { scriptId: SID2 });
  assert.equal(a.options[1].confirm.tone, 'danger');
});

test('WHEN upload_failed is open THEN Retry upload (resume its job) · Skip (resolve) · Open run; keyed by the warning', () => {
  const a = warningAsk(warn({ id: '44', code: 'upload_failed', title: 'upload failed', evidence: 'HTTP 500 from videos.insert', job_id: 'j-7' }));
  assert.equal(a.source_key, 'warning:44');
  assert.deepEqual(a.options.map((o) => o.label), ['Retry upload', 'Skip', 'Open run']);
  assert.deepEqual(a.options[0].args, { jobId: 'j-7' });
  assert.deepEqual(a.options[1], { id: 'skip', label: 'Skip', action: 'resolve_warnings', args: { warningIds: ['44'] } });
});

test('WHEN upload_failed has no job id THEN no Retry (nothing safe to resume)', () => {
  const a = warningAsk(warn({ id: '45', code: 'upload_failed', job_id: null, evidence: 'x' }));
  assert.ok(!a.options.some((o) => o.action === 'retry_resume'));
});

test('WHEN a warning is quiet (advisory/informational), resolved, or another code THEN no ask', () => {
  assert.equal(warningAsk(warn({ severity: 'advisory' })), null);
  assert.equal(warningAsk(warn({ state: 'resolved' })), null);
  assert.equal(warningAsk(warn({ code: 'run_failed' })), null);
  assert.equal(warningAsk(null), null);
});

test('WHEN a script warning cites no script id THEN the ask falls back to the warning key with no Retry', () => {
  const a = warningAsk(warn({ id: '46', evidence: 'no script record' }));
  assert.equal(a.source_key, 'warning:46');
  assert.ok(!a.options.some((o) => DISPATCH_ACTIONS.includes(o.action)));
  assert.equal(a.options.find((o) => o.id === 'skip').action, 'resolve_warnings');
});

// ------------------------------------------------------------- script-store source
test('WHEN an approved script has no video (approvedNotPublished) THEN the same script-keyed ask, title from the row', () => {
  const a = unpublishedScriptAsk({ id: SID, channel_id: 'money-rulebook', title: 'Why banks love debt', job_id: 'j-0', slot_date: '2026-11-22' });
  assert.equal(a.source_key, `script:${SID}:unpublished`);
  assert.equal(a.body, '“Why banks love debt”');
  assert.deepEqual(a.covers, []);
});

// ------------------------------------------------------------- derive / dedupe
test('WHEN two sources describe one script THEN deriveAsks merges them into ONE ask covering every warning id', () => {
  const m = deriveAsks({
    warnings: [warn(), warn({ id: '42', code: 'approval_dispatch_failed', evidence: `script ${SID}, job j-0 — github 500` })],
    unpublished: [{ id: SID, channel_id: 'money-rulebook', title: 'Why banks love debt', job_id: 'j-0' }],
  });
  assert.equal(m.size, 1);
  const a = m.get(`script:${SID}:unpublished`);
  assert.deepEqual([...a.covers].sort(), ['41', '42']);
});

test('WHEN a failed station belongs to the run of an approved-but-unbuilt script THEN only the station ask stays (it covers the warnings)', () => {
  const t = today({ job: job({ id: 'j-1', resumed_from_job_id: 'j-0' }), steps: [...okThrough('render'), st('render', 'failed', { error: 'SIGTERM at 2700s' })] });
  const m = deriveAsks({ today: t, warnings: [warn()], unpublished: [{ id: SID, channel_id: 'money-rulebook', title: 'Why banks love debt', job_id: 'j-0' }] });
  assert.deepEqual([...m.keys()], ['station:j-1:render']);
  assert.deepEqual(m.get('station:j-1:render').covers, ['41']);
});

test('WHEN a reader failed (null) THEN its source contributes nothing and nothing throws', () => {
  const m = deriveAsks({ today: null, warnings: null, unpublished: null });
  assert.equal(m.size, 0);
});

// ------------------------------------------------------------- expiry
const row = (over = {}) => ({ id: '7', channel: 'money-rulebook', kind: 'retry_or_skip', source_key: `script:${SID}:unpublished`, status: 'pending', created_at: new Date(NOW - 3600_000).toISOString(), expires_at: new Date(NOW + 3600_000).toISOString(), options: [], answer: null, ...over });
const allRead = { today: true, warnings: true, unpublished: true };

test('WHEN 24 h passed THEN the ask expires — nothing hangs forever', () => {
  const s = staleAsks([row({ expires_at: new Date(NOW - 1).toISOString() })], { candidates: new Map([[`script:${SID}:unpublished`, {}]]), read: allRead, now: NOW });
  assert.deepEqual(s, [{ id: '7', reason: '24 h passed' }]);
});

test('WHEN the source warning closed / the script got its video THEN the ask expires', () => {
  const s = staleAsks([row(), row({ id: '8', source_key: 'warning:44' })], { candidates: new Map(), read: allRead, now: NOW });
  assert.deepEqual(s.map((x) => x.id), ['7', '8']);
  assert.ok(s.every((x) => x.reason === 'no longer applies'));
});

test('WHEN a reader failed THEN asks from that family are NOT expired (unknown is not resolved)', () => {
  const s = staleAsks([row(), row({ id: '8', source_key: 'warning:44' })], { candidates: new Map(), read: { today: true, warnings: false, unpublished: true }, now: NOW });
  assert.deepEqual(s, []);
});

test('WHEN a newer run for the channel SUCCEEDED at that station THEN the station ask expires', () => {
  const t = today({ job: job({ id: 'j-2', status: 'succeeded', started_at: at(60) }), steps: [st('voice', 'succeeded', { job_id: 'j-2' })] });
  const s = staleAsks([row({ source_key: 'station:j-1:voice' })], { candidates: new Map(), today: t, read: allRead, now: NOW });
  assert.deepEqual(s, [{ id: '7', reason: 'a newer run passed this step' }]);
});

test('WHEN a newer run failed again at that station THEN the old ask is superseded (the new one is its own ask)', () => {
  const t = today({ job: job({ id: 'j-2', started_at: at(60) }), steps: [st('voice', 'failed', { job_id: 'j-2' })] });
  const s = staleAsks([row({ source_key: 'station:j-1:voice' })], { candidates: new Map([['station:j-2:voice', {}]]), today: t, read: allRead, now: NOW });
  assert.deepEqual(s, [{ id: '7', reason: 'a newer run failed here again' }]);
});

test('WHEN a newer run has not reached that station yet THEN the station ask stays (until 24 h)', () => {
  const t = today({ job: job({ id: 'j-2', status: 'running', started_at: at(60) }), steps: [st('topic', 'succeeded', { job_id: 'j-2' })] });
  assert.deepEqual(staleAsks([row({ source_key: 'station:j-1:voice' })], { candidates: new Map(), today: t, read: allRead, now: NOW }), []);
});

test('WHEN the station ask is still the latest failure THEN it stays', () => {
  const t = today({ job: job(), steps: [st('voice', 'failed')] });
  assert.deepEqual(staleAsks([row({ source_key: 'station:j-1:voice' })], { candidates: new Map([['station:j-1:voice', {}]]), today: t, read: allRead, now: NOW }), []);
});

test('WHEN the station reader failed THEN station asks are never expired early', () => {
  assert.deepEqual(staleAsks([row({ source_key: 'station:j-1:voice' })], { candidates: new Map(), today: null, read: { ...allRead, today: false }, now: NOW }), []);
});

test('WHEN the ask is not pending THEN staleAsks ignores it', () => {
  assert.deepEqual(staleAsks([row({ status: 'answered', expires_at: new Date(NOW - 1).toISOString() })], { candidates: new Map(), read: allRead, now: NOW }), []);
});

// ------------------------------------------------------------- present / answer
test('presentAsk: the client sees ids/labels/links/confirm text, never the server action args; plus covers and the last error', () => {
  const cand = warningAsk(warn());
  const p = presentAsk(row({ options: cand.options, title: cand.title, body: cand.body, answer: { lastError: 'github 500: boom' } }), cand);
  assert.equal(p.id, '7');
  assert.deepEqual(p.covers, ['41']);
  assert.equal(p.error, 'github 500: boom');
  assert.equal(p.options[0].label, 'Retry now');
  assert.ok(p.options.every((o) => o.args === undefined && o.action === undefined));
  assert.equal(p.options[1].confirm.tone, 'danger');
  assert.equal(p.expiresAt, new Date(NOW + 3600_000).toISOString());
});

test('parseAnswer: WHEN id or optionId is missing/malformed THEN a 400 reason, never a guess', () => {
  assert.deepEqual(parseAnswer({ id: '12', optionId: 'retry' }), { ok: true, id: '12', optionId: 'retry' });
  assert.deepEqual(parseAnswer({ id: 12, optionId: 'skip' }), { ok: true, id: '12', optionId: 'skip' });
  assert.equal(parseAnswer({}).ok, false);
  assert.equal(parseAnswer({ id: 'x; drop', optionId: 'retry' }).reason, 'bad_id');
  assert.equal(parseAnswer({ id: '1', optionId: '../x' }).reason, 'bad_option');
  assert.equal(parseAnswer(null).ok, false);
});

test('findOption: only a STORED server option with an action can be run (links and unknown ids refused)', () => {
  const ask = { options: warningAsk(warn({ code: 'review_timeout', evidence: `script ${SID2} awaiting` })).options };
  assert.equal(findOption(ask, 'skip').action, 'reject_script');
  assert.equal(findOption(ask, 'review'), null, 'a link option is client-side only');
  assert.equal(findOption(ask, 'nope'), null);
  assert.equal(findOption({ options: '[{"id":"skip","label":"Skip","action":"dismiss"}]' }, 'skip').action, 'dismiss', 'jsonb as text parses');
  assert.equal(findOption({ options: [{ id: 'x', label: 'X', action: 'rm -rf' }] }, 'x'), null, 'unknown actions are never runnable');
});

test('expiresLabel: hours, then minutes, then null once gone', () => {
  assert.equal(expiresLabel(new Date(NOW + 5 * 3600_000 + 60_000).toISOString(), NOW), 'expires in 5 h');
  assert.equal(expiresLabel(new Date(NOW + 40 * 60_000).toISOString(), NOW), 'expires in 40 min');
  assert.equal(expiresLabel(new Date(NOW + 20_000).toISOString(), NOW), 'expires in 1 min');
  assert.equal(expiresLabel(new Date(NOW - 1).toISOString(), NOW), null);
  assert.equal(expiresLabel(null, NOW), null);
});
