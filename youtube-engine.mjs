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
import sharp from 'sharp';
import { EMBEDDED_FONTS_CSS } from './typography-poster-engine.mjs';
import { ensurePoolClip } from './cinematic-engine.mjs';
import { getTopicClip } from './youtube-clips.mjs';

const FF = process.env.FFMPEG_PATH || (fs.existsSync('ffmpeg-bin/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe')
  ? 'ffmpeg-bin/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe' : 'ffmpeg');
const POOL_DIR = 'pixabay-pool';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || (fs.existsSync('.env') ? (fs.readFileSync('.env', 'utf8').match(/^GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim() : '') || '';
import { BRANDS as YT_BRAND_KITS } from './yt-brands/brands.mjs';

// Resolve the brand for a page. New multi-channel kits (yt-brands/brands.mjs)
// are selected via page.ytSlug; legacy FB-page brands keep working unchanged.
function resolveBrand(page) {
  if (page?.ytSlug) {
    const kit = YT_BRAND_KITS.find((b) => b.slug === page.ytSlug);
    if (kit) {
      const followName = kit.label.split(' ').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
      return { ...kit, followName };
    }
  }
  return YT_BRANDS[page?.id] || Object.values(YT_BRANDS)[0];
}

// ---------------------------------------------------------------------------
// YouTube brand configs — separate identity from the FB/IG BRANDS table.
// ---------------------------------------------------------------------------
const YT_BRANDS = {
  '116157974886564': { label: 'SILENT WEALTH', accent: '#F5E31C', keyword: 'money mindset quotes', kwShort: 'wealth wisdom', theme: 'Wealth', niches: ['wealth building', 'financial freedom', 'millionaire mindset'], authority: 'Money Psychology', voice: 'bm_george', tags: ['money mindset', 'wealth psychology', 'success mindset', 'self improvement', 'psychology', 'stoicism'] },
  '108044922375174': { label: 'STRATEGIC SILENCE', accent: '#4D8DFF', keyword: 'stoic quotes', kwShort: 'stoic wisdom', theme: 'Power', niches: ['dark psychology', 'self mastery', 'power moves'], authority: 'Stoicism Philosophy', voice: 'am_michael', tags: ['stoicism', 'dark psychology', 'machiavelli', 'psychology', 'stoic wisdom', 'self improvement', 'mental strength'] },
  '1077306835630491': { label: 'EON VENTURES', accent: '#FF7A1A', keyword: 'discipline quotes', kwShort: 'discipline', theme: 'Discipline', niches: ['success habits', 'entrepreneur mindset', 'hard work'], authority: 'Discipline', voice: 'am_fenrir', tags: ['discipline', 'self improvement', 'mental strength', 'success mindset', 'personal growth', 'stoicism'] },
  '114550268199751': { label: 'RELIQ NORTH', accent: '#C8202D', keyword: 'stoic wisdom', kwShort: 'stoic wisdom', theme: 'Calm', niches: ['inner peace', 'digital minimalism', 'calm mind'], authority: 'Stoicism Philosophy', voice: 'am_michael', tags: ['stoicism', 'stoic wisdom', 'stoic philosophy', 'inner peace', 'emotional resilience', 'personal growth'] },
  '106473735839651': { label: 'THE BOUNDARIES CLUB', accent: '#FF8A1E', keyword: 'self respect quotes', kwShort: 'self respect', theme: 'Boundaries', niches: ['boundaries', 'emotional intelligence', 'protect your peace'], authority: 'Psychology', voice: 'bm_daniel', tags: ['self respect', 'boundaries', 'emotional intelligence', 'psychology', 'self improvement', 'dark psychology'] }
};

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
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
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

export function buildYouTubeMeta(page, postData, seed = 0, musicLabel = '') {
  const brand = resolveBrand(page);
  const headlineTC = titleCase((postData?.headline || 'Stay Silent and Build').replace(/\.$/, ''));
  const kw = titleCase(brand.keyword);
  const formulas = [
    `${headlineTC} — ${kw}`,
    `${kw}: ${headlineTC}`,
    `Read This If You Need ${brand.theme} — ${kw}`,
    `Daily ${kw} — ${headlineTC}`
  ];
  const title = formulas[seed % formulas.length].replace(/\s+/g, ' ').trim().slice(0, 95);

  const descCore = [
    `${capitalized(brand.keyword)} for anyone building ${brand.niches[0]}.`,
    `"${String(postData?.insight_body || '').trim()}"`,
    String(postData?.takeaway || '').trim(),
    `Follow ${brand.followName || 'Quote Quarry'} for daily ${brand.kwShort}.`,
    `#motivation #mindset #${brand.keyword.split(' ')[0].replace(/[^a-z]/g, '')}`
  ].join('\n').slice(0, 300);
  const description = musicLabel ? `${descCore}\n🎵 ${musicLabel}`.slice(0, 480) : descCore;

  const tags = [brand.keyword, ...brand.niches, 'motivation', 'quotes'].slice(0, 6);
  return { title, description, tags, format: HOOK_STYLES[seed % HOOK_STYLES.length], keyword: brand.keyword };
}

// ---------------------------------------------------------------------------
// Scheduling — 05:45 / 13:30 / 18:45 PKT slots (UTC+5, no DST).
// nextYouTubeSlotCandidatesISO returns the next N slot timestamps so the
// uploader can skip slots that already have a full batch scheduled.
// ---------------------------------------------------------------------------
export function nextYouTubeSlotCandidatesISO(n = 6, now = new Date()) {
  const slotsSec = [45 * 60, 8 * 3600 + 30 * 60, 13 * 3600 + 45 * 60];
  const t = now.getTime() / 1000 + 15 * 60;
  const dayStart = Math.floor(t / 86400) * 86400;
  const out = [];
  for (let d = 0; d <= Math.ceil(n / 3); d++) {
    for (const s of slotsSec) {
      const ts = dayStart + d * 86400 + s;
      if (ts > t) out.push(new Date(ts * 1000).toISOString());
    }
  }
  return out.slice(0, n);
}

export function nextYouTubeSlotISO(now = new Date()) {
  return nextYouTubeSlotCandidatesISO(1, now)[0];
}

// ---------------------------------------------------------------------------
// Thumbnail — 1280x720 CTR design: CLEAN background frame (no on-screen text!),
// huge Anton headline with the key word in the brand accent, thick black
// stroke, Quote Quarry eyebrow.
// ---------------------------------------------------------------------------
export async function renderYouTubeThumbnail(headline, cleanFrameFile, opts = {}) {
  const accent = opts.accent || '#F5E31C';
  const eyebrow = opts.eyebrow || 'QUOTE QUARRY';
  const b64 = await sharp(cleanFrameFile).resize(1280, 720, { fit: 'cover', position: 'attention' }).jpeg({ quality: 88 }).toBuffer();

  const raw = String(headline || 'DAILY MOTIVATION')
    .replace(/#[\w]+/g, '').replace(/[—|].*$/, '').trim().toUpperCase();
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
export async function renderYouTubeShort(page, postData, musicOverride = null) {
  const brand = resolveBrand(page);
  if (!brand) throw new Error('no YouTube config for page ' + page?.id);
  console.log(`[YouTube Short] ${brand.label} (4K topic clip + human narration + Hormozi captions)...`);

  const clip = (await getTopicClip(page, postData)) || await ensurePoolClip(page.id);

  // premium thumbnail from a CLEAN frame of the raw clip (no on-screen text)
  let thumb = null;
  try {
    const frameFile = `${POOL_DIR}/yt-thumb-frame-${page.id}.jpg`;
    execFileSync(FF, ['-y', '-v', 'error', '-ss', String(clip.start + 3), '-i', clip.file, '-frames:v', '1', frameFile]);
    thumb = await renderYouTubeThumbnail(postData?.headline || 'DAILY MOTIVATION', frameFile,
      { accent: brand.accent, eyebrow: brand.eyebrow || `QUOTE QUARRY // ${brand.label}` });
    fs.rmSync(frameFile, { force: true });
  } catch (e) {
    console.log(`      [YT Short] Thumbnail skipped (${String(e.message).slice(0, 80)})`);
  }

  const seed = Math.floor(Date.now() / 86400000) + Number(page.id % 7);
  const hook = buildHook(postData, seed);
  const narration = narrate(spokenScript(postData), page.id, brand.voice);
  const bodyLines = narration ? null : wrapTextToLines(postData?.insight_body || '', 24).slice(0, 4);
  const overlayFile = await renderOverlay(page.id, brand, hook, bodyLines, narration ? null : postData?.takeaway, !!narration);

  const scrimSvg = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="rgba(8,8,10,0.42)"/><stop offset="0.45" stop-color="rgba(8,8,10,0.60)"/><stop offset="1" stop-color="rgba(8,8,10,0.82)"/>
  </linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/></svg>`;
  const scrimFile = `${POOL_DIR}/yt-scrim-${page.id}.png`;
  await sharp(Buffer.from(scrimSvg)).png().toFile(scrimFile);

  const lastWordEnd = narration ? narration.words[narration.words.length - 1].s + narration.words[narration.words.length - 1].d : 12;
  const dur = narration
    ? Math.max(11, Math.min(30, Math.round((lastWordEnd + 1.2) * 10) / 10))
    : 13;

  // ASS captions from exact word timestamps
  let assFile = null;
  if (narration) {
    assFile = `${POOL_DIR}/yt-caps-${page.id}.ass`;
    fs.writeFileSync(assFile, buildAssCaptions(narration.words), 'utf8');
  }

  const chain = [
    `[0:v]crop=ih*9/16:ih,scale=1080:1920,eq=saturation=1.04:contrast=1.06,fade=t=in:st=0:d=0.5,fade=t=out:st=${(dur - 0.8).toFixed(1)}:d=0.8[bv]`,
    `[1:v]scale=1080:1920[sc]`,
    `[bv][sc]overlay=0:0[base]`,
    `[base][3:v]overlay=0:0[ov]`
  ];
  let audioChain;
  if (narration) {
    chain.push(`[ov]ass=${assFile}:fontsdir=image-tools/fonts[v]`);
    audioChain = `[4:a]adelay=350|350,apad=pad_dur=2[nar];[2:a]volume=0.14,apad=pad_dur=2[mus];[nar][mus]amix=inputs=2:duration=longest:normalize=0,atrim=0:${dur},afade=t=out:st=${(dur - 1.0).toFixed(1)}:d=1.0[a]`;
  } else {
    chain.push(`[ov]null[v]`);
    audioChain = `[2:a]volume=0.7,afade=t=in:st=0:d=1,afade=t=out:st=${(dur - 1.5).toFixed(1)}:d=1.5[a]`;
  }

  const args = ['-y', '-ss', String(clip.start), '-i', clip.file, '-i', scrimFile, '-stream_loop', '-1', '-i', (musicOverride?.file || 'image-tools/audio/awakening-dew.mp3'), '-i', overlayFile];
  if (narration) args.push('-i', narration.file);
  args.push('-filter_complex', chain.join(';') + ';' + audioChain, '-map', '[v]', '-map', '[a]',
    '-t', String(dur), '-r', '30',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', `${POOL_DIR}/yt-short-${page.id}.tmp.mp4`);

  try {
    execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const buf = fs.readFileSync(`${POOL_DIR}/yt-short-${page.id}.tmp.mp4`);
    fs.rmSync(`${POOL_DIR}/yt-short-${page.id}.tmp.mp4`, { force: true });
    fs.rmSync(overlayFile, { force: true });
    fs.rmSync(assFile, { force: true });
    console.log(`      ✓ YouTube Short rendered (${Math.round(buf.length / 1024)} KB, ${dur}s, ${narration ? 'narrated' : 'silent fallback'}, hook: ${hook.style}, clip: ${clip.query || 'pool'})`);
    return { buffer: buf, thumb, meta: buildYouTubeMeta(page, postData, seed, musicOverride ? `${musicOverride.title} — ${musicOverride.credit}` : ''), duration: dur };
  } catch (e) {
    fs.rmSync(overlayFile, { force: true });
    fs.rmSync(assFile, { force: true });
    const msg = e.stderr ? e.stderr.toString().split('\n').filter((l) => /Error|Invalid|No such|Unable/i.test(l)).join(' | ') : e.message;
    throw new Error('YouTube Short render failed: ' + msg.slice(0, 300));
  }
}

// ===========================================================================
// SCRIPTED SHORTS — the "5 Cold Behaviours" listicle format (hook → 5 points
// → closing), narrated section-by-section. PRIMARY YouTube format; single
// quotes remain the fallback.
// ===========================================================================
import path from 'node:path';

const FALLBACK_SCRIPTS = {
  '116157974886564': { // Silent Wealth
    hook: '5 quiet money habits that make you rich while others stay broke.',
    points: [
      { title: 'PAY YOURSELF FIRST', line: 'Move money to savings before you touch your salary. Wealth is what you keep, not what you earn.' },
      { title: 'BUY TIME, NOT THINGS', line: 'Rich people spend money to buy hours. Broke people spend hours to save pennies.' },
      { title: 'STAY SILENT ABOUT MONEY', line: 'Announce less, accumulate more. Every plan you broadcast becomes a target.' },
      { title: 'OWN ASSETS, NOT BRANDS', line: 'A logo on your chest empties your pocket. Let assets pay for your lifestyle.' },
      { title: 'MASTER BORING DISCIPLINE', line: 'Boring consistency beats exciting bets. Compounding rewards the patient, not the loud.' }
    ],
    closing: 'Stay quiet. Keep building. Let the numbers speak.',
    thumbHeadline: '5 QUIET HABITS THAT MAKE YOU RICH'
  },
  '108044922375174': { // Strategic Silence
    hook: '5 cold behaviors that make people respect you instantly.',
    points: [
      { title: 'SPEAK LESS', line: 'Every extra word gives away power. Say it once, say it calm, then stop.' },
      { title: 'SLOW DOWN EVERYTHING', line: 'Rushed people look weak. Slow movements, slow replies, slow decisions signal control.' },
      { title: 'STOP EXPLAINING', line: 'You owe no one a reason for your choices. Explanations invite negotiations.' },
      { title: 'HOLD EYE CONTACT', line: 'Look until they look away. Silence plus steady eyes wins every room.' },
      { title: 'KEEP YOUR PLANS HIDDEN', line: 'Move in silence. Surprise is the weapon of the strategic mind.' }
    ],
    closing: 'Respect is never demanded. It is engineered.',
    thumbHeadline: '5 COLD BEHAVIORS THAT COMMAND RESPECT'
  },
  '1077306835630491': { // Eon Ventures
    hook: '5 brutal rules of discipline that build unstoppable people.',
    points: [
      { title: 'NO ZERO DAYS', line: 'Do something every single day. One percent daily compounds into an empire.' },
      { title: 'SCHEDULE OR SUFFER', line: 'Motivation is a mood. A calendar is a decision. Winners decide.' },
      { title: 'EMBRACE THE BORING', line: 'The work nobody sees is the work that changes everything.' },
      { title: 'KILL DISTRACTIONS', line: 'Your phone is a slot machine. Every scroll is a bet against your future.' },
      { title: 'FINISH WHAT YOU START', line: 'Half-done dreams build nothing. Completion is the rarest skill on earth.' }
    ],
    closing: 'Discipline is choosing what you want most over what you want now.',
    thumbHeadline: '5 BRUTAL RULES OF DISCIPLINE'
  },
  '114550268199751': { // Reliq North
    hook: '5 stoic rules that calm an anxious mind instantly.',
    points: [
      { title: 'CONTROL THE CONTROLLABLE', line: 'Divide every problem in two. Act on yours. Release the rest to the world.' },
      { title: 'LOSE THE AUDIENCE', line: 'You rehearse your pain for imaginary judges. Nobody is watching that closely.' },
      { title: 'PREPARE FOR LOSS', line: 'Expect the worst calmly, and peace follows you into every storm.' },
      { title: 'GUARD YOUR INPUTS', line: 'An anxious mind is often just an overfed mind. Consume less. Think deeper.' },
      { title: "ACT, DON'T RUMINATE", line: 'Action kills anxiety faster than thought. Move your body, quiet your mind.' }
    ],
    closing: 'Calm is not a gift. It is a daily practice.',
    thumbHeadline: '5 STOIC RULES TO CALM YOUR MIND'
  },
  '106473735839651': { // The Boundaries Club
    hook: '5 boundaries that protect your peace from toxic people.',
    points: [
      { title: 'SAY NO WITHOUT ESSAYS', line: 'A real no needs no explanation. Over-explaining invites over-negotiating.' },
      { title: 'LIMIT ACCESS', line: 'Availability is a currency. Stop giving discounts to people who drain you.' },
      { title: 'LEAVE LOUD ROOMS', line: 'You cannot heal in the same environment that made you sick. Walk out early.' },
      { title: 'STOP OVER-FUNCTIONING', line: 'Doing their work teaches them you always will. Let people carry their own weight.' },
      { title: "ENFORCE, DON'T ANNOUNCE", line: 'Boundaries whispered and never enforced are just wishes. Follow through quietly.' }
    ],
    closing: 'Protect your peace like your life depends on it. It does.',
    thumbHeadline: '5 BOUNDARIES THAT PROTECT YOUR PEACE'
  }
};

export async function generateYouTubeScript(page, forcedTheme = null) {
  const brand = resolveBrand(page);
  const fallback = FALLBACK_SCRIPTS[page?.id] || FALLBACK_SCRIPTS['114550268199751'];
  if (!GEMINI_API_KEY) return { ...fallback, source: 'fallback' };
  const legacyThemes = ['silent behaviors that make people respect you', 'things to cut out of your life quietly', 'signs someone is secretly testing you', 'things you must do alone to become stronger', 'rules that protect you from toxic people', 'phrases fake friends use', 'things you should never apologize for', 'stop caring about these things', 'habits of mentally unbreakable people', 'ways to beat manipulators without fighting'];
  const themeList = forcedTheme ? forcedTheme : (brand.themeBank?.length ? brand.themeBank : legacyThemes).join(' / ');
  const themeLine = forcedTheme
    ? `Theme for this script (MUST be about exactly this): ${forcedTheme}.`
    : `Pick ONE theme from this PROVEN list (rotate, never repeat yesterday's): ${themeList}.`;
  const styleLine = brand.themeBank?.length
    ? `Write like the top ${brand.authority} YouTube channels for "${page.name}" (Niche: ${page.niche}). The points must be concrete, specific ${brand.niches[0]} insights that feel like insider knowledge, not vague motivation.\nCRITICAL: every point MUST be strictly about ${brand.niches.join(' / ')}. Do NOT write generic stoicism, generic self-improvement, or mindset fluff.`
    : `You write viral self-improvement YouTube Shorts scripts (like top stoicism channels: Stoic Legend, Psygena, Legacy Mindset) for "${page.name}" (Niche: ${page.niche}).\nWrite in EASY, CLEAR, punchy English. The points must be about HUMAN PSYCHOLOGY, respect and social dynamics (this is what performs best), not abstract quotes.`;
  const trendBlock = page.trend ? `\nGOING VIRAL RIGHT NOW in this exact niche (ride this wave — align your angle and wording with what is working): ${page.trend.videos.slice(0, 5).map(v => `"${v.title}"`).join(' | ')}\nHot search keywords to weave in naturally: ${page.trend.hotKeywords.join(', ')}.` : '';
  const prompt = `${styleLine}
Write in EASY, CLEAR, punchy English.
${themeLine}${trendBlock}
Structure: a curiosity-gap hook, 5 numbered points, a memorable closing line.
Return ONLY valid JSON:
{"hook":"<=12 words","thumb_headline":"<=6 word ALL CAPS thumbnail headline","points":[{"title":"2-5 word ALL CAPS title","line":"1-2 short sentences, 14-18 words"},{"title":"...","line":"..."},{"title":"...","line":"..."},{"title":"...","line":"..."},{"title":"...","line":"..."}],"closing":"<=12 words"}`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, responseMimeType: 'application/json' } })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`gemini HTTP ${res.status}: ${String(data?.error?.message || '').slice(0, 80)}`);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = text ? JSON.parse(text.replace(/^```json\s*/, '').replace(/```$/, '').trim()) : null;
    if (!parsed?.hook || !Array.isArray(parsed.points) || parsed.points.length < 4) throw new Error(`bad script shape: ${String(text).slice(0, 100)}`);
    return { ...parsed, points: parsed.points.slice(0, 5), closing: parsed.closing || '', thumbHeadline: parsed.thumb_headline || `${parsed.points.length} RULES`, source: 'gemini' };
  } catch (e) {
    console.log(`      [YT Script] Gemini failed (${String(e.message).slice(0, 80)}) — trying Pollinations...`);
  }
  // Fallback brain 1: Groq gpt-oss-120b (free tier ~14,400 req/day)
  try {
    const gk = process.env.GROQ_API_KEY || (fs.existsSync('.env') ? (fs.readFileSync('.env', 'utf8').match(/^GROQ_API_KEY=(.+)$/m) || [])[1]?.trim() : '');
    if (!gk) throw new Error('no Groq key');
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${gk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: prompt }], temperature: 0.9, max_tokens: 1500 })
    });
    if (!res.ok) throw new Error('Groq HTTP ' + res.status);
    const data = await res.json();
    const text = (data.choices?.[0]?.message?.content || '').trim();
    const start = text.indexOf('{'), end = text.lastIndexOf('}');
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!parsed?.hook || !Array.isArray(parsed.points) || parsed.points.length < 4) throw new Error('bad script shape');
    console.log('      [YT Script] Groq script OK');
    return { ...parsed, points: parsed.points.slice(0, 5), closing: parsed.closing || '', thumbHeadline: parsed.thumb_headline || `${parsed.points.length} RULES`, source: 'groq' };
  } catch (e) {
    console.log(`      [YT Script] Groq failed (${String(e.message).slice(0, 80)}) — trying HF...`);
  }
  // Fallback brain: HuggingFace Inference (free tier, existing HF_TOKEN)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const hf = process.env.HF_TOKEN || (fs.existsSync('.env') ? (fs.readFileSync('.env', 'utf8').match(/^HF_TOKEN=(.+)$/m) || [])[1]?.trim() : '');
      if (!hf) throw new Error('no HF token');
      const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${hf}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'meta-llama/Llama-3.1-8B-Instruct', messages: [{ role: 'user', content: prompt + (attempt > 1 ? '\nIMPORTANT: reply with the raw JSON object ONLY, no other text.' : '') }], temperature: 0.9, max_tokens: 800 })
      });
      if (!res.ok) throw new Error('HF HTTP ' + res.status);
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || '';
      const text = raw.replace(/^```json\s*/, '').replace(/```$/, '').trim();
      const start = text.indexOf('{'), end = text.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('no JSON in HF reply');
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (!parsed?.hook || !Array.isArray(parsed.points) || parsed.points.length < 4) throw new Error('bad script shape');
      console.log(`      [YT Script] HF Llama script OK (attempt ${attempt})`);
      return { ...parsed, points: parsed.points.slice(0, 5), closing: parsed.closing || '', thumbHeadline: parsed.thumb_headline || `${parsed.points.length} RULES`, source: 'hf' };
    } catch (e) {
      console.log(`      [YT Script] HF attempt ${attempt} failed (${String(e.message).slice(0, 80)})`);
      if (attempt === 2) return { ...fallback, source: 'fallback' };
    }
  }
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

export async function renderYouTubeScriptShort(page, script, musicOverride = null) {
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
  try {
    const frameFile = `${POOL_DIR}/yt-thumb-frame-${page.id}.jpg`;
    execFileSync(FF, ['-y', '-v', 'error', '-ss', String(clip.start + 3), '-i', clip.file, '-frames:v', '1', frameFile]);
    thumb = await renderYouTubeThumbnail(script.thumbHeadline || script.hook, frameFile, { accent: brand.accent, eyebrow: brand.eyebrow || `QUOTE QUARRY // ${brand.label}` });
    fs.rmSync(frameFile, { force: true });
  } catch (e) { console.log(`      [YT Script] Thumbnail skipped (${String(e.message).slice(0, 80)})`); }

  const meta = buildScriptMeta(page, script, musicOverride ? `${musicOverride.title} — ${musicOverride.credit}` : '');
  console.log(`      ✓ Script Short rendered (${Math.round(buf.length / 1024)} KB, ${total}s, ${sections.length} sections)`);
  return { buffer: buf, thumb, meta, duration: total };
}

export function buildScriptMeta(page, script, musicLabel = '') {
  const brand = resolveBrand(page);
  // competitor-proven patterns: numbered listicle title + "| <authority>" suffix
  // (every Stoic Legend title ends "| Stoicism Philosophy"; Psygena5 uses "| Machiavelli")
  const title = `${titleCase(script.thumbHeadline)} | ${brand.authority}`.replace(/\s+/g, ' ').slice(0, 95);
  const visibleTags = (brand.tags || ['stoicism', 'psychology', 'self improvement']).slice(0, 3).map((t) => '#' + t.replace(/\s+/g, ''));
  const descCore = [
    `${titleCase(script.hook)}.`,
    '',
    ...script.points.map((p, i) => `${i + 1}. ${titleCase(p.title)} — ${p.line}`),
    '',
    String(script.closing || ''),
    `Follow ${brand.followName || 'Quote Quarry'} for daily ${brand.kwShort}.`,
    visibleTags.join(' ')
  ].join('\n').slice(0, 480);
  const description = musicLabel ? `${descCore}\n🎵 ${musicLabel}`.slice(0, 4900) : descCore;
  // the ranking tag sets these channels actually use (from competitor-scan)
  const tags = [...(page.trend?.hotKeywords || []), ...(brand.tags || []), 'life lessons'].filter((t, i, a) => a.indexOf(t) === i).slice(0, 12);
  return { title, description, tags, format: 'script', keyword: brand.keyword };
}
