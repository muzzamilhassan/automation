// Owner request (2026-11-23): "remove all the dummy icons and add real ones."
// Emoji / text glyphs used as UI icons (✓ ⭐ ▲ ▸ ↗ → …) were replaced by real
// lucide-react icons in the kind's colour family (pattern: CalendarDayDrawer
// KIND / KindBadge). This sentinel keeps them out.
//
// Scans every studio/app + studio/components file (server-only app/api routes
// excluded — they never render) plus the lib modules whose strings render as
// UI, with comments stripped (house lesson: prose never trips a sentinel).
// A line holding a banned glyph fails unless an ALLOW entry (file + pattern +
// reason) covers it; an ALLOW entry that no longer matches anything fails too,
// so the list never rots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO = path.join(ROOT, 'studio');

// Glyph classes that acted as icons: emoji, check/cross marks, warning,
// clocks, play/pause, dots/circles, shade blocks, triangles/carets, stars, arrows.
const GLYPH = /\p{Extended_Pictographic}|[✓✔✕✗✖⚠⏰⏳⏸▶◀●○◐░▸▾▴▲▼★☆↗↖↘←→↑↓]/u;

// lib modules whose strings are rendered as UI text.
const UI_LIBS = ['lib/slot-planner.mjs'];

// Deliberate keeps. file is relative to studio/; pattern must match the line.
const ALLOW = [
  { file: 'components/TemplateAssignPanel.js', pattern: /→/, reason: 'flow notation inside a sentence ("Manage → API keys") — not an icon' },
  { file: 'app/templates/drafts/page.js', pattern: /join\(' → '\)/, reason: 'templates lane file; arrow is a flow separator between section names (data)' },
  { file: 'app/topics/page.js', pattern: /Research proposes → you approve →/, reason: 'arrows are flow notation inside a sentence, not an icon' },
  { file: 'app/production/page.js', pattern: /research → script → voice → render → upload/, reason: 'flow notation inside confirm-dialog prose (a string prop)' },
  { file: 'app/thumbs/page.js', pattern: /Video 1 → first, video 2 → second/, reason: 'mapping notation inside a sentence' },
  { file: 'components/wizard/GoogleSetupDrawer.js', pattern: /console\.cloud\.google\.com → APIs &amp; Services → Credentials/, reason: 'menu path notation (Google Console breadcrumb), not an icon' },
  { file: 'components/wizard/ConnectStep.js', pattern: /logged in → choose/, reason: 'step notation inside a note string prop (plain text)' },
  { file: 'components/wizard/ConnectedChannels.js', pattern: /logged in → choose/, reason: 'step notation inside a note string prop (plain text)' },
  { file: 'components/shell/CommandPalette.js', pattern: /<span className="kbd">↑<\/span><span className="kbd">↓<\/span>/, reason: 'keyboard key legends inside <kbd> caps, not decorative icons' },
];

const read = (p) => fs.readFileSync(p, 'utf8');
// strip comments (block, JSX {/* */}, whole-line and trailing ` // ` comments),
// keeping line numbers stable
const blank = (m) => m.replace(/[^\n]/g, ' ');
const code = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
  .replace(/\/\*[\s\S]*?\*\//g, blank)
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/[ \t]\/\/[ \t].*$/gm, '');

function files() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        if (path.relative(STUDIO, p).replace(/\\/g, '/') === 'app/api') continue; // server-only
        walk(p);
      } else if (/\.(m?js|jsx)$/.test(e.name)) out.push(p);
    }
  };
  walk(path.join(STUDIO, 'app'));
  walk(path.join(STUDIO, 'components'));
  for (const f of UI_LIBS) out.push(path.join(STUDIO, f));
  return out;
}

function scan() {
  const hits = [];
  for (const p of files()) {
    const rel = path.relative(STUDIO, p).replace(/\\/g, '/');
    code(read(p)).split('\n').forEach((line, i) => {
      if (GLYPH.test(line)) hits.push({ rel, line: i + 1, text: line.trim() });
    });
  }
  return hits;
}

test('no emoji / text glyph acts as a UI icon (use lucide-react) — only the explicit allow-list survives', () => {
  const bad = scan().filter((h) => !ALLOW.some((a) => a.file === h.rel && a.pattern.test(h.text)));
  assert.deepEqual(
    bad.map((h) => `${h.rel}:${h.line}: ${h.text.slice(0, 140)}`),
    [],
    'replace the glyph with a lucide icon (aria-hidden next to a word, aria-label when alone) or add a reasoned ALLOW entry',
  );
});

test('every allow-list entry still matches something and carries a reason (no rot)', () => {
  const hits = scan();
  for (const a of ALLOW) {
    assert.ok(a.reason && a.reason.length > 10, `${a.file} needs a reason`);
    assert.ok(hits.some((h) => h.rel === a.file && a.pattern.test(h.text)), `stale ALLOW entry: ${a.file} ${a.pattern}`);
  }
});

test('the sentinel actually sees glyphs (self-check on a synthetic line)', () => {
  for (const g of ['✓', '⭐', '▲', '▸', '↗', '→', '←', '▶', '⚠️', '📝']) assert.ok(GLYPH.test(`<span>${g}</span>`), g);
  for (const ok of ['3× faster', 'Ctrl K', '—', '·', '…']) assert.ok(!GLYPH.test(ok), ok);
  assert.ok(!GLYPH.test(code('<span>ok</span> // was ✓')), 'trailing comments are stripped');
  assert.ok(!GLYPH.test(code('{/* ⭐ */}<b/>')), 'JSX comments are stripped');
});

test('fake letter icons are real icons: bell "status unknown" badge and the custom-colour "+"', () => {
  const shell = code(read(path.join(STUDIO, 'components/shell/AppShell.js')));
  assert.match(shell, /status unknown"><CircleHelp size=\{10\} aria-label="Alerts status unknown" \/><\/span>/);
  assert.doesNotMatch(shell, /status unknown">\?<\/span>/);
  const accent = code(read(path.join(STUDIO, 'components/wizard/AccentPicker.js')));
  assert.match(accent, /<Plus size=\{14\} aria-hidden \/>/);
  assert.doesNotMatch(accent, /pointer-events-none">\+<\/span>/);
});

test('lib/slot-planner reasons are plain words — the star is a real icon in SlotTimeline', () => {
  const planner = read(path.join(STUDIO, 'lib/slot-planner.mjs'));
  assert.doesNotMatch(code(planner), /⭐/);
  const timeline = read(path.join(STUDIO, 'components/SlotTimeline.js'));
  assert.match(timeline, /import \{[^}]*\bStar\b[^}]*\} from 'lucide-react'/);
});
