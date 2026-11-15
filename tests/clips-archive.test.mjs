// #96 hotfix — clips queued in CI must survive the ephemeral runner.
//
// On doc days channel-pipeline feeds the fresh render to shorts-clips with
// --local; that branch skipped the Release-asset upload entirely, so queue
// entries pointed at files that existed only on that day's runner: the first
// clip posted, the runner died, and every later clip failed forever with
// "neither a local file nor a Release asset URL" (one ntfy/day until drained).
// Five layers tested here:
// 1. --local --archive  → cut from disk AND upload the clips to the
//    `clips-<slug>-<docRunId>` Release; entries carry asset+url (file: stays —
//    same-day posts still hit the live file).
// 2. pure --local (dev) → byte-identical legacy queue (file:, no url, zero HTTP).
// 3. asset upload failing 3× → clip DROPPED with a loud [alert] — a queued
//    entry without a servable url is the #96 failure mode, never queue it.
// 4. publisher fallback → one on-the-fly Release lookup by
//    `clips-<slug>-<lastRunId>` before the clean failure.
// 5. the pipeline flag → CI adds --archive, dev does not.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { archiveAndMapClips, lookupQueuedClipAsset, ensureQueueArgs } from '../longvideo/shorts-clips.mjs';

// ---- helpers ----------------------------------------------------------

function stubFetch(handlers) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, opts });
    const h = handlers.find(([match]) => url.includes(match));
    if (!h) throw new Error(`stub: no handler for ${url}`);
    return h[1]({ url, opts });
  };
  return { calls, fetchImpl };
}

const tmpDirs = [];
function tmpClipFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clips-archive-'));
  tmpDirs.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.alloc(2048, 7));
  return file;
}
after(() => { for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

// Drop tests must never hit the real ntfy (loadEnv may load NTFY_TOPIC) —
// this recorder doubles as the assertion target for the MUST-alert contract.
const alerts = [];
function alertRecorder(a) { alerts.push(a); return Promise.resolve({ channel: 'ntfy', ok: true }); }

const mkClips = (files) => files.map((f, i) => ({ part: i + 1, file: f, title: `Title ${i + 1}`, startSec: 10 + i, durSec: 30 }));

// Happy-path GitHub stub: release missing (404) → create id 555 → uploads OK.
// The asset url echoes the uploaded name so entries are pin-assertable.
const RELEASE_HAPPY = [
  ['uploads.github.com', ({ url }) => ({ ok: true, status: 201, json: async () => ({ name: decodeURIComponent(url.split('name=')[1]), url: `https://api.github.com/repos/o/r/assets/${decodeURIComponent(url.split('name=')[1])}` }) })],
  ['releases/tags', () => ({ ok: false, status: 404 })],
  ['api.github.com', () => ({ ok: true, status: 201, json: async () => ({ id: 555, assets: [] }) })],
];

// ===========================================================================
// 1. --local --archive: cut from disk, queue Release-backed entries
// ===========================================================================

describe('#96 --local --archive: entries carry asset+url from the clips Release', () => {
  test('uploads every cut clip and queues asset+url (file: kept for same-day posts)', async () => {
    const { calls, fetchImpl } = stubFetch(RELEASE_HAPPY);
    const f1 = tmpClipFile('clip-01.mp4');
    const f2 = tmpClipFile('clip-02.mp4');
    const entries = await archiveAndMapClips({
      slug: 'lane-test', docRunId: 'local-1700000000000', clips: mkClips([f1, f2]),
      archive: true, local: true, tok: 'tok-123', repo: 'o/r', backoffMs: 1,
      log: () => { }, fetchImpl,
    });
    assert.equal(entries.length, 2, 'nothing dropped when uploads succeed');
    assert.deepEqual(entries[0], {
      part: 1, title: 'Title 1', startSec: 10, durSec: 30,
      asset: 'clip-01.mp4', url: 'https://api.github.com/repos/o/r/assets/clip-01.mp4', file: f1,
    }, 'entry 1: Release-backed AND local (same-day posts hit the live file)');
    assert.equal(entries[1].asset, 'clip-02.mp4');
    assert.ok(entries[1].url, 'entry 2 has a servable url');

    // release create: tag/name follow the clips-<slug>-<docRunId> contract
    const create = calls.find((c) => c.url === 'https://api.github.com/repos/o/r/releases');
    assert.ok(create, 'release looked up, then created');
    assert.equal(create.opts.method, 'POST');
    const body = JSON.parse(create.opts.body);
    assert.equal(body.tag_name, 'clips-lane-test-local-1700000000000');
    assert.equal(body.name, 'Clips lane-test local-1700000000000');
    // asset upload: right release, right name, workflow token
    const up = calls.find((c) => c.url.includes('uploads.github.com'));
    assert.equal(up.opts.method, 'POST');
    assert.ok(up.url.includes('/repos/o/r/releases/555/assets?name=clip-01.mp4'), `got ${up.url}`);
    assert.equal(up.opts.headers.Authorization, 'Bearer tok-123');
  });

  test('re-run against an existing release reuses its assets (no duplicate uploads)', async () => {
    const { calls, fetchImpl } = stubFetch([
      ['releases/tags', () => ({ ok: true, status: 200, json: async () => ({ id: 777, assets: [{ name: 'clip-01.mp4', url: 'u-01' }, { name: 'clip-02.mp4', url: 'u-02' }] }) })],
    ]);
    const entries = await archiveAndMapClips({
      slug: 's', docRunId: 'd', clips: mkClips([tmpClipFile('clip-01.mp4'), tmpClipFile('clip-02.mp4')]),
      archive: true, local: true, log: () => { }, fetchImpl,
    });
    assert.equal(calls.filter((c) => c.url.includes('uploads.github.com')).length, 0, 'no upload POSTs');
    assert.equal(entries[0].url, 'u-01');
    assert.equal(entries[1].url, 'u-02');
  });
});

// ===========================================================================
// 2. pure --local (no --archive): byte-identical legacy dev behavior
// ===========================================================================

describe('#96 pure --local dev mode is untouched', () => {
  test('queues file: paths, no asset/url, ZERO http (no release pushed)', async () => {
    const { calls, fetchImpl } = stubFetch([]);
    const f1 = tmpClipFile('clip-01.mp4');
    const f2 = tmpClipFile('clip-02.mp4');
    const entries = await archiveAndMapClips({
      slug: 's', docRunId: 'local-1700000000000', clips: mkClips([f1, f2]),
      archive: false, local: true, log: () => { }, fetchImpl,
    });
    assert.equal(calls.length, 0, 'dev mode must not touch the GitHub API');
    assert.deepEqual(entries, [
      { part: 1, title: 'Title 1', startSec: 10, durSec: 30, asset: undefined, url: undefined, file: f1 },
      { part: 2, title: 'Title 2', startSec: 11, durSec: 30, asset: undefined, url: undefined, file: f2 },
    ]);
  });
});

// ===========================================================================
// 3. hardening: asset upload failing 3× ⇒ dropped + [alert], never queued
// ===========================================================================

describe('#96 upload hardening: a clip with no servable url never reaches the queue', () => {
  test('upload failing 3x ⇒ exactly 3 attempts, clip dropped, [alert] logged + ntfy fired', async () => {
    let uploads = 0;
    const logs = [];
    alerts.length = 0;
    const { fetchImpl } = stubFetch([
      ['uploads.github.com', () => { uploads++; return { ok: false, status: 502 }; }],
      ['releases/tags', () => ({ ok: false, status: 404 })],
      ['api.github.com', () => ({ ok: true, status: 201, json: async () => ({ id: 555, assets: [] }) })],
    ]);
    const entries = await archiveAndMapClips({
      slug: 's', docRunId: 'd', clips: mkClips([tmpClipFile('clip-01.mp4')]),
      archive: true, local: true, backoffMs: 1, log: (m) => logs.push(m), alert: alertRecorder, fetchImpl,
    });
    assert.equal(uploads, 3, 'retry budget: 3 attempts, no more');
    assert.equal(entries.length, 0, 'failed clip dropped from the queue');
    const logAlert = logs.find((l) => l.includes('[alert]'));
    assert.ok(logAlert, 'a loud [alert] line was logged');
    assert.ok(logAlert.includes('part 1') && logAlert.includes('Title 1'), `alert names the dropped clip: ${logAlert}`);
    // the failure mode was DISCOVERED via ntfy — a drop must push, naming the
    // dropped part/title and the remaining count
    assert.equal(alerts.length, 1, 'exactly one ntfy alert for the drop');
    assert.equal(alerts[0].title, '[s] clips: 1 clip(s) dropped — Release upload failed');
    assert.ok(alerts[0].text.includes('part 1 "Title 1"'), `alert text names part+title: ${alerts[0].text}`);
    assert.ok(alerts[0].text.includes('0/1 clips queued.'), `alert text carries the remaining count: ${alerts[0].text}`);
  });

  test('mixed: one clip uploads, one fails ⇒ only the servable one is queued (artifact path too)', async () => {
    let uploads = 0;
    const logs = [];
    alerts.length = 0;
    const { fetchImpl } = stubFetch([
      ['uploads.github.com', ({ url }) => (url.includes('name=clip-01.mp4')
        ? { ok: true, status: 201, json: async () => ({ name: 'clip-01.mp4', url: 'u-01' }) }
        : (uploads++, { ok: false, status: 500 }))],
      ['releases/tags', () => ({ ok: false, status: 404 })],
      ['api.github.com', () => ({ ok: true, status: 201, json: async () => ({ id: 555, assets: [] }) })],
    ]);
    // artifact-scan path (local: false) — the same hardening must apply there
    const entries = await archiveAndMapClips({
      slug: 's', docRunId: '424242', clips: mkClips([tmpClipFile('clip-01.mp4'), tmpClipFile('clip-02.mp4')]),
      archive: true, local: false, backoffMs: 1, log: (m) => logs.push(m), alert: alertRecorder, fetchImpl,
    });
    assert.equal(uploads, 3, 'clip-02 retried 3x');
    assert.equal(entries.length, 1, 'only the servable clip queued');
    assert.deepEqual(entries[0], {
      part: 1, title: 'Title 1', startSec: 10, durSec: 30, asset: 'clip-01.mp4', url: 'u-01', file: undefined,
    }, 'artifact-path entries stay file-less');
    assert.ok(logs.some((l) => l.includes('[alert]') && l.includes('part 2')), 'drop logged');
    assert.equal(alerts.length, 1, 'partial drop ntfy fired');
    assert.ok(alerts[0].text.includes('part 2 "Title 2"'), `alert names the dropped clip: ${alerts[0].text}`);
    assert.ok(alerts[0].text.includes('1/2 clips queued.'), `remaining count in the alert: ${alerts[0].text}`);
    for (const e of entries) assert.ok(e.url, 'every queued entry has a servable url');
  });

  test('a THROWN fetch (ECONNRESET on a 25MB body) counts as a failed attempt, not an escape', async () => {
    let uploads = 0;
    alerts.length = 0;
    const logs = [];
    const { fetchImpl } = stubFetch([
      ['uploads.github.com', () => { uploads++; throw new Error('ECONNRESET'); }],
      ['releases/tags', () => ({ ok: false, status: 404 })],
      ['api.github.com', () => ({ ok: true, status: 201, json: async () => ({ id: 555, assets: [] }) })],
    ]);
    const entries = await archiveAndMapClips({
      slug: 's', docRunId: 'd', clips: mkClips([tmpClipFile('clip-01.mp4')]),
      archive: true, local: true, backoffMs: 1, log: (m) => logs.push(m), alert: alertRecorder, fetchImpl,
    });
    assert.equal(uploads, 3, 'throwing fetch exhausts the same 3-attempt budget');
    assert.equal(entries.length, 0, 'clip dropped, no unhandled rejection');
    assert.equal(alerts.length, 1, 'drop still ntfy’d');
    assert.ok(logs.some((l) => l.includes('threw for clip-01.mp4') && l.includes('ECONNRESET')), 'throw logged as a failed attempt');
  });

  test('throw once, then succeed ⇒ clip kept (transient network blips do not drop)', async () => {
    let uploads = 0;
    alerts.length = 0;
    const { fetchImpl } = stubFetch([
      ['uploads.github.com', () => { if (++uploads === 1) throw new Error('ECONNRESET'); return { ok: true, status: 201, json: async () => ({ name: 'clip-01.mp4', url: 'u-01' }) }; }],
      ['releases/tags', () => ({ ok: false, status: 404 })],
      ['api.github.com', () => ({ ok: true, status: 201, json: async () => ({ id: 555, assets: [] }) })],
    ]);
    const entries = await archiveAndMapClips({
      slug: 's', docRunId: 'd', clips: mkClips([tmpClipFile('clip-01.mp4')]),
      archive: true, local: true, backoffMs: 1, log: () => { }, alert: alertRecorder, fetchImpl,
    });
    assert.equal(uploads, 2, 'retried after the throw');
    assert.equal(entries.length, 1, 'clip kept');
    assert.equal(entries[0].url, 'u-01');
    assert.equal(alerts.length, 0, 'no drop alert when everything lands');
  });

  test('release create AND fallback lookup fail ⇒ loud fail() (no unhandled throw)', async () => {
    const { calls, fetchImpl } = stubFetch([
      ['releases/tags', () => ({ ok: false, status: 500 })],
      ['api.github.com', () => ({ ok: false, status: 500 })],
    ]);
    await assert.rejects(
      () => archiveAndMapClips({
        slug: 's', docRunId: 'd', clips: mkClips([tmpClipFile('clip-01.mp4')]),
        archive: true, local: true, backoffMs: 1, log: () => { }, alert: alertRecorder, fetchImpl,
      }),
      /clips-s-d unavailable \(create \+ lookup failed\)/,
    );
    assert.equal(calls.filter((c) => c.url.includes('uploads.github.com')).length, 0, 'no uploads attempted against a missing release');
  });
});

// ===========================================================================
// 4. publisher fallback: one on-the-fly Release lookup before failing
// ===========================================================================

describe('#96 publisher fallback: resolve a url-less clip from the clips Release', () => {
  test('asset exists on clips-<slug>-<lastRunId> ⇒ {asset,url} used (one lookup)', async () => {
    const { calls, fetchImpl } = stubFetch([
      ['releases/tags', () => ({ ok: true, status: 200, json: async () => ({ assets: [{ name: 'clip-01.mp4', url: 'u-01' }, { name: 'clip-02.mp4', url: 'u-02' }] }) })],
    ]);
    const found = await lookupQueuedClipAsset({ slug: 'iron', docRunId: '998877', clip: { part: 2, asset: 'clip-02.mp4' }, fetchImpl });
    assert.deepEqual(found, { asset: 'clip-02.mp4', url: 'u-02' });
    assert.equal(calls.length, 1, 'exactly one on-the-fly lookup');
    assert.ok(calls[0].url.endsWith('/releases/tags/clips-iron-998877'), `got ${calls[0].url}`);
  });

  test('clip.asset missing ⇒ canonical clip-<part>.mp4 name derived', async () => {
    const { fetchImpl } = stubFetch([
      ['releases/tags', () => ({ ok: true, status: 200, json: async () => ({ assets: [{ name: 'clip-02.mp4', url: 'u-02' }] }) })],
    ]);
    assert.deepEqual(await lookupQueuedClipAsset({ slug: 's', docRunId: 'd', clip: { part: 2 }, fetchImpl }), { asset: 'clip-02.mp4', url: 'u-02' });
  });

  test('release missing (404) ⇒ null — the existing fail path (and its ntfy) fires', async () => {
    const { calls, fetchImpl } = stubFetch([
      ['releases/tags', () => ({ ok: false, status: 404 })],
    ]);
    assert.equal(await lookupQueuedClipAsset({ slug: 's', docRunId: 'd', clip: { part: 1, asset: 'clip-01.mp4' }, fetchImpl }), null);
    assert.equal(calls.length, 1);
  });

  test('no lastRunId in state ⇒ null without any http', async () => {
    const { calls, fetchImpl } = stubFetch([]);
    assert.equal(await lookupQueuedClipAsset({ slug: 's', docRunId: undefined, clip: { part: 1 }, fetchImpl }), null);
    assert.equal(calls.length, 0);
  });
});

// ===========================================================================
// 5. the pipeline flag: CI adds --archive, dev does not
// ===========================================================================

describe('#96 pipeline wiring: doc-day ensure-queue gains --archive in CI', () => {
  test('ensureQueueArgs ci:true appends --archive after the legacy args', () => {
    assert.deepEqual(
      ensureQueueArgs({ slug: 'iron-discipline', feedDir: 'tt-lf/clipfeed-iron-discipline', ci: true }),
      ['ensure-queue', 'iron-discipline', '--local', 'tt-lf/clipfeed-iron-discipline', '--max', '4', '--archive'],
    );
  });

  test('ensureQueueArgs ci:false is byte-identical to the legacy pipeline args', () => {
    assert.deepEqual(
      ensureQueueArgs({ slug: 'iron-discipline', feedDir: 'tt-lf/clipfeed-iron-discipline', ci: false }),
      ['ensure-queue', 'iron-discipline', '--local', 'tt-lf/clipfeed-iron-discipline', '--max', '4'],
    );
  });

  // channel-pipeline.mjs is a top-level CLI script (running it in-process would
  // run the whole autopilot) — pin the wiring at the call site instead.
  test('channel-pipeline passes ci: GITHUB_ACTIONS === "true" to the args builder', () => {
    const src = fs.readFileSync(new URL('../channel-pipeline.mjs', import.meta.url), 'utf8');
    assert.match(src, /ensureQueueArgs\(\{\s*slug,\s*feedDir,\s*ci:\s*process\.env\.GITHUB_ACTIONS === 'true'\s*\}\)/);
  });
});

// ===========================================================================
// review r1: load-bearing expressions pinned (a one-token "cleanup" revert
// reintroduces #96 with every behavior test still green)
// ===========================================================================

describe('#96 review r1: load-bearing expressions pinned in shorts-clips.mjs', () => {
  test('ensureQueue dispatches the Release archive with `!localDir || archiveMode`', () => {
    const src = fs.readFileSync(new URL('../longvideo/shorts-clips.mjs', import.meta.url), 'utf8');
    assert.match(src, /archive:\s*!localDir \|\| archiveMode/);
  });

  test('an ALL-fail upload batch fails loudly BEFORE saveChannelState (run stays un-marked)', () => {
    const src = fs.readFileSync(new URL('../longvideo/shorts-clips.mjs', import.meta.url), 'utf8');
    assert.match(src, /if \(entries\.length === 0\) await fail\(`all \$\{clips\.length\} clips failed Release upload`\);/);
    // and the save must come after the guard, not before it
    const guardAt = src.indexOf('if (entries.length === 0) await fail(');
    const saveAt = src.indexOf('saveChannelState(slug, st);', guardAt);
    assert.ok(saveAt > guardAt, 'saveChannelState must run after the all-fail guard');
  });

  test('release asset download requests application/octet-stream and validates MP4 size and magic bytes', () => {
    const src = fs.readFileSync(new URL('../longvideo/shorts-clips.mjs', import.meta.url), 'utf8');
    assert.match(src, /Accept:\s*'application\/octet-stream'/, 'requests binary octet-stream so GitHub returns MP4 bytes, not JSON metadata');
    assert.match(src, /buf\.length\s*<\s*50000/, 'guards against corrupted / tiny payload before saving or uploading');
    assert.match(src, /magic\s*!==\s*'ftyp'/, 'verifies MP4 ftyp container signature before uploading to YouTube');
  });
});

// Audit 2026-11-13 #7 — post-next exit contract (spec docs/qa/truthful-outcomes-qa.md).
// Every "posted nothing" path used to exit 0 and the pipeline logged ✓.
describe('audit #7: post-next exit codes', () => {
  const src = () => fs.readFileSync(new URL('../longvideo/shorts-clips.mjs', import.meta.url), 'utf8');
  const exitAfter = (marker) => {
    const s = src();
    const at = s.indexOf(marker);
    assert.ok(at > 0, `marker not found: ${marker}`);
    const m = s.slice(at).match(/process\.exit\(([^)]*)\)/);
    return m && m[1];
  };

  test('the exported contract matches the pipeline constants', async () => {
    const { CLIP_EXIT } = await import('../longvideo/shorts-clips.mjs');
    assert.deepEqual(CLIP_EXIT, { POSTED: 0, NOTHING_DUE: 3, NO_CLIP: 4 });
    const pipe = fs.readFileSync(new URL('../channel-pipeline.mjs', import.meta.url), 'utf8');
    assert.match(pipe, /const CLIPS_NOTHING_DUE = 3;/);
    assert.match(pipe, /const CLIPS_NO_CLIP = 4;/);
  });

  test('already posted today -> 0; off day -> NOTHING_DUE', () => {
    assert.equal(exitAfter('clip Short already posted today'), '0');
    assert.equal(exitAfter('is not a short day'), 'CLIP_EXIT.NOTHING_DUE');
  });

  test('quota blocked, exhausted queue -> NO_CLIP', () => {
    assert.equal(exitAfter('[quota] upload skipped'), 'CLIP_EXIT.NO_CLIP');
    assert.equal(exitAfter('queue exhausted (all posted'), 'CLIP_EXIT.NO_CLIP');
  });

  test('empty queue: stale docs -> NO_CLIP, fresh docs -> NOTHING_DUE', () => {
    const s = src();
    const block = s.slice(s.indexOf('const stale = !dd'), s.indexOf('const stale = !dd') + 900);
    assert.match(block, /process\.exit\(stale \? CLIP_EXIT\.NO_CLIP : CLIP_EXIT\.NOTHING_DUE\)/);
  });

  test('a verify-run with no exit status (killed / timed out) is a failure, not success', () => {
    assert.doesNotMatch(src(), /process\.exit\(v\.status \|\| 0\)/);
    assert.match(src(), /process\.exit\(v\.status \?\? 1\)/);
  });
});

// Audit #7 follow-up (live run 43724498853): CLIP_EXIT was declared AFTER the
// top-level `await postNext()` dispatch, so every coded exit threw a TDZ
// ReferenceError and exited 1 ("Clip posting failed"). Source pins could not
// see it — this test RUNS post-next for real (off day: no network needed).
describe('audit #7 follow-up: post-next exit codes from a real run', () => {
  test('off day -> exit 3 (NOTHING_DUE), not a crash', async () => {
    const os = await import('node:os');
    const path = await import('node:path');
    const { spawnSync } = await import('node:child_process');
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'clips-exit-'));
    try {
      const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const notToday = DAY[(new Date().getUTCDay() + 1) % 7];
      fs.mkdirSync(path.join(sandbox, 'yt-mcp', 'state'), { recursive: true });
      fs.writeFileSync(path.join(sandbox, 'yt-mcp', 'cadence.json'), JSON.stringify({ quotequarry: { shortDays: [notToday], shortsSource: 'clips' } }));
      const script = new URL('../longvideo/shorts-clips.mjs', import.meta.url);
      const r = spawnSync(process.execPath, [script.pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'post-next', 'quotequarry'], {
        cwd: sandbox, encoding: 'utf8', timeout: 60000,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NTFY_TOPIC: '' },
      });
      assert.doesNotMatch(r.stderr || '', /before initialization/, 'no TDZ crash');
      assert.match(r.stdout || '', /is not a short day/);
      assert.equal(r.status, 3, `expected NOTHING_DUE (3), got ${r.status}: ${(r.stderr || '').slice(0, 200)}`);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Audit 2026-11-13 #9 — clip-feed run identity. The doc-day feed (local mode,
// inside the SAME CI run that uploads lf-<slug>) recorded docRunId
// 'local-<ts>', while the self-feed matches artifacts by GitHub run id — so a
// doc fed on its doc day was eligible to be clipped AGAIN when the queue ran
// dry (every channel's recent doneRuns were local-* entries). And the self-feed
// scanned the 14 newest successful runs: with the 48/day external heartbeat
// that is ~7 hours — new docs would stop being found. Now: CI feeds record
// GITHUB_RUN_ID, and docs are found by artifact NAME (independent of run count).
// Spec + QA: docs/qa/clip-run-identity-qa.md.
// ---------------------------------------------------------------------------
describe('audit #9: clip-feed run identity', () => {
  test('localFeedRunId: the CI run id when present, local-<ts> only off CI', async () => {
    const { localFeedRunId } = await import('../longvideo/shorts-clips.mjs');
    assert.equal(localFeedRunId({ GITHUB_RUN_ID: '43724498853' }, 1794755374545), '43724498853');
    assert.equal(localFeedRunId({}, 1794755374545), 'local-1794755374545');
  });

  test('pickDocRun: the newest unexpired doc artifact not yet clipped', async () => {
    const { pickDocRun } = await import('../longvideo/shorts-clips.mjs');
    const arts = [
      { workflow_run: { id: 43724498853 }, expired: false },
      { workflow_run: { id: 40660835260 }, expired: false },
    ];
    assert.deepEqual(pickDocRun(arts, {}), { runId: '43724498853' });
    assert.deepEqual(pickDocRun(arts, { doneRuns: ['43724498853'] }), { runId: null, reason: 'run 43724498853 already clipped' });
    assert.deepEqual(pickDocRun(arts, { lastRunId: '43724498853' }), { runId: null, reason: 'run 43724498853 already clipped' });
    assert.deepEqual(pickDocRun([{ workflow_run: { id: 1 }, expired: true }, ...arts], { doneRuns: ['43724498853'] }).runId, null, 'expired artifacts are skipped, the next is already clipped');
    assert.deepEqual(pickDocRun([], {}), { runId: null, reason: 'no doc artifacts' });
  });

  test('regression: a doc fed locally in CI is NEVER re-clipped by the self-feed', async () => {
    const { pickDocRun, localFeedRunId } = await import('../longvideo/shorts-clips.mjs');
    const fedAs = localFeedRunId({ GITHUB_RUN_ID: '43724498853' }, Date.now());
    const clipQueue = { lastRunId: fedAs, doneRuns: [fedAs] };
    assert.equal(pickDocRun([{ workflow_run: { id: 43724498853 }, expired: false }], clipQueue).runId, null);
  });

  test('wiring: ensure-queue finds docs by artifact name, not by scanning the last 14 runs', () => {
    const src = fs.readFileSync(new URL('../longvideo/shorts-clips.mjs', import.meta.url), 'utf8');
    assert.match(src, /actions\/artifacts\?name=lf-\$\{slug\}/);
    assert.doesNotMatch(src, /runs\?status=success&per_page=14/);
    assert.match(src, /docRunId = localFeedRunId\(process\.env, Date\.now\(\)\)/);
  });
});
