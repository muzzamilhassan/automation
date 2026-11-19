// Round 2 "every feature linked" sweep (2026-11-19) — source-scan sentinels
// over the pages/components owned by the frontend-sweep lane.
//
// Pins: no window.confirm (useConfirm instead), no dead href="#", no links
// to the retired /operations /content /network routes, no px one-off text
// sizes, every <button> wired (onClick / submit / inside a form), and every
// icon-only button named for screen readers (aria-label).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const FILES = [
  'studio/app/page.js',
  'studio/app/runs/page.js',
  'studio/app/videos/page.js',
  'studio/app/tasks/page.js',
  'studio/app/review/page.js',
  'studio/app/warnings/page.js',
  'studio/app/topics/page.js',
  'studio/app/create/page.js',
  'studio/app/thumbs/page.js',
  'studio/app/studio/page.js',
  'studio/app/social/page.js',
  'studio/app/music/page.js',
  'studio/app/production/page.js',
  'studio/app/logs/page.js',
  'studio/app/analytics/page.js',
  'studio/app/providers/page.js',
  'studio/app/usage/page.js',
  'studio/app/settings/page.js',
  'studio/app/users/page.js',
  'studio/app/sessions/page.js',
  'studio/app/styles/page.js',
  'studio/app/templates/drafts/page.js',
  'studio/app/client/page.js',
  'studio/components/ui.js',
  'studio/components/DataTable.js',
  'studio/components/charts.js',
  'studio/components/shell/CommandPalette.js',
  'studio/components/shell/PocketBar.js',
];

const read = (p) => fs.readFileSync(p, 'utf8');
// strip comments so prose never trips a sentinel (house lesson)
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Every <button …>…</button> with its opening tag parsed brace-aware (an
// arrow `=>` inside onClick={…} must not end the tag).
function buttons(src) {
  const out = [];
  const re = /<button(?=[\s>])/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + 7;
    let depth = 0;
    let quote = null;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    const open = src.slice(m.index, i + 1);
    const selfClosing = open.endsWith('/>');
    const close = selfClosing ? i + 1 : src.indexOf('</button>', i);
    const inner = selfClosing ? '' : src.slice(i + 1, close);
    out.push({ at: m.index, open, inner });
  }
  return out;
}

const insideForm = (src, at) => src.lastIndexOf('<form', at) > src.lastIndexOf('</form>', at);
const lineOf = (src, at) => src.slice(0, at).split('\n').length;

test('every owned file exists', () => {
  for (const f of FILES) assert.ok(fs.existsSync(f), f);
});

test('no window.confirm — destructive actions use useConfirm()', () => {
  for (const f of FILES) assert.doesNotMatch(code(read(f)), /window\.confirm\(/, f);
});

test('no dead href="#" links', () => {
  for (const f of FILES) assert.doesNotMatch(code(read(f)), /href=(?:"#"|'#'|\{['"`]#['"`]\})/, f);
});

test('no links to the retired /operations /content /network routes', () => {
  const retired = /(?:href=|push\(|replace\()\s*\{?\s*['"`]\/(?:operations|content|network)(?:[/?#'"`])/;
  for (const f of FILES) assert.doesNotMatch(code(read(f)), retired, f);
});

test('text sizes come from the scale (no text-[Npx], no text-t-NN)', () => {
  for (const f of FILES) {
    const c = code(read(f));
    assert.doesNotMatch(c, /text-\[\d+(?:\.\d+)?px\]/, f);
    assert.doesNotMatch(c, /\btext-t-\d+\b/, f);
  }
});

test('every <button> is wired: onClick, type=submit, spread props, or inside a <form>', () => {
  const dead = [];
  for (const f of FILES) {
    const src = code(read(f));
    for (const b of buttons(src)) {
      const wired = /\bon(?:Click|MouseDown|PointerDown)=|type="submit"|\{\.\.\.\w/.test(b.open) || insideForm(src, b.at);
      if (!wired) dead.push(`${f}:${lineOf(src, b.at)} ${b.open.slice(0, 80)}`);
    }
  }
  assert.deepEqual(dead, [], 'buttons with no handler:\n' + dead.join('\n'));
});

test('icon-only buttons carry an aria-label', () => {
  const unnamed = [];
  for (const f of FILES) {
    const src = code(read(f));
    for (const b of buttons(src)) {
      const hasIcon = /<[A-Z]\w*[^>]*\/>/.test(b.inner);
      const text = b.inner.replace(/<[A-Z]\w*[^>]*\/>/g, '').replace(/\s+/g, '');
      if (hasIcon && text === '' && !/aria-label=/.test(b.open)) unnamed.push(`${f}:${lineOf(src, b.at)}`);
    }
  }
  assert.deepEqual(unnamed, [], 'icon-only buttons without aria-label:\n' + unnamed.join('\n'));
});

test('destructive confirms are danger-toned dialogs', () => {
  const pins = {
    'studio/app/sessions/page.js': /tone: 'danger'/,
    'studio/app/settings/page.js': /tone: 'danger'/,
    'studio/app/thumbs/page.js': /tone: 'danger'/,
    'studio/app/production/page.js': /tone: 'danger'/,
    'studio/app/review/page.js': /tone: 'danger'/,
  };
  for (const [f, re] of Object.entries(pins)) {
    const c = code(read(f));
    assert.match(c, /useConfirm\(\)/, f);
    assert.match(c, re, f);
  }
});

test('the kit EmptyState can carry an action (retry / next step)', () => {
  const ui = code(read('studio/components/ui.js'));
  assert.match(ui, /export function EmptyState\(\{ icon: Icon, title, sub, children \}\)/);
});
