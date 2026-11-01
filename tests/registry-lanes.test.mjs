// #106 Phase 4.5 T4b — the crossposting + reporting lanes were hardcoded to
// the legacy 4 channels: fb-now / ig-slot-poster / daily-sweeper each carried
// 4 per-slug outbox cache steps, reporting-daily pinned 4 YT_TOKEN_* secrets,
// and every new registry channel was invisible to all of them.
//
// SOURCE-SCAN + YAML pins — the house pattern for workflow integrity
// (tests/studio-action-route.test.mjs, tests/autopilot-discovery.test.mjs):
// these files are data for the Actions runner, so the pin asserts the
// registry-driven SHAPE (discover job → fromJSON matrix → per-slug steps)
// and the ABSENCE of any legacy slug literal outside comments. A comment may
// name a workflow; the executed YAML/`run:` payload may not name a slug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as yaml from 'js-yaml';

const LANES = {
  'fb-now.yml': { job: 'run' },
  'ig-slot-poster.yml': { job: 'post' },
  'daily-sweeper.yml': { job: 'handoff' },
  'reporting-daily.yml': { job: 'report' },
};

const LEGACY_SLUGS = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'];

// Strip full-line YAML comments so explanatory prose cannot satisfy (or trip)
// the no-hardcode scan; executed payload (keys, run scripts, env) stays in.
// The house bot commit identity (bot@quotequarry.local, used by every
// workflow's state-commit step) is not a channel reference — neutralize it.
function payload(file) {
  return fs
    .readFileSync(`.github/workflows/${file}`, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n')
    .replaceAll('bot@quotequarry.local', '<house-bot-identity>');
}

function doc(file) {
  return yaml.load(fs.readFileSync(`.github/workflows/${file}`, 'utf8'));
}

for (const [file] of Object.entries(LANES)) {
  test(`T4b ${file}: a discover job reads yt-mcp/studio-channels.json and exposes the matrix output`, () => {
    const src = payload(file);
    assert.ok(src.includes('yt-mcp/studio-channels.json'), 'discover must read the studio registry');
    assert.ok(/active !== false/.test(src), 'discover must keep every active registry channel (active !== false)');
    assert.ok(/filter\(c => c\.slug && c\.active !== false\)/.test(src), 'the filter must drop malformed entries (c.slug && — parity with lib/registry-slugs.mjs)');
    const d = doc(file);
    assert.ok(d.jobs.discover, 'a discover job must exist');
    assert.ok(d.jobs.discover.outputs && d.jobs.discover.outputs.channels, 'discover must expose channels');
    assert.ok(d.jobs.discover.steps.some((s) => s.run && s.run.includes('GITHUB_OUTPUT')), 'discover writes via GITHUB_OUTPUT');
  });

  test(`T4b ${file}: an unreadable registry fails LOUDLY (::error annotation — never a silent green zero-job run)`, () => {
    const src = payload(file);
    assert.match(
      src,
      /::error::registry unreadable \(no channel selected\): /,
      'a corrupted registry sync must be indistinguishable from a failure, not from a quiet day',
    );
  });

  test(`T4b ${file}: the lane job matrices over fromJSON(needs.discover.outputs.channels)`, () => {
    const src = payload(file);
    assert.match(
      src,
      /fromJSON\(needs\.discover\.outputs\.channels\)/,
      'the lane must be driven by the discover output, not a literal list',
    );
    const d = doc(file);
    const matrixJob = Object.entries(d.jobs).find(([, j]) => j.strategy && j.strategy.matrix);
    assert.ok(matrixJob, 'a matrix job must exist');
    assert.equal(
      matrixJob[1].strategy.matrix['slug'],
      '${{ fromJSON(needs.discover.outputs.channels) }}',
      'the matrix axis must be the registry-derived slug list',
    );
  });

  test(`T4b ${file}: no legacy channel slug survives outside comments (the hardcode is gone)`, () => {
    const src = payload(file);
    const hits = LEGACY_SLUGS.filter((s) => src.includes(s));
    assert.deepEqual(hits, [], `legacy slugs still hardcoded in ${file}: ${hits.join(', ')}`);
  });
}

test('T4b fb-now.yml: ONE generic cache restore keyed by the matrix slug — and no save step (drains never re-save, #63)', () => {
  const src = payload('fb-now.yml');
  assert.match(src, /path: fb-outbox\/\$\{\{ matrix\.slug\.slug \}\}/, 'restore path must come from the matrix');
  assert.match(src, /restore-keys: ig-outbox-\$\{\{ matrix\.slug\.slug \}\}-/, 'restore-keys chain must stay per-slug');
  assert.equal(src.includes('actions/cache/save'), false, 'fb-now restores only — a drain re-save would resurrect posted reels (#63)');
  assert.ok(src.includes('node fb-crosspost.mjs'), 'the drain script must run unfiltered (it scans only the restored slug dir)');
  assert.match(src, /node fb-images\.mjs "\$SLUG"/, 'posters must target this job\'s slug only (fb-images.mjs [slug])');
});

test('T4b ig-slot-poster.yml: ONE generic cache restore keyed by the matrix slug, --one posts only what this job restored', () => {
  const src = payload('ig-slot-poster.yml');
  assert.match(src, /path: fb-outbox\/\$\{\{ matrix\.slug\.slug \}\}/, 'restore path must come from the matrix');
  assert.match(src, /restore-keys: ig-outbox-\$\{\{ matrix\.slug\.slug \}\}-/, 'restore-keys chain must stay per-slug');
  assert.ok(src.includes('node ig-crosspost.mjs --one'), 'the slot poster must keep its one-reel-per-run behavior');
  assert.equal(src.includes('actions/cache/save'), false, 'ig-slot-poster restores only — same #63 reasoning as fb-now');
});

test('T4b fb-now.yml + ig-slot-poster.yml: same-slug drain jobs still serialize across BOTH workflows (#63 resurrect guard)', () => {
  // The old design shared ONE workflow-level `outbox-drain` group; the matrix
  // replaces it with a job-level group keyed by slug ONLY (no workflow
  // dimension) so fb-now's quotequarry job and ig-slot-poster's quotequarry
  // job can never restore+save the same cache chain concurrently.
  for (const file of ['fb-now.yml', 'ig-slot-poster.yml']) {
    const d = doc(file);
    const job = d.jobs[LANES[file].job];
    assert.equal(job.concurrency.group, 'crosspost-${{ matrix.slug.slug }}', `${file} drain group must be per-slug and workflow-agnostic`);
    assert.equal(job.concurrency['cancel-in-progress'], false);
  }
});

test('T4b fb-now.yml + ig-slot-poster.yml: matrix legs rebase before pushing state (2+ legs with changes = all-but-first lose the push)', () => {
  // The commit steps kept single-job-era bodies while the jobs became a
  // matrix: parallel legs committing yt-mcp/state race and every leg but the
  // first loses its push (poster date-guards defeated, IG marks lost). The
  // house pattern is channel-autopilot.yml's pull --rebase --autostash.
  for (const file of ['fb-now.yml', 'ig-slot-poster.yml']) {
    const d = doc(file);
    const commitStep = d.jobs[LANES[file].job].steps.find((s) => (s.name || '').startsWith('💾 Commit'));
    assert.ok(commitStep, `${file} must keep its state-commit step`);
    assert.match(
      commitStep.run,
      /git pull --rebase --autostash origin main \|\| true/,
      `${file} commit step must rebase onto origin before pushing (matrix-safe state commits)`,
    );
    assert.match(commitStep.run, /git push \|\| true/, 'the push must stay fail-soft');
  }
});

test('T4b reporting-daily.yml: discover exits 1 on an unreadable registry (the report lane goes RED, never silently skips)', () => {
  const d = doc('reporting-daily.yml');
  const discoverRun = d.jobs.discover.steps.find((s) => s.id === 'disc' || (s.run || '').includes('GITHUB_OUTPUT'));
  assert.ok(discoverRun, 'discover run step must exist');
  assert.match(discoverRun.run, /process\.exit\(1\)/, 'reporting-daily must fail the discover job — a red run beats an empty report');
});

test('T4b sweeper.mjs: non-legacy channels without a token heal via a channel-autopilot dispatch (deduped per day)', () => {
  // sweeper.mjs self-executes at import (unguarded main), so this is a
  // source-scan pin — the house pattern for scripts the runner owns.
  const src = fs.readFileSync('sweeper.mjs', 'utf8');
  assert.match(src, /healRouteFor/, 'the routing policy must come from lib/registry-slugs.mjs, not an inline slug check');
  assert.match(src, /channel-autopilot\.yml\/dispatches/, 'the heal dispatch must target channel-autopilot.yml (dynamic-secret matrix)');
  assert.match(src, /topup/, 'the dispatch carries a topup input');
  assert.match(src, /heal-dispatches\.json/, 'the per-slug per-day dedupe state must persist (committed with the logs)');
  assert.match(src, /shouldDispatchHealToday/, 'the dedupe decision must be the tested helper');
  assert.match(src, /GITHUB_PAT/, 'the dispatch rides the existing PAT env like the compilation re-dispatch');
});

test('T4b daily-sweeper.yml: the sweep still runs ONCE (node sweeper.mjs) — healing must not multiply by matrix', () => {
  const d = doc('daily-sweeper.yml');
  const sweep = d.jobs.sweep;
  assert.ok(sweep, 'the single sweep job must stay');
  assert.equal(
    sweep.steps.some((s) => s.run && s.run.includes('node sweeper.mjs')),
    true,
    'sweep step unchanged: sweeper.mjs loops the registry itself',
  );
  assert.equal(d.concurrency && d.concurrency.group, 'sweeper', 'the sweeper workflow-level lock stays');
});

test('T4b daily-sweeper.yml: healed outbox reaches IG via a matrix handoff with the SAME per-slug sweep cache keys', () => {
  const src = payload('daily-sweeper.yml');
  const d = doc('daily-sweeper.yml');
  const handoff = d.jobs.handoff;
  assert.ok(handoff, 'a handoff job must exist');
  assert.equal(handoff.strategy.matrix.slug, '${{ fromJSON(needs.discover.outputs.channels) }}');
  const save = handoff.steps.find((s) => (s.uses || '').startsWith('actions/cache/save'));
  assert.ok(save, 'handoff saves the per-slug outbox cache');
  assert.equal(
    save.with.key,
    'ig-outbox-${{ matrix.slug.slug }}-sweep-${{ github.run_id }}',
    'cache key must be byte-identical to the old hardcoded per-slug keys',
  );
  assert.equal(
    save.with.path,
    'fb-outbox/${{ matrix.slug.slug }}',
    'save path must come from the matrix',
  );
  assert.match(src, /hashFiles\(format\('fb-outbox\/\{0\}\/\*\.json\*', matrix\.slug\.slug\)\)/, 'the save condition stays hash-gated per slug');
});

test('T4b reporting-daily.yml: per-channel token rides the channel-autopilot matrix pattern (format + secrets index)', () => {
  const src = payload('reporting-daily.yml');
  assert.match(
    src,
    /secrets\[format\('YT_TOKEN_\{0\}', matrix\.slug\.envSlug\)\]/,
    'the per-channel secret must resolve via the matrix envSlug (the only dynamic-secret pattern that works)',
  );
  assert.match(src, /GITHUB_ENV/, 'the resolved token is exported under its real YT_TOKEN_<ENSSLUG> name');
});

test('T4b reporting-daily.yml: report jobs fetch per channel (--channel), the collect job merges fragments (--collect)', () => {
  const src = payload('reporting-daily.yml');
  assert.match(src, /node daily-excel-report\.mjs --channel "\$SLUG"/, 'each matrix job fetches only its channel');
  assert.match(src, /node daily-excel-report\.mjs daily --collect/, 'collect merges the fragments into the daily payload');
  assert.match(src, /pattern: report-fragment-\*/, 'collect downloads every channel fragment artifact');
  const d = doc('reporting-daily.yml');
  assert.equal(d.concurrency.group, 'reporting', 'the reporting workflow-level lock stays');
  const collect = d.jobs.collect;
  assert.ok(collect, 'a collect job must exist');
  assert.ok(collect.needs.includes('report'), 'collect waits for the per-channel report jobs');
});
