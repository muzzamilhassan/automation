// Daily / weekly / monthly reports: what posted where, what missed, growth
// (subs/views/comments) — text summary + PDF, delivered to WhatsApp/Telegram.
//
// Usage: node daily-report.mjs [daily|weekly|monthly]
// Delivery: CallMeBot text (+PDF link) — set CALLMEBOT_PHONE + CALLMEBOT_KEY.
//           Optional: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (native PDF),
//           WA_TOKEN + WA_PHONE_ID + WA_TO (official Cloud API PDF).
//           With none configured, everything runs in DRY-RUN (console + local PDF).
import fs from 'node:fs';
import { computeDeltas, collectYouTube, expectedPerDay, failedRunsToday, pktDate,
  postsBetween, readSnapshot, snapshotFile, sumRange } from './reporting/collect.mjs';
import { buildPdf, hostFile, sendTelegramDocument, sendWhatsAppDocument, sendWhatsAppText } from './reporting/send.mjs';

const MODE = (process.argv[2] || 'daily').toLowerCase();
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const sign = (n) => (n >= 0 ? '+' : '') + fmt(n);

console.log(`\n📊 Building ${MODE.toUpperCase()} report...`);

// ---------------------------------------------------------------------------
// 1. Collect current state
// ---------------------------------------------------------------------------
const cur = await collectYouTube();
console.log(`YouTube: ${cur.stats.title} — ${fmt(cur.stats.subscribers)} subs, ${fmt(cur.stats.totalViews)} views, ${cur.videos.length} recent videos`);

const today = pktDate();
fs.mkdirSync('state', { recursive: true });
fs.mkdirSync('reports', { recursive: true });

// period boundaries (PKT-based days)
const dayMs = 86400000;
const nowPkt = new Date(Date.now() + 300 * 60000);
const startPkt = new Date(nowPkt.getTime() - (MODE === 'daily' ? 1 : MODE === 'weekly' ? 7 : 30) * dayMs);
const iso = (d) => d.toISOString().slice(0, 19);

// ---------------------------------------------------------------------------
// 2. Deltas + posts + failures
// ---------------------------------------------------------------------------
let delta = null, gained = { likes: 0, comments: 0 };
let topVideos = [];

if (MODE === 'daily') {
  const prev = readSnapshot(new Date(Date.now() - dayMs).toISOString().slice(0, 10))
    || readSnapshot(new Date(Date.now() - 2 * dayMs).toISOString().slice(0, 10));
  delta = computeDeltas(prev, cur);
  if (delta) {
    gained = { likes: delta.likes, comments: delta.comments };
    topVideos = delta.perVideo;
  } else {
    console.log('No previous snapshot — first run, deltas start tomorrow.');
    topVideos = cur.videos.filter((v) => Date.now() - new Date(v.publishedAt) < 3 * dayMs)
      .sort((a, b) => b.views - a.views);
  }
} else {
  const agg = sumRange(MODE === 'weekly' ? 7 : 30);
  gained = { likes: agg.likes, comments: agg.comments };
  delta = { subscribers: agg.subscribers, totalViews: agg.totalViews, perVideo: agg.top };
  topVideos = agg.top;
}

const posts = postsBetween(iso(startPkt), iso(nowPkt));
const byPlatform = {};
for (const p of posts) byPlatform[p.platform] = (byPlatform[p.platform] || 0) + (p.status === 'failed' ? 0 : 1);
const failedPosts = posts.filter((p) => p.status === 'failed').length;

// missed: expected daily baseline × period days − actual YouTube Shorts published
const periodDays = MODE === 'daily' ? 1 : MODE === 'weekly' ? 7 : 30;
const shortsToday = posts.filter((p) => p.platform === 'YouTube' && p.status !== 'failed').length;
const exp = expectedPerDay();
const missed = Math.max(0, exp.youtube * periodDays - shortsToday);
const failures = MODE === 'daily' ? failedRunsToday() : [];

// ---------------------------------------------------------------------------
// 3. Persist daily snapshot (needed for tomorrow's deltas)
// ---------------------------------------------------------------------------
const snapshot = { date: today, stats: cur.stats, videos: cur.videos };
if (delta) snapshot.delta = delta;
fs.writeFileSync(snapshotFile(today), JSON.stringify(snapshot));

// ---------------------------------------------------------------------------
// 4. Build report object + text summary + PDF
// ---------------------------------------------------------------------------
const periodLabel = MODE === 'daily' ? `Daily Report — ${today}`
  : MODE === 'weekly' ? `Weekly Report — last 7 days (to ${today})`
  : `Monthly Report — last 30 days (to ${today})`;

const report = {
  title: periodLabel,
  period: MODE === 'daily' ? today : `${iso(startPkt).slice(0, 10)} → ${today}`,
  now: cur.stats, delta, gained,
  posts: { published: posts.filter((p) => p.status !== 'failed').length, missed, byPlatform },
  failures, topVideos,
  postList: MODE === 'daily' ? posts : []
};

const t = [];
t.push(`📊 *Quote Quarry ${MODE} report* (${report.period})`);
t.push(`👥 Subs: *${fmt(cur.stats.subscribers)}* ${delta ? `(${sign(delta.subscribers)})` : ''}`);
t.push(`👁 Total views: *${fmt(cur.stats.totalViews)}* ${delta ? `(${sign(delta.totalViews)})` : ''}`);
t.push(`❤️ Likes +${fmt(gained.likes)} | 💬 Comments +${fmt(gained.comments)}`);
t.push(`📤 Published: *${report.posts.published}* | Missed: *${report.posts.missed}*${failures.length ? ` | ⚠️ Failed runs: ${failures.length}` : ''}`);
if (topVideos.length) {
  t.push(`🏆 Top: ${topVideos[0].title.slice(0, 45)} (+${fmt(topVideos[0].viewsGained)} views)`);
}
const textSummary = t.join('\n');

const pdfName = `reports/quarry-${MODE}-${today}.pdf`;
await buildPdf(report, pdfName);
console.log(`PDF saved: ${pdfName} (${Math.round(fs.statSync(pdfName).size / 1024)} KB)`);

// ---------------------------------------------------------------------------
// 5. Deliver
// ---------------------------------------------------------------------------
if (process.env.REPORT_SEND !== 'false') {
  let sent = false;
  if (await sendTelegramDocument(pdfName, textSummary.replace(/\*/g, ''))) sent = true;
  else {
    const url = await hostFile(pdfName, `quarry-${MODE}-${today}.pdf`);
    if (url) {
      if (await sendWhatsAppDocument(url, `quarry-${MODE}-${today}.pdf`)) sent = true;
      const linkMsg = await sendWhatsAppText(`${textSummary}\n\n📄 Full PDF: ${url}`);
      sent = sent || linkMsg;
    } else {
      sent = await sendWhatsAppText(textSummary);
    }
  }
  if (!sent) console.log('DRY-RUN: no WhatsApp/Telegram configured. Summary:\n' + textSummary);
} else {
  console.log('REPORT_SEND=false — summary:\n' + textSummary);
}
console.log('Done.');
