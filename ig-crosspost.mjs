// Cross-posts produced Shorts to the mapped Instagram accounts as Reels.
// Chain: uguu.se public hosting -> IG media container (REELS) -> publish.
// Usage: node ig-crosspost.mjs                       # scan fb-outbox/
//        node ig-crosspost.mjs <video.mp4> <slug>    # post one file now
import fs from 'node:fs';
import path from 'node:path';
import { hostImagePublicly } from './threads-publisher.mjs';

const envStr = fs.readFileSync(path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '.env'), 'utf8');
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || (envStr.match(/^FB_PAGE_TOKEN=(.+)$/m) || [])[1]?.trim() || '';

const PAGE_MAP = {
  'quotequarry': '108044922375174',
  'investors-compass': '116157974886564',
  'money-rulebook': '1077306835630491',
  'debt-free-doctrine': '106473735839651'
};
const HASHTAGS = {
  'quotequarry': '#stoicism #dailymotivation #mindset #wisdom #selfimprovement',
  'investors-compass': '#investingpsychology #stockmarket #wealthbuilding #investing #moneymindset',
  'money-rulebook': '#moneyrules #personalfinance #financialfreedom #moneytips #wealth',
  'debt-free-doctrine': '#debtfree #moneytips #financialfreedom #debtpayoff #moneymindset'
};

let tokensCache = null;
async function getPageToken(pageId) {
  if (!tokensCache) {
    tokensCache = {};
    const res = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account{username,id}&access_token=${encodeURIComponent(FB_PAGE_TOKEN)}`);
    const data = await res.json();
    for (const p of data.data || []) tokensCache[p.id] = { token: p.access_token, igId: p.instagram_business_account?.id || null };
  }
  return tokensCache[pageId] || {};
}

function seoCaption(meta) {
  const hash = HASHTAGS[meta.slug] || '#motivation #mindset #success';
  return `${meta.title}\n\n${String(meta.description || '').slice(0, 800)}\n\nFollow for daily content. ${hash}`.slice(0, 2100);
}

async function postIgReel(slug, videoBuffer, meta) {
  const pageId = PAGE_MAP[slug];
  const { token: pageToken, igId } = await getPageToken(pageId);
  if (!pageToken || !igId) { console.log(`  ✗ IG: no linked account for ${slug}`); return null; }

  console.log('  [ig] hosting video publicly...');
  const hosted = await hostImagePublicly(videoBuffer, 'video/mp4', 'reel.mp4');
  if (!hosted) { console.log('  ✗ IG: hosting failed'); return null; }

  const createRes = await fetch(`https://graph.facebook.com/v21.0/${igId}/media?access_token=${encodeURIComponent(pageToken)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: meta.kind === 'episode' ? 'VIDEO' : 'REELS', video_url: hosted, caption: seoCaption(meta), share_to_feed: true })
  });
  const createData = await createRes.json();
  if (!createData.id) { console.log('  ✗ IG container failed:', JSON.stringify(createData).slice(0, 140)); return null; }
  const creationId = createData.id;

  let status = 'IN_PROGRESS';
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 6000));
    const stRes = await fetch(`https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${encodeURIComponent(pageToken)}`);
    status = (await stRes.json()).status_code;
    if (status === 'FINISHED' || status === 'ERROR') break;
    console.log(`  [ig] processing... (${status})`);
  }
  if (status !== 'FINISHED') { console.log('  ✗ IG: container not FINISHED —', status); return null; }

  const pubRes = await fetch(`https://graph.facebook.com/v21.0/${igId}/media_publish?creation_id=${creationId}&access_token=${encodeURIComponent(pageToken)}`, { method: 'POST' });
  const pubData = await pubRes.json();
  if (pubData.id) { console.log(`  ✓ IG Reel PUBLISHED → @${(await getPageToken(pageId), '')}${meta.slug} (post ${pubData.id})`); return pubData.id; }
  console.log('  ✗ IG publish failed:', JSON.stringify(pubData).slice(0, 140));
  return null;
}

// ---------- main ----------
const oneFile = process.argv[2];
if (oneFile) {
  const slug = process.argv[3];
  const metaFile = oneFile.replace(/\.mp4$/, '.json');
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8'))
    : { title: 'Daily Investing Wisdom', description: 'Investing psychology and market wisdom for long-term wealth.', slug };
  await postIgReel(slug, fs.readFileSync(oneFile), meta);
  process.exit(0);
}

const jobs = [];
for (const dir of fs.existsSync('fb-outbox') ? fs.readdirSync('fb-outbox') : []) {
  const d = path.join('fb-outbox', dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) {
    if (f.endsWith('.json')) jobs.push(path.join(d, f));          // not yet posted anywhere
    if (f.endsWith('.fb-done')) jobs.push(path.join(d, f));       // FB done, IG pending
  }
}
if (!jobs.length) { console.log('[ig] outbox empty — nothing to cross-post'); process.exit(0); }

for (const metaFile of jobs) {
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const videoPath = path.resolve(meta.videoFile);
  if (!fs.existsSync(videoPath)) continue;
  const id = await postIgReel(meta.slug, fs.readFileSync(videoPath), meta);
  if (id) fs.renameSync(metaFile, metaFile + '.done');
  await new Promise(r => setTimeout(r, 3000));
}
console.log('[ig] cross-post pass complete');
