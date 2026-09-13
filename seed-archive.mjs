// One-time seeder: put the channel's oldest dead Shorts into the GitHub archive
// so the recycler never needs to download from YouTube (CI-safe forever).
// Downloads locally (residential IP — proven working), uploads to Releases.
// Usage: node seed-archive.mjs <slug> [count=15]
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import {
  channelAuth, findRecycleCandidates, downloadFromArchive, downloadVideo, archiveUpload,
} from './yt-recycle.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const envRaw = fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '';
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

const slug = process.argv[2];
const want = Number(process.argv[3] || 15);
if (!slug) { console.error('Usage: node seed-archive.mjs <slug> [count=15]'); process.exit(1); }
const log = (m) => console.log(`[${slug}] ${m}`);

const auth = await channelAuth(slug);
const y = google.youtube({ version: 'v3', auth });
const cands = await findRecycleCandidates(y, { log, limit: 60 });
if (!cands.length) { console.log('nothing to seed'); process.exit(0); }

const tmp = path.join(ROOT, 'fb-outbox', slug);
fs.mkdirSync(tmp, { recursive: true });

let seeded = 0, skipped = 0, failed = 0;
for (const c of cands) {
  if (seeded >= want) break;
  const f = path.join(tmp, `seed-${c.videoId}.mp4`);
  try {
    if (await downloadFromArchive(c.videoId, f, log)) {
      log(`${c.videoId} already in archive — skip`);
      skipped++;
      continue;
    }
    log(`seeding ${c.videoId} "${c.title}" (${c.views} views)...`);
    downloadVideo(c.videoId, f, log);
    await archiveUpload(c.videoId, f, log);
    seeded++;
  } catch (e) {
    failed++;
    log(`✗ ${c.videoId} failed: ${String(e.message).slice(0, 90)}`);
  } finally {
    try { fs.unlinkSync(f); } catch { }
  }
}
log(`done: ${seeded} seeded, ${skipped} already archived, ${failed} failed`);
