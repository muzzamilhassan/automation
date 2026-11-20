// Round 2 (2026-11-19) — Channels page: every per-channel feature opens in a
// Drawer instead of expanding inline inside the card. Source scans pin the
// wiring (pages use @/ aliases that plain `node --test` cannot resolve).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const LIST = read('studio/app/channels/page.js');
const SLUG = read('studio/app/channels/[slug]/page.js');
const DRAWERS = read('studio/components/ChannelDrawers.js');
const OVERVIEW = read('studio/components/ChannelOverviewDrawer.js');
const PANELS = {
  SchedulePanel: read('studio/components/SchedulePanel.js'),
  TemplateAssignPanel: read('studio/components/TemplateAssignPanel.js'),
  ChannelKeysPanel: read('studio/components/ChannelKeysPanel.js'),
  ProviderRoutingPanel: read('studio/components/ProviderRoutingPanel.js'),
};
const MINE = { LIST, SLUG, DRAWERS, OVERVIEW, ...PANELS };

test('no inline panel expansion remains on the Channels list', () => {
  assert.doesNotMatch(LIST, /\{\s*(schedOpen|tplOpen|keysOpen|routeOpen|parkedKeys)\s*===/);
  for (const name of Object.keys(PANELS)) {
    assert.doesNotMatch(LIST, new RegExp(String.raw`<${name}\b`), `${name} must not render directly on the list`);
  }
  assert.match(LIST, /import ChannelDrawers, \{ CHANNEL_DRAWERS \} from '@\/components\/ChannelDrawers'/);
  assert.match(LIST, /<ChannelDrawers slug=\{drawer\?\.slug\}[^>]*open=\{drawer\?\.which\} onClose=\{closeDrawer\} \/>/);
});

test('ChannelDrawers renders each of the 4 panels inside <Drawer> via the frame prop', () => {
  assert.match(DRAWERS, /import Drawer from '@\/components\/Drawer'/);
  // wave B4 (T3-05): frame(body, footer, opts) — opts.dirty guards the close
  assert.match(DRAWERS, /const frame = \(body, footer, opts\) => \(\s*<Drawer\b[\s\S]*?footer=\{footer \|\| undefined\}[\s\S]*?>\s*\{body\}\s*<\/Drawer>/);
  for (const name of Object.keys(PANELS)) {
    assert.match(DRAWERS, new RegExp(String.raw`<${name} key=\{k\} slug=\{slug\} frame=\{frame\} />`), name);
  }
  for (const k of ['schedule', 'templates', 'keys', 'routing']) {
    assert.match(DRAWERS, new RegExp(String.raw`\b${k}: \{ label: '[^']+', title: '[^']+', description: `), k);
  }
});

test('every panel hands its content to the frame (drawer) when one is given', () => {
  for (const [name, src] of Object.entries(PANELS)) {
    assert.match(src, new RegExp(String.raw`export default function ${name}\(\{ slug, frame \}\)`), name);
    assert.match(src, /if \(frame\) return frame\(body, (footer|null)(, \{ dirty \})?\);/, name);
  }
  // panels with one primary action put it in the drawer's sticky footer
  assert.match(PANELS.SchedulePanel, /if \(frame\) return frame\(body, footer, \{ dirty \}\);/);
  assert.match(PANELS.SchedulePanel, /const footer = \(\s*<>[\s\S]*Save schedule/);
  assert.match(PANELS.TemplateAssignPanel, /const footer = isOwner && templates\.length \? \([\s\S]*Assign &amp; pin/);
});

test('drawer onClose is stable (Drawer re-runs its focus effect when onClose changes)', () => {
  assert.match(LIST, /const closeDrawer = useCallback\(\(\) => setDrawer\(null\), \[\]\)/);
  assert.match(SLUG, /const closeDrawer = useCallback\(\(\) => setDrawer\(null\), \[\]\)/);
});

test('no window.confirm in any of these files; destructive actions use useConfirm', () => {
  for (const [name, src] of Object.entries(MINE)) {
    assert.doesNotMatch(src, /window\.confirm\(/, name);
  }
  const confirmIn = (src, fnStart) => {
    const at = src.indexOf(fnStart);
    assert.ok(at > 0, fnStart);
    return /await confirm\(\{/.test(src.slice(at, at + 600));
  };
  assert.ok(confirmIn(PANELS.TemplateAssignPanel, 'const unassign = async'), 'template unassign confirms');
  // wave A1 (T3-11): remove is a local draft edit; the ONE write (Save) confirms
  assert.ok(confirmIn(PANELS.ProviderRoutingPanel, 'const saveChanges = async'), 'provider routing save confirms');
  assert.ok(confirmIn(PANELS.ChannelKeysPanel, 'const remove = async'), 'key remove confirms');
  assert.match(LIST, /const confirm = useConfirm\(\);/);
  assert.match(LIST, /const ok = await confirm\(on\b/);
  assert.match(SLUG, /const askPause = async \(\) => \{\s*const ok = await confirm\(/);
  for (const src of [LIST, SLUG, PANELS.TemplateAssignPanel, PANELS.ChannelKeysPanel, PANELS.ProviderRoutingPanel]) {
    assert.match(src, /import \{ useConfirm \} from '@\/components\/ConfirmDialog'/);
  }
});

test('channel grid items and their rows can shrink (no horizontal overflow)', () => {
  assert.match(LIST, /<div className="grid grid-cols-1 [^"]*gap-4">/);
  assert.match(LIST, /id=\{'chan-' \+ c\.slug\}\s*className=\{'p-5 scroll-mt-24 min-w-0 /);
  assert.match(LIST, /<p className="t-12 text-muted line-clamp-2 break-words"/, 'long niche text wraps/clamps');
  assert.match(LIST, /<h2 className="[^"]*truncate"/, 'long channel names truncate');
  assert.match(LIST, /<div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t/, 'action row wraps');
  // the niche chips in the template drawer wrap instead of overflowing
  assert.match(PANELS.TemplateAssignPanel, /<div className="flex flex-wrap gap-1\.5">\s*\{channelNiches\.map/);
  assert.match(PANELS.TemplateAssignPanel, /className="max-w-full whitespace-normal break-words"/);
});

test('cards are compact: Active/Paused chip, one Open button, one Manage menu', () => {
  assert.match(LIST, /c\.flowPaused \? <Chip tone="plain"[^>]*>Paused<\/Chip> : <Chip tone="ok" dot[^>]*>Active<\/Chip>/);
  assert.match(LIST, /<ManageMenu label=\{label\} items=\{items\} \/>/);
  assert.match(LIST, /aria-haspopup="menu"/);
  assert.match(LIST, /role="menuitem"/);
  assert.match(LIST, /href: editHref\(c\.slug\)/, 'Edit profile keeps the wizard edit flow');
  // the old six unlabelled icon buttons are gone
  assert.doesNotMatch(LIST, /ButtonUtility/);
});

// ---- Feedback round 1 (D): no warning text on cards, red dot for REAL problems only ----

test('D1: cards show no warning sentence and no health verdict label', () => {
  assert.doesNotMatch(LIST, /channelHealth\(/, 'the card no longer runs the warning verdict');
  assert.doesNotMatch(LIST, /health\.(reasons|label|level)/);
  assert.doesNotMatch(LIST, /firstReason|reasonInk/);
  assert.doesNotMatch(LIST, /not run today/i);
  // the YouTube account line is a neutral fact, never red warning ink
  assert.doesNotMatch(LIST, /key: 'yt'[^\n]*tone: 'bad'/);
  assert.doesNotMatch(LIST, /a\.tone === 'bad'/);
  assert.doesNotMatch(LIST, /re-connect needed/);
});

test('D2/D3: the red dot comes from the REAL grouped warnings for that channel only', () => {
  assert.match(LIST, /import \{ useOpenWarnings \} from '@\/components\/use-open-warnings'/);
  assert.match(LIST, /const \{ rows: openWarningRows \} = useOpenWarnings\(\);/);
  assert.match(LIST, /channelHasRealProblem\(openWarningRows, c\.slug\)/);
  assert.match(LIST, /\{hasProblem \? <ProblemDot \/> : null\}/);
  // the dot itself: red token, accessible label, links to the Inbox
  assert.match(OVERVIEW, /export function ProblemDot\(/);
  assert.match(OVERVIEW, /aria-label=\{PROBLEM_LABEL\}/);
  assert.match(OVERVIEW, /title=\{PROBLEM_LABEL\}/);
  assert.match(OVERVIEW, /href=\{INBOX_HREF\}/);
  assert.match(OVERVIEW, /var\(--bad\)/);
});

test('D5: the per-channel page has no warning-reason list, at most one red-dot line', () => {
  assert.doesNotMatch(SLUG, /health\.reasons/);
  assert.doesNotMatch(SLUG, /channelHealth\(/);
  assert.match(SLUG, /const \{ rows: openWarningRows \} = useOpenWarnings\(\);/);
  assert.match(SLUG, /channelHasRealProblem\(openWarningRows, slug\)/);
  assert.match(SLUG, /<ChannelStatus c=\{c\} logs=\{data\.logs\} now=\{now\} hasProblem=\{hasProblem\} \/>/);
  // the hook runs before any early return (rules of hooks)
  assert.ok(SLUG.indexOf('useOpenWarnings();') < SLUG.indexOf('return <PageSkeleton />'));
  assert.equal((OVERVIEW.match(/<ProblemLine \/>/g) || []).length, 1, 'one line, rendered by the shared status block');
});

// ---- Feedback round 1 (H): "Open channel" opens a large drawer on the list ----

test('H1: "Open channel" and the channel name open the overview drawer, not a new page', () => {
  assert.match(LIST, /import ChannelOverviewDrawer, \{ ProblemDot \} from '@\/components\/ChannelOverviewDrawer'/);
  assert.match(LIST, /<button type="button" className="btn btn-primary btn-sm" onClick=\{openDrawer\('overview'\)\}>\s*Open channel/);
  assert.match(LIST, /<h2 className="[^"]*truncate"[^>]*>\s*<button type="button"[^>]*onClick=\{openDrawer\('overview'\)\}/);
  assert.doesNotMatch(LIST, /<Link href=\{channelHref\(c\.slug\)\}/, 'no card link navigates away any more');
  assert.match(OVERVIEW, /<Drawer\b[\s\S]*?size="xl"/);
});

test('H2: the overview drawer shows status, today, next slot and the schedule from real data', () => {
  assert.match(LIST, /<ChannelOverviewDrawer\s[^>]*channel=\{overviewRow\}[^>]*logs=\{data\.logs\}/);
  assert.match(LIST, /const overviewRow = drawer\?\.which === 'overview' \? active\.find\(\(c\) => c\.slug === drawer\.slug\) \|\| null : null;/);
  assert.match(OVERVIEW, /export function ChannelStatus\(/);
  assert.match(OVERVIEW, /youtubeConnection\(c\)/);
  assert.match(OVERVIEW, /todayStatus\(c, now\)/);
  assert.match(OVERVIEW, /uploadedToday\(logs, c\.slug, now\)/);
  assert.match(OVERVIEW, /nextScheduled\(logs, c\.slug, now\)/);
  assert.match(OVERVIEW, /nextSlot\(c, now\)/);
  assert.match(OVERVIEW, /scheduleSummary\(channel\)/);
  assert.doesNotMatch(OVERVIEW, /channelHealth\(|todayProduction\(/, 'no warning verdict / "Not run today" wording');
});

test('H3: quick actions swap the overview for ONE manage drawer (single drawer state)', () => {
  assert.match(OVERVIEW, /drawersFor\(role\)\.map\(\(k\) =>/);
  assert.match(OVERVIEW, /onClick=\{\(\) => onManage\(k\)\}/);
  assert.match(LIST, /onManage=\{manageFromOverview\}/);
  assert.match(LIST, /const manageFromOverview = useCallback\(\(which\) => setDrawer\(\(d\) => \(d \? \{ \.\.\.d, which \} : d\)\), \[\]\);/);
  // the manage drawers and the overview share the ONE drawer state -> never two open
  assert.match(LIST, /open=\{drawer\?\.which === 'overview'\}/);
  assert.match(LIST, /onClose=\{closeDrawer\}/);
});

test('H4: the overview drawer links to the full page, which keeps working', () => {
  assert.match(OVERVIEW, /href=\{channelHref\(channel\.slug\)\}[\s\S]{0,200}Full page ↗/);
});

test('parked brands open the keys drawer (not an inline panel below the grid)', () => {
  assert.match(LIST, /onClick=\{\(\) => setDrawer\(\{ slug: c\.slug, label: channelDisplayName\(c\.label, c\.slug\), which: 'keys' \}\)\}/);
  assert.doesNotMatch(LIST, /<ChannelKeysPanel/);
});

test('failed overview load shows an error with Retry, never "0 channels"', () => {
  assert.match(LIST, /\.catch\(\(\) => setData\(\{ error: true, channels: \[\] \}\)\)/);
  assert.match(LIST, /if \(data\.error\)/);
  assert.match(LIST, /Couldn't load your channels right now/);
});

test('the per-channel page opens the SAME drawers from its settings shortcuts', () => {
  assert.match(SLUG, /import ChannelDrawers, \{ CHANNEL_DRAWERS, drawersFor \} from '@\/components\/ChannelDrawers'/);
  assert.match(SLUG, /<ChannelDrawers slug=\{slug\} label=\{label\} open=\{drawer\} onClose=\{closeDrawer\} \/>/);
  assert.match(SLUG, /drawerKeys\.map\(\(k\) => \(\s*<DrawerShortcut key=\{k\}[^>]*onClick=\{\(\) => setDrawer\(k\)\}/);
  assert.match(SLUG, /const drawerKeys = drawersFor\(role\);/);
  // the old "jump to /channels#slug to find the panels" shortcut is gone
  assert.doesNotMatch(SLUG, /Schedule, keys & routing/);
});

test('clients never see drawers whose API refuses them (keys only)', () => {
  assert.match(DRAWERS, /export function drawersFor\(role\) \{\s*return Object\.keys\(CHANNEL_DRAWERS\)\.filter\(\(k\) => !\(role === 'client' && CHANNEL_DRAWERS\[k\]\.staffOnly\)\);/);
  assert.match(DRAWERS, /keys: \{[^}]*staffOnly: false \}/);
  for (const k of ['schedule', 'templates', 'thumbnails', 'routing']) {
    assert.match(DRAWERS, new RegExp(String.raw`${k}: \{[^}]*staffOnly: true \}`), k);
  }
});

test('house design kit: no one-off pixel text sizes or hardcoded hex colours in these files', () => {
  for (const [name, src] of Object.entries(MINE)) {
    assert.doesNotMatch(src, /text-\[\d+px\]/, name);
    assert.doesNotMatch(src, /text-t-\d+/, name);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{6}\b/, name);
    assert.doesNotMatch(src, /\b(?:text|bg|border)-(?:red|emerald|amber|sky)-\d{3}\b/, name);
    assert.doesNotMatch(src, /\b(?:bg|border)-(?:white|black)\/\d+/, name);
  }
});

// ---- Feedback round 1 (E + Thumbnails drawer) ----

test('E1: every manage drawer description is at most 5 words', () => {
  const descs = [...DRAWERS.matchAll(/description: '([^']*)'/g)].map((m) => m[1]);
  assert.equal(descs.length, 5, 'schedule, templates, thumbnails, keys, routing');
  for (const d of descs) assert.ok(d.trim().split(/\s+/).filter(Boolean).length <= 5, `"${d}" is too long`);
});

test('T1: Thumbnails drawer is registered between Templates and API keys and routed to ThumbnailAssignPanel', () => {
  assert.match(DRAWERS, /import ThumbnailAssignPanel from '@\/components\/ThumbnailAssignPanel'/);
  assert.match(DRAWERS, /thumbnails: \{ label: 'Thumbnails', title: 'Thumbnail designs', description: '[^']+', icon: ImageIcon, size: 'lg', staffOnly: true \}/);
  const order = [...DRAWERS.matchAll(/^\s+(\w+): \{ label: /gm)].map((m) => m[1]);
  assert.deepEqual(order, ['schedule', 'templates', 'thumbnails', 'keys', 'routing']);
  assert.match(DRAWERS, /if \(open === 'thumbnails'\) return <ThumbnailAssignPanel key=\{k\} slug=\{slug\} frame=\{frame\} \/>;/);
  // every Manage list is built from CHANNEL_DRAWERS, so Thumbnails shows up in all three
  assert.match(LIST, /Object\.entries\(CHANNEL_DRAWERS\)\.map/);
  assert.match(SLUG, /drawerKeys\.map\(\(k\) =>/);
  assert.match(OVERVIEW, /drawersFor\(role\)\.map/);
  // the old /thumbs shortcut on the channel page no longer clashes with the drawer's name
  assert.doesNotMatch(SLUG, /title="Thumbnails"/);
});
