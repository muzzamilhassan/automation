// Thumbnail template engine (Studio side) — pure sharp+SVG, 1280×720 JPEG.
// Same proven technique as youtube-engine.mjs renderYouTubeThumbnail (base64
// fonts embedded in SVG → sharp), generalized to multiple templates and any
// photo (Pexels URL fetched server-side, upload dataURL, or none for paper).
import fs from 'node:fs';
import path from 'node:path';

const FONT_DIR = path.join(process.cwd(), 'lib', 'fonts');
const b64 = (f) => {
  try { return fs.readFileSync(path.join(FONT_DIR, f)).toString('base64'); } catch { return ''; }
};

let _fontsCss = null;
function fontsCss() {
  if (_fontsCss) return _fontsCss;
  _fontsCss = `<style>
@font-face{font-family:'AntonS';src:url(data:font/woff;base64,${b64('Anton-normal-400.woff')}) format('woff');font-weight:400;}
@font-face{font-family:'OswaldS';src:url(data:font/woff;base64,${b64('Oswald-500.woff')}) format('woff');font-weight:500;}
@font-face{font-family:'OswaldS';src:url(data:font/woff;base64,${b64('Oswald-700.woff')}) format('woff');font-weight:700;}
@font-face{font-family:'InterS';src:url(data:font/woff;base64,${b64('Inter-normal-600.woff')}) format('woff');font-weight:600;}
@font-face{font-family:'InterS';src:url(data:font/woff;base64,${b64('Inter-normal-800.woff')}) format('woff');font-weight:800;}
@font-face{font-family:'PlayfairS';src:url(data:font/woff;base64,${b64('PlayfairDisplay-normal-700.woff')}) format('woff');font-weight:700;}
</style>`;
  return _fontsCss;
}

export const escapeXml = (s) =>
  String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Greedy 3-line wrap — heuristics tuned to the Anton sizes below (same idea as
// renderYouTubeThumbnail's char-based wrap; SVG has no DOM measuring).
// Line 3 always absorbs ALL remaining words (never drop words silently);
// oversized line 3 renders at a reduced size instead.
export function wrapTitle(title, maxChars) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= maxChars) { cur += ' ' + w; continue; }
    lines.push(cur);
    if (lines.length === 2) { lines.push(words.slice(i).join(' ')); return lines; }
    cur = w;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

export const pickAccentWord = (title) => {
  const words = String(title || '').split(/\s+/).filter((w) => w.replace(/[^a-zA-Z]/g, '').length > 3);
  if (!words.length) return '';
  return words.reduce((a, b) => (b.replace(/[^a-zA-Z]/g, '').length > a.replace(/[^a-zA-Z]/g, '').length ? b : a));
};

// Render one text line, highlighting the accent word (case-insensitive).
// Shadow = offset blurred black copy (soft, no hard borders — owner taste).
function lineSvg(x, y, line, size, fill, accent, accentFill, shadowRef, anchor = 'start') {
  const words = line.split(' ');
  const spans = words.map((w) => {
    const isAccent = accent && w.toLowerCase().replace(/[^a-z]/g, '') === accent.toLowerCase().replace(/[^a-z]/g, '');
    return `<tspan fill="${isAccent ? accentFill : fill}">${escapeXml(w)}</tspan>`;
  });
  const base = `font-family="AntonS" font-size="${size}" ${anchor !== 'start' ? `text-anchor="${anchor}"` : ''}`;
  return `
    <text x="${x + 4}" y="${y + 6}" ${base} fill="#000" opacity="0.5" filter="url(#${shadowRef})">${escapeXml(line)}</text>
    <text x="${x}" y="${y}" ${base}>${spans.join(' ')}</text>`;
}

// T1 — Clean Frame: full-bleed photo, bottom scrim, centered Anton headline.
function tplClean({ photoHref, lines, accent, accentWord, chip, eyebrow }) {
  const sizes = lines.length === 1 ? [150] : lines.length === 2 ? [128] : [104];
  const startY = 720 - 56 - (lines.length - 1) * (sizes[0] + 12);
  const textEls = lines.map((l, i) => lineSvg(640, startY + i * (sizes[0] + 12), l, sizes[0], '#FFFFFF', accent, accent, 'softShadow', 'middle')).join('');
  return `
    <image href="${photoHref}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/>
    <rect x="0" y="330" width="1280" height="390" fill="url(#scrimUp)"/>
    ${chip ? `<rect x="56" y="48" rx="6" ry="6" width="${chip.length * 13 + 44}" height="42" fill="${accent}"/><text x="${56 + 22}" y="76" font-family="InterS" font-weight="800" font-size="19" letter-spacing="3" fill="#0B0B0D">${escapeXml(chip.toUpperCase())}</text>` : ''}
    ${eyebrow ? `<text x="640" y="${startY - sizes[0] - 26}" text-anchor="middle" font-family="OswaldS" font-weight="500" font-size="24" letter-spacing="8" fill="#FFFFFF" opacity="0.92">${escapeXml(eyebrow.toUpperCase())}</text>` : ''}
    ${textEls}
    <rect x="0" y="712" width="1280" height="8" fill="${accent}"/>`;
}

// T2 — Bold Poster: shade panel left + photo right, huge left-aligned Anton.
function tplPoster({ photoHref, lines, accent, accentWord, chip, eyebrow, shade, brand }) {
  const sizes = lines.length === 1 ? [140] : lines.length === 2 ? [116] : [96];
  const startY = 720 - 64 - (lines.length - 1) * (sizes[0] + 10);
  const textEls = lines.map((l, i) => lineSvg(56, startY + i * (sizes[0] + 10), l, sizes[0], '#F5F2E8', accent, accent, 'softShadow')).join('');
  return `
    ${photoHref ? `<image href="${photoHref}" x="560" y="0" width="720" height="720" preserveAspectRatio="xMidYMid slice"/>
    <rect x="560" y="0" width="720" height="720" fill="#000" opacity="0.18"/>` : `<rect x="560" y="0" width="720" height="720" fill="${shade}"/>`}
    <rect x="0" y="0" width="560" height="720" fill="${shade}"/>
    <rect x="554" y="0" width="6" height="720" fill="${accent}"/>
    ${chip ? `<rect x="56" y="56" rx="6" ry="6" width="${chip.length * 13 + 44}" height="42" fill="${accent}"/><text x="${56 + 22}" y="84" font-family="InterS" font-weight="800" font-size="19" letter-spacing="3" fill="#0B0B0D">${escapeXml(chip.toUpperCase())}</text>` : ''}
    ${eyebrow ? `<text x="56" y="${startY - sizes[0] - 24}" font-family="OswaldS" font-weight="500" font-size="22" letter-spacing="7" fill="#FFFFFF" opacity="0.9">${escapeXml(eyebrow.toUpperCase())}</text>` : ''}
    ${textEls}
    <rect x="56" y="${720 - 44}" width="26" height="4" fill="${accent}"/>
    <text x="1224" y="676" text-anchor="end" font-family="InterS" font-weight="800" font-size="20" letter-spacing="4" fill="#FFFFFF" opacity="0.85">${escapeXml(brand || '')}</text>`;
}

// T3 — Paper Doc: warm paper, soft-masked photo left, serif + giant accent word.
function tplPaper({ photoHref, lines, accent, accentWord, chip, eyebrow, brand }) {
  const phrase = lines.join(' ');
  const big = (accentWord || pickAccentWord(phrase) || 'STORY').toUpperCase();
  const rest = phrase.replace(new RegExp(big, 'i'), '').trim().replace(/\s+/g, ' ') || phrase;
  const restLines = wrapTitle(rest, 26);
  const startY = 300;
  const restEls = restLines.map((l, i) =>
    `<text x="620" y="${startY + 70 + i * 46}" font-family="PlayfairS" font-size="38" fill="#232019">${escapeXml(l)}</text>`).join('');
  return `
    <rect x="0" y="0" width="1280" height="720" fill="#F3F1EC"/>
    <rect x="0" y="0" width="1280" height="720" fill="url(#paperVignette)"/>
    ${photoHref ? `<g clip-path="url(#photoOval)">
      <image href="${photoHref}" x="30" y="60" width="560" height="600" preserveAspectRatio="xMidYMid slice"/>
    </g>
    <ellipse cx="310" cy="360" rx="286" ry="306" fill="none" stroke="#DDD8CC" stroke-width="3"/>` : ''}
    <g clip-path="url(#frame)"><rect x="0" y="0" width="1280" height="720" fill="url(#grain)"/></g>
    ${chip ? `<text x="620" y="150" font-family="InterS" font-weight="600" font-size="20" letter-spacing="6" fill="#8A8272">${escapeXml(chip.toUpperCase())}</text>` : ''}
    <text x="620" y="196" font-family="InterS" font-weight="600" font-size="16" letter-spacing="8" fill="#A39A85">P R E S E N T S</text>
    ${restEls}
    <text x="616" y="${startY + 70 + restLines.length * 46 + 130}" font-family="AntonS" font-size="${big.length > 9 ? 120 : 150}" fill="${accent}">${escapeXml(big)}</text>
    <circle cx="1180" cy="120" r="44" fill="none" stroke="${accent}" stroke-width="3"/>
    <text x="1180" y="130" text-anchor="middle" font-family="PlayfairS" font-size="30" fill="#232019">${escapeXml((brand || 'QQ').slice(0, 2).toUpperCase())}</text>
    <text x="620" y="668" font-family="InterS" font-weight="600" font-size="15" letter-spacing="2" fill="#8A8272">${escapeXml(eyebrow || '')}</text>`;
}

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
    <feGaussianBlur stdDeviation="10"/>
  </filter>
  <clipPath id="photoOval"><ellipse cx="310" cy="360" rx="280" ry="300"/></clipPath>
  <clipPath id="frame"><rect x="0" y="0" width="1280" height="720"/></clipPath>
</defs>`;

export const TEMPLATES = {
  clean: { label: 'Clean Frame', desc: 'Full-bleed photo, bottom gradient, centered headline — Shorts staple', needsPhoto: true },
  poster: { label: 'Bold Poster', desc: 'Split layout: shade panel + big left headline — long-form staple', needsPhoto: false },
  paper: { label: 'Paper Doc', desc: 'Warm paper, soft-masked photo, serif + giant accent word', needsPhoto: false },
};

// Main entry: returns a 1280×720 SVG string.
export function buildThumbSvg(template, opts) {
  const o = {
    title: String(opts.title || 'Untitled story'),
    accent: opts.accent || '#E8C15A',
    chip: String(opts.chip || '').slice(0, 24),
    eyebrow: String(opts.eyebrow || '').slice(0, 40),
    shade: opts.shade || '#0A1128',
    brand: opts.brand || '',
    photoHref: opts.photoHref || '',
  };
  const maxChars = template === 'poster' ? 12 : 16;
  const lines = wrapTitle(o.title, maxChars);
  o.lines = lines;
  o.accentWord = opts.accentWord || pickAccentWord(o.title);
  const tpl = template === 'poster' ? tplPoster : template === 'paper' ? tplPaper : tplClean;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">${fontsCss()}${DEFS}${tpl(o)}</svg>`;
}
