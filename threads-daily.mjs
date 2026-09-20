// Threads daily (09-20): Threads posting died silently on Sep 15 when the old
// content-machine workflow was deleted and nobody called threads-publisher
// anymore. This posts ONE Quote Quarry reel per day to Threads (@quotequarry8)
// from the FB/IG outbox. Runs inside ig-slot-poster (3x/day schedule; the
// date-guard makes it post once per day, first slot after content exists).
import fs from 'node:fs';
import { loadAllStates, saveChannelState } from './lib/state.mjs';

const TOKEN_PATH = 'threads-oauth-tokens.json';
const DRY = process.argv.includes('--dry');
const today = new Date().toISOString().slice(0, 10);

// CI: materialize the token from the secret (local dev already has the file)
if (process.env.THREADS_TOKEN_JSON && !fs.existsSync(TOKEN_PATH)) {
  fs.writeFileSync(TOKEN_PATH, process.env.THREADS_TOKEN_JSON);
}

const st = loadAllStates();
const tstate = st.threads || {};
if (tstate.lastPostDate === today && !DRY) {
  console.log('[threads] already posted today — skip');
  process.exit(0);
}

const dir = 'fb-outbox/quotequarry';
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.mp4')).sort() : [];
if (!files.length) {
  console.log('[threads] no Quote Quarry reel in the outbox — skip');
  process.exit(0);
}
// newest reel wins; skip files already posted in earlier days if any remain
const posted = tstate.postedFiles || [];
const fresh = files.filter(f => !posted.includes(f));
const pick = (fresh.length ? fresh : files)[files.includes(fresh[0]) ? files.indexOf(fresh[0]) : files.length - 1];
const stamp = pick.replace(/\.mp4$/, '');
let meta = {};
try { meta = JSON.parse(fs.readFileSync(`${dir}/${stamp}.json`, 'utf8')); } catch { }
const hashtags = (meta.tags || []).slice(0, 3).map(t => '#' + String(t).replace(/\s+/g, '')).join(' ');
const text = [meta.title || 'Daily wisdom', meta.description || '', hashtags].filter(Boolean).join('\n\n').slice(0, 460);

console.log(`[threads] pick: ${pick} | caption: ${JSON.stringify(text.slice(0, 80))}...`);
if (DRY) { console.log('[threads] dry run — not posting'); process.exit(0); }

const { publishToThreads } = await import('./threads-publisher.mjs');
const videoBuffer = fs.readFileSync(`${dir}/${pick}`);
const res = await publishToThreads({ videoBuffer, text });
if (res) {
  saveChannelState('threads', {
    ...tstate,
    lastPostDate: today,
    postedFiles: [...posted, pick].slice(-60)
  });
  console.log('[threads] posted ✓');
} else {
  console.log('[threads] publish returned null — see log above');
  process.exit(1);
}
