// Panel half of "100% ready before anything publishes" (owner, 2026-11-21):
//   - GET /api/channels/readiness — the same answer the engine computes, from
//     the same files (registry + cadence), for the chips and the checklist
//   - Resume is refused while a channel is not 7/7: the flow route answers
//     409 with the missing items; "Save & start" keeps the autopilot off;
//     the Channels card, the channel page and the bulk resume say why
//   - the Schedule drawer edits the Shorts and long-video go-public times
// Routes and components import '@/…', so they are pinned by source scans
// (CRLF-safe); the pure helpers are run for real.
// Spec + QA: docs/qa/channel-readiness-qa.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { parsePublishTimes, scheduleDirty } from '../studio/lib/slot-planner.mjs';
import { registryToKit, mergeBrand } from '../lib/brand-resolve.mjs';
import { allowedRoles } from '../studio/lib/route-roles.js';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('P1 — publish times (pure, shared by the drawer and the schedule route)', () => {
  test('nothing sent = nothing to change', () => {
    assert.deepEqual(parsePublishTimes({}), { ok: true, kitPatch: {}, top: {} });
    assert.deepEqual(parsePublishTimes(null), { ok: true, kitPatch: {}, top: {} });
  });

  test('Shorts times: 1–6 valid UTC times, padded, de-duplicated, written to kit AND top level', () => {
    assert.deepEqual(parsePublishTimes({ slots: ['0:05', '21:20', '21:20'] }), {
      ok: true, kitPatch: { slots: ['00:05', '21:20'] }, top: { slots: ['00:05', '21:20'] },
    });
    assert.match(parsePublishTimes({ slots: [] }).error, /at least one Shorts time/);
    assert.match(parsePublishTimes({ slots: ['7pm'] }).error, /HH:MM/);
    assert.match(parsePublishTimes({ slots: 'x' }).error, /list/);
    assert.match(parsePublishTimes({ slots: ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00'] }).error, /6/);
  });

  test('long-video time: one valid UTC time; blank is refused (a filled time is never wiped)', () => {
    assert.deepEqual(parsePublishTimes({ longSlot: '9:30' }), { ok: true, kitPatch: { longSlot: '09:30' }, top: {} });
    assert.match(parsePublishTimes({ longSlot: '' }).error, /long-video time/);
    assert.match(parsePublishTimes({ longSlot: '24:00' }).error, /HH:MM/);
  });

  test('scheduleDirty notices a changed go-public time (and ignores absent ones)', () => {
    const saved = { docDays: ['Thu'], shortDays: ['Mon'], shortsSource: 'clips', gateCron: '21 3 * * *', slots: ['00:05'], longSlot: '22:30' };
    assert.equal(scheduleDirty(saved, { ...saved }), false);
    assert.equal(scheduleDirty(saved, { ...saved, longSlot: '22:45' }), true);
    assert.equal(scheduleDirty(saved, { ...saved, slots: ['00:05', '12:00'] }), true);
    const old = { docDays: [], shortDays: [], shortsSource: 'generated', gateCron: '' };
    assert.equal(scheduleDirty(old, { ...old }), false, 'callers without times are unchanged');
  });
});

describe('P2 — the engine reads what the drawer saves', () => {
  test('kit.longSlot reaches the brand the long-video lane uses (registryToKit → mergeBrand)', () => {
    const reg = registryToKit({ slug: 'some-channel', kit: { longSlot: '20:20' } });
    assert.equal(reg.longSlot, '20:20');
    assert.equal(mergeBrand({ slug: 'some-channel', longSlot: '01:30', slots: ['00:35'] }, reg).longSlot, '20:20', 'the panel value beats the static kit');
    assert.equal(mergeBrand(null, reg).longSlot, '20:20', 'a wizard channel too');
  });

  test('Shorts times are saved to both places, so the engine (top-level first) and the kit agree', () => {
    const t = parsePublishTimes({ slots: ['21:00'] });
    const entry = { slug: 'some-channel', slots: ['05:00'], ...t.top, kit: { slots: ['05:00'], ...t.kitPatch } };
    assert.deepEqual(registryToKit(entry).slots, ['21:00']);
  });
});

describe('P3 — GET /api/channels/readiness', () => {
  const ROUTE = read('studio/app/api/channels/readiness/route.js');

  test('reads the same two engine files the autopilot reads and answers with the shared module', () => {
    assert.match(ROUTE, /import \{ readinessFor \} from '@\/lib\/channel-readiness\.mjs';/);
    assert.match(ROUTE, /readRepoJSON\('yt-mcp\/studio-channels\.json'\)/);
    assert.match(ROUTE, /readRepoJSON\('yt-mcp\/cadence\.json'\)/);
  });

  test('signed in only; a client sees only their own channels', () => {
    assert.match(ROUTE, /const user = await getUser\(req\);\n\s*if \(!user\) return Response\.json\(\{ error: 'not signed in' \}, \{ status: 401 \}\);/);
    assert.match(ROUTE, /canAccessChannelSlug\(user, slug\)/);
    assert.match(ROUTE, /slugsForUser\(user\)/);
  });

  test('a failed read is a 502, never a guess', () => {
    assert.match(ROUTE, /status: 502/);
  });

  test('the proxy lets every signed-in role reach it (the route checks the channel)', () => {
    assert.deepEqual(allowedRoles('/api/channels/readiness'), ['owner', 'staff', 'client']);
  });
});

describe('P4 — Resume is refused while not ready (server)', () => {
  const FLOW = read('studio/app/api/channels/flow/route.js');

  test('turning ON checks readiness from the engine files first; 409 lists what is missing', () => {
    const check = FLOW.indexOf('if (on) {');
    const write = FLOW.indexOf('await setChannelAutopilot(slug, on);');
    assert.ok(check > 0 && check < write, 'the check runs before any write');
    const block = FLOW.slice(check, write);
    assert.match(block, /readRepoJSON\('yt-mcp\/studio-channels\.json'\)/);
    assert.match(block, /readRepoJSON\('yt-mcp\/cadence\.json'\)/);
    assert.match(block, /readiness = readinessFor\(\{ registry, cadence, slug \}\);/);
    assert.match(block, /if \(!readiness\.ready\) \{/);
    assert.match(block, /status: 409/);
    assert.match(block, /missing: missingLabels\(readiness\)/);
  });

  test('FAIL CLOSED: if readiness cannot be read, Resume is refused (503); pausing never checks', () => {
    const block = FLOW.slice(FLOW.indexOf('if (on) {'), FLOW.indexOf('await setChannelAutopilot(slug, on);'));
    assert.match(block, /status: 503/);
    assert.doesNotMatch(FLOW, /if \(!on\) \{[^}]*readiness/);
  });

  test('"Save & start" in the setup wizard cannot switch on a not-ready channel', () => {
    const PROFILE = read('studio/app/api/channels/profile/route.js');
    const start = PROFILE.slice(PROFILE.indexOf('if (body.startAutopilot === true) {'));
    assert.match(PROFILE, /import \{ channelReadiness, missingLabels \} from '@\/lib\/channel-readiness\.mjs';/);
    assert.match(start, /const startCheck = channelReadiness\(\{ entry, schedule: cadence\?\.\[slug\] \|\| null \}\);/);
    assert.match(start, /if \(startCheck\.ready\) \{\n\s*entry\.autopilot = true;/);
    assert.match(start, /autopilotBlocked = \{ done: startCheck\.done, total: startCheck\.total, missing: missingLabels\(startCheck\) \};/);
    assert.match(PROFILE, /\.\.\.\(autopilotBlocked \? \{ autopilotBlocked \} : \{\}\)/);
    const PAGE = read('studio/app/channels/add/page.js');
    assert.match(PAGE, /setStarted\(start === true && !d\.autopilotBlocked\);/);
    assert.match(PAGE, /Not ready to publish yet/);
  });
});

describe('P5 — the panel shows it and blocks Resume (client)', () => {
  const LIST = read('studio/app/channels/page.js');
  const PAGE = read('studio/app/channels/[slug]/page.js');
  const DRAWER = read('studio/components/ChannelOverviewDrawer.js');
  const CHECK = read('studio/components/ReadinessChecklist.js');
  const HOOK = read('studio/components/use-readiness.js');
  const PROD = read('studio/app/production/page.js');

  test('one hook reads /api/channels/readiness (all channels or one)', () => {
    assert.match(HOOK, /fetch\(slug \? `\/api\/channels\/readiness\?slug=\$\{encodeURIComponent\(slug\)\}` : '\/api\/channels\/readiness'\)/);
    assert.match(HOOK, /export function useReadiness\(slug\)/);
  });

  test('the checklist: "Ready to publish: N/7", ✓/✗ items, fixes open the right drawer or Edit profile', () => {
    assert.match(CHECK, /Ready to publish: \{r\.done\}\/\{r\.total\}/);
    assert.match(CHECK, /item\.href \? \(\n?\s*<Link href=\{item\.href\}/);
    assert.match(CHECK, /canOpen\(item\.place\) \? \(\n?\s*<button type="button"[^>]*onClick=\{\(\) => onOpen\(item\.place\)\}/);
    assert.match(CHECK, /Nothing publishes until all \{r\.total\} are done\./);
    assert.match(CHECK, /export function ReadyChip\(/);
    assert.match(CHECK, /`Ready \$\{r\.done\}\/\$\{r\.total\}`/);
  });

  test('Channels cards: a "Ready N/7" chip; Resume on a not-ready card opens the checklist instead', () => {
    assert.match(LIST, /import \{ ReadyChip \} from '@\/components\/ReadinessChecklist';/);
    assert.match(LIST, /import \{ useReadiness \} from '@\/components\/use-readiness';/);
    assert.match(LIST, /const \{ bySlug: readiness, status: readinessStatus, reload: reloadReadiness \} = useReadiness\(\);/);
    assert.match(LIST, /<ReadyChip r=\{readiness\[c\.slug\]\} className="shrink-0" \/>/);
    assert.match(LIST, /const closeDrawer = useCallback\(\(\) => \{ setDrawer\(null\); reloadReadiness\(\); \}, \[reloadReadiness\]\);/);
    assert.match(LIST, /notReady\n?\s*\? \{ key: 'flow', label: 'Resume autopilot — not ready', icon: Play, onSelect: blockedResume \}/);
    assert.match(LIST, /if \(r\.status === 409\)/);
  });

  test('the overview drawer shows the checklist and opens drawers from it', () => {
    assert.match(DRAWER, /import ReadinessChecklist from '@\/components\/ReadinessChecklist';/);
    assert.match(DRAWER, /<ReadinessChecklist slug=\{channel\.slug\} r=\{readiness\}[^>]*onOpen=\{onManage\}/);
    assert.match(LIST, /readiness=\{overviewRow \? readiness\[overviewRow\.slug\] : null\}/);
  });

  test('the channel page: checklist card + Resume locked until 7/7', () => {
    assert.match(PAGE, /const \{ bySlug: readinessBySlug, status: readinessStatus, reload: reloadReadiness \} = useReadiness\(slug\);/);
    assert.ok(PAGE.indexOf('useReadiness(slug)') < PAGE.indexOf('if (data === null || !meDone) return <PageSkeleton />;'), 'the hook runs before any early return');
    assert.match(PAGE, /<ReadinessChecklist slug=\{slug\} r=\{readiness\}/);
    assert.match(PAGE, /disabled=\{busy \|\| resumeLocked\}/);
    assert.match(PAGE, /const resumeLocked = Boolean\(readiness && !readiness\.ready\);/);
  });

  test('hooks and state are declared before anything reads them (build safety)', () => {
    assert.ok(PAGE.indexOf('useReadiness(slug)') < PAGE.indexOf('const resumeLocked'));
    assert.ok(LIST.indexOf('useReadiness()') < LIST.indexOf('const toggleFlow'));
  });

  test('bulk "Resume everything" names the not-ready channels instead of "failed"', () => {
    assert.match(PROD, /if \(r\.status === 409\) \{ notReady \+= 1; continue; \}/);
    assert.match(PROD, /not ready to publish/);
  });
});

describe('P6 — the Schedule drawer edits the go-public times', () => {
  const PANEL = read('studio/components/SchedulePanel.js');
  const ROUTE = read('studio/app/api/channels/schedule/route.js');

  test('two plain pickers in the owner’s clock, each labelled with UTC', () => {
    assert.match(PANEL, /Shorts go public at/);
    assert.match(PANEL, /Long videos go public at/);
    assert.match(PANEL, /<PublishTimeInput\b/);
    const INPUT = read('studio/components/PublishTimeInput.js');
    assert.match(INPUT, /type="text"/);
    assert.match(INPUT, /UTC/);
    assert.match(INPUT, /localToUtc\(/);
    assert.match(INPUT, /utcToLocal\(/);
  });

  test('saves only changed times (dirty-field), through the schedule route', () => {
    assert.match(PANEL, /const timesSent = \{\n\s*\.\.\.\(timesChanged\.slots \? \{ slots: publish \} : \{\}\),\n\s*\.\.\.\(timesChanged\.longSlot \? \{ longSlot: publishLong \|\| '' \} : \{\}\),\n\s*\};/);
    assert.match(PANEL, /const payload = \{ slug, \.\.\.draft, \.\.\.timesSent, /);
    assert.match(PANEL, /const dirty = approveChanged \|\| scheduleDirty\(saved, \{ \.\.\.draft, gateCron, slots: publish, longSlot: publishLong \|\| '' \}\);/);
    assert.match(PANEL, /const timesCheck = parsePublishTimes\(timesSent\);/);
    assert.match(PANEL, /!timesCheck\.ok/);
    // after a save, the baseline only takes the times the server confirmed
    assert.match(PANEL, /slots: j\.publishSaved\?\.slots \|\| saved\.slots, longSlot: j\.publishSaved\?\.longSlot \|\| saved\.longSlot/);
    for (const name of ['const [publish, setPublish]', 'const [publishLong, setPublishLong]', 'const [saved, setSaved]']) {
      assert.ok(PANEL.indexOf(name) < PANEL.indexOf('const dirty = approveChanged'), `${name} declared before use`);
      assert.ok(PANEL.indexOf(name) < PANEL.indexOf('const timesChanged ='), `${name} declared before use`);
    }
    assert.ok(PANEL.indexOf('const timesChanged =') < PANEL.indexOf('const timesSent ='));
    assert.ok(PANEL.indexOf('const timesSent =') < PANEL.indexOf('const timesCheck ='));
  });

  test('the route validates the times BEFORE any write, then writes them with the kit writer', () => {
    assert.match(ROUTE, /const \{ slug, gateCron: rawGateCron, slots: rawSlots, longSlot: rawLongSlot, autoApproveHours: rawApprove, \.\.\.schedule \} = body \|\| \{\};/);
    const parse = ROUTE.indexOf('const times = parsePublishTimes({');
    const firstWrite = ROUTE.indexOf('await writeRepoJSON(FILE, file');
    assert.ok(parse > 0 && parse < firstWrite, 'a bad time never half-saves');
    assert.match(ROUTE, /if \(!times\.ok\) return Response\.json\(\{ error: times\.error \}, \{ status: 400 \}\);/);
    assert.match(ROUTE, /await setChannelKitFields\(slug, times\.kitPatch, \{ top: times\.top, message: /);
    assert.match(ROUTE, /if \(Object\.keys\(times\.kitPatch\)\.length\)/);
  });
});
