// YouTube Shorts Engine v2 — a DEDICATED YouTube format, deliberately different
// from the FB/IG cinematic reels but driven by the same content batch.
//
//   • Topic-matched 4K Pixabay footage per quote (Gemini picks the search query)
//   • Human-feel narration: OpenAI gpt-4o-mini-tts "documentary narrator"
//     instructions (Edge-TTS fallback) + whisper word-level alignment
//   • Trending "Hormozi" captions: ALL-CAPS Anton, thick black outline,
//     1-3 words per cue, yellow keyword, pop-in scale, burned via libass ASS
//   • Hook in frame 1 (<=7 words), loopable, ~12-30s, safe-zone layout
//   • SEO metadata + scheduled uploads at the 05:45/13:30/18:45 PKT slots
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path'; // restored — the #72 dead-code range accidentally cut this mid-file import (IC heal regression)
import sharp from 'sharp';
import { EMBEDDED_FONTS_CSS } from './typography-poster-engine.mjs';
import { ensurePoolClip } from './cinematic-engine.mjs';
import { getTopicClip } from './youtube-clips.mjs';
import { routeAndCall } from './lib/ai-adapter.mjs';
import { capabilityProviders } from './studio/lib/provider-catalog.js';
import { REGISTRY_META } from './studio/lib/template-registry.data.js';

import { resolveBinary } from './lib/ffmpeg.mjs';
import { loadEnv } from './lib/env.mjs';

loadEnv();
const FF = resolveBinary('ffmpeg');
const POOL_DIR = 'pixabay-pool';
// BYOK (#104): provider keys for the script brain are applied per channel
// THROUGH the adapter (routeAndCall -> applyChannelKeys, capability-filtered)
// at call time — provider selection never reads env directly anymore.
import { resolveBrand as resolveBrandKit } from './lib/brand-resolve.mjs';
import { loadChannelState, saveChannelState } from './lib/state.mjs';

// Resolve the brand for a page/channel. Delegates to unified lib/brand-resolve.mjs.
function resolveBrand(page) {
  if (page?.ytBrand) {
    const b = page.ytBrand;
    const followName = b.followName || (b.label ? b.label.split(' ').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ') : 'us');
    return { ...b, followName };
  }
  const slug = page?.ytSlug || page?.slug || page?.id;
  const brand = resolveBrandKit(slug);
  const followName = brand?.label ? brand.label.split(' ').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ') : 'us';
  return { ...brand, followName };
}

const HOOK_STYLES = ['direct', 'emphasis', 'curiosity', 'negative'];
const CURIOSITY_PREFIX = ['NOBODY TELLS YOU THIS:', 'READ THIS TWICE:', 'THIS CHANGES EVERYTHING:'];
// ASS colour is &HAABBGGRR — #FFD93D yellow (BGR 3DD9FF)
const ASS_YELLOW = '&H3DD9FF&';
const ASS_WHITE = '&HFFFFFF&';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function wrapTextToLines(text, maxChars) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current ? current + ' ' + w : w).length <= maxChars) {
      current = current ? current + ' ' + w : w;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const escapeXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const titleCase = (s) => String(s || '').toLowerCase().replace(/(?<!['’])\b([a-z])/g, (m, p) => p.toUpperCase());
const stripPunct = (s) => String(s || '').replace(/[.,!?;:"'’"“”—–-]/g, '').trim();

// ---------------------------------------------------------------------------
// Spoken script — written FOR the voice: contractions, short sentences, a
// pause marker before the takeaway (the "human twist" lives here as much as
// in the TTS instructions).
// ---------------------------------------------------------------------------
export function spokenScript(postData) {
  const headline = titleCase((postData?.headline || '').replace(/\.$/, ''));
  const insight = String(postData?.insight_body || '').trim();
  const takeaway = String(postData?.takeaway || '')
    .replace(/^Rule:\s*/i, '')
    .replace(/\.$/, '')
    .trim();
  const parts = [`Listen — ${headline}.`, insight];
  if (takeaway) parts.push(`Here's the rule... ${takeaway}.`);
  return parts.filter(Boolean).join(' ').split(/\s+/).slice(0, 55).join(' ');
}

// ---------------------------------------------------------------------------
// Narration — youtube-flow/narrate.py returns exact word timestamps
// ---------------------------------------------------------------------------
let cachedPython = null;
function resolvePython() {
  if (cachedPython !== null) return cachedPython;
  for (const cmd of ['python', 'python3']) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'ignore' });
      cachedPython = cmd;
      return cmd;
    } catch (e) { /* try next */ }
  }
  cachedPython = '';
  return '';
}

function narrate(scriptText, tag, voice = '') {
  const py = resolvePython();
  if (!py) return null;
  const base = `${POOL_DIR}/yt-tts-${tag}`;
  fs.mkdirSync(POOL_DIR, { recursive: true });
  fs.writeFileSync(`${base}.txt`, scriptText, 'utf8');
  try {
    const env = { ...process.env };
    if (voice) env.YT_KOKORO_VOICE = voice;
    execFileSync(py, ['youtube-flow/narrate.py', `${base}.txt`, `${base}.mp3`, `${base}.words.json`],
      { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000, env });
    // narrate.py writes a meta file — audio may be .mp3 (openai/edge) or .wav (kokoro)
    const meta = JSON.parse(fs.readFileSync(`${base}.mp3.meta.json`, 'utf8'));
    if (!meta.words?.length || !fs.existsSync(meta.audio)) return null;
    return { file: meta.audio, words: meta.words, engine: meta.engine };
  } catch (e) {
    console.log(`      [YT Short] Narration unavailable (${String(e.message).slice(0, 120)}) — rendering text-only.`);
    return null;
  } finally {
    fs.rmSync(`${base}.txt`, { force: true });
    fs.rmSync(`${base}.mp3.meta.json`, { force: true });
  }
}

// ---------------------------------------------------------------------------
// Trending caption template — "Hormozi" style ASS (research: ascynd.io 2025,
// EchoWave, libass docs). ALL-CAPS Anton 110, 9px black outline, 1-3 words
// per cue, yellow keyword, pop-in scale, centered at y=1260 (safe zone).
// ---------------------------------------------------------------------------
function assTime(sec) {
  const cs = Math.round(Math.max(0, sec) * 100); // integer centiseconds — 59.995+ carries into the next minute
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
const escAss = (s) => String(s || '').replace(/[{}\\]/g, '');

export function buildAssCaptions(words, opts = {}) {
  const W = opts.w || 1080;
  const H = opts.h || 1920;
  const CX = opts.x || Math.round(W / 2);
  const CY = opts.y || 1260;
  const SIZE = opts.size || 110;
  const clean = words.map((w) => ({ ...w, t: stripPunct(w.w).toUpperCase() })).filter((w) => w.t);
  // group into cues of <=3 words; break on sentence punctuation or a >0.45s gap
  const cues = [];
  let cur = [];
  for (let i = 0; i < clean.length; i++) {
    cur.push(clean[i]);
    const punct = /[.!?…]$/.test(clean[i].w);
    const gap = i + 1 < clean.length ? clean[i + 1].s - (clean[i].s + clean[i].d) : 0;
    if (cur.length >= 3 || punct || gap > 0.45 || i === clean.length - 1) {
      cues.push({ start: cur[0].s, end: cur[cur.length - 1].s + cur[cur.length - 1].d, words: cur });
      cur = [];
    }
  }

  const lines = cues.map((c) => {
    const keyword = c.words.map((w) => w.t).reduce((a, b) => (b.length > a.length ? b : a), '');
    const body = c.words.map((w) => (w.t === keyword && w.t.length > 2
      ? `{\\c${ASS_YELLOW}}${escAss(w.t)}{\\c${ASS_WHITE}}`
      : escAss(w.t))).join(' ');
    const pop = `\\fad(30,30)\\t(0,90,\\fscx114\\fscy114)\\t(90,240,\\fscx100\\fscy100)`;
    return `Dialogue: 0,${assTime(c.start)},${assTime(Math.max(c.end, c.start + 0.35))},Hormozi,,0,0,0,,{\\an5\\pos(${CX},${CY})${pop}}${body}`;
  });

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hormozi,Anton,${SIZE},${ASS_WHITE},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${Math.max(4, Math.round(SIZE / 14))},0,5,60,60,640,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join('\n')}
`;
}

// ---------------------------------------------------------------------------
// Hook builder — style rotation (playbook Part 4: rotation beats one template)
// ---------------------------------------------------------------------------
function buildHook(postData, styleIndex) {
  const headline = (postData?.headline || 'STAY SILENT AND BUILD').toUpperCase();
  const style = HOOK_STYLES[styleIndex % HOOK_STYLES.length];
  let prefix = null;
  if (style === 'curiosity') prefix = CURIOSITY_PREFIX[styleIndex % CURIOSITY_PREFIX.length];
  if (style === 'negative' && !/^(STOP|NEVER|DON'T|DO NOT|QUIT)/.test(headline)) prefix = 'STOP.';
  let accentWord = null;
  if (style === 'emphasis') {
    accentWord = headline.split(/\s+/).filter((w) => w.length > 3).sort((a, b) => b.length - a.length)[0] || null;
  }
  const hookLines = wrapTextToLines(headline, 11).slice(0, 3);
  return { style, prefix, hookLines, accentWord };
}

// ---------------------------------------------------------------------------
// Overlay PNG — Quote Quarry identity: eyebrow + huge hook + footer.
// (The spoken words live in the ASS captions, so no body text needed when
// narration is present.)
// ---------------------------------------------------------------------------
async function renderOverlay(pageId, brand, hook, bodyLines, takeaway, withNarration) {
  const hlLines = hook.hookLines;
  const hSize = hlLines.some((l) => l.length > 9) ? 100 : 122;
  const hSp = Math.round(hSize * 1.04);
  const prefixY = 430;
  const hookTop = hook.prefix ? 540 : 470;
  const anchor = 'text-anchor="middle" x="540"';

  const hlEls = hlLines.map((line, i) => {
    let inner = escapeXml(line);
    if (hook.accentWord && line.includes(hook.accentWord)) {
      const esc = hook.accentWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      inner = line.split(new RegExp(`(${esc})`)).map((p) => (p === hook.accentWord
        ? `<tspan fill="${brand.accent}">${escapeXml(p)}</tspan>`
        : escapeXml(p))).join('');
    }
    return `<text ${anchor} y="${hookTop + i * hSp}" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="${hSize}" fill="#FFFFFF">${inner}</text>`;
  }).join('\n  ');

  let bodyEls = '';
  let takeawayEl = '';
  if (!withNarration) {
    const bSize = 50;
    const bSp = Math.round(bSize * 1.4);
    const bodyTop = Math.min(1210, hookTop + hlLines.length * hSp + 200);
    bodyEls = (bodyLines || []).map((line, i) =>
      `<text ${anchor} y="${bodyTop + i * bSp}" font-family="'Oswald', 'Arial Narrow', sans-serif" font-size="${bSize}" fill="#E8E8E8">${escapeXml(line)}</text>`).join('\n  ');
    if (takeaway) {
      takeawayEl = `<text ${anchor} y="${Math.min(1600, bodyTop + (bodyLines || []).length * bSp + 110)}" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="600" font-size="44" fill="${brand.accent}">${escapeXml(takeaway)}</text>`;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs><style>${EMBEDDED_FONTS_CSS}</style></defs>
  <text ${anchor} y="300" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="500" font-size="28" letter-spacing="7" fill="${brand.accent}">${escapeXml(brand.eyebrow || `QUOTE QUARRY // ${brand.label}`)}</text>
  ${hook.prefix ? `<text ${anchor} y="${prefixY}" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="600" font-size="40" letter-spacing="5" fill="${brand.accent}">${escapeXml(hook.prefix)}</text>` : ''}
  ${hlEls}
  ${bodyEls}
  ${takeawayEl}
  <text ${anchor} y="1798" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="500" font-size="30" letter-spacing="4" fill="#9A9A9A">${escapeXml(brand.handle || '@quotequarry302')} • DAILY ${escapeXml(brand.kwShort.toUpperCase())}</text>
</svg>`;
  const file = `${POOL_DIR}/yt-overlay-${pageId}.png`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

// ---------------------------------------------------------------------------
// SEO metadata (playbook Part 3)
// ---------------------------------------------------------------------------
const capitalized = (s) => titleCase(s);

/**
 * R4 (red-flags spec) — the active doc template's thumb_design block, or
 * null. Registry DATA only: the doc lane passes it to renderYouTubeThumbnail
 * as opts.thumbDesign; templates without the block render byte-identical to
 * today (R5, default-inert). Never a hardcoded per-channel map.
 */
export function thumbDesignFor(templateId) {
  const meta = templateId ? REGISTRY_META[templateId] : null;
  const td = meta && typeof meta === 'object' ? meta.thumb_design : null;
  return td && typeof td === 'object' && !Array.isArray(td) ? td : null;
}

/**
 * The left-stack doc-thumb overlay (owner reference BFCa-bRy-3M): full-bleed
 * frame + red-tinted scrim, top-left chip (accent dot + letterspaced caps),
 * accent eyebrow above a LEFT-anchored Anton headline whose LAST word takes
 * the accent tspan, bottom-right diamond brand mark. Pure SVG string — the
 * tests assert its elements without sharp. Only reached via thumb_design.
 */
export function leftStackThumbOverlay({ lines, size, accent, eyebrow, b64, td }) {
  const n = lines.length;
  const lastLine = lines[n - 1] || '';
  const words = lastLine.split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1] || '';
  const escLast = lastWord ? lastWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
  const lineEls = lines.map((line, i) => {
    let inner = escapeXml(line);
    let shadowInner = inner;
    if (escLast && i === n - 1 && line.includes(lastWord)) {
      inner = line.split(new RegExp(`(${escLast})`)).map((p) => (p === lastWord
        ? `<tspan fill="${accent}">${escapeXml(p)}</tspan>`
        : escapeXml(p))).join('');
      // owner directive 2026-11-05: the accent word is CRISP — the blurred
      // shadow layer skips it (spaces keep the shadow words in place). Safe
      // because the accent is the line's LAST word (nothing follows it).
      shadowInner = escapeXml(line.replace(new RegExp(`(${escLast})`), ' '.repeat(lastWord.length)));
    }
    const y = 648 - (n - 1 - i) * (size + 16);
    return `<text text-anchor="start" x="72" y="${y}" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="${size}" fill="#000000" opacity="0.65" filter="url(#soft)" transform="translate(0,10)">${shadowInner}</text>
  <text text-anchor="start" x="72" y="${y}" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="${size}" fill="#FFFFFF">${inner}</text>`;
  }).join('\n  ');
  const chipText = String(td.chip || '').trim();
  const chip = chipText ? `<g data-thumb="chip">
    <rect x="72" y="56" width="${72 + chipText.length * 19}" height="52" rx="26" fill="rgba(10,10,10,0.72)" stroke="rgba(255,255,255,0.45)" stroke-width="2"/>
    <circle cx="104" cy="82" r="7" fill="${accent}"/>
    <text x="122" y="93" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="600" font-size="28" letter-spacing="8" fill="#FFFFFF">${escapeXml(chipText.toUpperCase())}</text>
  </g>` : '';
  const brand = String(td.brandmark || '').trim();
  // the diamond sits just LEFT of the letterspaced text (end-anchored at
  // x=1208) — estimated advance ≈ 0.62em glyph + 6px tracking at 30px
  const brandDiamondX = 1208 - Math.round(brand.length * (30 * 0.62 + 6)) - 24;
  const brandmark = brand ? `<g data-thumb="brandmark">
    <rect x="${brandDiamondX}" y="646" width="14" height="14" fill="${accent}" transform="rotate(45 ${brandDiamondX + 7} 653)"/>
    <text x="1208" y="668" text-anchor="end" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="600" font-size="30" letter-spacing="6" fill="#FFFFFF" fill-opacity="0.92">${escapeXml(brand.toUpperCase())}</text>
  </g>` : '';
  const eyebrowY = 648 - (n - 1) * (size + 16) - size - 34;
  const eyebrowRow = String(eyebrow || '').trim()
    ? `<text x="72" y="${eyebrowY}" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="600" font-size="34" letter-spacing="10" fill="${accent}">${escapeXml(String(eyebrow).toUpperCase())}</text>`
    : ''; // no eyebrow declared — the row is omitted entirely
  // owner directive 2026-11-05: NO full-frame overlay. A black gradient from
  // the LEFT only — dark at the edge for the text, fading to fully clear just
  // past the middle — the right side keeps the photo's original colors and
  // brightness (no tint, no wash).
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs><style>${EMBEDDED_FONTS_CSS}</style>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="12"/></filter>
    <linearGradient id="lg" x1="0" y1="0" x2="0.62" y2="0">
      <stop offset="0" stop-color="rgba(0,0,0,0.9)"/>
      <stop offset="0.55" stop-color="rgba(0,0,0,0.42)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
  </defs>
  <image href="data:image/jpeg;base64,${b64.toString('base64')}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1280" height="720" fill="url(#lg)"/>
  ${eyebrowRow}
  ${chip}
  ${lineEls}
  ${brandmark}
</svg>`;
}

export async function renderYouTubeThumbnail(headline, cleanFrameFile, opts = {}) {
  const accent = opts.accent || '#F5E31C';
  const eyebrow = opts.eyebrow || 'QUOTE QUARRY';
  const b64 = await sharp(cleanFrameFile).resize(1280, 720, { fit: 'cover', position: 'attention' }).jpeg({ quality: 95 }).toBuffer();

  const raw = String(headline || 'DAILY MOTIVATION')
    .replace(/#[\w]+/g, '').replace(/[—|].*$/, '').trim().toUpperCase();
  // R4 (red-flags spec): a template-declared thumb_design switches the frame
  // thumbnail to the left-stack design (chip / brandmark / last-word accent /
  // tinted scrim). Everything below this branch is the DEFAULT path, untouched
  // byte-for-byte (R5 default-inert — the incident-sensitive guard).
  if (opts.thumbDesign && opts.thumbDesign.layout === 'left-stack') {
    const td = opts.thumbDesign;
    const tdLines = wrapTextToLines(raw, 18).slice(0, 3);
    let tdSize = tdLines.some((l) => l.length > 15) ? 96 : 112;
    if (tdLines.length === 1 && tdLines[0].length <= 8) tdSize = 128;
    // eyebrow comes from the TEMPLATE only (absent = no row rendered); the
    // kit/QUOTE QUARRY fallbacks never leak into the left-stack design.
    const tdSvg = leftStackThumbOverlay({ lines: tdLines, size: tdSize, accent: td.accent || accent, eyebrow: td.eyebrow ?? '', b64, td });
    return sharp(Buffer.from(tdSvg), { density: 150 }).resize(1280, 720).jpeg({ quality: 95 }).toBuffer();
  }
  let lines = wrapTextToLines(raw, 13).slice(0, 3);
  let size = lines.some((l) => l.length > 10) ? 128 : 150;
  if (lines.length === 1 && lines[0].length <= 8) size = 180;
  const accentWord = lines.join(' ').split(/\s+/).filter((w) => w.length > 3).sort((a, b) => b.length - a.length)[0] || null;

  const esc = accentWord ? accentWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
  const lineEls = lines.map((line, i) => {
    let inner = escapeXml(line);
    if (esc && line.includes(accentWord)) {
      inner = line.split(new RegExp(`(${esc})`)).map((p) => (p === accentWord
        ? `<tspan fill="${accent}">${escapeXml(p)}</tspan>`
        : escapeXml(p))).join('');
    }
    const y = 330 + i * (size + 18);
    return `<text text-anchor="middle" x="640" y="${y}" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="${size}" fill="#000000" opacity="0.65" filter="url(#soft)" transform="translate(0,10)">${inner}</text>
  <text text-anchor="middle" x="640" y="${y}" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="${size}" fill="#FFFFFF">${inner}</text>`;
  }).join('\n  ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs><style>${EMBEDDED_FONTS_CSS}</style>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="12"/></filter>
    <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(0,0,0,0.42)"/><stop offset="0.55" stop-color="rgba(0,0,0,0.62)"/><stop offset="1" stop-color="rgba(0,0,0,0.85)"/>
    </linearGradient>
  </defs>
  <image href="data:image/jpeg;base64,${b64.toString('base64')}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1280" height="720" fill="url(#vg)"/>
  <text text-anchor="middle" x="640" y="120" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="600" font-size="34" letter-spacing="10" fill="${accent}">${escapeXml(eyebrow)}</text>
  <rect x="560" y="150" width="160" height="7" rx="3.5" fill="${accent}"/>
  ${lineEls}
</svg>`;
  return sharp(Buffer.from(svg), { density: 150 }).resize(1280, 720).jpeg({ quality: 92 }).toBuffer();
}

// ---------------------------------------------------------------------------
// Main renderer — returns { buffer, meta } for the YouTube Short
// ---------------------------------------------------------------------------
// Emergency-script line templates — varied copy per theme (see #12/#91: the
// fallback is kit-driven and must never throw; it is the last line of defense
// when every LLM provider fails)
const FALLBACK_LINE_TEMPLATES = [
  (t) => `Most people treat "${t}" as an idea. Winners treat it as a daily practice — small, deliberate, repeatable.`,
  (t) => `Nobody is coming to hand you "${t}". You build it in silence, one decision at a time.`,
  (t) => `Protect your "${t}" like an asset. The moment you guard it, everything downstream gets easier.`,
  (t) => `"${t}" looks boring on day one. On day one hundred it looks like a superpower.`,
  (t) => `Cut one thing that drains your "${t}" today. Subtraction is the fastest form of progress.`,
];

function fallbackScriptFor(brand) {
  const niche = String(brand?.niche || 'timeless wisdom and self-mastery');
  const themes = (brand?.tags || []).slice(0, 5);
  for (const t of niche.split(/[,&]/).map((x) => x.trim()).filter((x) => x.length > 3)) {
    if (themes.length >= 5) break;
    if (!themes.includes(t)) themes.push(t);
  }
  const spare = ['discipline', 'focus', 'patience', 'purpose', 'consistency'];
  while (themes.length < 5) themes.push(spare[themes.length]);
  return {
    hook: `5 principles of ${niche.split(/[,&]/)[0].trim().toLowerCase()} that separate you from 99% of people.`,
    points: themes.map((t, i) => ({ title: String(t).toUpperCase().slice(0, 36), line: FALLBACK_LINE_TEMPLATES[i % FALLBACK_LINE_TEMPLATES.length](t) })),
    closing: 'Which one do you live by? Comment the number.',
    thumbHeadline: '5 PRINCIPLES THAT SEPARATE YOU FROM 99%',
  };
}

// ---------------------------------------------------------------------------
// #104 Task 6 — the script brain routes through the capability registry
// (lib/ai-adapter.mjs). The hand-coded provider chains (doc: gemini → groq →
// cloudflare; shorts: gemini → groq → cerebras → mistral → hf) are GONE per
// AC-P2-10: provider ORDER and FALLBACK now belong to routeAndCall('script-gen')
// — channel routes → workspace default → catalog baseline. What stays
// caller-owned is the JSON CONTRACT (prompt + shape validation — only the
// brain knows what a usable script looks like) and the escalation-retry walk
// (the retired per-provider "reply with raw JSON ONLY" retries, now
// chain-wide). Two seams preserve the retired chains' semantics across the
// swap:
//   - scriptGenRouting(): hf is FILTERED at the selection seam (dead paid
//     lane — zero free credits, Task 1 review carry-forward) and openai is
//     only ever reachable via an EXPLICIT route (a paid lane must never enter
//     the zero-config baseline);
//   - scriptShapeGate(): a provider reply that parses but fails the brain's
//     shape check is surfaced to the adapter as unusable content, so
//     fail-continue still walks to the next provider (the retired chains'
//     bad-shape fall-through).
// ---------------------------------------------------------------------------

// Shared loose parse (deepdive's old parseLoose): tolerates code fences and
// prose around the JSON object. Throws when no JSON object is present.
export function parseScriptJson(content) {
  const t = String(content || '').replace(/```json|```/g, '').trim();
  return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
}

// Dead paid lane — never routed, never a fallback candidate (research
// 2026-10-28: HF free tier ships zero monthly credits; Llama-3.1-8B was the
// known long-JSON truncator).
export const SCRIPT_GEN_DEAD_LANES = ['hf'];
// Paid lanes excluded from the IMPLICIT baseline only: with zero routes
// configured the brain stays on today's free behavior; an explicit route
// (user story 10's slot-0 UI action) reaches openai's adapter-pinned chat lane.
export const SCRIPT_GEN_BASELINE_PAID = ['openai'];

export function filterScriptGenRoutes(routes) {
  return (Array.isArray(routes) ? routes : []).filter((r) => r && !SCRIPT_GEN_DEAD_LANES.includes(r.providerId));
}

export function baselineScriptGenRoutes() {
  return capabilityProviders('script-gen')
    .filter((id) => !SCRIPT_GEN_DEAD_LANES.includes(id) && !SCRIPT_GEN_BASELINE_PAID.includes(id))
    .map((providerId, i) => ({ providerId, priority: i + 1, source: 'baseline' }));
}

// Routing wrapper passed to routeAndCall as injected.routing: delegates to the
// real Task-3 routing (lazy — importing this module never touches the DB),
// filters the dead lanes, and substitutes the FILTERED baseline whenever
// routing is unavailable or empty (otherwise routeAndCall would build its own
// UNfiltered baseline). Non-script-gen capabilities delegate verbatim and
// return [] on failure — routeAndCall's own baseline is correct for those.
export function scriptGenRouting(realRouting = null) {
  return {
    async resolveCapability(capability, channelId) {
      if (capability !== 'script-gen') {
        if (!realRouting) return [];
        try { return await realRouting.resolveCapability(capability, channelId); } catch { return []; }
      }
      let routes = [];
      try {
        if (!realRouting) {
          const { getProviderRouting } = await import('./studio/lib/provider-routing.js');
          realRouting = await getProviderRouting();
        }
        routes = await realRouting.resolveCapability(capability, channelId);
      } catch (e) {
        console.log(`[script-brain] routing unavailable — filtered baseline (${String(e?.message || e).slice(0, 80)})`);
        routes = [];
      }
      const filtered = filterScriptGenRoutes(routes);
      return filtered.length > 0 ? filtered : baselineScriptGenRoutes();
    },
  };
}

// Mirror of the adapter's content extraction (callGemini reads
// candidates[0].content.parts[0].text; the one OpenAI-compatible client reads
// choices[0].message.content) so the gate inspects exactly what the adapter
// will return. Returns null for non-JSON bodies — those pass through and the
// adapter classifies parse_error itself.
export function extractScriptText(url, text) {
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (String(url).includes('generativelanguage.googleapis.com')) {
    return j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  return j?.choices?.[0]?.message?.content || '';
}

// Fetch wrapper: a usable reply passes through byte-identical; a reply whose
// content fails the brain's shape check is rebuilt with an EMPTY body at the
// same status, which the adapter reads as parse_error and fail-continues to
// the next provider (no doomed retries, no lost fallback).
export function scriptShapeGate(fetchImpl, isUsableContent) {
  const rebuild = (text, res) => {
    try {
      return new Response(text, { status: res.status || 200, statusText: res.statusText || '', headers: res.headers || undefined });
    } catch { return res; }
  };
  const usable = (content) => {
    try { return isUsableContent(content); } catch { return false; } // a throwing validator = unusable
  };
  return async (url, init) => {
    const res = await fetchImpl(url, init);
    if (!res || !res.ok) return res;
    const text = await res.text();
    const extracted = extractScriptText(url, text);
    if (extracted === null || usable(extracted)) return rebuild(text, res);
    return rebuild('', res);
  };
}

// ---------------------------------------------------------------------------
// #105 Task 7 — the generators ask the brain (Phase 3 RAG wiring).
//
// Zero-config = committed behavior: with BRAIN_ENABLED unset nothing below
// fetches, prompts stay byte-identical, and the walk/terminal contracts are
// untouched (pinned by tests/brain-wiring.test.mjs).
//
// Enabled + sidecar FULLY ready (one cached /health probe per process; arming
// requires status ok + model_loaded + pgvector_reachable — a 200 alone would
// arm a half-ready sidecar):
//   - /context is fetched BEFORE prompt assembly and the retrieved
//     exemplars+performance are appended as the labeled "YOUR PAST VIDEOS"
//     section; the retrieved ids are logged machine-parseably
//     (`[brain-context] ... ids=`) so the E2E task can prove provenance.
//   - /dedupe gates the walk between shape validation and return, with the
//     D6 TIERING MATRIX (gatedReview = the template's registry meta
//     review_required is non-empty — ANY review class: finance/medical/
//     health/all; P5-T2b, D3/AC-P5-6):
//       brain UP   + BLOCK + gated     -> BLOCK consumes the walk (retry with
//                                         vary-guidance); exhausted -> lane terminal
//       brain UP   + BLOCK + un-gated  -> downgraded to a recorded WARN;
//                                         proceed (fewer videos is never the
//                                         failure mode; a flagged script is)
//       brain DOWN + gated             -> FAIL-CLOSED: walk consumed, lane
//                                         terminal (never publish un-gated)
//       brain DOWN + un-gated          -> fail-open (legacy behavior + one warning)
//       WARN / PASS                    -> proceed always
//     Exhausted walks land on the lane's existing terminal unchanged.
//     Verdicts are recorded machine-parseably (`[brain-dedupe] ... verdict=`).
//
// Disabled = silent; enabled-but-down = exactly one warning, then the matrix.
// The sidecar lives on localhost inside the CI job (port via BRAIN_PORT,
// default 8000).
// ---------------------------------------------------------------------------

export const BRAIN_ENABLED_ENV = 'BRAIN_ENABLED';
const BRAIN_TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const BRAIN_HEALTH_TIMEOUT_MS = 2000;  // one fast probe, fail fast
const BRAIN_CALL_TIMEOUT_MS = 10000;   // context/dedupe round-trips
const BRAIN_CONTEXT_K = 3;             // exemplars injected per prompt
const BRAIN_DEFAULT_VARIATION_THRESHOLD = 0.85;      // D8 default
const BRAIN_DEFAULT_CROSS_CHANNEL_THRESHOLD = 0.90;  // D8 default (variation + 0.05)

export function brainBaseUrl(env = process.env) {
  const port = String(env.BRAIN_PORT ?? '').replace(/[^0-9]/g, '');
  return `http://127.0.0.1:${port || '8000'}`;
}

// Per-process health cache: one /health probe per flag value (the flag value
// keys the cache so tests can flip the env without a reset seam —
// resetBrainHealth() exists for explicit isolation anyway).
let brainHealthCache = null;
export function resetBrainHealth() { brainHealthCache = null; }

/**
 * 'off' (flag unset — silent, zero calls) | 'down' (enabled but the sidecar
 * is unreachable or not fully ready — one warning per process) | 'up'.
 */
export async function brainState(injected = null) {
  const flag = String(process.env[BRAIN_ENABLED_ENV] || '').trim().toLowerCase();
  if (!BRAIN_TRUTHY.has(flag)) return 'off';
  if (brainHealthCache && brainHealthCache.flag === flag) return brainHealthCache.up ? 'up' : 'down';
  let up = false;
  try {
    const res = await (injected?.brainFetch || fetch)(
      `${brainBaseUrl()}/health`, { signal: AbortSignal.timeout(BRAIN_HEALTH_TIMEOUT_MS) });
    const body = res && res.ok ? await res.json().catch(() => null) : null;
    up = Boolean(body && body.status === 'ok'
      && body.model_loaded === true && body.pgvector_reachable === true);
  } catch { up = false; }
  brainHealthCache = { flag, up };
  if (!up) console.log('[brain] enabled but sidecar not ready (unreachable / model unloaded / pg down) — D6 matrix applies');
  return up ? 'up' : 'down';
}

export async function brainReachable(injected = null) {
  return (await brainState(injected)) === 'up';
}

/**
 * /context before prompt assembly. Returns the retrieved exemplars
 * [{id, score, performance, excerpt}] when the brain was consulted (possibly
 * []), or null when disabled/unreachable/failed (fail-open). Logs the
 * machine-parseable provenance line for every consultation.
 */
export async function fetchBrainContext({ channel, kind, topic, k = BRAIN_CONTEXT_K, jobId = null, injected = null }) {
  if (!channel || !kind || !topic) return null;
  if ((await brainState(injected)) !== 'up') return null;
  try {
    const res = await (injected?.brainFetch || fetch)(`${brainBaseUrl()}/context`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel, kind, topic, k }),
      signal: AbortSignal.timeout(BRAIN_CALL_TIMEOUT_MS),
    });
    if (!res || !res.ok) throw new Error(`status ${res ? res.status : 'no response'}`);
    const items = await res.json();
    if (!Array.isArray(items)) throw new Error('context: non-array body');
    const ids = items.map((c) => c?.id).filter((x) => x !== null && x !== undefined);
    console.log(`[brain-context] job=${jobId || 'unknown'} channel=${channel} kind=${kind} ids=${ids.join(',')}`);
    return items;
  } catch (e) {
    console.log(`[brain] /context failed (${String(e?.message || e).slice(0, 80)}) — legacy prompt (fail-open, D6)`);
    return null;
  }
}

/** The labeled prompt section the retrieved exemplars ride in. */
export function brainContextSection(items) {
  const rows = (Array.isArray(items) ? items : []).map((c, i) => {
    const perf = c?.performance && typeof c.performance === 'object' && !Array.isArray(c.performance)
      ? Object.entries(c.performance).map(([k, v]) => `${k}=${v}`).join(' ')
      : '';
    const excerpt = String(c?.excerpt || '').replace(/\s+/g, ' ').trim();
    return `${i + 1}. [id=${c?.id ?? 'unknown'}${perf ? ` | ${perf}` : ''}] ${excerpt}`;
  });
  return `\nYOUR PAST VIDEOS — learn from these; vary from them (never repeat their hooks, examples, or angle):\n${rows.join('\n')}`;
}

/**
 * Internal gate probe. Returns { state: 'disabled' | 'down' | 'ok', verdict? }:
 *   'disabled' — feature flag off (zero-config, SILENT; never a D6 event)
 *   'down'     — enabled but the sidecar is unreachable/not ready, or the
 *                /dedupe call failed (warning already logged)
 *   'ok'       — verdict response in `verdict`
 */
async function dedupeCheck({ channel, kind, templateId = null, threshold = null, crossThreshold = null, jobId = null, chunks = [], injected = null }) {
  if (!channel || !kind || !Array.isArray(chunks) || chunks.length === 0) return { state: 'disabled' };
  const state = await brainState(injected);
  if (state !== 'up') return { state: state === 'off' ? 'disabled' : 'down' };
  try {
    const body = { channel, kind, chunks };
    if (templateId) body.template_id = templateId;
    if (threshold !== null && threshold !== undefined) body.threshold = threshold;
    if (crossThreshold !== null && crossThreshold !== undefined) body.cross_channel_threshold = crossThreshold;
    if (jobId) body.job_id = jobId;
    const res = await (injected?.brainFetch || fetch)(`${brainBaseUrl()}/dedupe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(BRAIN_CALL_TIMEOUT_MS),
    });
    if (!res || !res.ok) throw new Error(`status ${res ? res.status : 'no response'}`);
    const out = await res.json();
    if (!out || typeof out.verdict !== 'string') throw new Error('dedupe: bad verdict shape');
    return { state: 'ok', verdict: out };
  } catch (e) {
    console.log(`[brain] /dedupe failed (${String(e?.message || e).slice(0, 80)}) — variation gate unavailable (D6 matrix applies)`);
    return { state: 'down' };
  }
}

/**
 * /dedupe as the checkDup hook. Returns the verdict response
 * {verdict, score, top_match_id, neighbors} when the brain was consulted, or
 * null when disabled/unreachable/failed (gate skipped — callers apply the D6
 * matrix themselves; callScriptBrain does).
 */
export async function checkDup(options) {
  const gate = await dedupeCheck(options || {});
  return gate.state === 'ok' ? gate.verdict : null;
}

/**
 * D8 — thresholds and the review-gating signals are registry DATA.
 * finance-explainers carries explicit values in template-registry.data.js;
 * every other template (and the template-less lanes) inherits the documented
 * defaults — variation 0.85, cross-channel 0.90. `financeGated` mirrors the
 * template's safety.review_required containing 'finance' (the D6 tiering
 * input as originally shipped); `gatedReview` mirrors ANY non-empty
 * review_required — the P5-T2b tiering key (D3/AC-P5-6): a dedupe BLOCK on
 * any review-gated class fails closed instead of downgrading to WARN.
 * Never a hardcoded per-channel map.
 *
 * KIND-SAFE IDENTITY (Phase 5 T1, D1/D19): `templateId` is the registry KEY —
 * the one string of the four-homes invariant (assignment id == registry key ==
 * brain-gate id == review-gate meta id). REGISTRY_META is keyed by that exact
 * string, so the resolution below reads the ASSIGNED template's own block and
 * never falls back to its visual family's historical association (there is
 * deliberately NO family fallback here: for legacy rows the assignment string
 * already IS the family id, and re-deriving a family's meta for a v2 template
 * would gate on the wrong block).
 */
export function registryThresholds(templateId) {
  const meta = templateId ? REGISTRY_META[templateId] : null;
  const reviewRequired = Array.isArray(meta?.safety?.review_required)
    ? meta.safety.review_required : [];
  return {
    variation: typeof meta?.variation_threshold === 'number'
      ? meta.variation_threshold : BRAIN_DEFAULT_VARIATION_THRESHOLD,
    crossChannel: typeof meta?.cross_channel_threshold === 'number'
      ? meta.cross_channel_threshold : BRAIN_DEFAULT_CROSS_CHANNEL_THRESHOLD,
    reviewRequired,
    financeGated: reviewRequired.includes('finance'),
    // P5-T2b (D3/AC-P5-6): the fail-closed tiering arms on ANY non-empty
    // review_required — keying on finance alone downgraded a medical BLOCK
    // to WARN-and-ship (the adversarial C2 gap).
    gatedReview: reviewRequired.length > 0,
  };
}

/**
 * D8 threading: the channel's ACTIVE template assignment (slug -> template id
 * -> registry meta). Fail-open null on any failure — template-less lanes get
 * the documented default thresholds and are NOT finance-gated. Lazy: no DB
 * import/network until called.
 *
 * KIND-SAFE IDENTITY (Phase 5 T1, D1/D19): the returned string is the
 * assignment row's id — the registry KEY (template_id). For pre-Phase-5 rows
 * that string equals the family id (template_id == family_id for the legacy
 * 7, zero migration); for schema v2 rows it is the template's own id. Whatever
 * comes back feeds registryThresholds/REGISTRY_META[...] unchanged — every
 * consumer reads the SAME string the assignment stores.
 */
export async function resolveTemplateId(channelId) {
  if (!channelId) return null;
  try {
    const { getRegistryDb } = await import('./studio/lib/template-registry-db.js');
    const db = await getRegistryDb();
    const row = await db.getActiveAssignment(channelId);
    return row?.family_id || null;
  } catch (e) {
    console.log(`[brain] template lookup unavailable (${String(e?.message || e).slice(0, 80)}) — template-less thresholds (D8 defaults)`);
    return null;
  }
}

// Adapter error classes worth an escalation walk: the provider RESPONDED but
// the payload was unusable, so the raw-JSON-only suffix can help. HTTP/network
// failures never re-walk (outage economics preserved: one walk, fail fast).
const SHAPE_RETRY_CLASSES = new Set(['parse_error', 'empty_response']);

/**
 * One script-brain request over the capability registry. Walks routeAndCall
 * up to maxAttempts times (attempt n>1 appends `suffix` to the prompt chain-
 * wide — the retired per-provider escalation retries). The shape gate keeps
 * bad-shape replies flowing to later providers WITHIN a walk. Never throws.
 * @param {object} o { slug, jobId, prompt, isValidJson(parsed)=>bool,
 *   maxAttempts, suffix, injected,
 *   dedupe?: { channel, kind, templateId?, threshold?, crossThreshold?,
 *              financeGated?, toChunks(parsed) } —
 *   the #105 checkDup hook, gated through POST /dedupe between shape
 *   validation and return, with the D6 tiering matrix (see the block
 *   comment at the top of the brain section). Since P5-T2b (D3/AC-P5-6) the
 *   tiering key is gatedReview — ANY non-empty review_required, derived from
 *   the descriptor's templateId through registryThresholds (the one identity
 *   string, D19); the financeGated descriptor flag composes (finance
 *   templates are a subset of gated) but no longer arms the tiering alone:
 *   BLOCK+gated consumes the walk (retry with vary-guidance naming the top
 *   match); BLOCK+un-gated downgrades to a recorded WARN and proceeds;
 *   gate-down+gated fails closed (walk consumed, lane terminal on
 *   exhaustion); gate-down+un-gated and disabled proceed fail-open;
 *   WARN/PASS proceed always.
 * }
 * @returns {Promise<{ ok: true, parsed: object, provider: string, model: string|null, attempts: object[], walk: number }
 *                   |{ ok: false, attempts: object[], error: string }>}
 */
export async function callScriptBrain({ slug = null, jobId = null, prompt, isValidJson, maxAttempts = 1, suffix = '', injected = null, dedupe = null }) {
  const isUsableContent = (content) => {
    try { return isValidJson(parseScriptJson(content)); } catch { return false; }
  };
  const injectedAdapter = {
    routing: scriptGenRouting(injected?.realRouting || null),
    keys: injected?.keys,
    writer: injected?.writer,
    fetch: scriptShapeGate(injected?.fetch || fetch, isUsableContent),
    env: injected?.env,
  };
  let last = null;
  let varyFrom = null; // top match of the last BLOCK — names the vary guidance on later walks
  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
    const varyGuidance = attempt > 1 && varyFrom !== null
      ? `\nYour previous video ('${varyFrom}') covered this — vary the hook and examples.`
      : '';
    const res = await routeAndCall('script-gen', {
      slug: slug || undefined,
      jobId: jobId || undefined,
      prompt: attempt > 1 ? prompt + suffix + varyGuidance : prompt,
      injected: injectedAdapter,
    });
    last = res;
    if (res.ok) {
      let parsed = null;
      try { parsed = parseScriptJson(res.content); } catch { parsed = null; }
      if (parsed && isValidJson(parsed)) {
        if (dedupe) {
          // P5-T2b (D3/AC-P5-6): the fail-closed tiering arms on ANY non-empty
          // review_required — derived from the descriptor's own templateId
          // through the registry (the one identity string, D19), so both the
          // shorts threading and the doc lane's T2e financeGated derivation
          // compose unchanged. Class-less templates keep the exact WARN
          // downgrade.
          const gatedReview = registryThresholds(dedupe.templateId ?? null).gatedReview;
          const gate = await dedupeCheck({
            channel: dedupe.channel,
            kind: dedupe.kind,
            templateId: dedupe.templateId ?? null,
            threshold: dedupe.threshold ?? null,
            crossThreshold: dedupe.crossThreshold ?? null,
            jobId,
            chunks: dedupe.toChunks ? dedupe.toChunks(parsed) : [],
            injected,
          });
          // D6 tier 1: brain unreachable + review-gated template -> FAIL-CLOSED
          // (never publish un-gated). The walk is consumed; exhausted walks
          // land on the lane's existing terminal.
          if (gate.state === 'down' && gatedReview) {
            console.log(`[brain-dedupe] job=${jobId || 'unknown'} channel=${dedupe.channel} kind=${dedupe.kind} verdict=BLOCK score=0 top_match=null reason=gate-unreachable+review-gated (D6 tier 1 fail-closed) — walk consumed`);
            continue;
          }
          if (gate.state === 'ok') {
            const v = gate.verdict;
            // Guidance source for any later walk — set for WARN too (the
            // writer should know which video the script risks converging with).
            if (v.top_match_id !== null && v.top_match_id !== undefined) varyFrom = v.top_match_id;
            const downgraded = v.verdict === 'BLOCK' && !gatedReview;
            console.log(`[brain-dedupe] job=${jobId || 'unknown'} channel=${dedupe.channel} kind=${dedupe.kind} verdict=${downgraded ? 'WARN' : v.verdict} score=${v.score} top_match=${v.top_match_id}${downgraded ? ' (BLOCK downgraded: un-gated lane, D6 tier 4)' : ''}`);
            // D6 tier 3: brain UP + BLOCK + review-gated -> fail the walk
            // (retry with vary-guidance); exhausted walks -> lane terminal.
            if (v.verdict === 'BLOCK' && gatedReview) continue;
            // D6 tiers 2/4/5: gate-down+un-gated, BLOCK-downgraded, WARN
            // and PASS all proceed with the script.
          }
        }
        return { ok: true, parsed, provider: res.usage?.provider || 'unknown', model: res.usage?.model || null, attempts: res.attempts, walk: attempt };
      }
    }
    if (!(res.attempts || []).some((a) => SHAPE_RETRY_CLASSES.has(a.error_class))) break;
  }
  return { ok: false, attempts: last?.attempts || [], error: last?.error || 'script_brain_exhausted' };
}

// The shorts JSON contract — identical check across every retired provider arm.
const validShortsScript = (p) => p?.hook && Array.isArray(p.points) && p.points.length >= 4;

// ---------------------------------------------------------------------------
// Phase 5 T2a (spec D2) — story_structure prompt threading. A template's
// story_structure authors POINT-SLOT CONSTRAINTS over the immutable shorts
// skeleton (hook + 4-5 numbered points + closing — validShortsScript above
// never changes); it never redefines the JSON shape. Every helper below
// returns '' / null for a template without the field, so the kit path stays
// byte-identical (AC-P5-3).
// ---------------------------------------------------------------------------

// The resolved template's story_structure block, or null (template-less lanes
// and the legacy 7 have none). Reads the registry data by the ONE identity
// string — the same template_id the assignment/brain/review gates use (D19).
function templateStoryStructure(templateId) {
  const meta = templateId ? REGISTRY_META[templateId] : null;
  return (meta && typeof meta === 'object' && meta.story_structure) || null;
}

// The template's hook_classes[] APPEND one constraints line to the kit's hook
// rule (D2) — the kit line itself always survives.
function hookClassesLine(story) {
  const classes = (Array.isArray(story?.hook_classes) ? story.hook_classes : [])
    .map((c) => String(c || '').trim()).filter(Boolean);
  return classes.length
    ? `\nHOOK CLASSES (template constraint — the hook must be one of these types): ${classes.join(' | ')}.`
    : '';
}

// The template's title_patterns[] REPLACE the kit's title line when declared
// (Phase 5 T2a); when the template omits them the kit line survives untouched.
function titlePatternsLine(story) {
  const patterns = (Array.isArray(story?.title_patterns) ? story.title_patterns : [])
    .map((p) => String(p || '').trim()).filter(Boolean);
  return patterns.length
    ? `\nthumb_headline MUST follow one of this template's title patterns: ${patterns.join(' | ')}. Max 8 words.`
    : '';
}

// GUARD CHOICE (Phase 5 T2a — the T1 reviewer's watch-item): CONSTRAIN, never
// refuse. When the template's beats exceed the kit's declared point count, the
// beats are mapped INTO the kit count — the FINAL slot absorbs the overflow
// (merged "Then:" clauses) — and the prompt itself carries the absorption
// note, so nothing is truncated silently and an authoring slip never kills a
// live channel's production day. The kit owns the point count because its
// pacingRule (kit-owned, unchanged per D2) commands "Exactly N points" — a
// self-contradicting prompt is the worse failure, and refusal would turn an
// authoring mistake into a dead run. The sync-time validator stays the first
// line of defense; this guard covers the brand-blind gap it cannot check. The
// mapping is also logged, machine-parseably. All-whitespace beats are the same
// as no beats ('' return — the caller keeps the kit line), and a kit-less plan
// below SKELETON_FLOOR pads with explicit free slots (validShortsScript's
// >=4-points gate would otherwise shape-reject every reply). Every constraint
// line ends with exactly one final period — the slot lines' style.
const SKELETON_FLOOR = 4;
function storyStructureLine(story, SC) {
  const beats = (Array.isArray(story.beats) ? story.beats : [])
    .map((b) => String(b || '').trim()).filter(Boolean);
  if (!beats.length) return '';
  const kitPoints = typeof SC?.points === 'number' ? SC.points : null;
  let slots = beats;
  let absorbNote = '';
  if (kitPoints && beats.length > kitPoints) {
    slots = [...beats.slice(0, kitPoints - 1), beats.slice(kitPoints - 1).join(' Then: ')];
    absorbNote = ` (absorbs the template's beats ${kitPoints + 1}-${beats.length} — the kit's ${kitPoints}-point skeleton is immutable)`;
    console.log(`[story-structure] template beats=${beats.length} exceed the kit's ${kitPoints}-point skeleton — mapped INTO the kit count (slot ${kitPoints} absorbs beats ${kitPoints + 1}-${beats.length}); constrain-not-refuse (Phase 5 T2a)`);
  } else if (!kitPoints && beats.length < SKELETON_FLOOR) {
    slots = [...slots, ...Array.from({ length: SKELETON_FLOOR - beats.length }, () =>
      `free point (unconstrained by the template — the shorts skeleton floors at ${SKELETON_FLOOR} points)`)];
    console.log(`[story-structure] template beats=${beats.length} below the shorts skeleton floor (${SKELETON_FLOOR}) — ${SKELETON_FLOOR - beats.length} free slot(s) added (kit-less lane, Phase 5 T2a)`);
  }
  const lineWords = story.line_words ?? SC?.lineWords ?? null;
  const head = `Structure: hook (≤10 words), numbered points as POINT-SLOT constraints${lineWords ? ` (each line ${lineWords} words)` : ''}, closing (≤10 words).${SC?.targetSeconds ? ` Target: ~${SC.targetSeconds} seconds spoken.` : ''}`;
  const slotLines = slots
    .map((b, i) => `• Point ${i + 1} MUST BE: ${b}${i === slots.length - 1 ? absorbNote : ''}.`)
    .join('\n');
  const payoff = story.payoff_rule
    ? `• Closing MUST: ${String(story.payoff_rule).trim().replace(/\.?$/, '.')}`
    : '';
  return payoff ? `${head}\n${slotLines}\n${payoff}` : `${head}\n${slotLines}`;
}

export async function generateYouTubeScript(page, forcedTheme = null, opts = {}) {
  const brand = resolveBrand(page);
  const fallback = fallbackScriptFor(brand);
  // The retired `if (!geminiKey()) return fallback` gate died with the chain
  // config: eligibility is whatever the registry resolves. With nothing
  // configured the walk below still lands on the template fallback — the
  // zero-config terminal behavior is unchanged (source 'fallback').
  // 09-30: static theme lists are gone. The caller passes a research-derived
  // topic directive; without one, the model chooses from the live trend
  // signals (or the niche itself as last resort).
  const themeLine = forcedTheme
    ? `Topic for this script (MUST be about exactly this): ${forcedTheme}`
    : page.trend
      ? `Choose the single most compelling topic for today's video yourself, derived from the viral signals below. Do NOT copy any existing title.`
      : `Choose the single most compelling, most searched topic in the niche for today's video.`;
  const subNichesStr = Array.isArray(brand.niches) && brand.niches.length ? brand.niches.join(', ') : (brand.niche || 'self improvement');
  const styleLine = `You write viral, high-retention YouTube Shorts scripts for "${page.name || brand.label}" (Niche: ${brand.niche}).
Target content pillars: ${subNichesStr}.
Write in EASY, CLEAR, punchy English with high curiosity and immediate practical payoff. The points must deliver concrete insider-level insights that feel like real knowledge, not generic surface-level fluff.`;
  const trendBlock = page.trend ? `\nGOING VIRAL RIGHT NOW in this exact niche (ride this wave — align your angle and wording with what is working): ${page.trend.videos.slice(0, 5).map(v => `"${v.title}"`).join(' | ')}\nHot search keywords to weave in naturally: ${page.trend.hotKeywords.join(', ')}.` : '';
  // RETENTION ENGINE (09-19: IC/MR/DFD sat at 35-54% avg-watched and the Shorts
  // feed buried them; QQ's 86% proves the format works when viewers stay)
  const SC = brand.script || null;
  // Phase 5 T2a (spec D2) — story_structure threading. The assigned template's
  // story_structure REPLACES the kit's structureLine with its beat plan as
  // point-slot constraints (the template's OWN point count + line words over
  // the IMMUTABLE shorts skeleton — the JSON-contract line below is untouched);
  // its hook_classes[] APPEND one constraints line to the kit's hook rule; its
  // title_patterns[] REPLACE the kit's title line. Wherever the template omits
  // a field — or no template is assigned — every line is today's kit text,
  // byte-identical (AC-P5-3).
  const story = templateStoryStructure(opts.templateId || null);
  const hookRule = (SC ? `\nHOOK RULES (the first 2 seconds decide the swipe — obey ALL):
• Open with a question, a shocking number, or a stake that involves "you". NEVER a definition, a greeting, a setup, or a list announcement ("here are N things..." is BANNED).
• The hook must open a loop that only closes at the end.` : '') + hookClassesLine(story);
  const pacingRule = SC ? `\nPACING RULES (viewers swipe away at the first weak line):
• Exactly ${SC.points} points. Each point line: ${SC.lineWords} words. One concrete idea per line, opened with the payoff itself — zero filler, zero transitions, no repeating an earlier point.
• Closing: a punchline, challenge, or mic-drop line (≤10 words) that makes the viewer rewatch or comment. NEVER a summary and never "follow for more".` : '';
  const titleRule = titlePatternsLine(story)
    || (SC ? `\nthumb_headline MUST use this proven ${SC.titleStyle} pattern: ${SC.titleExamples}. Max 8 words.` : '');
  const kitStructureLine = SC
    ? `Structure: hook (≤10 words), ${SC.points} numbered points (each line ${SC.lineWords} words), closing (≤10 words). Target: ~${SC.targetSeconds} seconds spoken.`
    : 'Structure: a curiosity-gap hook, 5 numbered points, a memorable closing line.';
  // An empty beat plan (all-whitespace beats) renders '' and falls back to the
  // kit line here — absent and empty are the same template (Phase 5 T2a).
  const structureLine = (story?.beats?.length && storyStructureLine(story, SC)) || kitStructureLine;
  const prompt = `${styleLine}
Write in EASY, CLEAR, punchy English.
${themeLine}${trendBlock}${hookRule}${pacingRule}${titleRule}
${structureLine}
Return ONLY valid JSON:
{"hook":"<=12 words","thumb_headline":"<=6 word ALL CAPS thumbnail headline","points":[{"title":"2-5 word ALL CAPS title","line":"1-2 short sentences"},{"title":"...","line":"..."},{"title":"...","line":"..."},{"title":"...","line":"..."}],"closing":"<=12 words"}`;
  try {
    const slug = page?.ytSlug || page?.slug || page?.id || null;
    // #105 Task 7 — /context BEFORE prompt assembly. No-op unless the brain is
    // enabled AND reachable (disabled = byte-identical prompt, zero calls).
    const brainJobId = `ytscript:${slug || 'unknown'}:${new Date().toISOString().slice(0, 10)}`;
    const brainTopic = forcedTheme || page?.trend?.videos?.[0]?.title || (brand.niche || 'self improvement');
    const ctx = await fetchBrainContext({
      channel: slug, kind: 'shorts', topic: brainTopic, jobId: brainJobId,
      injected: opts.injected || null,
    });
    const dedupeThresholds = registryThresholds(opts.templateId || null);
    const res = await callScriptBrain({
      slug,
      jobId: brainJobId,
      prompt: ctx && ctx.length ? prompt + brainContextSection(ctx) : prompt,
      isValidJson: validShortsScript,
      // the retired HF second-try escalation, now chain-wide (walk 2 appends
      // the suffix to whichever providers are routed)
      maxAttempts: 2,
      suffix: '\nIMPORTANT: reply with the raw JSON object ONLY, no other text.',
      injected: opts.injected || null, // real path: registry routing + vault keys + usage ledger
      dedupe: {
        channel: slug,
        kind: 'shorts',
        templateId: opts.templateId || null,
        threshold: dedupeThresholds.variation,
        crossThreshold: dedupeThresholds.crossChannel, // registry band transported to the gate (D8)
        financeGated: dedupeThresholds.financeGated,   // D6 tiering input (finance review_required)
        // the whole script as one pooled chunk — the shape the backfilled
        // corpus is embedded with, so similarity compares like-for-like
        toChunks: (p) => [{
          chunk_kind: 'pooled',
          text: [p.hook, ...(Array.isArray(p.points) ? p.points : []).map((pt) => `${pt.title}. ${pt.line}`), p.closing]
            .filter(Boolean).join('\n'),
        }],
      },
    });
    if (res.ok) {
      console.log(`      [YT Script] ${res.provider} script OK${res.walk > 1 ? ` (attempt ${res.walk})` : ''}`);
      return { ...res.parsed, points: res.parsed.points.slice(0, 5), closing: res.parsed.closing || '', thumbHeadline: res.parsed.thumb_headline || `${res.parsed.points.length} RULES`, source: res.provider };
    }
  } catch (e) {
    console.log(`      [YT Script] script brain failed (${String(e?.message || e).slice(0, 80)}) — template fallback`);
  }
  return { ...fallback, source: 'fallback' };
}

async function renderSectionCard(pageId, accent, section, handle, kwShort) {
  const anchor = 'text-anchor="middle" x="540"';
  const els = [];
  if (section.kicker) {
    els.push(`<text ${anchor} y="330" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="600" font-size="38" letter-spacing="6" fill="${accent}">${escapeXml(section.kicker)}</text>`);
  }
  let y = section.kicker ? 560 : 480;
  if (section.num) {
    els.push(`<text ${anchor} y="430" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="200" fill="${accent}">${section.num}</text>`);
    y = 640;
  }
  const bigLines = wrapTextToLines((section.big || '').toUpperCase(), 14).slice(0, 4);
  const bSize = bigLines.some((l) => l.length > 11) ? 76 : 96;
  bigLines.forEach((l, i) => els.push(
    `<text ${anchor} y="${y + i * (bSize + 12)}" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="${bSize}" fill="#FFFFFF" stroke="#000000" stroke-width="8" stroke-linejoin="round" paint-order="stroke">${escapeXml(l)}</text>`));
  y += bigLines.length * (bSize + 12) + (bigLines.length ? 70 : 0);
  if (section.sub) {
    const subLines = wrapTextToLines(section.sub, 30).slice(0, 4);
    subLines.forEach((l, i) => els.push(
      `<text ${anchor} y="${y + i * 64}" font-family="'Oswald', 'Arial Narrow', sans-serif" font-size="46" fill="#E8E8E8">${escapeXml(l)}</text>`));
  }
  els.push(`<text ${anchor} y="1798" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="500" font-size="30" letter-spacing="4" fill="#9A9A9A">${escapeXml(handle || '@quotequarry302')} • DAILY ${escapeXml((kwShort || 'WISDOM').toUpperCase())}</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs><style>${EMBEDDED_FONTS_CSS}</style></defs>
  ${els.join('\n  ')}
</svg>`;
  const file = `${POOL_DIR}/yt-script-card-${Math.random().toString(36).slice(2, 7)}.png`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

// opts.thumbVariants (T5b D18): WHERE the admin-panel config enables picking,
// the caller passes N>1 and the render extracts N staggered frames (candidate
// 1 keeps the exact legacy +3s offset) — out.thumbs carries every variant and
// out.thumb stays candidate 1. Default/absent = 1 = today's byte-identical
// single candidate.
// T5b round 1 (pure, unit-pinned): candidate 1's frame offset is the LEGACY
// +3 seconds — the enabled path must not move the auto-set thumbnail.
export function thumbFrameOffset(v) {
  return v === 0 ? 3 : 2 + v * 1.5;
}

// #106 Phase 5 T2d (D12/D13/D14, AC-P5-12..14) — the candidate SOURCE switch:
// WHERE picking is enabled (thumbVariants > 1, threaded from the template DATA
// by the T5 gate) AND the channel kit assigns a thumb set (kit.thumbTemplates —
// D13's assignment storage: the panel's 2–3 launch-design ids), candidates
// 2..N are REGISTRY renders instead of staggered frames. The selection pool is
// ASSIGNED ∩ ELIGIBLE: an assigned id that is not in the eligible launch set
// (unknown id, or a needsPhoto:true design) drops out of the intersection, and
// an intersection that shrinks to 0 is the 0-eligible cell — production-
// reachable now that the kit key gates the seam. Candidate 1 stays today's
// frame thumbnail (thumbFrameOffset(0) === 3 above — the regression pin).
// Fail-soft by contract: null whenever the registry cannot contribute (kit key
// absent or empty, import failure, unreadable state, 0 eligible) so the caller
// keeps today's staggered frames byte-identically — the count still comes from
// the template data; the SOURCE is the only change (QA Row R6's source-switch
// cell).
// Rotation (AC-P5-13): the last-used design id persists in the channel state
// file (`thumb_last_design`). The mark ADVANCES AT PICK TIME — a design whose
// render later degrades is not re-picked until rotation wraps back around to
// it; a missing/unreadable state degrades to first-eligible, never a block.
async function registryThumbCandidates(brand, page, slots) {
  try {
    const slug = page?.ytSlug || page?.slug || page?.id;
    if (!brand || !slug) return null;
    const assigned = Array.isArray(brand?.thumbTemplates)
      ? brand.thumbTemplates.filter((x) => typeof x === 'string' && x.length > 0)
      : null;
    if (!assigned || !assigned.length) return null; // D13: no assigned thumb set — today's staggered frames, byte-identically
    const reg = await import('./studio/lib/thumb-registry.mjs');
    let lastPickedId = null;
    try { lastPickedId = loadChannelState(slug)?.thumb_last_design ?? null; } catch { }
    const picks = reg.uniqueDesigns(reg.pickCandidates(brand?.niche, slots, { lastPickedId, assignedIds: assigned }));
    if (!picks.length) return null; // 0 eligible (the assigned set shrank to nothing) — the frames cell
    const lastId = picks[picks.length - 1].id;
    if (lastId !== lastPickedId) {
      try {
        const state = loadChannelState(slug) || {};
        state.thumb_last_design = lastId;
        saveChannelState(slug, state);
      } catch { }
    }
    console.log(`      [YT Script] thumb registry candidates: ${picks.map((d) => d.id).join(', ')} (assigned: ${assigned.join(', ')}; last used: ${lastPickedId || 'none'})`);
    return { designs: picks, pickedIds: picks.map((d) => d.id) };
  } catch (e) {
    console.log(`      [YT Script] thumb registry unavailable (non-fatal): ${String(e?.message || e).slice(0, 80)}`);
    return null;
  }
}

// ONE registry design rendered through the EXISTING v2 renderer with the
// channel's brand tokens (D11: accent/bg/label — the same inputs the Studio
// preview route passes; entry-level token pins win, D14). JPEG <= 2 MB (the
// YouTube cap): one lower-quality re-encode, then the candidate is dropped —
// per-variant fail-soft, candidate 1 still ships.
async function renderRegistryThumb(design, brand, script) {
  const [{ renderV2 }, reg] = await Promise.all([
    import('./studio/lib/thumb-templates-v2.js'),
    import('./studio/lib/thumb-registry.mjs'),
  ]);
  const tokens = reg.thumbRenderTokens(design, brand);
  const svg = renderV2(`v2/${design.id}`, {
    title: script.thumbHeadline || script.hook,
    accent: tokens.accent,
    shade: tokens.shade,
    brand: tokens.brand,
    eyebrow: tokens.eyebrow,
  });
  let jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  if (jpeg.length > 2 * 1024 * 1024) jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 78 }).toBuffer();
  if (jpeg.length > 2 * 1024 * 1024) throw new Error(`encoded ${(jpeg.length / 1048576).toFixed(2)} MB exceeds the 2 MB YouTube cap`);
  return jpeg;
}

export async function renderYouTubeScriptShort(page, script, musicOverride = null, opts = {}) {
  const brand = resolveBrand(page);
  if (!brand) throw new Error('no YouTube config for page ' + page?.id);
  console.log(`[YouTube Script Short] ${brand.label} ("${script.thumbHeadline}", ${script.source})...`);
  const clip = (await getTopicClip(page, { headline: script.thumbHeadline, insight_body: script.hook })) || await ensurePoolClip(page.id);

  const sections = [
    { text: script.hook, kicker: 'WATCH TILL THE END', big: script.hook },
    ...script.points.map((p, i) => {
      // strip AI-included numbering ("1." / "Point 2:") — we add our own number,
      // otherwise the narration says the number twice ("1, 1, …")
      const clean = String(p.title || '').replace(/^\s*(?:\d+\s*[.)]|point\s*\d+\s*[.:)]?)\s*/i, '').trim();
      return { text: `${i + 1}. ${clean}. ${p.line}`, num: String(i + 1), big: clean, sub: p.line };
    }),
    { text: script.closing, kicker: 'REMEMBER THIS', big: script.closing }
  ].filter((s) => s.text);

  const scrimSvg = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="rgba(8,8,10,0.45)"/><stop offset="0.45" stop-color="rgba(8,8,10,0.64)"/><stop offset="1" stop-color="rgba(8,8,10,0.84)"/>
  </linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/></svg>`;
  const scrimFile = `${POOL_DIR}/yt-script-scrim-${page.id}.png`;
  await sharp(Buffer.from(scrimSvg)).png().toFile(scrimFile);

  const buildDir = `${POOL_DIR}/yt-script-build`;
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });

  let cum = 0;
  const segFiles = [];
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const narration = narrate(sec.text, `${page.id}-s${i}`, brand.voice);
    const lastW = narration ? narration.words[narration.words.length - 1] : null;
    const dur = lastW
      ? Math.max(3.5, Math.min(20, Math.round((lastW.s + lastW.d + 0.8) * 10) / 10))
      : 4.5;
    const card = await renderSectionCard(page.id, brand.accent, sec, brand.handle, brand.kwShort);
    const segFile = path.resolve(`${buildDir}/seg-${String(i).padStart(2, '0')}.mp4`);
    const chain = `[0:v]crop=ih*9/16:ih,scale=1080:1920,eq=saturation=1.04:contrast=1.06` +
      (i === 0 ? `,fade=t=in:st=0:d=0.4` : ``) + `,fade=t=out:st=${Math.max(0, dur - 0.35).toFixed(1)}:d=0.35[bv];` +
      `[1:v]scale=1080:1920[sc];[bv][sc]overlay=0:0[base];[base][3:v]overlay=0:0[ov]`;
    let filter, inputs;
    if (narration) {
      // relative path only — a Windows drive colon breaks the filtergraph parser
      const assFile = `${buildDir}/cap-${i}.ass`;
      fs.writeFileSync(assFile, buildAssCaptions(narration.words), 'utf8');
      filter = chain + `;[ov]ass=${assFile}:fontsdir=image-tools/fonts[v];[2:a]apad=pad_dur=1,atrim=0:${dur}[a]`;
      inputs = ['-i', narration.file];
    } else {
      filter = chain + `;[ov]null[v];anullsrc=r=44100:cl=stereo,atrim=0:${dur}[a]`;
      inputs = ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
    }
    execFileSync(FF, ['-y', '-stream_loop', '-1', '-ss', String(clip.start), '-i', clip.file, '-i', scrimFile,
      ...inputs, '-i', card, '-filter_complex', filter, '-map', '[v]', '-map', '[a]',
      '-t', String(dur), '-r', '30', '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '160k', '-video_track_timescale', '15360', segFile],
      { stdio: ['ignore', 'ignore', 'pipe'] });
    fs.rmSync(card, { force: true });
    if (narration) fs.rmSync(narration.file, { force: true });
    segFiles.push(segFile);
    cum += dur;
  }

  const total = Math.min(60, Math.round(cum * 10) / 10);
  const musicArgs = musicOverride?.file ? ['-stream_loop', '-1', '-i', musicOverride.file] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
  const musicIdx = segFiles.length;
  const filter = `${segFiles.map((_, i) => `[${i}:v][${i}:a]`).join('')}concat=n=${segFiles.length}:v=1:a=1[vc][ac];` +
    `[vc]format=yuv420p[v];[${musicIdx}:a]volume=0.13,atrim=0:${total},afade=t=out:st=${Math.max(0, total - 1.2).toFixed(1)}:d=1.2[am];` +
    `[ac][am]amix=inputs=2:duration=first:normalize=0[aout]`;
  const outFile = `${POOL_DIR}/yt-script-short-${page.id}.tmp.mp4`;
  execFileSync(FF, ['-y', ...segFiles.map((f) => ['-i', f]).flat(), ...musicArgs,
    '-filter_complex', filter, '-map', '[v]', '-map', '[aout]',
    '-t', String(total), '-r', '30', '-pix_fmt', 'yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outFile],
    { stdio: ['ignore', 'ignore', 'pipe'], timeout: 15 * 60 * 1000 });
  const buf = fs.readFileSync(outFile);
  fs.rmSync(outFile, { force: true });
  fs.rmSync(buildDir, { recursive: true, force: true });

  let thumb = null;
  const thumbs = [];
  let thumbReg = null; // T2d: the picked registry designs (returned for the lane's rotation mark)
  try {
    const variants = Math.max(1, Math.min(6, Number(opts?.thumbVariants) || 1));
    // #106 P5 T2d (D12/AC-P5-12): candidates 2..N come from the thumbnail
    // registry WHEN picking is enabled and the niche resolves designs; candidate
    // 1 stays today's frame thumbnail (the exact legacy +3s offset below — the
    // regression pin). Registry unavailable or 0 eligible = null = today's
    // staggered frames, byte-identical (the COUNT still comes from the template
    // data; the SOURCE is the only change).
    if (variants > 1) {
      try { thumbReg = await registryThumbCandidates(brand, page, variants - 1); } catch (e) { thumbReg = null; }
    }
    const reg = thumbReg;
    const frameVariants = reg ? 1 : variants;
    for (let v = 0; v < frameVariants; v++) {
      const frameFile = `${POOL_DIR}/yt-thumb-frame-${page.id}${v > 0 ? `-v${v}` : ''}.jpg`;
      // candidate 1 keeps the exact legacy offset (+3s); variants stagger later frames
      execFileSync(FF, ['-y', '-v', 'error', '-ss', String(clip.start + thumbFrameOffset(v)), '-i', clip.file, '-frames:v', '1', frameFile]);
      const t = await renderYouTubeThumbnail(script.thumbHeadline || script.hook, frameFile, { accent: brand.accent, eyebrow: brand.eyebrow || `QUOTE QUARRY // ${brand.label}` });
      thumbs.push(t);
      fs.rmSync(frameFile, { force: true });
    }
    if (reg) {
      for (const design of reg.designs) {
        try {
          thumbs.push(await renderRegistryThumb(design, brand, script));
        } catch (e) {
          console.log(`      [YT Script] registry thumb ${design.id} degraded (non-fatal): ${String(e.message).slice(0, 80)}`);
        }
      }
      if (thumbs.length > 1) console.log(`      [YT Script] ${thumbs.length} thumb candidates (1 frame + ${thumbs.length - 1} registry) — candidate 1 ships, swap at Studio > Review`);
    }
    thumb = thumbs[0] || null;
  } catch (e) { console.log(`      [YT Script] Thumbnail skipped (${String(e.message).slice(0, 80)})`); }

  const meta = buildScriptMeta(page, script, musicOverride ? `${musicOverride.title} — ${musicOverride.credit}` : '');
  console.log(`      ✓ Script Short rendered (${Math.round(buf.length / 1024)} KB, ${total}s, ${sections.length} sections)`);
  return { buffer: buf, thumb, thumbs, meta, duration: total, thumbDesigns: thumbReg ? thumbReg.pickedIds : null };
}

export function buildScriptMeta(page, script, musicLabel = '') {
  const brand = resolveBrand(page);
  const authority = brand.authority || `${brand.niche || 'Daily'} Wisdom`;
  const title = `${titleCase(script.thumbHeadline)} | ${authority}`.replace(/\s+/g, ' ').slice(0, 95);
  const visibleTags = (brand.tags?.length ? brand.tags : [brand.niche || 'shorts']).slice(0, 3).map((t) => '#' + String(t).replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, ''));
  const descCore = [
    `${titleCase(script.hook)}.`,
    '',
    ...script.points.map((p, i) => `${i + 1}. ${titleCase(p.title)} — ${p.line}`),
    '',
    String(script.closing || ''),
    `Follow ${brand.followName || brand.label || 'us'} for daily ${brand.kwShort || 'insights'}.`,
    visibleTags.join(' ')
  ].join('\n').slice(0, 480);
  const description = musicLabel ? `${descCore}\n🎵 ${musicLabel}`.slice(0, 4900) : descCore;
  // the ranking tag sets these channels actually use (from competitor-scan)
  const tags = [...(page.trend?.hotKeywords || []), ...(brand.tags || []), 'life lessons'].filter((t, i, a) => a.indexOf(t) === i).slice(0, 12);
  return { title, description, tags, format: 'script', keyword: brand.keyword };
}
