// YouTube Shorts Engine — a DEDICATED YouTube format, deliberately different
// from the FB/IG cinematic reels but driven by the same content batch.
//
// Differences from the FB/IG reel (per research/youtube-growth-playbook-2026-09.md):
//   • Quote Quarry identity: uniform dark scrim + Anton hook, accent per brand
//   • Hook in frame 1 (<=7 words on screen instantly), inside UI safe zones
//   • Edge-TTS narration + burned karaoke subtitles (MoneyPrinterTurbo pattern)
//   • Loopable: hook text stays on screen the whole video, audio fades clean
//   • Duration follows the narration (~12-25s), never 3-minute territory
//   • SEO metadata: keyword front-loaded titles, unique <300 char descriptions,
//     exactly 3 visible hashtags, skip the tags field
//   • Uploads are scheduled (private + publishAt) at the 05:45/13:30/18:45 PKT
//     Shorts slots instead of posting instantly
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { EMBEDDED_FONTS_CSS } from './typography-poster-engine.mjs';
import { ensurePoolClip } from './cinematic-engine.mjs';

const FF = process.env.FFMPEG_PATH || (fs.existsSync('ffmpeg-bin/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe')
  ? 'ffmpeg-bin/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe' : 'ffmpeg');
const POOL_DIR = 'pixabay-pool';
const SUB_STYLE = 'FontName=Oswald,FontSize=14,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=52,WrapStyle=2';

// ---------------------------------------------------------------------------
// YouTube brand configs — separate identity from the FB/IG BRANDS table.
// One recognizable Quote Quarry look (dark scrim, Anton caps, white ink) with
// a per-brand accent color + SEO keyword set.
// ---------------------------------------------------------------------------
const YT_BRANDS = {
  '116157974886564': { label: 'SILENT WEALTH', accent: '#F5E31C', keyword: 'money mindset quotes', kwShort: 'wealth wisdom', theme: 'Wealth', niches: ['wealth building', 'financial freedom', 'millionaire mindset'] },
  '108044922375174': { label: 'STRATEGIC SILENCE', accent: '#4D8DFF', keyword: 'stoic quotes', kwShort: 'stoic wisdom', theme: 'Power', niches: ['dark psychology', 'self mastery', 'power moves'] },
  '1077306835630491': { label: 'EON VENTURES', accent: '#FF7A1A', keyword: 'discipline quotes', kwShort: 'discipline', theme: 'Discipline', niches: ['success habits', 'entrepreneur mindset', 'hard work'] },
  '114550268199751': { label: 'RELIQ NORTH', accent: '#C8202D', keyword: 'stoic wisdom', kwShort: 'stoic wisdom', theme: 'Calm', niches: ['inner peace', 'digital minimalism', 'calm mind'] },
  '106473735839651': { label: 'THE BOUNDARIES CLUB', accent: '#FF8A1E', keyword: 'self respect quotes', kwShort: 'self respect', theme: 'Boundaries', niches: ['boundaries', 'emotional intelligence', 'protect your peace'] }
};

// Hook style rotation (playbook Part 4: format rotation beats one template)
const HOOK_STYLES = ['direct', 'emphasis', 'curiosity', 'negative'];
const CURIOSITY_PREFIX = ['NOBODY TELLS YOU THIS:', 'READ THIS TWICE:', 'THIS CHANGES EVERYTHING:'];

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

// ---------------------------------------------------------------------------
// Hook builder — style rotation over the same content (robust, no AI needed)
// ---------------------------------------------------------------------------
function buildHook(postData, styleIndex) {
  const headline = (postData?.headline || 'STAY SILENT AND BUILD').toUpperCase();
  const style = HOOK_STYLES[styleIndex % HOOK_STYLES.length];
  let hook = headline;
  let prefix = null;
  if (style === 'curiosity') prefix = CURIOSITY_PREFIX[styleIndex % CURIOSITY_PREFIX.length];
  if (style === 'negative' && !/^(STOP|NEVER|DON'T|DO NOT|QUIT)/.test(headline)) prefix = 'STOP.';
  // 'emphasis' / 'direct' keep the raw headline; 'emphasis' recolors a keyword below

  // accent the longest word for the 'emphasis' style
  let accentWord = null;
  if (style === 'emphasis') {
    accentWord = hook.split(/\s+/).filter((w) => w.length > 3).sort((a, b) => b.length - a.length)[0] || null;
  }
  const hookLines = wrapTextToLines(hook, 11).slice(0, 3);
  return { style, prefix, hookLines, accentWord };
}

// ---------------------------------------------------------------------------
// Overlay PNG — Quote Quarry dark identity. With narration only the hook card
// shows (subtitles carry the words); without narration the insight + takeaway
// are added so the Short still works silent.
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

  // fallback (silent) body: insight lines + accent takeaway
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
// Narration — Edge TTS via youtube-flow/tts_subs.py (MoneyPrinterTurbo pattern)
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

function spokenScript(postData) {
  const headline = titleCase(postData?.headline || '').replace(/\.$/, '');
  const takeaway = String(postData?.takeaway || '').replace(/^Rule:\s*/i, 'The rule is this: ');
  const insight = String(postData?.insight_body || '');
  const words = [headline ? `${headline}.` : '', insight, takeaway].filter(Boolean).join(' ').split(/\s+/);
  return words.slice(0, 52).join(' ');
}

function narrate(scriptText, tag) {
  const py = resolvePython();
  if (!py) return null;
  const base = `${POOL_DIR}/yt-tts-${tag}`;
  fs.writeFileSync(`${base}.txt`, scriptText, 'utf8');
  try {
    execFileSync(py, ['youtube-flow/tts_subs.py', `${base}.txt`, `${base}.mp3`, `${base}.srt`, `${base}.json`],
      { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 });
    const meta = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8'));
    if (!fs.existsSync(`${base}.mp3`) || !fs.existsSync(`${base}.srt`)) return null;
    return { mp3: `${base}.mp3`, srt: `${base}.srt`, duration: meta.duration || 12 };
  } catch (e) {
    console.log(`      [YT Short] Narration unavailable (${String(e.message).slice(0, 120)}) — rendering text-only.`);
    return null;
  } finally {
    fs.rmSync(`${base}.txt`, { force: true });
  }
}

// ---------------------------------------------------------------------------
// SEO metadata (playbook Part 3) — keyword front-loaded title, unique short
// description, exactly 3 visible hashtags. Tags field intentionally minimal.
// ---------------------------------------------------------------------------
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

const capitalized = (s) => titleCase(s);

// ---------------------------------------------------------------------------
// Scheduling — next 05:45 / 13:30 / 18:45 PKT slot (UTC+5, no DST)
// Slots in UTC: 00:45, 08:30, 13:45. Requires ~15 min lead time.
// ---------------------------------------------------------------------------
export function nextYouTubeSlotISO(now = new Date()) {
  const slotsSec = [45 * 60, 8 * 3600 + 30 * 60, 13 * 3600 + 45 * 60];
  const t = now.getTime() / 1000 + 15 * 60;
  const dayStart = Math.floor(t / 86400) * 86400;
  for (const s of slotsSec) {
    if (dayStart + s > t) return new Date((dayStart + s) * 1000).toISOString();
  }
  return new Date((dayStart + 86400 + slotsSec[0]) * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Main renderer — returns { buffer, meta } for the YouTube Short
// ---------------------------------------------------------------------------
export async function renderYouTubeShort(page, postData, musicOverride = null) {
  const brand = YT_BRANDS[page?.id];
  if (!brand) throw new Error('no YouTube config for page ' + page?.id);
  console.log(`[YouTube Short] ${brand.label} (dedicated YT format)...`);
  const clip = await ensurePoolClip(page.id);

  const seed = Math.floor(Date.now() / 86400000) + Number(page.id % 7);
  const hook = buildHook(postData, seed);
  const narration = narrate(spokenScript(postData), page.id);
  const bodyLines = narration ? null : wrapTextToLines(postData?.insight_body || '', 24).slice(0, 4);
  const overlayFile = await renderOverlay(page.id, brand, hook, bodyLines, narration ? null : postData?.takeaway, !!narration);

  const scrimSvg = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="rgba(8,8,10,0.55)"/><stop offset="0.45" stop-color="rgba(8,8,10,0.72)"/><stop offset="1" stop-color="rgba(8,8,10,0.88)"/>
  </linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/></svg>`;
  const scrimFile = `${POOL_DIR}/yt-scrim-${page.id}.png`;
  await sharp(Buffer.from(scrimSvg)).png().toFile(scrimFile);

  const dur = narration
    ? Math.max(11, Math.min(30, Math.round((narration.duration + 1.2) * 10) / 10))
    : 13;

  const chain = [
    `[0:v]crop=ih*9/16:ih,scale=1080:1920,eq=saturation=1.04:contrast=1.06,fade=t=in:st=0:d=0.5,fade=t=out:st=${(dur - 0.8).toFixed(1)}:d=0.8[bv]`,
    `[1:v]scale=1080:1920[sc]`,
    `[bv][sc]overlay=0:0[base]`,
    `[base][3:v]overlay=0:0[ov]`
  ];
  let audioChain;
  if (narration) {
    chain.push(`[ov]subtitles=filename=${narration.srt}:fontsdir=image-tools/fonts:force_style='${SUB_STYLE}'[v]`);
    audioChain = `[4:a]adelay=350|350,apad=pad_dur=2[nar];[2:a]volume=0.16,apad=pad_dur=2[mus];[nar][mus]amix=inputs=2:duration=longest:normalize=0,atrim=0:${dur},afade=t=out:st=${(dur - 1.0).toFixed(1)}:d=1.0[a]`;
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
    console.log(`      ✓ YouTube Short rendered (${Math.round(buf.length / 1024)} KB, ${dur}s, ${narration ? 'narrated' : 'silent fallback'}, hook: ${hook.style})`);
    return { buffer: buf, meta: buildYouTubeMeta(page, postData, seed, musicOverride ? `${musicOverride.title} — ${musicOverride.credit}` : ''), duration: dur };
  } catch (e) {
    fs.rmSync(overlayFile, { force: true });
    const msg = e.stderr ? e.stderr.toString().split('\n').filter((l) => /Error|Invalid|No such|Unable/i.test(l)).join(' | ') : e.message;
    throw new Error('YouTube Short render failed: ' + msg.slice(0, 300));
  }
}
