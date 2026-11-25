// "Ask the factory" (2026-11-23) — the pipeline half. The panel dispatches
// channel-autopilot.yml with {channel, topic, lane}; the topic reaches the
// lanes ONLY as the env var FACTORY_TOPIC (never interpolated into a shell
// line), only on a manual single-channel dispatch, sanitised by the shared
// studio/lib/factory-plan.mjs before any prompt. Unset = the lanes pick
// their own topic exactly as before (source pins on the unchanged paths).
// House pattern: fs source scans + js-yaml for the workflow (the lanes are
// top-level-await scripts that cannot be imported without a live run).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as yaml from 'js-yaml';

const WF_PATH = '.github/workflows/channel-autopilot.yml';
const wfRaw = fs.readFileSync(WF_PATH, 'utf8');
const wf = yaml.load(wfRaw);
const pipeline = fs.readFileSync('channel-pipeline.mjs', 'utf8');
const daily = fs.readFileSync('yt-daily.mjs', 'utf8');
const deepdive = fs.readFileSync('yt-deepdive.mjs', 'utf8');

const produceSteps = wf.jobs.produce.steps;
const pipelineStep = produceSteps.find((s) => typeof s.run === 'string' && s.run.includes('node channel-pipeline.mjs'));

test('EARS: the workflow declares optional topic + lane dispatch inputs (blank default)', () => {
  const inputs = (wf.on || wf[true]).workflow_dispatch.inputs;
  for (const k of ['channel', 'topup', 'force_doc', 'resume', 'heartbeat', 'topic', 'lane']) assert.ok(inputs[k], `input ${k}`);
  assert.equal(inputs.topic.required, false);
  assert.equal(inputs.topic.default, '');
  assert.match(inputs.topic.description, /160/);
  assert.equal(inputs.lane.required, false);
  assert.equal(inputs.lane.default, '');
});

test('EARS: the topic reaches the pipeline ONLY as env, ONLY on a manual single-channel fresh dispatch WITH a topic', () => {
  const env = pipelineStep.env;
  const gate = "github.event_name == 'workflow_dispatch' && inputs.channel != '' && inputs.heartbeat != '1' && inputs.resume == '' && inputs.topup == '' && inputs.topic != ''";
  assert.equal(env.FACTORY_TOPIC, `\${{ (${gate}) && inputs.topic || '' }}`);
  assert.equal(env.FACTORY_LANE, `\${{ (${gate}) && inputs.lane || '' }}`);
});

test('EARS: the topic is never interpolated into any shell line of the workflow', () => {
  for (const job of Object.values(wf.jobs)) {
    for (const s of job.steps || []) {
      if (typeof s.run === 'string') assert.doesNotMatch(s.run, /inputs\.topic|FACTORY_TOPIC/, `step "${s.name}" must not put the topic in a shell line`);
    }
  }
});

test('EARS: the factory NEVER adds the general --force — the run line is byte-identical to before', () => {
  assert.equal(
    pipelineStep.run.split('  #')[0].trim(),
    `node channel-pipeline.mjs "$SLUG" \${{ inputs.topup && format('--topup={0}', inputs.topup) || '' }} \${{ inputs.force_doc == '1' && '--force' || '' }} \${{ inputs.resume && format('--resume {0}', inputs.resume) || '' }}`,
  );
  for (const job of Object.values(wf.jobs)) {
    for (const st of job.steps || []) if (typeof st.run === 'string') assert.doesNotMatch(st.run, /inputs\.lane/, `step "${st.name}"`);
  }
  // run-name (the panel's busy check keys on "<slug> · <event>") is untouched
  assert.match(wfRaw, /^run-name: "\$\{\{ inputs\.channel \|\| \(\(inputs\.heartbeat == '1' \|\| github\.event_name == 'schedule'\) && 'heartbeat'\) \|\| 'all channels' \}\} · \$\{\{ github\.event_name \}\}"$/m);
});

test('EARS: a factory documentary run skips the Shorts phase (no re-made / re-uploaded Shorts) and runs the doc lane', () => {
  assert.match(pipeline, /let DOC_ONLY_RUN = process\.env\.FACTORY_LANE === 'doc' && Boolean\(process\.env\.FACTORY_TOPIC\);/);
  // the Shorts phase: the doc-only branch comes FIRST, before clips / generated production
  assert.match(pipeline, /if \(DOC_ONLY_RUN\) \{\n\s+log\([^\n]*Shorts phase skipped[^\n]*\);\n\s+await jobCtl\?\.finishStep\(SHORTS_STEP, 'skipped', [^\n]*\);\n\s+results\.nothingDue = true;[^\n]*\n\} else if \(shortsSource === 'clips'\) \{\n\s+await runClipsPhase1\(\);/);
  // the review hold does not post a clip on a doc-only run either
  assert.match(pipeline, /if \(!DOC_ONLY_RUN && shortsSource === 'clips' && \['no_approved_script', 'awaiting_review', 'rejected'\]\.includes\(gate\.reason\)\) \{/);
  // the doc child is NEVER handed --force by the factory: FORCE stays the argv flag only
  assert.match(pipeline, /^const FORCE = process\.argv\.includes\('--force'\);$/m);
  assert.doesNotMatch(pipeline, /FACTORY[^\n]*'--force'|DOC_ONLY_RUN[^\n]*'--force'/);
});

test('EARS: a gated generated channel with a factory documentary saves the DOC script for review (not a Shorts script)', () => {
  assert.match(pipeline, /if \(generateOnly && shortsSource !== 'clips' && !DOC_ONLY_RUN\) \{\n\s+log\(`\[review\] no approved script for slot/);
  assert.match(pipeline, /\} else if \(generateOnly\) \{\n\s+log\(`\[review\] no approved doc script — generate-only run on the DOC lane/);
  // the approval's resume run renders that doc through yt-deepdive — never as a Short through yt-daily
  assert.match(pipeline, /if \(gate\.script\?\.kind === 'doc' && shortsSource !== 'clips'\) \{\n\s+DOC_ONLY_RUN = true;/);
});

test('EARS: yt-deepdive takes a factory topic off the doc-day cadence but keeps the already-shipped-today guard', () => {
  assert.match(deepdive, /if \(!isDocDue\(b, lastLongDate\(state\[slug\]\)\) && !FORCE && !GENERATE_ONLY && !FACTORY_DOC_TOPIC\) \{/);
  assert.match(deepdive, /const catchingUp = !FORCE && !GENERATE_ONLY && !FACTORY_DOC_TOPIC && !isDocDay\(b\);/);
  assert.match(deepdive, /if \(state\[slug\]\?\.deepdiveDate === today\(\) && !FORCE\) \{/);
});

test('EARS: the clips warning reads the pipeline own shortsSource (cadence-derived), after it is defined', () => {
  const def = pipeline.indexOf("const shortsSource = b.shortsSource || 'generated';");
  const warn = pipeline.indexOf('Shorts are clips of its documentary — a Shorts-lane topic is not used');
  assert.ok(def > 0 && warn > def, 'warning after the shortsSource definition');
  assert.match(pipeline, /if \(process\.env\.FACTORY_LANE === 'short' && process\.env\.FACTORY_TOPIC && shortsSource === 'clips'\) \{/);
});

test('EARS: factory seeds never enter the trend-seed rotation (usedTrendSeeds)', () => {
  const saves = [...daily.matchAll(/usedTrendSeeds: \[\.\.\.usedSeeds, \.\.\.themesToday\.map\(t => t\.seed\)([^\]]*)\]\.slice\(-40\)/g)];
  assert.equal(saves.length, 2);
  for (const m of saves) assert.equal(m[1], ".filter((sd) => !String(sd).startsWith('factory:'))");
});

test('EARS: unset = unchanged — the pipeline touches the factory module only when a factory env is present', () => {
  assert.doesNotMatch(pipeline, /^import .*factory-plan/m, 'no static import');
  assert.match(pipeline, /if \(process\.env\.FACTORY_TOPIC \|\| process\.env\.FACTORY_LANE\) \{\n\s+const \{ factoryTopicFor, normalizeLane \} = await import\('\.\/studio\/lib\/factory-plan\.mjs'\);/);
  // the sanitised value replaces the raw env before ANY child is spawned
  const block = pipeline.indexOf('FACTORY_TOPIC || process.env.FACTORY_LANE');
  assert.ok(block > 0 && block < pipeline.indexOf("run('yt-daily.mjs'"), 'factory block runs before the first child');
  assert.match(pipeline, /process\.env\.FACTORY_TOPIC = topic;/);
  assert.match(pipeline, /delete process\.env\.FACTORY_TOPIC;/);
});

test('EARS: unset = unchanged — yt-daily still researches topics; the desk/research loops start where the factory slot left off', () => {
  assert.doesNotMatch(daily, /^import .*factory-plan/m, 'no static import');
  assert.match(daily, /const FACTORY_SHORT_TOPIC = process\.env\.FACTORY_TOPIC\s+\? \(await import\('\.\/studio\/lib\/factory-plan\.mjs'\)\)\.factoryTopicFor\('short', process\.env\)\s+: null;/);
  // research call is untouched
  assert.match(daily, /page\.trend = await researchTrend\(slug, channelAuth\(slug\), \[\.\.\.b\.niches, \.\.\.b\.tags\.slice\(0, 2\)\]\);/);
  // the factory topic takes slot 1 (themesToday is empty when unset -> loop start 0 = old behaviour)
  assert.match(daily, /const themesToday = \[\];\n[\s\S]{0,600}if \(FACTORY_SHORT_TOPIC\) \{[\s\S]{0,400}themesToday\.push\(\{ seed: `factory:\$\{FACTORY_SHORT_TOPIC\.slice\(0, 40\)\}`/);
  assert.match(daily, /for \(let k = themesToday\.length; k < b\.slots\.length && deskQueue\.length; k\+\+\) \{/);
  assert.match(daily, /for \(let k = themesToday\.length; k < b\.slots\.length; k\+\+\) \{/);
  // topic station: same success rule as before
  assert.match(daily, /if \(themesToday\.length\) await station\('topic', 'succeeded'\);\n\s+else await station\('topic', 'failed', 'trend research failed — no topic today'\);/);
});

test('EARS: unset = unchanged — yt-deepdive researches the theme exactly as before; a factory topic replaces only the pick', () => {
  assert.doesNotMatch(deepdive, /^import .*factory-plan/m, 'no static import');
  assert.match(deepdive, /const FACTORY_DOC_TOPIC = process\.env\.FACTORY_TOPIC\s+\? \(await import\('\.\/studio\/lib\/factory-plan\.mjs'\)\)\.factoryTopicFor\('doc', process\.env\)\s+: null;/);
  assert.match(deepdive, /await station\('topic', 'running'\);\nif \(FACTORY_DOC_TOPIC\) \{[\s\S]{0,700}\} else try \{\n  const \{ researchTrend \} = await import\('\.\/trend-research\.mjs'\);/);
  // the research body, the evergreen fallback and the station close are untouched
  assert.match(deepdive, /longSeed = trend\.videos\.find\(\(v\) => !usedLong\.includes\(v\.title\)\) \|\| trend\.videos\[0\] \|\| null;/);
  assert.match(deepdive, /if \(!theme\) \{\n  \/\/ Last-resort evergreen angle/);
  assert.match(deepdive, /await station\('topic', 'succeeded'\);\nawait station\('script', 'running'\);\n/);
  assert.ok(deepdive.includes('write: (p) => llmScript(p, longSeed?.title || theme, docTemplateId),'));
  // the review gate is untouched: generate-only still saves awaiting_review and stops
  assert.match(deepdive, /if \(GENERATE_ONLY\) \{\n  const docDupGen = findDup/);
});

test('EARS: the doc lane prompt carries only the sanitised topic, never the raw env', () => {
  const i = deepdive.indexOf('if (FACTORY_DOC_TOPIC) {');
  const body = deepdive.slice(i, deepdive.indexOf('} else try {', i));
  assert.doesNotMatch(body, /process\.env/);
  assert.match(body, /theme = `[^`]*\$\{FACTORY_DOC_TOPIC\}/);
  const j = daily.indexOf('if (FACTORY_SHORT_TOPIC) {');
  assert.doesNotMatch(daily.slice(j, j + 600), /process\.env/);
});
