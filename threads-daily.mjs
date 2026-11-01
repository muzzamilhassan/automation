// Threads daily (09-20): Threads posting died silently on Sep 15 when the old
// content-machine workflow was deleted and nobody called threads-publisher
// anymore. This posts ONE reel per day per Threads destination, from that
// channel's FB/IG outbox. Runs inside ig-slot-poster (3x/day schedule; the
// date-guard makes it post once per day per channel, first slot after content
// exists).
// #106 T4c: the fb-outbox/quotequarry + @quotequarry8 hardcode is retired —
// the flow iterates the registry channels that carry a threadsHandle
// (destinations.threadsHandle, seeded/edited in Studio; today that is exactly
// quotequarry, so its behavior is byte-identical). --slug <slug> pins one
// channel for local runs. State nests per channel under st.threads[<slug>];
// the legacy single-account top-level shape carries over so the once/day
// guard survives the flip unchanged. Main is IS_MAIN-guarded (the
// daily-excel-report.mjs house pattern) so tests can import the helpers.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadAllStates, saveChannelState } from './lib/state.mjs';
import { activeRegistryChannels, loadRegistryChannels } from './lib/registry-slugs.mjs';
import { destinationsFor, normHandle } from './lib/registry.mjs';

const TOKEN_PATH = 'threads-oauth-tokens.json';

export function parseArgs(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--slug');
  return { slug: i >= 0 ? (argv[i + 1] || null) : null, dry: argv.includes('--dry') };
}

// Registry channels with a Threads destination — the targets this lane posts
// for. A channel without a threadsHandle is simply not a Threads target (it
// gets its FB/IG lanes elsewhere); with --slug, a slug without one is a loud
// skip, not a silent no-op.
export function threadsTargets(entries) {
  return (entries || [])
    .map((c) => ({
      slug: c.slug,
      label: c.label || c.slug,
      threadsHandle: normHandle(destinationsFor(c.slug)?.threadsHandle),
    }))
    .filter((t) => t.threadsHandle);
}

// Newest fresh titled reel in a channel's outbox dir (null = nothing to post).
// Stale cache files without meta are skipped; posted files drop out.
export function pickThreadReel(dir, posted = []) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.mp4')).sort() : [];
  for (const f of [...files].reverse()) {
    if (posted.includes(f)) continue;
    let m = {};
    try { m = JSON.parse(fs.readFileSync(path.join(dir, f.replace(/\.mp4$/, '.json')), 'utf8')); } catch { }
    if (!m.title) continue;
    return { file: f, meta: m };
  }
  return null;
}

// Per-channel date-guard state. Legacy shape (top-level lastPostDate/
// postedFiles) belonged to the only seeded Threads destination — carry it over
// so the once/day guard survives the parameterization unchanged.
export function threadsChannelState(tstate, slug) {
  if (tstate[slug]) return tstate[slug];
  if (tstate.lastPostDate || tstate.postedFiles) {
    return { lastPostDate: tstate.lastPostDate, postedFiles: tstate.postedFiles };
  }
  return {};
}

// The first per-channel write drops the legacy top-level keys — the nested
// shape is canonical from then on.
export function nextThreadsState(tstate, slug, next) {
  const out = { ...tstate };
  delete out.lastPostDate;
  delete out.postedFiles;
  out[slug] = next;
  return out;
}

// The daily pass over the Threads targets. Round 1 fix: state ACCUMULATES
// across targets (tstate = nextThreadsState(...) inside the loop) and every
// write persists the accumulator — writing from a once-loaded snapshot let
// target B erase target A's nested state (guard + postedFiles), re-picking
// A's reel for a duplicate daily post; it also leaked the legacy top-level
// shape to any un-nested slug. Accumulating kills both. saveState/publish are
// injectable seams (the daily-excel-report house pattern) so tests can drive
// the real loop; main() wires them to saveChannelState / threads-publisher.
export async function runThreadsDaily({
  targets,
  today,
  tstate = {},
  dry = false,
  outboxRoot = 'fb-outbox',
  saveState = () => { },
  publish,
}) {
  let state = tstate;
  let failed = false;

  for (const t of targets) {
    const chState = threadsChannelState(state, t.slug);
    if (chState.lastPostDate === today && !dry) {
      console.log(`[threads] ${t.slug}: already posted today — skip`);
      continue;
    }
    const dir = path.join(outboxRoot, t.slug);
    const pick = pickThreadReel(dir, chState.postedFiles || []);
    if (!pick) {
      console.log(`[threads] ${t.slug}: no fresh titled reel in ${dir} — skip`);
      continue;
    }
    const { file: pickFile, meta } = pick;
    const hashtags = (meta.tags || []).slice(0, 3).map(t2 => '#' + String(t2).replace(/\s+/g, '')).join(' ');
    const text = [meta.title || 'Daily wisdom', meta.description || '', hashtags].filter(Boolean).join('\n\n').slice(0, 460);

    console.log(`[threads] ${t.slug} pick: ${pickFile} | caption: ${JSON.stringify(text.slice(0, 80))}...`);
    if (dry) { console.log('[threads] dry run — not posting'); continue; }

    const videoBuffer = fs.readFileSync(path.join(dir, pickFile));
    const res = await publish({ videoBuffer, text });
    if (res) {
      state = nextThreadsState(state, t.slug, {
        lastPostDate: today,
        postedFiles: [...(chState.postedFiles || []), pickFile].slice(-60),
      });
      saveState(state);
      console.log(`[threads] ${t.slug} posted ✓`);
    } else {
      console.log(`[threads] ${t.slug}: publish returned null — see log above`);
      failed = true; // this channel fails the step; other targets still get their turn
    }
  }
  return { state, failed };
}

async function main() {
  const { slug: onlySlug, dry: DRY } = parseArgs();
  const today = new Date().toISOString().slice(0, 10);

  // CI: materialize the token from the secret (local dev already has the file)
  if (process.env.THREADS_TOKEN_JSON && !fs.existsSync(TOKEN_PATH)) {
    fs.writeFileSync(TOKEN_PATH, process.env.THREADS_TOKEN_JSON);
  }

  let targets = threadsTargets(activeRegistryChannels(loadRegistryChannels()));
  if (onlySlug) targets = targets.filter((t) => t.slug === onlySlug);
  if (!targets.length) {
    console.log(onlySlug
      ? `[threads] ${onlySlug}: ✗ no Threads destination (destinations.threadsHandle) in the registry — skip`
      : '[threads] no Threads destination in the registry — skip');
    process.exit(0);
  }

  const st = loadAllStates();
  const { failed } = await runThreadsDaily({
    targets,
    today,
    dry: DRY,
    tstate: st.threads || {},
    saveState: (s) => saveChannelState('threads', s),
    publish: async ({ videoBuffer, text }) => {
      const { publishToThreads } = await import('./threads-publisher.mjs');
      return publishToThreads({ videoBuffer, text });
    },
  });
  if (failed) process.exit(1);
}

const IS_MAIN = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  main().then(function () { }, function (e) {
    console.error('[threads] Error: ' + e.message);
    process.exit(1);
  });
}
