// #106 Phase 4.5 T4b — daily-excel-report.mjs drove the daily report from a
// hardcoded 4-channel array (labels/handles/fbPageIds inline). It now
// discovers channels from yt-mcp/studio-channels.json (active only) via
// lib/registry-slugs.mjs, and gains the reporting-daily matrix modes:
//   --channel <slug>  one channel per invocation → fragment JSON artifact
//   --collect         merge the fragment artifacts into the SAME daily payload
// The workbook format is pinned on fixture data so the registry flip produces
// byte-equivalent output for the legacy 4 (RULES: same schedules, same outputs).
// The script body is guarded behind IS_MAIN, so importing here runs no fetches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { reportChannels, parseReportArgs, fragmentOf, collectFragments, buildExcel, ntfyHeaders } from '../daily-excel-report.mjs';
import { activeRegistryChannels, loadRegistryChannels } from '../lib/registry-slugs.mjs';
import { fbPageId as registryFbPageId, destinationsFor } from '../lib/registry.mjs';

function tmpDir(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `t4b-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('T4b reportChannels: the legacy 4 keep byte-identical labels/handles/fbPageIds (same report rows as the hardcoded array)', () => {
  const chans = reportChannels();
  const bySlug = Object.fromEntries(chans.map((c) => [c.slug, c]));
  // MR-only mode (owner directive 2026-11-03): only the ACTIVE registry
  // channels report — the paused three must NOT appear.
  assert.deepEqual(chans.map((c) => c.slug), ['money-rulebook'], 'the active set is the MR-only pause');
  assert.deepEqual([bySlug['money-rulebook'].label, bySlug['money-rulebook'].handle, bySlug['money-rulebook'].fbPageId], ['The Money Rulebook', '@themoneyrulebook-p4y', '1077306835630491']);
  // The four legacy tuples stay pinned against the REGISTRY FILE itself
  // (state-independent — reactivation restores the rows with zero test edits).
  const reg = JSON.parse(fs.readFileSync('yt-mcp/studio-channels.json', 'utf8'));
  const fileBySlug = Object.fromEntries(reg.channels.map((c) => [c.slug, c]));
  assert.deepEqual([fileBySlug['quotequarry'].label, fileBySlug['quotequarry'].handle, registryFbPageId('quotequarry')], ['Quote Quarry', '@quotequarry302', '114550268199751']);
  assert.deepEqual([fileBySlug['investors-compass'].label, fileBySlug['investors-compass'].handle, registryFbPageId('investors-compass')], ["Investor's Compass", '@investorscompasshq', '116157974886564']);
  assert.deepEqual([fileBySlug['debt-free-doctrine'].label, fileBySlug['debt-free-doctrine'].handle, registryFbPageId('debt-free-doctrine')], ['Debt-Free Doctrine', '@debtfreedoctrine', '106473735839651']);
});

test('T4b reportChannels: derived from the live registry — a new active channel joins without a code change', () => {
  // T4c: each channel also carries its resolved destinations
  // (fbPageId/igHandle/threadsHandle/tiktokHandle) next to the fbPageId field.
  const expected = activeRegistryChannels(loadRegistryChannels()).map((c) => ({
    slug: c.slug,
    label: c.label,
    handle: c.handle,
    envSlug: c.envSlug,
    fbPageId: registryFbPageId(c.slug),
    igHandle: destinationsFor(c.slug)?.igHandle,
    threadsHandle: destinationsFor(c.slug)?.threadsHandle,
    tiktokHandle: destinationsFor(c.slug)?.tiktokHandle,
  }));
  assert.deepEqual(reportChannels(), expected, 'reportChannels must be the registry view, not a second list');
});

test('T4b parseReportArgs: mode, --channel <slug> (value never mistaken for the mode) and --collect', () => {
  assert.deepEqual(parseReportArgs([]), { mode: 'daily', channel: null, collect: false });
  assert.deepEqual(parseReportArgs(['weekly']), { mode: 'weekly', channel: null, collect: false });
  assert.deepEqual(parseReportArgs(['--channel', 'quotequarry']), { mode: 'daily', channel: 'quotequarry', collect: false });
  assert.deepEqual(parseReportArgs(['daily', '--collect']), { mode: 'daily', channel: null, collect: true });
  assert.deepEqual(parseReportArgs(['--channel', 'money-rulebook', 'monthly', '--collect']), { mode: 'monthly', channel: 'money-rulebook', collect: true });
});

test('T4b fragmentOf: one channel fetch becomes the per-channel fragment artifact (null-padded when a half fails)', () => {
  const data = { ytData: [{ label: 'Quote Quarry', subs: 10 }], fbPages: [{ slug: 'quotequarry', followers: 5 }], threads: null };
  const frag = fragmentOf('quotequarry', data);
  assert.equal(frag.slug, 'quotequarry');
  assert.deepEqual(frag.yt, { label: 'Quote Quarry', subs: 10 });
  assert.deepEqual(frag.fb, { slug: 'quotequarry', followers: 5 });
  assert.ok(frag.fetchedAt, 'fragment carries its fetch time');

  const half = fragmentOf('debt-free-doctrine', { ytData: [], fbPages: [], threads: null });
  assert.equal(half.yt, null, 'no YouTube rows = null yt half, not a missing key');
  assert.equal(half.fb, null);
});

test('T4b collectFragments: registry order + GAP for missing fragments', (t) => {
  const dir = tmpDir(t, 'frags');
  fs.mkdirSync(path.join(dir, 'fragments'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'fragments', 'debt-free-doctrine.json'), JSON.stringify({ slug: 'debt-free-doctrine', yt: { label: 'Debt-Free Doctrine', subs: 7 }, fb: null }));
  fs.writeFileSync(path.join(dir, 'fragments', 'quotequarry.json'), JSON.stringify({ slug: 'quotequarry', yt: { label: 'Quote Quarry', subs: 9 }, fb: { slug: 'quotequarry', followers: 3 } }));
  const channels = [
    { slug: 'quotequarry', label: 'Quote Quarry' },
    { slug: 'money-rulebook', label: 'The Money Rulebook' }, // no fragment on disk
    { slug: 'debt-free-doctrine', label: 'Debt-Free Doctrine' },
  ];
  const out = collectFragments(channels, path.join(dir, 'fragments'));
  assert.deepEqual(out.ytData.map((y) => y.label), ['Quote Quarry', 'Debt-Free Doctrine'], 'fragment order follows the registry, not the artifact download order');
  assert.deepEqual(out.fbPages, [{ slug: 'quotequarry', followers: 3 }]);
  assert.equal(out.ytData.some((y) => y.label === 'The Money Rulebook'), false, 'missing fragment = GAP rows absent, never a crash');
  const corrupt = path.join(dir, 'fragments', 'junk.json');
  fs.writeFileSync(corrupt, '{not json');
  const after = collectFragments(channels, path.join(dir, 'fragments'));
  assert.deepEqual(after.ytData.map((y) => y.label), ['Quote Quarry', 'Debt-Free Doctrine'], 'a corrupt fragment is skipped with a log, not fatal');
});

test('T4b buildExcel on fixture data: identical workbook format (sheets, headers, rows, growth + state file)', async (t) => {
  const reportsDir = tmpDir(t, 'reports');
  const stateDir = tmpDir(t, 'state');
  const ytData = [
    { label: 'Quote Quarry', title: 'Quote Quarry', handle: '@quotequarry302', subs: 1000, views: 50000, videos: 120, retention: { views: 900, avgPct: 86.2, subsGained: 12 }, videoRows: [{ channel: 'Quote Quarry', title: 'Test short', videoId: 'abc123', goesLive: '2026-10-31 22:35 UTC', privacy: 'public', views: 2400, likes: 100, comments: 5 }] },
    { label: 'Debt-Free Doctrine', title: 'Debt-Free Doctrine', handle: '@debtfreedoctrine', subs: 500, views: 20000, videos: 60, retention: null, videoRows: [] },
  ];
  const fbPages = [
    { slug: 'quotequarry', label: 'Quote Quarry', name: 'Reliq North', username: 'reliqnorth', followers: 8600, igUsername: 'quotequarry8', igFollowers: 100, igPosts: 42 },
  ];
  // ntfy is env-gated at call time — detach it so the test never posts.
  const prevTopic = process.env.NTFY_TOPIC;
  delete process.env.NTFY_TOPIC;
  let file;
  try {
    // T4c: the destination rows are channels-driven — pass the fixture's
    // channels (quotequarry is the only seeded Threads destination).
    const channels = [
      { slug: 'quotequarry', label: 'Quote Quarry', fbPageId: '114550268199751', threadsHandle: 'quotequarry8' },
      { slug: 'debt-free-doctrine', label: 'Debt-Free Doctrine', fbPageId: '106473735839651' },
    ];
    file = await buildExcel(ytData, fbPages, null, { reportsDir, stateDir, channels });
  } finally {
    if (prevTopic !== undefined) process.env.NTFY_TOPIC = prevTopic;
  }

  assert.equal(path.dirname(file), reportsDir, 'the workbook lands in the reports dir (daily-report-<date>.xlsx)');
  assert.match(path.basename(file), /^daily-report-\d{4}-\d{2}-\d{2}\.xlsx$/);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  assert.deepEqual(
    wb.worksheets.map((ws) => ws.name),
    ['Overview', 'YouTube Details', 'Retention (28d)', 'Facebook Pages', 'Instagram', 'Growth (since last report)', 'Video Views'],
    'sheet set and order are unchanged',
  );

  const overview = wb.getWorksheet('Overview');
  assert.equal(overview.getRow(1).getCell(1).value, 'Channel');
  assert.deepEqual(overview.getRow(2).values.slice(1), ['Quote Quarry', 'YouTube', '@quotequarry302', 1000, 50000, 120], 'YouTube row shape unchanged');
  assert.equal(overview.getRow(4).getCell(1).value, 'Reliq North (feeds: Quote Quarry)', 'FB row keeps the (feeds: <label>) suffix');
  assert.equal(overview.getRow(5).getCell(2).value, 'Instagram');
  // T4c: the manual 'All brands' TikTok row died with its display literal —
  // rows below the IG row are destinations-driven (quotequarry's seeded
  // threadsHandle gets the Threads row; no tiktokHandle = no TikTok row).
  assert.deepEqual(overview.getRow(6).values.slice(1), ['Quote Quarry', 'Threads', '@quotequarry8', 'n/a', '-', '-'], 'the seeded Threads destination gets the Threads row');
  assert.ok(!overview.getRow(7).getCell(1).value, 'no TikTok row while no channel carries a tiktokHandle');

  const details = wb.getWorksheet('YouTube Details');
  assert.deepEqual(details.getRow(2).values.slice(1), ['Quote Quarry', '@quotequarry302', 1000, 50000, 120]);

  const retention = wb.getWorksheet('Retention (28d)');
  assert.equal(retention.getRow(2).getCell(5).value, '✅ feed will promote', 'retention verdict for 86.2% avg watched');
  assert.equal(retention.getRow(3).getCell(5).value, 'no data', 'channels without analytics keep the no-data verdict');

  const growth = wb.getWorksheet('Growth (since last report)');
  assert.equal(growth.getRow(2).getCell(1).value, '(first run — deltas appear from the next report on)', 'no prior snapshot → placeholder row');

  const videos = wb.getWorksheet('Video Views');
  assert.equal(videos.getRow(2).getCell(3).value, 'abc123');

  const snap = JSON.parse(fs.readFileSync(path.join(stateDir, 'report-stats.json'), 'utf8'));
  assert.equal(snap.yt['Quote Quarry'].subs, 1000, 'the growth snapshot is still written for the next run');
});

test('T4b ntfyHeaders: the push title/filename carry the report mode (daily/weekly/monthly), ASCII-only', () => {
  assert.deepEqual(ntfyHeaders('daily', 4, 4), {
    'Title': 'Quarry daily report - 4 YT / 4 FB channels',
    'Tags': 'chart',
    'Filename': 'daily-report-' + new Date().toISOString().slice(0, 10) + '.xlsx',
  });
  assert.equal(ntfyHeaders('weekly', 1, 1).Title, 'Quarry weekly report - 1 YT / 1 FB channels');
  assert.equal(ntfyHeaders('monthly', 1, 1).Filename, 'monthly-report-' + new Date().toISOString().slice(0, 10) + '.xlsx');
});

test('T4b buildExcel with NTFY_TOPIC set: the push really goes out and carries the mode (fetch intercepted, no network)', async (t) => {
  const reportsDir = tmpDir(t, 'reports-ntfy');
  const stateDir = tmpDir(t, 'state-ntfy');
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, title: opts.headers.Title, filename: opts.headers.Filename });
    return { ok: true, status: 200 };
  };
  process.env.NTFY_TOPIC = 'test-topic';
  try {
    await buildExcel(
      [{ label: 'Quote Quarry', title: 'Quote Quarry', handle: '@quotequarry302', subs: 1, views: 1, videos: 1, retention: null, videoRows: [] }],
      [],
      null,
      { mode: 'weekly', reportsDir, stateDir },
    );
  } finally {
    globalThis.fetch = realFetch;
    if (process.env.NTFY_TOPIC === 'test-topic') delete process.env.NTFY_TOPIC;
  }
  assert.equal(calls.length, 1, 'exactly one ntfy push per build');
  assert.match(calls[0].url, /ntfy\.sh\/test-topic$/);
  assert.match(calls[0].title, /Quarry weekly report/, 'the mode must reach the push title (regression: orphaned MODE reference)');
  assert.match(calls[0].filename, /^weekly-report-\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test('T4b buildExcel: growth deltas appear when the previous snapshot is from an earlier day', async (t) => {
  const reportsDir = tmpDir(t, 'reports2');
  const stateDir = tmpDir(t, 'state2');
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'report-stats.json'), JSON.stringify({ date: yesterday, yt: { 'Quote Quarry': { subs: 900, views: 49000 } }, fb: {} }));
  const prevTopic = process.env.NTFY_TOPIC;
  delete process.env.NTFY_TOPIC;
  let file;
  try {
    file = await buildExcel(
      [{ label: 'Quote Quarry', title: 'Quote Quarry', handle: '@quotequarry302', subs: 1000, views: 50000, videos: 120, retention: null, videoRows: [] }],
      [],
      null,
      { reportsDir, stateDir, channels: [{ slug: 'quotequarry', label: 'Quote Quarry', handle: '@quotequarry302' }] },
    );
  } finally {
    if (prevTopic !== undefined) process.env.NTFY_TOPIC = prevTopic;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const growth = wb.getWorksheet('Growth (since last report)');
  assert.deepEqual(growth.getRow(2).values.slice(1), ['Quote Quarry — YouTube', 1000, 100, 50000, 1000], 'delta row shape unchanged (now, change, views, change)');
});
