// Cross-posts produced YouTube Shorts to their matched Facebook Pages as
// video Reels, with US/high-CPM-country timing (mirrors the YT slot times)
// and SEO descriptions (keyword-first, <=3 hashtags).
//
// Modes:
//   node fb-crosspost.mjs                        # scan fb-outbox/ and post all
//   node fb-crosspost.mjs <video.mp4> <slug>     # post one file now (test)
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { buildFbVariant } from './fb-variant.mjs';
import { BRANDS } from './yt-brands/brands.mjs';

const brandOf = (slug) => BRANDS.find(b => b.slug === slug);

const envStr = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || (envStr.match(/^FB_PAGE_TOKEN=(.+)$/m) || [])[1]?.trim() || '';

// YT slug -> FB page (audience-matched)
const PAGE_MAP = {
  'quotequarry': '114550268199751',      // Reliq North (8.6k followers, user order 09-20 — replaces Strategic Silence)
  'investors-compass': '116157974886564', // Silent Wealth (money psychology)
  'money-rulebook': '1077306835630491',   // Eon Ventures (success habits)
  'debt-free-doctrine': '106473735839651' // The Boundaries Club (boundaries)
};
const HASHTAGS = {
  'quotequarry': '#Stoicism #DailyWisdom #Mindset',
  'investors-compass': '#InvestingPsychology #StockMarket #WealthBuilding',
  'money-rulebook': '#MoneyRules #PersonalFinance #FinancialFreedom',
  'debt-free-doctrine': '#DebtFree #FinancialFreedom #MoneyTips'
};

function graphPostForm(pageId, fields, fileBuf) {
  return new Promise((resolve, reject) => {
    const B = 'XXfb' + Date.now();
    let pre = '';
    for (const [k, v] of Object.entries(fields)) pre += `--${B}
Content-Disposition: form-data; name="${k}"

${v}
`;
    pre += `--${B}
Content-Disposition: form-data; name="source"; filename="reel.mp4"
Content-Type: video/mp4

`;
    const body = Buffer.concat([Buffer.from(pre), fileBuf, Buffer.from('\r\n--' + B + '--')]);
    const req = https.request({
      hostname: 'graph.facebook.com', path: `/v20.0/${pageId}/videos`, method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${B}`, 'Content-Length': body.length },
      timeout: 900000
    }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ error: d.slice(0, 200) }); } }); });
    req.on('timeout', () => req.destroy(new Error('upload timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
let pageTokensCache = null;
async function getPageToken(pageId) {
  if (!pageTokensCache) {
    pageTokensCache = {};
    const res = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=${FB_PAGE_TOKEN}`);
    const data = await res.json();
    for (const p of data.data || []) pageTokensCache[p.id] = p.access_token;
  }
  return pageTokensCache[pageId] || FB_PAGE_TOKEN;
}

function seoDescription(meta) {
  // FB-native caption (09-20): hook first line, one value line, follow CTA,
  // <=3 hashtags (FB uses fewer hashtags than YouTube).
  const b = brandOf(meta.slug);
  const label = b ? b.label.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'us';
  const kw = b ? b.kwShort : 'content';
  const hash = HASHTAGS[meta.slug] || '#Motivation #Mindset #Success';
  const hook = String(meta.title || '').slice(0, 90);
  const body = String(meta.description || '').split('\n').filter(Boolean)[0] || '';
  return `${hook}\n\n${body}\n\nFollow ${label} for daily ${kw}. ${hash}`.slice(0, 1200);
}

async function postReel(slug, videoBuffer, meta, publishAtIso) {
  const pageId = PAGE_MAP[slug];
  if (!pageId) { console.log(`[fb] no page mapping for ${slug} — skipped`); return null; }
  const token = await getPageToken(pageId);
  const form = new FormData();
const fields = { access_token: token, title: String(meta.title || '').slice(0, 255), description: seoDescription(meta) };
  let unix = publishAtIso ? Math.floor(new Date(publishAtIso).getTime() / 1000) : 0;
  const minFuture = Math.floor(Date.now() / 1000) + 11 * 60;
  // FB needs the slot >=10 min out to schedule; a passed/too-soon slot gets
  // pushed ~20 min out instead of silently posting at upload time.
  if (unix > 0 && unix <= minFuture) unix = minFuture + 9 * 60;
  if (unix > minFuture) { fields.published = 'false'; fields.scheduled_publish_time = String(unix); }
  const data = await graphPostForm(pageId, fields, videoBuffer);
  if (data.id) {
    const schedIso = unix > minFuture ? new Date(unix * 1000).toISOString().replace(/\.\d+Z$/, 'Z') : null;
    console.log(`  ✓ FB ${schedIso ? 'Reel scheduled ' + schedIso : 'Reel PUBLISHED'} → page ${pageId}, video ${data.id}`);
    return data.id;
  }
  console.log(`  ✗ FB failed:`, JSON.stringify(data).slice(0, 160));
  return null;
}

// ---------- main ----------
const oneFile = process.argv[2];
if (oneFile) {
  const slug = process.argv[3];
  const metaFile = oneFile.replace(/\.mp4$/, '.json');
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8'))
    : { title: 'Daily Investing Wisdom', description: 'Investing psychology and market wisdom for long-term wealth.', slug };
  let buf = fs.readFileSync(oneFile);
  try { await buildFbVariant(oneFile, slug, oneFile.replace(/\.mp4$/, '-fb.mp4')); buf = fs.readFileSync(oneFile.replace(/\.mp4$/, '-fb.mp4')); }
  catch (e) { console.log('[fb] variant failed — posting original:', String(e.message).slice(0, 90)); }
  await postReel(slug, buf, meta, null);
  process.exit(0);
}

const jobs = [];
for (const dir of fs.existsSync('fb-outbox') ? fs.readdirSync('fb-outbox') : []) {
  const d = path.join('fb-outbox', dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) {
    if (f.endsWith('.json')) jobs.push(path.join(d, f));
  }
}
if (!jobs.length) { console.log('[fb] outbox empty — nothing to cross-post'); process.exit(0); }

// 09-20 CADENCE FIX: one NATIVE reel per page per day (cold pages posting 3
// identical reels daily read as automation spam, and unchanged cross-posts get
// demoted to ~0 views). The oldest queued file per slug is transformed into an
// FB-native variant and posted; same-day files stay queued (next day's run
// posts one of them — the backlog self-paces at 1/day).
const parsed = jobs.map(metaFile => {
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const stamp = Number(path.basename(metaFile).replace(/\.json$/, '')) || fs.statSync(metaFile).mtimeMs;
    return { metaFile, meta, stamp, slug: meta.slug };
  } catch { return null; }
}).filter(Boolean).sort((a, b) => a.stamp - b.stamp);

const postedSlugs = new Set();
for (const job of parsed) {
  if (!fs.existsSync(job.metaFile)) continue; // skipped/marked during this pass
  const videoPath = path.resolve(job.meta.videoFile);
  if (!fs.existsSync(videoPath)) { console.log(`[fb] missing ${videoPath} — skipped`); continue; }
  if (postedSlugs.has(job.slug)) {
    console.log(`[fb] cadence: ${job.slug} already has today's native reel — ${path.basename(job.metaFile)} stays queued`);
    continue;
  }
  const dayKey = new Date(job.stamp).toISOString().slice(0, 10);
  const variantPath = videoPath.replace(/\.mp4$/, '-fb.mp4');
  try {
    buildFbVariant(videoPath, job.slug, variantPath);
    console.log(`  ✓ FB-native variant rendered: ${path.basename(variantPath)}`);
  } catch (e) {
    console.log(`  ⚠ variant failed (${String(e.message).slice(0, 90)}) — posting original file`);
  }
  const usePath = fs.existsSync(variantPath) && fs.statSync(variantPath).size > 10000 ? variantPath : videoPath;
  let id = null;
  for (let a = 1; a <= 2 && !id; a++) {
    try {
      id = await postReel(job.slug, fs.readFileSync(usePath), job.meta, job.meta.publishAt);
    } catch (e) {
      console.log(`  ✗ attempt ${a} network error: ${e.message}`);
      if (a < 2) await new Promise(r => setTimeout(r, 5000));
    }
  }
  if (id) {
    fs.renameSync(job.metaFile, job.metaFile + '.fb-done');
    postedSlugs.add(job.slug);
    // same-day siblings: skip (they'd drip out 1/day otherwise)
    for (const other of parsed) {
      if (other.slug !== job.slug || other === job || !fs.existsSync(other.metaFile)) continue;
      if (new Date(other.stamp).toISOString().slice(0, 10) === dayKey) {
        fs.renameSync(other.metaFile, other.metaFile + '.fb-skipped');
        console.log(`  skip same-day file: ${path.basename(other.metaFile)}`);
      }
    }
  }
  await new Promise(r => setTimeout(r, 3000)); // space out page posts
}
console.log('[fb] cross-post pass complete');
