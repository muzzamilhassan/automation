// Push full branding to every onboarded YouTube channel, one command.
// Matches yt-mcp/channels/<slug>/token.json against yt-brands/brands.mjs.
//
// Dry-run (default):  node brand-channels.mjs
// Apply for real:     node brand-channels.mjs --apply
// One channel only:   node brand-channels.mjs --apply --only investors-compass
//
// Sets: channel description, keywords, country=US, and the 2560x1440 banner.
// NOT settable via API (do these once in YouTube Studio per channel):
//   channel name, @handle, profile picture (use yt-brands/avatars/<slug>.jpg).
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { BRANDS, COUNTRY } from './yt-brands/brands.mjs';

const APPLY = process.argv.includes('--apply');
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

const envStr = fs.readFileSync('.env', 'utf8');
const CLIENT_ID = envStr.match(/^YOUTUBE_CLIENT_ID=(.+)$/m)?.[1]?.trim();
const CLIENT_SECRET = envStr.match(/^YOUTUBE_CLIENT_SECRET=(.+)$/m)?.[1]?.trim();

const channelsDir = 'yt-mcp/channels';
const dirs = fs.readdirSync(channelsDir).filter(d => fs.existsSync(path.join(channelsDir, d, 'token.json')));
if (!dirs.length) { console.log('No channel tokens found in yt-mcp/channels/ — run add-yt-channel.mjs for each channel first.'); process.exit(0); }

let done = 0, skipped = 0;
for (const slug of dirs) {
  if (only && slug !== only) continue;
  const brand = BRANDS.find(b => b.slug === slug);
  if (!brand) { console.log(`⚠ ${slug}: token exists but no brand kit in yt-brands/brands.mjs — skipped`); skipped++; continue; }

  const tokens = JSON.parse(fs.readFileSync(path.join(channelsDir, slug, 'token.json'), 'utf8'));
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  auth.setCredentials({ refresh_token: tokens.refresh_token });

  const yt = google.youtube({ version: 'v3', auth });
  const { data: me } = await yt.channels.list({ part: 'id,snippet,brandingSettings', mine: true });
  const ch = me.items?.[0];
  if (!ch) { console.log(`✗ ${slug}: token could not read a channel (wrong channel authorized?)`); skipped++; continue; }

  if (!APPLY) {
    console.log(`[dry] ${brand.label} → ${ch.snippet.title} (${ch.id})`);
    console.log(`      desc: ${brand.description.slice(0, 70)}...`);
    console.log(`      keywords: ${brand.tags.slice(0, 6).join(', ')}... | country: ${COUNTRY} | banner: yt-brands/banners/${slug}.jpg`);
    done++;
    continue;
  }

  // 1. Upload banner
  const bannerRes = await yt.channelBanners.insert({
    media: { body: fs.createReadStream(`yt-brands/banners/${slug}.jpg`) }
  });
  const bannerUrl = bannerRes.data.url;

  // 2. Apply branding settings
  await yt.channels.update({
    part: 'brandingSettings',
    requestBody: {
      id: ch.id,
      brandingSettings: {
        channel: {
          description: brand.description,
          keywords: brand.tags.join(' '),
          country: COUNTRY
        },
        image: { bannerExternalUrl: bannerUrl }
      }
    }
  });
  console.log(`✓ ${brand.label} branded → ${ch.snippet.title} (${ch.id}) — description, ${brand.tags.length} keywords, country=${COUNTRY}, banner uploaded`);
  done++;
}

console.log(`\n${done} channel(s) ${APPLY ? 'branded' : 'planned'}, ${skipped} skipped.`);
if (!APPLY) console.log('Run with --apply to push for real.');
