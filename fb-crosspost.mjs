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

const envStr = fs.readFileSync(path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '.env'), 'utf8');
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || (envStr.match(/^FB_PAGE_TOKEN=(.+)$/m) || [])[1]?.trim() || '';

// YT slug -> FB page (audience-matched)
const PAGE_MAP = {
  'quotequarry': '108044922375174',      // Strategic Silence (stoicism)
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
  // keyword-first first line (FB SEO: first 100 chars weigh most), body, <=3 hashtags
  const hash = HASHTAGS[meta.slug] || '#Motivation #Mindset #Success';
  const body = String(meta.description || '').slice(0, 900);
  return `${meta.title}\n\n${body}\n\nFollow for daily content. ${hash}`.slice(0, 1200);
}

async function postReel(slug, videoBuffer, meta, publishAtIso) {
  const pageId = PAGE_MAP[slug];
  if (!pageId) { console.log(`[fb] no page mapping for ${slug} — skipped`); return null; }
  const token = await getPageToken(pageId);
  const form = new FormData();
const fields = { access_token: token, title: String(meta.title || '').slice(0, 255), description: seoDescription(meta) };
  const unix = publishAtIso ? Math.floor(new Date(publishAtIso).getTime() / 1000) : 0;
  const minFuture = Math.floor(Date.now() / 1000) + 11 * 60;
  if (unix > minFuture) { fields.published = 'false'; fields.scheduled_publish_time = String(unix); }
  const data = await graphPostForm(pageId, fields, videoBuffer);
  if (data.id) {
    console.log(`  ✓ FB ${unix > minFuture ? 'Reel scheduled ' + publishAtIso : 'Reel PUBLISHED'} → page ${pageId}, video ${data.id}`);
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
  await postReel(slug, fs.readFileSync(oneFile), meta, null);
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

for (const metaFile of jobs) {
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const videoPath = path.resolve(meta.videoFile);
  if (!fs.existsSync(videoPath)) { console.log(`[fb] missing ${videoPath} — skipped`); continue; }
  const id = await postReel(meta.slug, fs.readFileSync(videoPath), meta, meta.publishAt);
  if (id) fs.renameSync(metaFile, metaFile + '.fb-done');
  await new Promise(r => setTimeout(r, 3000)); // space out page posts
}
console.log('[fb] cross-post pass complete');
