// ONE-COMMAND onboarding for all 15 channels:
// consents -> branding push -> MCP entries -> CI secrets -> smoke tests.
// Run: node onboard-all.mjs   (or double-click onboard-all.bat)
// Re-run anytime — channels with tokens are skipped.
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { BRANDS } from './yt-brands/brands.mjs';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const has = (s) => fs.existsSync(`yt-mcp/channels/${s}/token.json`);

console.log('\n=== 15-CHANNEL ONBOARDING WIZARD ===');
console.log('For each brand: a browser opens the Google consent page.');
console.log('>>> PICK THE DUMMY CHANNEL you want for that brand, then click Continue/Allow. <<<');
console.log('Picked the wrong one? Just re-run: node add-yt-channel.mjs <slug>\n');

const pending = BRANDS.filter(b => !has(b.slug));
if (pending.length < BRANDS.length) console.log(`${BRANDS.length - pending.length}/${BRANDS.length} already authorized — skipping those.\n`);

let i = BRANDS.length - pending.length;
for (const b of pending) {
  i++;
  await rl.question(`[${i}/${BRANDS.length}] Press Enter to authorize ${b.label} — ${b.niche} ...`);
  process.stdout.write('\x07');
  spawnSync('node', ['add-yt-channel.mjs', b.slug], { stdio: 'inherit' });
  if (!has(b.slug)) console.log(`⚠ ${b.slug} NOT authorized — rerun later with: node add-yt-channel.mjs ${b.slug}`);
}

const done = BRANDS.filter(b => has(b.slug));
console.log(`\n${done.length}/${BRANDS.length} authorized. Now pushing everything to the channels...\n`);

if (done.length) {
  console.log('--- 1/4 Branding (description, keywords, country, banner) ---');
  spawnSync('node', ['brand-channels.mjs', '--apply'], { stdio: 'inherit' });
  console.log('\n--- 2/4 MCP server entries (.mcp.json) ---');
  spawnSync('node', ['wire-mcp-entries.mjs'], { stdio: 'inherit' });
  console.log('\n--- 3/4 GitHub Actions secrets ---');
  spawnSync('node', ['set-yt-secrets.mjs', ...done.map(b => b.slug)], { stdio: 'inherit' });
  console.log('\n--- 4/4 Smoke tests ---');
  for (const b of done) spawnSync('node', ['yt-mcp/smoke-test.mjs', `yt-mcp/channels/${b.slug}/token.json`], { stdio: 'inherit' });
}

console.log('\n=== ALL DONE ===');
console.log('1) RESTART ZCode — the yt-<slug> MCP servers (74 tools each) load on startup.');
console.log('2) Per channel in YouTube Studio (~2 min): rename channel to the brand name, set the @handle, upload the avatar from yt-brands/avatars/<slug>.jpg.');
console.log('3) Upload scaling: activate 3-4 channels/week at 1 Short/day (quota), see yt-brands/ONBOARDING.md.');
rl.close();
