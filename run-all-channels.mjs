// Quarry Local Pipeline — TOPUP HELPER ONLY (manual / PC-on use).
// CI channel workflows are the production master. This script must NOT be the
// first producer of the day: it starts with a git pull so the state guard sees
// what CI already produced, and it never uses --force unless you pass it.
// Usage: node run-all-channels.mjs [--force] [--no-episode]
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';

const envRaw = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

// sync state from origin first — without this the stale state file caused
// double production (CI produced the same slots again)
try {
  console.log('▶ git pull (sync state from origin)...');
  console.log(execSync('git pull --rebase --autostash', { stdio: 'pipe' }).toString().trim());
} catch (e) { console.log('  git pull failed (offline?) — continuing with local state'); }

const FORCE = process.argv.includes('--force');
const NO_EPISODE = process.argv.includes('--no-episode');
const channels = ['investors-compass', 'money-rulebook', 'debt-free-doctrine'];

console.log('╔══════════════════════════════════════════════╗');
console.log('║  QUARRY STUDIO — All Channels Pipeline       ║');
console.log('║  Started: ' + new Date().toLocaleString() + '  ║');
console.log('╚══════════════════════════════════════════════╝');

let ok = 0, fail = 0;
for (const slug of channels) {
  console.log(`\n▶ ${slug}...`);
  const args = ['yt-daily.mjs', slug];
  if (FORCE) args.push('--force');
  if (NO_EPISODE) args.push('--no-episode');
  const r = spawnSync('node', args, { stdio: 'inherit', timeout: 900000 });
  if (r.status === 0) { ok++; console.log(`  ✓ ${slug} done`); }
  else { fail++; console.log(`  ✗ ${slug} failed (exit ${r.status})`); }
}

// Cross-post all outbox items to FB + IG
console.log('\n▶ Cross-posting to FB + IG...');
for (const script of ['fb-crosspost.mjs', 'ig-crosspost.mjs']) {
  const r = spawnSync('node', [script], { stdio: 'inherit', timeout: 600000 });
  console.log(`  ${script}: ${r.status === 0 ? '✓' : '✗'}`);
}

// Posters
console.log('\n▶ Posting niche posters...');
for (const slug of channels) {
  const r = spawnSync('node', ['fb-images.mjs', slug], { stdio: 'inherit', timeout: 300000 });
  console.log(`  ${slug} poster: ${r.status === 0 ? '✓' : '✗'}`);
}

console.log(`\n══ PIPELINE COMPLETE ══`);
console.log(`  Channels: ${ok} succeeded, ${fail} failed`);
console.log(`  Finished: ${new Date().toLocaleString()}`);
