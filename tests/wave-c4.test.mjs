// Live-fix wave C4 — settings, team, users, sessions, usage, create and
// registry detail (T5-06..T5-13, T5-17, orphan draft previews). Pure logic
// is imported; components with '@/' imports are pinned by source scans
// (CRLF-robust String.raw regexes). EARS criteria + plain-English QA:
// docs/qa/live-fix-wave-c4-qa.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readJobs, JOBS_UNREACHABLE } from '../studio/lib/hf-jobs.mjs';
import { deviceLabel, localTime, capList, SIGNIN_CAP } from '../studio/lib/session-view.mjs';
import { TEAM_NAME_MAX, cleanTeamName, roleChangeError } from '../studio/lib/team-rules.mjs';
import { channelOwnership, clientChannelCount, keysForChannels } from '../studio/lib/users-view.mjs';
import { groupChannelRows, failureSummary, errorReason } from '../studio/lib/usage-view.mjs';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const CREATE = read('studio/app/create/page.js');
const CREATE_ROUTE = read('studio/app/api/create-video/route.js');
const SETTINGS = read('studio/app/settings/page.js');
const SESSIONS = read('studio/app/sessions/page.js');
const SESSION_DB = read('studio/lib/session-db.js');
const USERS = read('studio/app/users/page.js');
const USERS_ROUTE = read('studio/app/api/users/route.js');
const TEAM_ROUTE = read('studio/app/api/team/route.js');
const USAGE = read('studio/app/usage/page.js');
const USAGE_ROUTE = read('studio/app/api/usage/route.js');
const DETAIL = read('studio/app/templates/registry/detail/page.js');
const REGISTRY = read('studio/app/templates/registry/page.js');
const DRAFTS = read('studio/app/templates/drafts/page.js');

// ---- a fake GitHub contents API for readJobs ----
function fakeGitHub({ listStatus = 200, list = [], files = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (/\/contents\/hf-out\?ref=main$/.test(url)) return json(listStatus, list);
    const m = /\/contents\/hf-out\/([^/]+)\/status\.json/.exec(url);
    if (m) {
      const f = files[m[1]];
      if (f === undefined) return json(404, { message: 'Not Found' });
      if (typeof f === 'number') return json(f, { message: 'boom' });
      return json(200, f);
    }
    return json(404, {});
  };
  return { fetchImpl, calls };
}

describe('T5-06 — /create lists real render jobs only, and says when it cannot check', () => {
  test('J1: WHEN GitHub answers non-OK for the job list THEN readJobs throws "Couldn\'t check rendered videos right now" (never a silent [])', async () => {
    assert.equal(JOBS_UNREACHABLE, "Couldn't check rendered videos right now");
    const gh = fakeGitHub({ listStatus: 502 });
    await assert.rejects(readJobs({ fetchImpl: gh.fetchImpl, repo: 'o/r', headers: {} }), (e) => {
      assert.match(e.message, /^Couldn't check rendered videos right now/);
      assert.match(e.message, /502/);
      return true;
    });
  });

  test('J2: WHEN hf-out does not exist yet (404) THEN the list is honestly empty', async () => {
    const gh = fakeGitHub({ listStatus: 404 });
    assert.deepEqual(await readJobs({ fetchImpl: gh.fetchImpl, repo: 'o/r', headers: {} }), []);
  });

  test('J3: a folder without its own status.json (the nested "tech" folder) is not a job', async () => {
    const gh = fakeGitHub({
      list: [{ type: 'dir', name: 'tech' }, { type: 'dir', name: 'quiet-money-abc' }, { type: 'file', name: 'README.md' }],
      files: { 'quiet-money-abc': { id: 'quiet-money-abc', state: 'done', topic: 'Quiet money', createdAt: '2026-11-20T10:00:00Z' } },
    });
    const jobs = await readJobs({ fetchImpl: gh.fetchImpl, repo: 'o/r', headers: {} });
    assert.deepEqual(jobs.map((j) => j.id), ['quiet-money-abc']);
    assert.match(jobs[0].videoUrl, /hf-out\/quiet-money-abc\/video\.mp4$/);
  });

  test('J4: a job whose status.json cannot be read right now is "unknown", not dropped', async () => {
    const gh = fakeGitHub({ list: [{ type: 'dir', name: 'x-1' }], files: { 'x-1': 500 } });
    const jobs = await readJobs({ fetchImpl: gh.fetchImpl, repo: 'o/r', headers: {} });
    assert.deepEqual(jobs, [{ id: 'x-1', state: 'unknown', videoUrl: null }]);
  });

  test('J5: listJobs never caches a failure, and the route passes the error through', () => {
    const src = read('studio/lib/hf-jobs.mjs');
    assert.doesNotMatch(src, /cache\.val = \[\]; return \[\]/, 'the silent [] on a GitHub error is gone');
    assert.match(CREATE_ROUTE, /error: jobs\.error \|\| null/);
  });

  test('J6: an unknown-state job shows "Status unknown" with a Refresh, never an endless spinner', () => {
    assert.match(CREATE, /unknown: \{ tone: 'plain', label: 'Status unknown' \}/);
    assert.doesNotMatch(CREATE, /label: 'In progress…'/);
    assert.match(CREATE, /const unknownState = j\.state === 'unknown' \|\| !STATE_CHIP\[j\.state\];/);
    assert.match(CREATE, /\) : unknownState \? \(/, 'unknown (or any unrecognised state) has its own branch');
    assert.match(CREATE, /onClick=\{loadJobs\}[^>]*>\s*<RefreshCw size=\{13\} \/> Refresh/);
    // the spinner is only for queued jobs
    assert.match(CREATE, /j\.state === 'queued' \? <Loader2 size=\{20\} className="animate-spin" \/>/);
  });

  test('J7: the page shows the API error as-is ("Couldn\'t check rendered videos right now …")', () => {
    assert.match(CREATE, /setJobsErr\(d\.error \|\| ''\)/);
    assert.doesNotMatch(CREATE, /Couldn't read the render history/);
  });
});

describe('T5-07 / T5-08 — one local time format; all sign-ins counted; readable devices', () => {
  test('S1: a raw user-agent becomes "Chrome on Windows" and friends', () => {
    const chromeWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    assert.equal(deviceLabel(chromeWin), 'Chrome on Windows');
    assert.equal(deviceLabel(chromeWin + ' Edg/131.0.0.0'), 'Edge on Windows');
    assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'), 'Chrome on Android');
    assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), 'Safari on iPhone');
    assert.equal(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:132.0) Gecko/20100101 Firefox/132.0'), 'Firefox on Mac');
    assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'), 'Browser on Windows');
    assert.equal(deviceLabel('curl/8.18.0'), 'Script (curl)');
    assert.equal(deviceLabel('node'), 'Script (Node)');
    assert.equal(deviceLabel('Python-urllib/3.14'), 'Script (Python)');
    assert.equal(deviceLabel(''), 'Unknown device');
    assert.equal(deviceLabel(null), 'Unknown device');
  });

  test('S2: times read "7:38 pm your time" today, with the date on other days', () => {
    const now = new Date('2026-11-20T15:00:00Z');
    const tz = 'Asia/Karachi'; // UTC+5 — 14:38Z is 7:38 pm there
    assert.equal(localTime('2026-11-20T14:38:53Z', { now, timeZone: tz }), '7:38 pm your time');
    assert.equal(localTime('2026-11-19T04:05:00Z', { now, timeZone: tz }), 'Nov 19, 9:05 am your time');
    assert.equal(localTime('2025-11-19T04:05:00Z', { now, timeZone: tz }), 'Nov 19 2025, 9:05 am your time');
    assert.equal(localTime(null), '—');
    assert.equal(localTime('not a date'), '—');
  });

  test('S3: lists over the cap say "Showing 20 of 40"; nothing is hidden silently', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: i }));
    assert.equal(SIGNIN_CAP, 20);
    const capped = capList(rows, false);
    assert.equal(capped.shown.length, 20);
    assert.equal(capped.total, 40);
    assert.equal(capped.note, 'Showing 20 of 40');
    const all = capList(rows, true);
    assert.equal(all.shown.length, 40);
    assert.equal(all.note, '');
    assert.equal(capList(rows.slice(0, 3), false).note, '');
  });

  test('S4: listSessions has no hidden LIMIT 20 and both lists carry a readable device', () => {
    const fn = SESSION_DB.slice(SESSION_DB.indexOf('export async function listSessions'), SESSION_DB.indexOf('// shared brute-force throttle'));
    assert.doesNotMatch(fn, /LIMIT 20(?!0)/);
    assert.match(fn, /LIMIT 200/, 'still bounded, like the owner list');
    assert.match(fn, /device: deviceLabel\(r\.user_agent\)/);
    const all = SESSION_DB.slice(SESSION_DB.indexOf('export async function listAllSessions'));
    assert.match(all, /device: deviceLabel\(r\.user_agent\)/);
    assert.match(SESSION_DB, /import \{ deviceLabel \} from '\.\/session-view\.mjs'/);
  });

  test('S5: Settings › Security and /sessions both use localTime; no raw UTC slices', () => {
    assert.match(SETTINGS, /last used \{localTime\(s\.lastUsed\)\}/);
    assert.match(SETTINGS, /signed in \{localTime\(s\.created\)\}/);
    assert.doesNotMatch(SETTINGS, /toLocaleString\(\)/);
    assert.match(SESSIONS, /const when = \(iso\) => localTime\(iso\)/);
    assert.doesNotMatch(SESSIONS, /replace\('T', ' '\)\.slice\(0, 16\)/);
  });

  test('S6: Settings shows "Showing 20 of 40" with a See all button', () => {
    assert.match(SETTINGS, /capList\(sessions, showAllSessions\)/);
    assert.match(SETTINGS, /\{signins\.note\} — /);
    assert.match(SETTINGS, /onClick=\{\(\) => setShowAllSessions\(true\)\}[^>]*>See all<\/button>/);
  });

  test('S7: Users › Last action is in local time too', () => {
    assert.match(USERS, /localTime\(u\.lastAction\.at\)/);
    assert.doesNotMatch(USERS, /slice\(0, 16\)\.replace\('T', ' '\)/);
  });
});

describe('T5-09 / T5-10 / T5-11 — team roles, names and fresh counts', () => {
  test('T1: names are trimmed to 60 characters and control characters dropped', () => {
    assert.equal(TEAM_NAME_MAX, 60);
    assert.equal(cleanTeamName('x'.repeat(300)).length, 60);
    assert.equal(cleanTeamName('  Ada \n Lovelace\t '), 'Ada Lovelace');
    assert.equal(cleanTeamName(undefined), '');
  });

  test('T2: role changes are staff ↔ client only; the last owner is never demoted', () => {
    const users = [
      { email: 'own@x.com', role: 'owner' },
      { email: 'staff@x.com', role: 'staff' },
    ];
    assert.equal(roleChangeError(users, 'staff@x.com', 'client'), null);
    assert.match(roleChangeError(users, 'staff@x.com', 'owner'), /staff or client/);
    assert.match(roleChangeError(users, 'own@x.com', 'staff'), /last owner/);
    assert.match(roleChangeError(users, 'nobody@x.com', 'staff'), /unknown/);
    assert.equal(roleChangeError([...users, { email: 'own2@x.com', role: 'owner' }], 'own@x.com', 'staff'), null);
  });

  test('T3: POST stores and echoes the cleaned name; PATCH changes a role with the guard and revokes sessions', () => {
    assert.match(TEAM_ROUTE, /const name = cleanTeamName\(body\.name\)/);
    assert.match(TEAM_ROUTE, /VALUES \(\$\{email\}, \$\{role\}, \$\{name\}\)/);
    assert.match(TEAM_ROUTE, /\{ email, role, name \}/, 'the echoed member carries the stored name');
    assert.doesNotMatch(TEAM_ROUTE, /name: String\(body\.name \|\| ''\)/);
    assert.match(TEAM_ROUTE, /export async function PATCH\(req\)/);
    assert.match(TEAM_ROUTE, /roleChangeError\(users, email, body\.role\)/);
    assert.match(TEAM_ROUTE, /UPDATE users SET role = \$\{body\.role\} WHERE email = \$\{email\}/);
    assert.match(TEAM_ROUTE, /appendAudit\(actor\.email, 'team-role'/);
    // the DELETE last-owner guard stays
    assert.match(TEAM_ROUTE, /cannot remove the last owner/);
  });

  test('T4: the team form has an optional Name (max 60) and a confirmed role select per non-owner', () => {
    assert.match(SETTINGS, /id="team-name"[\s\S]{0,200}maxLength=\{60\}/);
    assert.match(SETTINGS, /body: JSON\.stringify\(\{ email: newEmail, role: newRole, name: newName \}\)/);
    assert.match(SETTINGS, /aria-label=\{`Role for \$\{u\.email\}`\}/);
    assert.match(SETTINGS, /const changeRole = async \(email, role\) =>/);
    assert.match(SETTINGS, /method: 'PATCH'/);
    assert.match(SETTINGS, /title: `Make \$\{email\} \$\{role\}\?`/);
  });

  test('T5: the help text says the truth (database, ask Claude for owners)', () => {
    assert.doesNotMatch(SETTINGS, /editing the invite file in the repo/);
    assert.match(SETTINGS, /Ask Claude to add another owner\./);
  });

  test('T6: the Accounts count refreshes after add, remove or role change', () => {
    assert.match(SETTINGS, /<UsersPage embedded refreshKey=\{teamVersion\} \/>/);
    assert.equal((SETTINGS.match(/setTeamVersion\(\(v\) => v \+ 1\)/g) || []).length, 3, 'add, remove and role change each bump it');
    assert.match(USERS, /\}, \[nonce, refreshKey\]\);/);
  });
});

describe('T5-12 — /users shows the real channels and keys', () => {
  const users = [
    { email: 'Own@x.com', role: 'owner' },
    { email: 'cli@x.com', role: 'client' },
  ];
  const registry = [
    { slug: 'money-rulebook', label: 'The Money Rulebook', ownerEmail: '' },
    { slug: 'yt-bot', label: 'YT-BOT', ownerEmail: 'own@x.com' },
    { slug: 'client-ch', label: 'Client Ch', ownerEmail: 'cli@x.com' },
    { slug: 'stray', label: 'Stray', ownerEmail: 'gone@x.com' },
  ];

  test('U1: channels with no owner email belong to the owner; only unknown owners stay unassigned', () => {
    const { byEmail, unbound } = channelOwnership(users, registry);
    assert.deepEqual(byEmail.get('own@x.com').map((c) => c.slug), ['money-rulebook', 'yt-bot']);
    assert.deepEqual(byEmail.get('cli@x.com').map((c) => c.slug), ['client-ch']);
    assert.deepEqual(unbound.map((c) => c.slug), ['stray']);
  });

  test('U2: "Client channels" counts only channels bound to client accounts', () => {
    assert.equal(clientChannelCount([
      { role: 'owner', channels: [{}, {}] },
      { role: 'client', channels: [{}] },
      { role: 'staff', channels: [] },
    ]), 1);
  });

  test('U3: keys come per owned channel from the vault (the /providers source)', () => {
    const channels = [{ slug: 'money-rulebook', label: 'The Money Rulebook' }, { slug: 'yt-bot', label: 'YT-BOT' }];
    assert.deepEqual(keysForChannels(channels, { 'money-rulebook': ['groq', 'gemini'] }), [
      { slug: 'money-rulebook', label: 'The Money Rulebook', providers: ['gemini', 'groq'] },
    ]);
  });

  test('U4: the route uses the shared helpers and the same vault file + decrypt as /providers', () => {
    assert.match(USERS_ROUTE, /channelOwnership\(users, registry\)/);
    assert.match(USERS_ROUTE, /readRepoJSON\(KEYS_FILE\)/);
    assert.match(USERS_ROUTE, /decryptKeys\(entry\.enc\)/);
    assert.match(USERS_ROUTE, /clientChannels: clientChannelCount\(list\)/);
    assert.match(USERS_ROUTE, /keys: keysForChannels\(myChannels, keysBySlug\)/);
  });

  test('U5: the page has an <h1> on /users, the client count and the per-channel keys', () => {
    assert.match(USERS, /embedded \? \(/);
    assert.match(USERS, /<PageHeader icon=\{UsersIcon\} title="Users"/);
    assert.match(USERS, /Client channels/);
    assert.match(USERS, /data\.clientChannels/);
    assert.doesNotMatch(USERS, /all legacy channels \(owner\)/);
    assert.match(USERS, /u\.keys\.map\(\(k\) =>/);
  });
});

describe('T5-13 — /usage says what it shows', () => {
  test('G1: non-channel buckets ("web-message", none) fold into one "Other" row', () => {
    const rows = [
      { key: 'money-rulebook', calls: 94, ok_calls: 73, fail_calls: 21, tokens: 100 },
      { key: 'web-message', calls: 15, ok_calls: 13, fail_calls: 2, tokens: 30 },
      { key: null, calls: 1, ok_calls: 1, fail_calls: 0, tokens: 5 },
    ];
    const out = groupChannelRows(rows, ['money-rulebook', 'yt-bot']);
    assert.deepEqual(out.map((r) => r.key), ['money-rulebook', 'Other']);
    const other = out[1];
    assert.equal(other.other, true);
    assert.deepEqual(other.parts, ['web-message', '(none)']);
    assert.equal(other.calls, 16);
    assert.equal(other.tokens, 35);
    assert.equal(other.fail_calls, 2);
    assert.deepEqual(groupChannelRows(rows, null), rows, 'registry unreadable → rows unchanged');
  });

  test('G2: failures read "29 of 129 calls failed · most often groq — HTTP error (16)"', () => {
    assert.equal(
      failureSummary({ events: 129, fail_calls: 29 }, [{ provider: 'groq', error_class: 'http_error', n: 16 }]),
      '29 of 129 calls failed · most often groq — HTTP error (16)',
    );
    assert.equal(failureSummary({ events: 10, fail_calls: 0 }, []), '');
    assert.equal(failureSummary({ events: 10, fail_calls: 2 }, []), '2 of 10 calls failed');
    assert.equal(errorReason('parse_error'), 'unreadable reply');
    assert.equal(errorReason('weird_thing'), 'weird thing');
  });

  test('G3: the route returns topErrors and groups channels via the registry', () => {
    assert.match(USAGE_ROUTE, /GROUP BY provider, error_class/);
    assert.match(USAGE_ROUTE, /groupChannelRows\(byChannel, slugs\)/);
    assert.match(USAGE_ROUTE, /topErrors/);
  });

  test('G4: the page is titled "AI usage" and shows the failure summary', () => {
    assert.match(USAGE, /title="AI usage"/);
    assert.doesNotMatch(USAGE, /title="Usage & cost"/);
    assert.match(USAGE, /failureSummary\(totals, data\.topErrors\)/);
    assert.match(SETTINGS, />AI usage<\/Link>/);
  });
});

describe('T5-17 and orphan draft previews', () => {
  test('R1: the registry detail with no id says "Pick a template from the registry" and links back', () => {
    assert.match(DETAIL, /if \(template === ''\) \{/);
    assert.match(DETAIL, /Pick a template from the registry/);
    assert.ok(DETAIL.indexOf("if (template === '') {") < DETAIL.indexOf('" has no registry metadata`}'), 'the empty-id branch runs before the unknown-id message');
    assert.match(DETAIL, /if \(template === null \|\| template === ''\) return;/, 'no fetch without an id');
  });

  test('R2: the drafts and registry pages never read /api/template-previews (orphan draft rows cannot show)', () => {
    assert.doesNotMatch(DRAFTS, /\/api\/template-previews'/);
    assert.doesNotMatch(REGISTRY, /template-previews/);
    assert.match(DRAFTS, /fetch\('\/api\/templates\/drafts'\)/, 'previews come attached to live draft files only');
  });
});
