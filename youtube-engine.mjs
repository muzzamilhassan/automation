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

// ---------------------------------------------------------------------------
// YouTube brand configs — separate identity from the FB/IG BRANDS table.
// ---------------------------------------------------------------------------
const YT_BRANDS = {
  '116157974886564': { label: 'SILENT WEALTH', accent: '#F5E31C', keyword: 'money mindset quotes', kwShort: 'wealth wisdom', theme: 'Wealth', niches: ['wealth building', 'financial freedom', 'millionaire mindset'] },
  '108044922375174': { label: 'STRATEGIC SILENCE', accent: '#4D8DFF', keyword: 'stoic quotes', kwShort: 'stoic wisdom', theme: 'Power', niches: ['dark psychology', 'self mastery', 'power moves'] },
  '1077306835630491': { label: 'EON VENTURES', accent: '#FF7A1A', keyword: 'discipline quotes', kwShort: 'discipline', theme: 'Discipline', niches: ['success habits', 'entrepreneur mindset', 'hard work'] },
  '114550268199751': { label: 'RELIQ NORTH', accent: '#C8202D', keyword: 'stoic wisdom', kwShort: 'stoic wisdom', theme: 'Calm', niches: ['inner peace', 'digital minimalism', 'calm mind'] },
  '106473735839651': { label: 'THE BOUNDARIES CLUB', accent: '#FF8A1E', keyword: 'self respect quotes', kwShort: 'self respect', theme: 'Boundaries', niches: ['boundaries', 'emotional intelligence', 'protect your peace'] }
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

function narrate(scriptText, tag) {
  const py = resolvePython();
  if (!py) return null;
  const base = `${POOL_DIR}/yt-tts-${tag}`;
  fs.mkdirSync(POOL_DIR, { recursive: true });
  fs.writeFileSync(`${base}.txt`, scriptText, 'utf8');
  try {
    execFileSync(py, ['youtube-flow/narrate.py', `${base}.txt`, `${base}.mp3`, `${base}.words.json`],
      { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 });
    const words = JSON.parse(fs.readFileSync(`${base}.words.json`, 'utf8'));
    if (!words?.length || !fs.existsSync(`${base}.mp3`)) return null;
    return { mp3: `${base}.mp3`, words };
  } catch (e) {
    console.log(`      [YT Short] Narration unavailable (${String(e.message).slice(0, 120)}) — rendering text-only.`);
    return null;
  } finally {
    fs.rmSync(`${base}.txt`, { force: true });
    fs.rmSync(`${base}.words.json`, { force: true });
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
  <text ${anchor} y="300" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="500" font-size="28" letter-spacing="7" fill="${brand.accent}">${escapeXml(`QUOTE QUARRY // ${brand.label}`)}</text>
  ${hook.prefix ? `<text ${anchor} y="${prefixY}" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="600" font-size="40" letter-spacing="5" fill="${brand.accent}">${escapeXml(hook.prefix)}</text>` : ''}
  ${hlEls}
  ${bodyEls}
  ${takeawayEl}
  <text ${anchor} y="1798" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="500" font-size="30" letter-spacing="4" fill="#9A9A9A">@quotequarry302 • DAILY ${escapeXml(brand.kwShort.toUpperCase())}</text>
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
  const brand = YT_BRANDS[page?.id] || Object.values(YT_BRANDS)[0];
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
    `Follow Quote Quarry for daily ${brand.kwShort}.`,
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
// Main renderer — returns { buffer, meta } for the YouTube Short
// ---------------------------------------------------------------------------
export async function renderYouTubeShort(page, postData, musicOverride = null) {
  const brand = YT_BRANDS[page?.id];
  if (!brand) throw new Error('no YouTube config for page ' + page?.id);
  console.log(`[YouTube Short] ${brand.label} (4K topic clip + human narration + Hormozi captions)...`);

  const clip = (await getTopicClip(page, postData)) || await ensurePoolClip(page.id);

  const seed = Math.floor(Date.now() / 86400000) + Number(page.id % 7);
  const hook = buildHook(postData, seed);
  const narration = narrate(spokenScript(postData), page.id);
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
  if (narration) args.push('-i', narration.mp3);
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
    return { buffer: buf, meta: buildYouTubeMeta(page, postData, seed, musicOverride ? `${musicOverride.title} — ${musicOverride.credit}` : ''), duration: dur };
  } catch (e) {
    fs.rmSync(overlayFile, { force: true });
    fs.rmSync(assFile, { force: true });
    const msg = e.stderr ? e.stderr.toString().split('\n').filter((l) => /Error|Invalid|No such|Unable/i.test(l)).join(' | ') : e.message;
    throw new Error('YouTube Short render failed: ' + msg.slice(0, 300));
  }
}
