// Phase 2 (I1/I2) — job-named menu + retired-hub redirects, and the Phase 1
// tail: no raw <button> bypasses the kit.
//
// Behavioral: NAV / ALL_NAV_ITEMS / navItemFor imported from nav.js;
// redirects() imported from next.config.mjs and called.
// Sentinel: a brace-aware scan of every studio/app + studio/components file
// for literal-className <button>s that skip the kit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO = path.join(ROOT, 'studio');
const { NAV, ALL_NAV_ITEMS, navItemFor, navSectionFor } = await import(pathToFileURL(path.join(STUDIO, 'components/shell/nav.js')).href);
const nextConfig = (await import(pathToFileURL(path.join(STUDIO, 'next.config.mjs')).href)).default;
const REDIRECTS = await nextConfig.redirects();

// Routes another Phase 2 agent is building right now; tolerated as missing
// until that page lands, never otherwise.
const PENDING_ROUTES = new Set(['/runs']);
const pageExists = (href) => fs.existsSync(path.join(STUDIO, 'app', ...href.split('/').filter(Boolean), 'page.js'));

test('NAV is the job-named menu (decision #3): labels and hrefs in order', () => {
  const flat = NAV.flatMap((g) => g.items).map((i) => [i.label, i.href]);
  assert.deepEqual(flat, [
    ['Today', '/'],
    ['Inbox', '/tasks'],
    ['Channels', '/channels'],
    ['Runs', '/runs'],
    ['Library', '/videos'],
    ['Analytics', '/analytics'],
    ['Create', '/studio'],
    ['Settings', '/settings'],
  ]);
});

test('Analytics is in the sidebar (audit 01: it was palette-only)', () => {
  assert.ok(NAV.some((g) => g.items.some((i) => i.href === '/analytics' && i.label === 'Analytics')));
});

test('NAV shape stays what AppShell/CommandPalette read: group + items{href,label,icon,desc}', () => {
  for (const g of NAV) {
    assert.equal(typeof g.group, 'string');
    for (const i of g.items) {
      assert.equal(typeof i.href, 'string');
      assert.equal(typeof i.label, 'string');
      assert.ok(i.icon, `${i.href} has an icon`);
      assert.equal(typeof i.desc, 'string');
    }
  }
});

// Owner rule (feedback round 1, D): real problems show ONLY in the bell and on
// the Inbox page — so no menu item carries a count badge any more.
test('no menu item carries a badge (warnings live in the bell + Inbox page only)', () => {
  for (const i of ALL_NAV_ITEMS) assert.equal(i.badge, undefined, `${i.href} has no badge`);
});

test('ALL_NAV_ITEMS: unique hrefs (palette keys), every entry has a label + group', () => {
  const hrefs = ALL_NAV_ITEMS.map((i) => i.href);
  assert.equal(new Set(hrefs).size, hrefs.length, 'duplicate href would collide as a React key');
  for (const i of ALL_NAV_ITEMS) {
    assert.ok(i.label && i.group, `${i.href} has label + group`);
  }
});

test('every legacy route is still findable (palette entry) or redirects somewhere that is', () => {
  const LEGACY = ['/', '/studio', '/content', '/operations', '/network', '/settings', '/review', '/topics', '/create',
    '/thumbs', '/templates', '/videos', '/social', '/music', '/production', '/logs', '/warnings', '/channels',
    '/providers', '/usage', '/analytics', '/tasks', '/users', '/sessions'];
  const listed = new Set(ALL_NAV_ITEMS.map((i) => i.href));
  for (const href of LEGACY) {
    const r = REDIRECTS.find((x) => x.source === href && !x.has);
    assert.ok(listed.has(href) || (r && listed.has(r.destination)), `${href} is lost`);
  }
});

test('every real app page (outside bare/dynamic/api routes) is in ALL_NAV_ITEMS or redirected', () => {
  // bare chrome-less pages, and detail pages that need an id in the query
  // (reached from their parent list, which IS listed)
  const BARE = new Set(['/login', '/proof', '/client', '/templates/registry/detail']);
  const pages = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === 'api' || e.name.startsWith('[') || e.name.startsWith('(') || e.name.startsWith('_')) continue;
        walk(path.join(dir, e.name), `${rel}/${e.name}`);
      } else if (e.name === 'page.js') pages.push(rel || '/');
    }
  };
  walk(path.join(STUDIO, 'app'), '');
  const listed = new Set(ALL_NAV_ITEMS.map((i) => i.href));
  const redirected = new Set(REDIRECTS.map((r) => r.source));
  for (const p of pages) {
    if (BARE.has(p)) continue;
    assert.ok(listed.has(p) || redirected.has(p), `${p} has no menu/palette entry and no redirect`);
  }
});

test('every menu/palette href resolves to a real page (no dead links)', () => {
  for (const i of ALL_NAV_ITEMS) {
    if (PENDING_ROUTES.has(i.href) && !pageExists(i.href)) continue;
    assert.ok(pageExists(i.href), `${i.href} has no app page`);
  }
});

test('hub redirects are temporary (decision #10), land on real pages, and never shadow a menu item', () => {
  const navHrefs = new Set(ALL_NAV_ITEMS.map((i) => i.href));
  const hubRules = REDIRECTS.filter((r) => r.source !== '/keys');
  assert.ok(hubRules.length > 0, 'hub redirects exist');
  for (const r of hubRules) {
    assert.equal(r.permanent, false, `${r.source} → ${r.destination} must be a 307 for the first week`);
    assert.ok(pageExists(r.destination), `${r.destination} is a real page`);
    assert.ok(!navHrefs.has(r.source), `${r.source} is redirected but still listed in the menu/palette`);
  }
  // the already-shipped /keys rule is untouched
  assert.deepEqual(REDIRECTS.find((r) => r.source === '/keys'), { source: '/keys', destination: '/channels', permanent: true });
});

test('hub tab URLs land on the screen that tab embedded; tab rules precede the bare rule', () => {
  const resolve = (source, tab) => REDIRECTS.find((r) => r.source === source
    && (!r.has || r.has.some((h) => h.type === 'query' && h.key === 'tab' && h.value === tab)))?.destination;
  assert.equal(resolve('/content', 'social'), '/social');
  assert.equal(resolve('/content', 'audio'), '/music');
  assert.equal(resolve('/content', 'videos'), '/videos');
  assert.equal(resolve('/content'), '/videos');
  assert.equal(resolve('/operations', 'logs'), '/logs');
  assert.equal(resolve('/operations', 'warnings'), '/warnings');
  assert.equal(resolve('/operations', 'pipelines'), '/production');
  assert.equal(resolve('/network', 'providers'), '/providers');
  assert.equal(resolve('/network', 'usage'), '/usage');
  assert.equal(resolve('/network', 'channels'), '/channels');
  // /studio is the Create menu target now — it must NOT redirect
  assert.ok(!REDIRECTS.some((r) => r.source === '/studio'));
});

test('navItemFor: breadcrumb title by pathname (exact, then longest prefix, never the brand name)', () => {
  assert.equal(navItemFor('/').label, 'Today');
  assert.equal(navItemFor('/tasks').label, 'Inbox');
  assert.equal(navItemFor('/review').label, 'Script approvals');
  assert.equal(navItemFor('/channels/add').label, 'Add channel');
  assert.equal(navItemFor('/channels/some-channel').label, 'Channels');
  assert.equal(navItemFor('/templates/registry/detail').label, 'Template registry');
  assert.equal(navItemFor('/nowhere'), null);
  assert.equal(navItemFor(''), null);
});

test('navSectionFor: every screen lights exactly the menu item it lives under', () => {
  const labels = new Set(NAV.flatMap((g) => g.items).map((i) => i.label));
  const navHrefs = new Set(NAV.flatMap((g) => g.items).map((i) => i.href));
  for (const i of ALL_NAV_ITEMS) {
    if (navHrefs.has(i.href)) continue;
    assert.ok(labels.has(i.group), `${i.href} group "${i.group}" is not a menu item`);
  }
  const at = (p) => navSectionFor(p)?.label ?? null;
  assert.equal(at('/'), 'Today');
  assert.equal(at('/review'), 'Inbox');
  assert.equal(at('/warnings'), 'Inbox');
  // live fix wave C1 (T1-12): the highlight follows the breadcrumb (Create › Templates › Drafts)
  assert.equal(at('/templates/drafts'), 'Create');
  assert.equal(at('/templates'), 'Create');
  assert.equal(at('/templates/registry/detail'), 'Create');
  assert.equal(at('/production'), 'Runs');
  assert.equal(at('/runs/history'), 'Runs');
  assert.equal(at('/social'), 'Library');
  assert.equal(at('/channels/some-channel'), 'Channels');
  assert.equal(at('/providers'), 'Settings');
  assert.equal(at('/nowhere'), null);
});

// ---- sentinel: raw <button>s that bypass the kit ----

// Files other Phase 2 agents own right now; they finish their own buttons.
const OFF_LIMITS = [
  /^app\/page\.js$/, /^app\/review\/page\.js$/, /^app\/warnings\/page\.js$/, /^app\/videos\/page\.js$/,
  /^app\/channels\/\[slug\]\//, /^app\/runs\//, /^components\/shell\/AppShell\.js$/, /^components\/shell\/PocketBar\.js$/,
];
// Kit button classes, the inline text-link style (underline), and the kit
// tile surface (inset-tile) used for whole-card choices.
const KIT = /(^|\s)(btn|icon-btn|qs-side[\w-]*|underline|inset-tile)(\s|$)/;

// End of a JSX opening tag: the first '>' outside braces and strings
// (so arrow functions `() =>` inside attributes don't end the tag).
function tagEnd(src, i) {
  let depth = 0;
  let quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return i;
  }
  return -1;
}

function rawButtons(src) {
  const out = [];
  const re = /<button\b/g;
  let m;
  while ((m = re.exec(src))) {
    const attrs = src.slice(m.index + 7, tagEnd(src, m.index + 7));
    const lit = attrs.match(/className="([^"]*)"/);
    if (!lit) continue; // dynamic classNames (state toggles) are out of scope
    if (KIT.test(lit[1])) continue;
    // deliberate non-kit shapes are marked: media/card tiles, chip close ×, switches
    if (/\bdata-kit="/.test(attrs) || /\brole="switch"/.test(attrs)) continue;
    out.push({ line: src.slice(0, m.index).split('\n').length, cls: lit[1] });
  }
  return out;
}

test('sentinel self-check: the scanner sees through arrow functions and honours exemptions', () => {
  const sample = [
    '<button onClick={() => go()} className="px-2 rounded">a</button>',
    '<button onClick={() => go()} className="btn btn-outline">b</button>',
    '<button data-kit="tile" className="relative block">c</button>',
    '<button className="t-11 text-accent underline">d</button>',
  ].join('\n');
  assert.deepEqual(rawButtons(sample).map((b) => b.line), [1]);
});

test('sentinel: no raw <button className="…"> outside the kit in studio/app + studio/components', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx|mjs)$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(STUDIO, 'app'));
  walk(path.join(STUDIO, 'components'));
  const offenders = [];
  for (const f of files) {
    const rel = path.relative(STUDIO, f).split(path.sep).join('/');
    if (OFF_LIMITS.some((r) => r.test(rel))) continue;
    for (const b of rawButtons(fs.readFileSync(f, 'utf8'))) offenders.push(`${rel}:${b.line} "${b.cls}"`);
  }
  assert.deepEqual(offenders, [], `raw buttons bypassing the kit:\n${offenders.join('\n')}`);
});
