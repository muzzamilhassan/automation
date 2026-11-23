// Creator City — Station drawer (research §5 item 7, 2026-11-23): the
// /api/stations/history route and the UI wiring. Studio files import through
// the '@/' alias, which plain node --test cannot resolve, so the wiring is
// pinned by SOURCE SCAN (house pattern: tests/stations-api.test.mjs). The
// behaviour behind it is proven in tests/station-settings.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { allowedRoles } from '../studio/lib/route-roles.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const route = read('studio/app/api/stations/history/route.js');
const drawer = read('studio/components/StationDrawer.js');
const runSteps = read('studio/components/RunStepsDrawer.js');
const slugPage = read('studio/app/channels/[slug]/page.js');

// ------------------------------------------------------------------ route
test('history: WHEN no user resolves THEN 401 before any data loads (fail-closed)', () => {
  assert.match(route, /getUser\(req\)\.catch\(\(\) => null\)/);
  const gate = route.indexOf("if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })");
  assert.ok(gate > 0, 'unknown user → 401');
  assert.ok(gate < route.indexOf('makeJobsRead('), '401 fires before the DB is touched');
});

test('history: WHEN the role is not owner/staff THEN 403 (in-route re-check, same as /api/stations)', () => {
  assert.match(route, /if \(!\['owner', 'staff'\]\.includes\(user\.role\)\)/);
  assert.match(route, /status: 403/);
  assert.ok(route.indexOf('status: 403') < route.indexOf('makeJobsRead('));
});

test('history: WHEN channel/station are invalid THEN 400 (parseHistoryQuery) before the DB', () => {
  assert.match(route, /const params = new URL\(req\.url\)\.searchParams;\s*const query = parseHistoryQuery\(params\);/);
  assert.match(route, /if \(!query\.ok\) return Response\.json\(\{ ok: false, reason: query\.reason \}, \{ status: 400 \}\);/);
  assert.ok(route.indexOf('status: 400') < route.indexOf('makeJobsRead('));
});

test('history: WHEN the DB is missing or throws THEN 503 history_unavailable, never an empty "nothing ran"', () => {
  const n = route.match(/Response\.json\(\{ ok: false, error: 'history_unavailable' \}, \{ status: 503 \}\)/g) || [];
  assert.equal(n.length, 2, 'both the not-configured and the query-failure paths answer 503');
  assert.match(route, /if \(!dbReady \|\| !db\)/);
  assert.match(route, /catch \{\s*return Response\.json\(\{ ok: false, error: 'history_unavailable' \}/);
});

test('history: reads Neon through the house client, last 5 via loadStationHistory + historyRows, GET only, force-dynamic', () => {
  assert.match(route, /from '@\/lib\/db\.mjs'/);
  assert.match(route, /makeJobsRead\(adaptPostgres\(db\)\)\.loadStationHistory\(\{ channel: query\.channel, station: query\.station, limit: HISTORY_LIMIT \}\)/);
  assert.match(route, /rows: historyRows\(rows, \{ now: Date\.now\(\) \}\)/);
  assert.match(route, /export const dynamic = 'force-dynamic'/);
  assert.match(route, /export async function GET\(req\)/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/, 'read-only route');
  assert.doesNotMatch(route, /from '\.\.\//, 'never reaches the repo-root lib/ (Vercel deploys studio/ alone)');
});

test('route-roles: /api/stations/history is owner+staff (clients refused at the front door)', () => {
  const roles = allowedRoles('/api/stations/history');
  assert.ok(roles && roles.includes('owner') && roles.includes('staff') && !roles.includes('client'));
});

// ---------------------------------------------------------- StationDrawer
test('StationDrawer: header is "<Station> · <Channel>" with no description line; settings first, then "Last 5"', () => {
  assert.match(drawer, /title=\{`\$\{cfg\.title\} · \$\{label \|\| slug\}`\}/);
  assert.doesNotMatch(drawer, /description=/);
  assert.ok(drawer.indexOf('aria-label="Settings"') < drawer.indexOf('>Last 5<'));
});

test('StationDrawer: embeds the SAME manage panels (VoicePanel, SchedulePanel) through a frame and guards their unsaved edits', () => {
  assert.match(drawer, /import VoicePanel from '@\/components\/VoicePanel'/);
  assert.match(drawer, /import SchedulePanel from '@\/components\/SchedulePanel'/);
  assert.match(drawer, /<Panel slug=\{slug\} frame=\{frame\} \/>/);
  assert.match(drawer, /dirty=\{dirty\}/);
});

test('StationDrawer: other settings open the existing Manage drawer (ChannelDrawers) nested on top', () => {
  assert.match(drawer, /import ChannelDrawers from '@\/components\/ChannelDrawers'/);
  assert.match(drawer, /<ChannelDrawers slug=\{slug\} label=\{label\} open=\{manage\} onClose=\{closeManage\} \/>/);
  assert.match(drawer, /const guardedClose = useGuardedClose\(onClose, Boolean\(manage\)\)/);
});

test('StationDrawer: honest loading / error (Retry) / empty states and fixed state words for the last 5', () => {
  assert.match(drawer, /aria-busy="true"/);
  assert.match(drawer, /title="Couldn't load results"/);
  assert.match(drawer, /Retry/);
  assert.match(drawer, /title="No results yet"/);
  assert.match(drawer, /<Chip tone=\{r\.tone\}>\{r\.word\}<\/Chip>/);
  assert.match(drawer, /historyView\(body\)/);
});

test('StationDrawer + entry points: text sizes use the .t-10…t-16 scale only (no text-[Npx])', () => {
  for (const [name, src] of [['StationDrawer', drawer], ['RunStepsDrawer', runSteps], ['[slug]/page', slugPage]]) {
    assert.doesNotMatch(src, /text-\[\d+px\]/, name);
  }
});

// ----------------------------------------------------------- entry points
test('RunStepsDrawer: each big dot opens StationDrawer for the job\'s channel, nested; the run drawer ignores closes meanwhile', () => {
  assert.match(runSteps, /import StationDrawer, \{ useGuardedClose \} from '@\/components\/StationDrawer'/);
  assert.match(runSteps, /<ClickableDots strip=\{view\.strip\} channel=\{view\.job\?\.channel \|\| null\}/);
  assert.match(runSteps, /onClick=\{\(\) => onStation\(\{ station: d\.key, channel \}\)\}/);
  assert.match(runSteps, /const guardedClose = useGuardedClose\(onClose, Boolean\(station\)\)/);
  assert.match(runSteps, /<StationDrawer\s+open=\{Boolean\(station\)\}\s+onClose=\{closeStation\}\s+slug=\{station\?\.channel\}/);
});

test('RunStepsDrawer: the station drawer names the CHANNEL (useBrands display name, else the slug), never the run name', () => {
  assert.match(runSteps, /const \{ bySlug \} = useBrands\(\)/);
  assert.match(runSteps, /label=\{station \? channelDisplayName\(bySlug\[station\.channel\]\?\.label, station\.channel\) : ''\}/);
  assert.doesNotMatch(runSteps, /name=\{target\.name\} onStation/);
});

test('StationDrawer: a refused source (401/403) shows a calm "Owner only"; real failures keep Retry', () => {
  assert.match(drawer, /sourceState\(r\.status, await r\.json\(\)\.catch\(\(\) => null\)\)/);
  assert.match(drawer, /if \(access === 'denied'\) return <p className="t-12 text-muted">\{OWNER_ONLY\}<\/p>;/);
  assert.match(drawer, /failed=\{factsFailed\(station, sources\)\} onRetry=\{retryFacts\}/);
  assert.match(drawer, /muted: 'var\(--muted\)'/);
});

test('channel page: a "Stations" row of the 7 stations (owner + staff only) opens StationDrawer', () => {
  assert.match(slugPage, /import StationDrawer from '@\/components\/StationDrawer'/);
  assert.match(slugPage, /\{role === 'owner' \|\| role === 'staff' \? \(/);
  assert.match(slugPage, /STATIONS\.map\(\(s\) => \(/);
  assert.match(slugPage, /onClick=\{\(\) => setStation\(s\.key\)\}/);
  assert.match(slugPage, /const closeStation = useCallback\(/);
  assert.match(slugPage, /<StationDrawer open=\{Boolean\(station\)\} onClose=\{closeStation\} slug=\{slug\} label=\{label\} station=\{station\} \/>/);
});
