// One-off: upload the 3 style-test reels to INVESTOR'S COMPASS (Silent Wealth YT).
// 2 old-style (brand quote reels) + 1 new-style (money psychology). Public, immediate.
import fs from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { google } from 'googleapis';

const ROOT = path.normalize(import.meta.dirname); // this script lives at the repo root
const envRaw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

const { bySlug } = await import(pathToFileURL(path.join(ROOT, 'yt-brands', 'brands.mjs')).href);
const slug = 'investors-compass';
const b = bySlug[slug];
if (!b) { console.error('unknown slug'); process.exit(1); }

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) { console.error('missing OAuth client'); process.exit(1); }

const tokenFile = path.join(ROOT, 'yt-mcp', 'channels', slug, 'token.json');
// Prefer the fresh root OAuth tokens (refreshed 09-11); verify it controls the IC channel.
const fresh = JSON.parse(fs.readFileSync(path.join(ROOT, 'youtube-oauth-tokens.json'), 'utf8'));
const stale = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
auth.setCredentials({ refresh_token: fresh.refresh_token || fresh.refreshToken });
const yt = google.youtube({ version: 'v3', auth });

const mine = await yt.channels.list({ part: ['snippet'], mine: true });
const myChannel = mine.data.items?.[0];
const target = await yt.channels.list({ part: ['snippet'], forHandle: b.handle.replace(/^@/, '') });
const targetId = target.data.items?.[0]?.id;
console.log(`oauth tokens control: "${myChannel?.snippet?.title}" (${myChannel?.id})`);
console.log(`target channel:      "${b.label}" (${targetId})`);
if (!myChannel || myChannel.id !== targetId) {
  console.error('TOKEN/CHANNEL MISMATCH — not uploading. Re-auth this channel.');
  process.exit(2);
}

const UPLOADS = [
  {
    file: 'old-style-sw-1.mp4',
    title: 'Time Is More Valuable Than Money #money #wealth #success',
    description: 'Old money rule #1: time beats money.\n\nFollow Silent Wealth for daily money psychology.\n\n#money #wealth #success #oldmoney #financialfreedom',
  },
  {
    file: path.join('explainer', 'out', 'reels', 'money.mp4'),
    title: 'Why The Rich Never Look Rich #money #wealth #oldmoney',
    description: '3 habits the rich share — and the stat that proves income is not wealth.\n\nFollow Silent Wealth for daily money psychology.\n\n#money #wealth #oldmoney #richhabits #financialfreedom',
  },
  {
    file: 'old-style-sw-2.mp4',
    title: "Wealth Is What You Don't Show #oldmoney #wealth #mindset",
    description: 'Old money stays quiet. New money stays loud.\n\nFollow Silent Wealth for daily money psychology.\n\n#oldmoney #wealth #mindset #money #discipline',
  },
];

for (const u of UPLOADS) {
  const filePath = path.isAbsolute(u.file) ? u.file : path.join(ROOT, u.file);
  if (!fs.existsSync(filePath)) { console.error(`MISSING: ${filePath}`); process.exit(1); }
  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: u.title, description: u.description, categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    },
    media: { body: createReadStream(filePath) },
  });
  console.log(`✓ ${res.data.id} — ${u.title} (${(fs.statSync(filePath).size / 1048576).toFixed(1)}MB)`);
}
console.log('ALL UPLOADED');
