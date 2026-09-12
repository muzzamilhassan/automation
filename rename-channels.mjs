// Rename all YouTube channels to their brand names.
// Uses YouTube API channels.update with brandingSettings.
// Works for any channel that has a valid token.
import fs from 'node:fs';
import { google } from 'googleapis';

const envRaw = fs.readFileSync('.env', 'utf8');
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

const brands = JSON.parse(fs.readFileSync('lib/brands.json', 'utf8'));
const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;

const SLUGS = [
  'investors-compass', 'money-rulebook', 'debt-free-doctrine', 'quotequarry',
  'escrow-estate', 'policy-brief', 'old-money-code', 'founders-margin',
  'closing-table', 'corner-office', 'tax-shield', 'ai-observer',
  'deep-work-os', 'longevity-code', 'iron-discipline', 'sleep-architect'
];

let renamed = 0, skipped = 0, failed = 0;

for (const slug of SLUGS) {
  const b = brands[slug];
  const envName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
  const tokenFile = `yt-mcp/channels/${slug}/token.json`;

  const raw = process.env[envName] || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '');
  if (!raw) { console.log(`⚠ ${slug}: no token`); continue; }

  try {
    const t = JSON.parse(raw);
    const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    auth.setCredentials({ refresh_token: t.refresh_token });
    const yt = google.youtube({ version: 'v3', auth });

    const { data: chData } = await yt.channels.list({ part: 'snippet,brandingSettings', mine: true });
    const c = chData.items?.[0];
    if (!c) { console.log(`⚠ ${slug}: no channel`); continue; }
    const current = c.snippet.title;

    if (current === b.label) { console.log(`✓ ${slug}: already named "${b.label}"`); continue; }

    await yt.channels.update({
      part: 'brandingSettings',
      requestBody: {
        id: c.id,
        brandingSettings: { channel: { title: b.label, description: b.description } }
      }
    });
    console.log(`✓ ${slug}: renamed "${current}" → "${b.label}"`);
    renamed++;
  } catch (e) {
    console.log(`✗ ${slug}: ${e.message.slice(0, 80)}`);
    failed++;
  }
  await new Promise(r => setTimeout(r, 800));
}
console.log(`\nDone: ${renamed} renamed, ${failed} failed, ${skipped} skipped`);
