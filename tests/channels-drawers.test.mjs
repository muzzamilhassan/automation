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
const PANELS = {
  SchedulePanel: read('studio/components/SchedulePanel.js'),
  TemplateAssignPanel: read('studio/components/TemplateAssignPanel.js'),
  ChannelKeysPanel: read('studio/components/ChannelKeysPanel.js'),
  ProviderRoutingPanel: read('studio/components/ProviderRoutingPanel.js'),
};
const MINE = { LIST, SLUG, DRAWERS, ...PANELS };

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
  assert.match(DRAWERS, /const frame = \(body, footer\) => \(\s*<Drawer\b[\s\S]*?footer=\{footer \|\| undefined\}[\s\S]*?>\s*\{body\}\s*<\/Drawer>/);
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
    assert.match(src, /if \(frame\) return frame\(body, (footer|null)\);/, name);
  }
  // panels with one primary action put it in the drawer's sticky footer
  assert.match(PANELS.SchedulePanel, /if \(frame\) return frame\(body, footer\);/);
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
  assert.ok(confirmIn(PANELS.ProviderRoutingPanel, 'const removeProvider = async'), 'provider remove confirms');
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

test('cards are compact: real health chip, one primary link, one Manage menu', () => {
  assert.match(LIST, /const health = channelHealth\(c, \{ now \}\);/);
  assert.match(LIST, /<Chip tone=\{levelTone\(health\.level\)\} dot/);
  assert.match(LIST, /<Link href=\{channelHref\(c\.slug\)\} className="btn btn-primary btn-sm">\s*Open channel/);
  assert.match(LIST, /<ManageMenu label=\{label\} items=\{items\} \/>/);
  assert.match(LIST, /aria-haspopup="menu"/);
  assert.match(LIST, /role="menuitem"/);
  assert.match(LIST, /href: editHref\(c\.slug\)/, 'Edit profile keeps the wizard edit flow');
  // the old six unlabelled icon buttons are gone
  assert.doesNotMatch(LIST, /ButtonUtility/);
});

test('parked brands open the keys drawer (not an inline panel below the grid)', () => {
  assert.match(LIST, /onClick=\{\(\) => setDrawer\(\{ slug: c\.slug, label: c\.label \|\| c\.slug, which: 'keys' \}\)\}/);
  assert.doesNotMatch(LIST, /<ChannelKeysPanel/);
});

test('failed overview load shows an error with Retry, never "0 channels"', () => {
  assert.match(LIST, /\.catch\(\(\) => setData\(\{ error: true, channels: \[\] \}\)\)/);
  assert.match(LIST, /if \(data\.error\)/);
  assert.match(LIST, /Couldn't load your channels right now/);
});

test('the per-channel page opens the SAME drawers from its settings shortcuts', () => {
  assert.match(SLUG, /import ChannelDrawers, \{ CHANNEL_DRAWERS, drawersFor \} from '@\/components\/ChannelDrawers'/);
  assert.match(SLUG, /<ChannelDrawers slug=\{slug\} label=\{c\.label \|\| slug\} open=\{drawer\} onClose=\{closeDrawer\} \/>/);
  assert.match(SLUG, /drawerKeys\.map\(\(k\) => \(\s*<DrawerShortcut key=\{k\}[^>]*onClick=\{\(\) => setDrawer\(k\)\}/);
  assert.match(SLUG, /const drawerKeys = drawersFor\(role\);/);
  // the old "jump to /channels#slug to find the panels" shortcut is gone
  assert.doesNotMatch(SLUG, /Schedule, keys & routing/);
});

test('clients never see drawers whose API refuses them (keys only)', () => {
  assert.match(DRAWERS, /export function drawersFor\(role\) \{\s*return Object\.keys\(CHANNEL_DRAWERS\)\.filter\(\(k\) => !\(role === 'client' && CHANNEL_DRAWERS\[k\]\.staffOnly\)\);/);
  assert.match(DRAWERS, /keys: \{[^}]*staffOnly: false \}/);
  for (const k of ['schedule', 'templates', 'routing']) {
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
