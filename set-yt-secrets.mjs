// After onboarding channels, push each token to GitHub Actions secrets so the
// cloud pipeline can publish per channel. Uses gh CLI + GITHUB_PAT from .env.
//
// Usage: node set-yt-secrets.mjs [slug ...]   (no args = all tokenized channels)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const envStr = fs.readFileSync('.env', 'utf8');
const GH_TOKEN = envStr.match(/^GITHUB_PAT=(.+)$/m)?.[1]?.trim();
const REPO = 'muzzamilhassan/automation';

const dirs = fs.readdirSync('yt-mcp/channels').filter(d => fs.existsSync(path.join('yt-mcp/channels', d, 'token.json')));
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : dirs;

for (const slug of wanted) {
  if (!dirs.includes(slug)) { console.log(`⚠ ${slug}: no token yet, skipping`); continue; }
  const secretName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
  const body = fs.readFileSync(path.join('yt-mcp/channels', slug, 'token.json'), 'utf8');
  execSync(`gh secret set ${secretName} --repo ${REPO}`, {
    input: body,
    env: { ...process.env, GH_TOKEN },
    stdio: ['pipe', 'inherit', 'inherit']
  });
  console.log(`✓ ${secretName} set on ${REPO}`);
}
