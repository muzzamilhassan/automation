// Thumbnail template engine (Studio side) — pure sharp + SVG PATHS, 1280×720.
// v2: text is converted to vector PATHS via opentype.js (TTFs shipped in
// lib/fonts) — zero system-font dependency, identical output on Vercel,
// locally and in CI. librsvg ignores data-URL @font-face (tofu boxes), which
// is exactly why this is paths, not text.
import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';

const FONT_DIR = path.join(process.cwd(), 'lib', 'fonts');
const TTF = {
  anton: 'Anton-Regular.ttf',
  oswald500: 'Oswald-500.ttf',
  oswald700: 'Oswald-700.ttf',
  inter600: 'Inter-SemiBold.ttf',
  inter800: 'Inter-ExtraBold.ttf',
  playfair: 'PlayfairDisplay-Bold.ttf',
};
const _fonts = {};
function font(name) {
  if (!_fonts[name]) {
    const buf = fs.readFileSync(path.join(FONT_DIR, TTF[name]));
    _fonts[name] = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return _fonts[name];
}

export const escapeXml = (s) =>
  String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const adv = (f, text, size, spacing = 0) =>
  f.getAdvanceWidth(text, size) + Math.max(0, text.length - 1) * spacing;

// Whole line as ONE path (fast); spacing supported via per-char layout.
function linePath(f, text, x, y, size, spacing = 0) {
  if (!text) return { d: '', width: 0 };
  if (!spacing) {
    const p = f.getPath(text, x, y, size);
    return { d: p.toPathData(1), width: p.getBoundingBox().x2 - p.getBoundingBox().x1 };
  }
  let cx = x;
  const parts = [];
  for (const ch of text) {
    if (ch !== ' ') parts.push(f.getPath(ch, cx, y, size).toPathData(1));
    cx += f.getAdvanceWidth(ch, size) + spacing;
  }
  return { d: parts.join(' '), width: cx - x - spacing };
}

// A line with ONE highlighted word — per-word paths, exact advances.
function accentLinePath(f, words, x, y, size, fill, accentFill, accentWord, spacing = 0) {
  let cx = x;
  const parts = [];
  for (const w of words) {
    const isAccent = accentWord && w.toLowerCase().replace(/[^a-z]/g, '') === String(accentWord).toLowerCase().replace(/[^a-z]/g, '');
    const p = f.getPath(w, cx, y, size).toPathData(1);
    parts.push(`<path d="${p}" fill="${isAccent ? accentFill : fill}"/>`);
    cx += f.getAdvanceWidth(w, size) + f.getAdvanceWidth(' ', size) + spacing;
  }
  return parts.join('');
}

// Exact-fit greedy wrap against a PIXEL width (no char heuristics).
export function wrapByWidth(f, text, size, maxWidth) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    const test = [...cur, words[i]].join(' ');
    if (adv(f, test, size) <= maxWidth || cur.length === 0) cur.push(words[i]);
    else {
      lines.push(cur.join(' '));
      if (lines.length === 2) { lines.push(words.slice(i).join(' ')); return lines; }
      cur = [words[i]];
    }
  }
  if (cur.length) lines.push(cur.join(' '));
  return lines.slice(0, 3);
}

// Shrink-to-fit: largest size ≤ start where the wrap fits both width & 3 lines.
function fitLines(f, text, startSize, maxWidth, minSize) {
  for (let size = startSize; size >= minSize; size -= 6) {
    const lines = wrapByWidth(f, text, size, maxWidth);
    const widest = Math.max(...lines.map((l) => adv(f, l, size)));
    if (widest <= maxWidth) return { lines, size };
  }
  return { lines: wrapByWidth(f, text, minSize, maxWidth), size: minSize };
}

export const pickAccentWord = (title) => {
  const words = String(title || '').split(/\s+/).filter((w) => w.replace(/[^a-zA-Z]/g, '').length > 3);
  if (!words.length) return '';
  return words.reduce((a, b) => (b.replace(/[^a-zA-Z]/g, '').length > a.replace(/[^a-zA-Z]/g, '').length ? b : a));
};

// Template-aware wrap (used by the preview route for metadata/checks).
export function wrapForTemplate(template, title) {
  return fitLines(font('anton'), String(title || '').trim(), template === 'poster' ? 140 : 150, template === 'poster' ? 468 : 1160, template === 'poster' ? 72 : 84).lines;
}

export const TEMPLATES = {
  clean: { label: 'Clean Frame', desc: 'Full-bleed photo, bottom gradient, centered headline', needsPhoto: true },
  poster: { label: 'Bold Poster', desc: 'Split layout: shade panel + huge left headline', needsPhoto: false },
  paper: { label: 'Paper Doc', desc: 'Warm paper, masked photo, serif + giant accent word', needsPhoto: false },
};

const DEFS = `
<defs>
  <linearGradient id="scrimUp" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.88"/>
  </linearGradient>
  <radialGradient id="paperVignette" cx="0.5" cy="0.35" r="1">
    <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.16"/>
  </radialGradient>
  <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="9"/>
  </filter>
  <clipPath id="photoOval"><ellipse cx="310" cy="360" rx="280" ry="300"/></clipPath>
</defs>`;

// ---- template layouts (text already converted to path elements) ----

function tplClean({ photoHref, linesEls, accent, chipEls, eyebrowEls }) {
  return `
    ${photoHref ? `<image href="${photoHref}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/>` : `<rect width="1280" height="720" fill="${'#101014'}"/>`}
    <rect x="0" y="300" width="1280" height="420" fill="url(#scrimUp)"/>
    ${chipEls}
    ${eyebrowEls}
    ${linesEls}
    <rect x="0" y="712" width="1280" height="8" fill="${accent}"/>`;
}

function tplPoster({ photoHref, linesEls, accent, chipEls, eyebrowEls, shade, brandEls }) {
  return `
    ${photoHref
    ? `<image href="${photoHref}" x="560" y="0" width="720" height="720" preserveAspectRatio="xMidYMid slice"/>
       <rect x="560" y="0" width="720" height="720" fill="#000" opacity="0.18"/>`
    : `<rect x="560" y="0" width="720" height="720" fill="${shade}"/>`}
    <rect x="0" y="0" width="560" height="720" fill="${shade}"/>
    <rect x="554" y="0" width="6" height="720" fill="${accent}"/>
    ${chipEls}
    ${eyebrowEls}
    ${linesEls}
    ${brandEls}`;
}

function tplPaper({ photoHref, phraseEls, bigEls, chipEls, monoEls, eyebrowEls, accent, brand }) {
  return `
    <rect x="0" y="0" width="1280" height="720" fill="#F3F1EC"/>
    <rect x="0" y="0" width="1280" height="720" fill="url(#paperVignette)"/>
    ${photoHref ? `<g clip-path="url(#photoOval)">
      <image href="${photoHref}" x="30" y="60" width="560" height="600" preserveAspectRatio="xMidYMid slice"/>
    </g>
    <ellipse cx="310" cy="360" rx="282" ry="302" fill="none" stroke="#DDD8CC" stroke-width="3"/>` : ''}
    ${chipEls}
    ${phraseEls}
    ${bigEls}
    ${monoEls}
    ${eyebrowEls}`;
}

// ---- main entry: returns a 1280×720 SVG string ----
export function buildThumbSvg(template, opts) {
  const o = {
    title: String(opts.title || 'Untitled story').trim(),
    accent: opts.accent || '#E8C15A',
    chip: String(opts.chip || '').slice(0, 24),
    eyebrow: String(opts.eyebrow || '').slice(0, 40),
    shade: opts.shade || '#0A1128',
    brand: String(opts.brand || '').slice(0, 28),
    photoHref: opts.photoHref || '',
  };
  const accentWord = opts.accentWord || pickAccentWord(o.title);
  let inner = '';

  if (template === 'clean') {
    const f = font('anton');
    const { lines, size } = fitLines(f, o.title, 150, 1160, 84);
    const lineH = size + 12;
    const startY = 720 - 60 - (lines.length - 1) * lineH;
    const linesEls = lines.map((l, i) => {
      const words = l.split(' ');
      const w = adv(f, l, size);
      const x = 640 - w / 2;
      const shadow = f.getPath(l, x + 4, startY + i * lineH + 6, size).toPathData(1);
      const main = accentLinePath(f, words, x, startY + i * lineH, size, '#FFFFFF', o.accent, accentWord);
      return `<path d="${shadow}" fill="#000" opacity="0.5" filter="url(#softShadow)"/>${main}`;
    }).join('');
    const os = font('oswald500');
    const chipEls = o.chip ? (() => {
      const c = o.chip.toUpperCase();
      const w = adv(os, c, 19, 3) + 40;
      return `<rect x="56" y="48" rx="6" width="${w.toFixed(0)}" height="42" fill="${o.accent}"/>
        <path d="${linePath(os, c, 76, 76, 19, 3).d}" fill="#0B0B0D"/>`;
    })() : '';
    const eyebrowEls = o.eyebrow ? (() => {
      const e = o.eyebrow.toUpperCase();
      const w = adv(os, e, 24, 8);
      return `<path d="${linePath(os, e, 640 - w / 2, startY - size - 26, 24, 8).d}" fill="#FFF" opacity="0.92"/>`;
    })() : '';
    inner = tplClean({ photoHref: o.photoHref, linesEls, accent: o.accent, chipEls, eyebrowEls });

  } else if (template === 'poster') {
    const f = font('anton');
    const { lines, size } = fitLines(f, o.title, 140, 468, 72);
    const lineH = size + 10;
    const startY = 720 - 96 - (lines.length - 1) * lineH;
    const linesEls = lines.map((l, i) => {
      const shadow = f.getPath(l, 60, startY + i * lineH + 6, size).toPathData(1);
      const main = accentLinePath(f, l.split(' '), 56, startY + i * lineH, size, '#F5F2E8', o.accent, accentWord);
      return `<path d="${shadow}" fill="#000" opacity="0.5" filter="url(#softShadow)"/>${main}`;
    }).join('');
    const is = font('inter800');
    const chipEls = o.chip ? (() => {
      const c = o.chip.toUpperCase();
      const w = adv(is, c, 19, 3) + 40;
      return `<rect x="56" y="56" rx="6" width="${w.toFixed(0)}" height="42" fill="${o.accent}"/>
        <path d="${linePath(is, c, 76, 84, 19, 3).d}" fill="#0B0B0D"/>`;
    })() : '';
    const os = font('oswald500');
    const eyebrowEls = o.eyebrow ? (() => {
      const e = o.eyebrow.toUpperCase();
      return `<path d="${linePath(os, e, 56, startY - size - 24, 22, 7).d}" fill="#FFF" opacity="0.9"/>`;
    })() : '';
    const brandEls = o.brand ? `<path d="${linePath(is, o.brand.toUpperCase(), 1224 - adv(is, o.brand.toUpperCase(), 20, 4), 676, 20, 4).d}" fill="#FFF" opacity="0.85"/>
      <rect x="56" y="${720 - 48}" width="26" height="4" fill="${o.accent}"/>` : '';
    inner = tplPoster({ photoHref: o.photoHref, linesEls, accent: o.accent, chipEls, eyebrowEls, shade: o.shade, brandEls });

  } else {
    // paper
    const anton = font('anton');
    const inter = font('inter600');
    const playfair = font('playfair');
    const big = (accentWord || pickAccentWord(o.title) || 'STORY').toUpperCase();
    const rest = o.title.replace(new RegExp(accentWord || pickAccentWord(o.title) || '§', 'i'), '').trim().replace(/\s+/g, ' ') || o.title;
    // serif phrase lines, fit to 600px width
    const restFit = fitLines(playfair, rest || o.title, 42, 600, 26);
    const chipEls = o.chip ? `<path d="${linePath(inter, o.chip.toUpperCase(), 620, 150, 20, 6).d}" fill="#8A8272"/>
      <path d="${linePath(inter, 'P R E S E N T S', 620, 196, 15, 4).d}" fill="#A39A85"/>` : '';
    const phraseEls = restFit.lines.map((l, i) =>
      `<path d="${linePath(playfair, l, 620, 300 + 60 + i * (restFit.size + 14), restFit.size).d}" fill="#232019"/>`).join('');
    const bigSize = Math.min(160, 620 / Math.max(1, adv(anton, big, 100) / 100));
    const bigW = adv(anton, big, bigSize);
    const bigEls = `<path d="${anton.getPath(big, 616, 300 + 60 + restFit.lines.length * (restFit.size + 14) + bigSize * 0.9, bigSize).toPathData(1)}" fill="${o.accent}"/>`;
    const monoEls = `<circle cx="1180" cy="120" r="44" fill="none" stroke="${o.accent}" stroke-width="3"/>
      <path d="${linePath(playfair, o.brand.slice(0, 2).toUpperCase() || 'QQ', 1180 - adv(playfair, o.brand.slice(0, 2).toUpperCase() || 'QQ', 30) / 2, 131, 30).d}" fill="#232019"/>`;
    const eyebrowEls = o.eyebrow ? `<path d="${linePath(inter, o.eyebrow, 620, 668, 15, 2).d}" fill="#8A8272"/>` : '';
    inner = tplPaper({ photoHref: o.photoHref, phraseEls, bigEls, chipEls, monoEls, eyebrowEls: eyebrowEls || chipEls, accent: o.accent, brand: o.brand });
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">${DEFS}${inner}</svg>`;
}
