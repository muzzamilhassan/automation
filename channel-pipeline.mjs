// Quarry Channel Pipeline — one command = everything for one channel.
// Produces Shorts → YouTube, cross-posts FB Reels, IG Reels, niche posters.
// Adding a new platform later = add one step here. No workflow changes needed.
//
// Usage: node channel-pipeline.mjs <slug> [--no-episode] [--force]
// Each step is independent: if one fails, the rest continue.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const slug = process.argv[2];
const FORCE = process.argv.includes('--force');
const SKIP_EPISODE = process.argv.includes('--no-episode');
// --topup=N: heal/backfill mode (sweeper semantics) — produce the first N slots
// even if today already ran; yt-daily marks the NEXT day done so the morning
// cron can't double-produce the healed reels.
const topupArg = process.argv.find(a => a.startsWith('--topup'));
const TOPUP_N = topupArg ? Math.max(0, Number(topupArg.split('=')[1]) || 0) : 0;
const brands = JSON.parse(fs.readFileSync('lib/brands.json', 'utf8'));
const b = brands[slug];
if (!b) { console.error(`[pipeline] unknown slug: ${slug}`); process.exit(0); }

const today = new Date().toISOString().slice(0, 10);
// 09-20: per-channel state files are the source of truth (lib/state.mjs)
import { loadAllStates } from './lib/state.mjs';
const loadState = () => loadAllStates();

const log = (msg) => console.log(`[${slug}] ${msg}`);
const results = { shorts: false, episode: false, fbReels: false, igReels: false, poster: false };
const errors = [];

function run(script, args = []) {
  log(`▶ ${script} ${args.join(' ')}`);
  try {
    const r = spawnSync('node', [script, ...args], { stdio: 'inherit', timeout: 900000 });
    return r.status === 0;
  } catch (e) { errors.push(`${script}: ${e.message}`); return false; }
}

// ---- Load state ----
const state = loadState();
const shortsDone = state[slug]?.lastRunDate === today;
const episodeDone = state[slug]?.deepdiveDate === today;

// ---- Phase 1: YouTube Shorts (3 per day) ----
if (!shortsDone || FORCE || TOPUP_N > 0) {
  log(`Phase 1 — Producing ${TOPUP_N > 0 ? `topup ${TOPUP_N}/${b.slots.length}` : b.slots.length} Shorts for ${b.label}...`);
  const ok = run('yt-daily.mjs', [slug, '--no-episode', ...(FORCE ? ['--force'] : []), ...(TOPUP_N > 0 ? [`--topup=${TOPUP_N}`] : [])]);
  if (ok) { results.shorts = true; log(`✓ Shorts queued`); }
  else { errors.push('Shorts production failed'); log(`✗ Shorts failed`); }
} else {
  log(`Shorts already produced today — skipping`);
  results.shorts = true;
}

// ---- Phase 1b: Proof-of-publication (09-20) ----
// 09-19 lesson: a dead token printed "✓ Shorts queued / Errors: 0" while
// nothing was uploaded. Verify the claimed uploads REALLY exist on YouTube.
if (results.shorts) {
  if (run('verify-run.mjs', [slug])) log(`✓ Uploads verified on YouTube`);
  else errors.push('Upload verification failed — check ntfy alert');
}

// ---- Phase 2: Facebook Reels (cross-post from outbox) ----
log(`Phase 2 — Cross-posting to Facebook...`);
if (run('fb-crosspost.mjs')) { results.fbReels = true; log(`✓ FB Reels done`); }
else errors.push('FB cross-post failed');

// ---- Phase 3: Instagram Reels ----
// IG has no scheduling API, so posting here meant reels went live whenever the
// run finished. They are now posted by ig-slot-poster.yml 3x/day at fixed slot
// times, pulling the produced reels from the run's saved outbox cache.
log(`Phase 3 — IG reels: handled by ig-slot-poster (3x/day at slot times)`);

// ---- Phase 4: Niche poster to FB page ----
log(`Phase 4 — Posting niche poster...`);
if (run('fb-images.mjs', [slug])) { results.poster = true; log(`✓ Poster done`); }
else errors.push('Poster failed');

// ---- Phase 5: Long-form episode (enable when ready) ----
if (!SKIP_EPISODE && !episodeDone) {
  log(`Phase 5 — Producing daily episode...`);
  const ok = run('yt-deepdive.mjs', [slug, ...(FORCE ? ['--force'] : [])]);
  if (ok) { results.episode = true; log(`✓ Episode done`); }
  else errors.push('Episode failed');
} else if (SKIP_EPISODE) {
  log(`Episode skipped (--no-episode or paused)`);
}

// ---- Summary ----
log(`══ PIPELINE COMPLETE ══`);
log(`  Shorts: ${results.shorts ? '✓' : '✗'}`);
log(`  FB Reels: ${results.fbReels ? '✓' : '✗'}`);
log(`  IG Reels: 📅 via ig-slot-poster (3x/day)`);
log(`  Poster: ${results.poster ? '✓' : '✗'}`);
log(`  Episode: ${results.episode ? '✓' : (SKIP_EPISODE ? '⏸ paused' : '✗')}`);
log(`  Errors: ${errors.length}`);
if (errors.length) errors.forEach(e => log(`    ! ${e}`));

// Always exit 0 — individual failures are logged, not fatal
process.exit(0);
