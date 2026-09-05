// Audit branding state of every onboarded channel.
// Usage: node audit-branding.mjs
import fs from 'node:fs';
import { google } from 'googleapis';
import { BRANDS } from './yt-brands/brands.mjs';

const envStr = fs.readFileSync('.env', 'utf8');
const CLIENT_ID = envStr.match(/^YOUTUBE_CLIENT_ID=(.+)$/m)?.[1]?.trim();
const CLIENT_SECRET = envStr.match(/^YOUTUBE_CLIENT_SECRET=(.+)$/m)?.[1]?.trim();

for (const b of BRANDS) {
  const t = JSON.parse(fs.readFileSync(`yt-mcp/channels/${b.slug}/token.json`, 'utf8'));
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  auth.setCredentials({ refresh_token: t.refresh_token });
  const yt = google.youtube({ version: 'v3', auth });
  const { data } = await yt.channels.list({ part: 'id,snippet,brandingSettings,statistics', mine: true });
  const c = data.items?.[0];
  if (!c) { console.log(`✗ ${b.slug}: no channel`); continue; }
  const bs = c.brandingSettings || {};
  console.log(`${b.slug} | "${c.snippet.title}" (want: ${b.label})`);
  console.log(`   desc: ${bs.channel?.description ? '✓ ' + bs.channel.description.length + ' chars' : '✗ MISSING'} | keywords: ${bs.channel?.keywords ? '✓' : '✗'} | country: ${bs.channel?.country || '✗'} | lang: ${bs.channel?.defaultLanguage || '—'} | banner: ${bs.image?.bannerExternalUrl ? '✓' : '✗'} | videos: ${c.statistics.videoCount}`);
}
