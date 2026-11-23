// Emotional voice via the free Kaggle GPU + the multi-niche voice library
// (owner-approved 2026-11-22). Spec (EARS) + plain-English QA:
// docs/qa/emotional-voice-qa.md.
//
// kit.voiceProfile gains { emotional, expression, model } — default off, which
// is byte-identical to today. The GPU engine model is DATA (GPU_VOICE_MODELS);
// expression 'none' (the default) = natural delivery, no sound tags at all.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GPU_VOICE_MODELS, DEFAULT_GPU_MODEL, EXPRESSIONS, DEFAULT_EXPRESSION, EXPRESSION_LABEL, TAG_DENSITY,
  gpuModel, expressionTags, parseEmotional, emotionalOf, stripVoiceTags, sanitizeNarrationTags,
  sanitizeEpisodeTags, stripEpisodeTags, spokenScriptOf, voiceTagPrompt, EMOTIONAL_LABEL,
} from '../studio/lib/emotional-voice.mjs';
import {
  parseVoiceProfile, voiceSettingsOf, sameVoiceSettings, resolveVoiceProfile,
} from '../studio/lib/human-voice.mjs';
import { kitFieldPatch, kitOnlySave, KIT_ONLY_KEYS } from '../studio/lib/channel-kit-fields.mjs';
import { voiceProfileFor } from '../lib/voice-profile.mjs';
import {
  VOICE_LIBRARY, CHARACTERS, NICHES, ACCENTS, GENDERS, libraryVoice, filterLibrary, libraryPreviewUrl, isLibraryVoice,
} from '../studio/lib/voice-library.mjs';
import {
  isoWeekKey, gpuUsageSummary, recordGpuRun, GPU_WEEKLY_LIMIT_HOURS, GPU_GUARD_HOURS, gpuUsageLine, mergeGpuUsage, gpuUsagePath,
} from '../studio/lib/gpu-usage.mjs';
import { emotionalVoiceArgs, spokenBeatTexts, readVoiceReport, emotionalFallbackWarning } from '../lib/emotional-voice-run.mjs';
import { buildStorybookBeats } from '../lib/doc-storybook.mjs';
import { channelReadiness } from '../studio/lib/channel-readiness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const CASES = JSON.parse(read('tests/fixtures/voice-profile-cases.json'));
const WEEKS = JSON.parse(read('tests/fixtures/gpu-usage-cases.json'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emotional-voice-'));
const writeJson = (name, data) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, JSON.stringify(data));
  return p;
};

describe('EV-D: the setting (studio/lib/emotional-voice.mjs + human-voice.mjs)', () => {
  test('EV-D1 the GPU engine model is data: chatterbox-turbo is the default and the only one built', () => {
    assert.equal(DEFAULT_GPU_MODEL, 'chatterbox-turbo');
    assert.deepEqual(GPU_VOICE_MODELS.map((m) => m.id), ['chatterbox-turbo']);
    const m = gpuModel('chatterbox-turbo');
    // the tokens Chatterbox-Turbo's tokenizer knows (added_tokens.json of ResembleAI/chatterbox-turbo)
    for (const t of ['sigh', 'chuckle', 'laugh', 'gasp', 'clear throat']) assert.ok(m.tags.includes(t), t);
    assert.equal(gpuModel('orpheus'), null, 'a model that is not built yet is unknown');
  });

  test('EV-D2 expression levels: none (default) / light / rich; none = no tags at all', () => {
    assert.deepEqual([...EXPRESSIONS], ['none', 'light', 'rich']);
    assert.equal(DEFAULT_EXPRESSION, 'none');
    assert.deepEqual(expressionTags('none'), []);
    assert.ok(expressionTags('light').length >= 1);
    assert.ok(expressionTags('light').every((t) => expressionTags('rich').includes(t)), 'light is a subset of rich');
    assert.ok(!expressionTags('light').includes('laugh'), 'owner: laughs sound unnatural — never at light');
    for (const e of EXPRESSIONS) assert.match(EXPRESSION_LABEL[e], /^[A-Z][a-z]+$/);
    assert.ok(TAG_DENSITY.light > TAG_DENSITY.rich, 'light = fewer tags');
    assert.equal(expressionTags('rich', 'nope'), null, 'unknown model -> no tag list');
  });

  test('EV-D3 parseEmotional validates with plain sentences', () => {
    assert.deepEqual(parseEmotional({ emotional: true }), { ok: true, value: { emotional: true, expression: 'none', model: 'chatterbox-turbo' } });
    assert.deepEqual(parseEmotional({ emotional: false, expression: 'rich' }).value, { emotional: false, expression: 'rich', model: 'chatterbox-turbo' });
    for (const bad of [{ emotional: 'yes' }, { emotional: true, expression: 'loud' }, { emotional: true, model: 'orpheus' }]) {
      const r = parseEmotional(bad);
      assert.equal(r.ok, false, JSON.stringify(bad));
      assert.match(r.error, /^voiceProfile\./);
    }
    assert.deepEqual(emotionalOf(undefined), { emotional: false, expression: 'none', model: 'chatterbox-turbo' });
    assert.deepEqual(emotionalOf({ human: true, emotional: true, expression: 'light' }), { emotional: true, expression: 'light', model: 'chatterbox-turbo' });
    assert.match(EMOTIONAL_LABEL, /Emotional voice/);
  });

  test('EV-D4 parseVoiceProfile keeps the 3 keys when emotional is absent (byte-identical) and adds the 3 emotional keys when sent', () => {
    assert.deepEqual(parseVoiceProfile({ human: true, mood: 'calm', speed: 0.95 }).value, { human: true, mood: 'calm', speed: 0.95 });
    assert.deepEqual(parseVoiceProfile({ human: true, mood: 'calm', speed: 0.95, emotional: true, expression: 'light' }).value,
      { human: true, mood: 'calm', speed: 0.95, emotional: true, expression: 'light', model: 'chatterbox-turbo' });
    const bad = parseVoiceProfile({ human: true, emotional: true, expression: 'shouty' });
    assert.equal(bad.ok, false);
    assert.match(bad.error, /none, light, rich/);
    assert.equal(sameVoiceSettings({ human: true, mood: 'calm', speed: 1 }, { human: true, mood: 'calm', speed: 1, emotional: false }), true, 'absent = off');
    assert.equal(sameVoiceSettings({ human: true, mood: 'calm', speed: 1 }, { human: true, mood: 'calm', speed: 1, emotional: true }), false);
    assert.equal(sameVoiceSettings({ human: true, emotional: true, expression: 'light' }, { human: true, emotional: true, expression: 'rich' }), false);
    assert.deepEqual(voiceSettingsOf({ human: true, emotional: true }).emotional, true);
  });

  test('EV-D5 a voice-drawer save may carry the voice too (kit.voice, readiness item 5), validated against the library', () => {
    assert.deepEqual([...KIT_ONLY_KEYS], ['voiceProfile', 'voice']);
    assert.equal(kitOnlySave({ slug: 'mr', kit: { voice: 'bm_lewis', voiceProfile: { human: true } } }), true);
    assert.equal(kitOnlySave({ slug: 'mr', kit: { voice: 'bm_lewis' } }), true);
    assert.deepEqual(kitFieldPatch({ voice: 'bm_lewis' }), { patch: { voice: 'bm_lewis' } });
    const bad = kitFieldPatch({ voice: 'en-US-AndrewNeural' });
    assert.deepEqual(bad.patch, {});
    assert.match(bad.error, /^voice/);
    assert.deepEqual(kitFieldPatch({ voiceProfile: { human: true, emotional: true, expression: 'rich' } }).patch.voiceProfile,
      { human: true, mood: 'warm', speed: 1, emotional: true, expression: 'rich', model: 'chatterbox-turbo' });
  });

  test('EV-D6 readiness is unchanged by the emotional keys (still 7 items, voice item reads kit.voice)', () => {
    const entry = { slug: 'x', tokenSecretSaved: true, niche: 'n', cron: '21 3 * * *', kit: { voice: 'bm_daniel', templateId: 't', storyShape: 'template', description: 'd', tags: ['a'], thumbTemplates: ['a', 'b'], slots: ['00:05'], longSlot: '22:30' } };
    const schedule = { docDays: ['Thu'] };
    const a = channelReadiness({ entry, schedule });
    const b = channelReadiness({ entry: { ...entry, kit: { ...entry.kit, voiceProfile: { human: true, emotional: true, expression: 'rich' } } }, schedule });
    assert.deepEqual(b, a);
    const noVoice = channelReadiness({ entry: { ...entry, kit: { ...entry.kit, voice: '' } }, schedule });
    const withLib = channelReadiness({ entry: { ...entry, kit: { ...entry.kit, voice: 'bm_lewis' } }, schedule });
    const item = (r) => r.items.find((i) => i.key === 'voice');
    assert.equal(item(noVoice).ok, false);
    assert.equal(item(withLib).ok, true);
  });
});

describe('EV-E: engine precedence (resolveVoiceProfile + the shared case table)', () => {
  test('EV-E1 the case table has emotional cases (Python mirrors the same table)', () => {
    assert.ok(CASES.cases.filter((c) => /^EV-E/.test(c.name)).length >= 5);
  });

  test('EV-E2 every case: voiceProfileFor and resolveVoiceProfile agree with the table', () => {
    const brandsFile = writeJson('brands.json', CASES.brands);
    CASES.cases.forEach((c, i) => {
      const regFile = writeJson(`registry-${i}.json`, c.registry);
      assert.deepEqual(voiceProfileFor(c.slug, brandsFile, regFile), c.expect, c.name);
      const entry = (c.registry.channels || []).find((e) => e.slug === c.slug) || null;
      assert.deepEqual(resolveVoiceProfile({ staticKit: CASES.brands[c.slug] || null, entry }), c.expect, c.name);
    });
  });

  test('EV-E3 emotional off / absent = exactly today\'s profile object (no emotional key)', () => {
    const entry = { slug: 'm', kit: { voice: 'bm_daniel', voiceProfile: { human: true, mood: 'calm', speed: 0.95, emotional: false, expression: 'rich' } } };
    assert.deepEqual(resolveVoiceProfile({ entry }), { engine: 'kokoro', voice: 'bm_daniel', speed: 0.95, mood: 'calm' });
  });
});

describe('EV-T: emotion tags (written sparingly, never shown)', () => {
  const S = 'Most people never check. [sigh] It quietly drains them. They feel fine. Then rent comes. It hurts. [chuckle] Funny, right? We all do it. Every month. Again.';

  test('EV-T1 stripVoiceTags removes every known tag and leaves untagged text byte-identical', () => {
    assert.equal(stripVoiceTags('Plain text, no tags.'), 'Plain text, no tags.');
    assert.equal(stripVoiceTags('Wait [sigh] what.'), 'Wait what.');
    assert.equal(stripVoiceTags('[Clear Throat] So. It ends [laugh].'), 'So. It ends.');
    assert.equal(stripVoiceTags('Keep [1] and [citation] as they are.'), 'Keep [1] and [citation] as they are.', 'only voice tags are stripped');
    assert.equal(stripVoiceTags(''), '');
    assert.equal(stripVoiceTags(undefined), '');
  });

  test('EV-T2 none = every tag stripped; light keeps only light tags, one per sentence, density-capped', () => {
    assert.equal(sanitizeNarrationTags(S, 'none'), stripVoiceTags(S));
    const light = sanitizeNarrationTags(S, 'light');
    assert.ok(!light.includes('[chuckle]'), 'chuckle is not a light tag');
    assert.equal((light.match(/\[[a-z ]+\]/g) || []).length, 1);
    const rich = sanitizeNarrationTags(S, 'rich');
    assert.equal((rich.match(/\[[a-z ]+\]/g) || []).length, 2);
    // unknown or unsupported tags are dropped, case is normalised
    assert.equal(sanitizeNarrationTags('One. Two. Three. Four. [Sigh] Five is here. Six. [pause] Seven. Eight.', 'rich'), 'One. Two. Three. Four. [sigh] Five is here. Six. Seven. Eight.');
    // a dangling tag (no words after it in its sentence) is dropped
    assert.equal(sanitizeNarrationTags('One. Two. Three. Four. Five six [sigh].', 'rich'), 'One. Two. Three. Four. Five six.');
    // density: a 2-sentence intro never gets a tag
    assert.equal(sanitizeNarrationTags('[sigh] Short intro. Ends here.', 'rich'), 'Short intro. Ends here.');
  });

  test('EV-T3 sanitizeEpisodeTags: off/none returns the SAME object; on strips titles and caps the narration', () => {
    const ep = { title: 'Why [sigh] money leaks', intro: 'A. B.', chapters: [{ title: '[laugh] Rent', text: S }], outro: 'Bye. Now.' };
    assert.equal(sanitizeEpisodeTags(ep, undefined), ep);
    assert.equal(sanitizeEpisodeTags(ep, 'none'), ep);
    const out = sanitizeEpisodeTags(ep, 'light');
    assert.equal(out.title, 'Why money leaks');
    assert.equal(out.chapters[0].title, 'Rent');
    assert.equal((out.chapters[0].text.match(/\[[a-z ]+\]/g) || []).length, 1);
  });

  test('EV-T4 stripEpisodeTags: what is shown is tag-free; the spoken copy rides along invisibly', () => {
    const plain = { title: 'T', intro: 'I.', chapters: [{ title: 'C', text: 'X.' }], outro: 'O.' };
    assert.equal(stripEpisodeTags(plain), plain, 'no tags = the same object');
    assert.equal(spokenScriptOf(plain), plain);
    const tagged = { ...plain, chapters: [{ title: 'C', text: 'One. [sigh] Two words.' }] };
    const shown = stripEpisodeTags(tagged);
    assert.equal(shown.chapters[0].text, 'One. Two words.');
    assert.equal(spokenScriptOf(shown), tagged);
    assert.ok(!JSON.stringify(shown).includes('[sigh]'), 'never serialised into anything shown or published');
  });

  test('EV-T5 the prompt asks for sparing tags only at light/rich, and never in titles', () => {
    assert.equal(voiceTagPrompt('none'), '');
    assert.equal(voiceTagPrompt(undefined), '');
    const p = voiceTagPrompt('light');
    assert.match(p, /\[sigh\]/);
    assert.doesNotMatch(p, /\[laugh\]/);
    assert.match(p, /at most one per 6 sentences/i);
    assert.match(p, /never in the title/i);
    assert.match(voiceTagPrompt('rich'), /\[chuckle\]/);
  });

  test('EV-T6 storybook: shown beats are tag-free; the spoken text keeps the tags only when the beats line up', () => {
    const tagged = { title: 'T', intro: 'Intro here.', chapters: [{ title: 'C', text: 'One. [sigh] Two words. Three.' }], outro: 'Out.' };
    const shown = stripEpisodeTags(tagged);
    const beats = buildStorybookBeats(shown, { followLine: 'f' });
    const say = buildStorybookBeats(spokenScriptOf(shown), { followLine: 'f' });
    const texts = spokenBeatTexts(beats, say);
    const two = beats.find((x) => x.text === 'Two words.');
    assert.equal(texts.get(two.i), '[sigh] Two words.');
    assert.ok(beats.every((x) => !/\[sigh\]/.test(`${x.text}${x.headline || ''}${x.sub || ''}`)));
    // mismatch (a tag-only fragment) -> no tags spoken at all, never a misaligned beat
    const broken = buildStorybookBeats({ ...tagged, chapters: [{ title: 'C', text: 'One. [sigh] Two.' }] }, { followLine: 'f' });
    broken.push({ i: 99, text: '[sigh]' });
    assert.equal(spokenBeatTexts(beats, broken).size, 0);
  });
});

describe('EV-L: the voice library (studio/lib/voice-library.mjs)', () => {
  test('EV-L1 every English Kokoro voice of voices-v1.0.bin except the novelty Santa voice, with plain labels', () => {
    const ids = VOICE_LIBRARY.map((v) => v.id);
    assert.equal(ids.length, 27);
    assert.ok(!ids.includes('am_santa'));
    for (const id of ['af_heart', 'bm_daniel', 'am_michael', 'bf_emma', 'bm_lewis', 'af_nicole']) assert.ok(ids.includes(id), id);
    for (const v of VOICE_LIBRARY) {
      assert.match(v.id, /^[ab][fm]_[a-z]+$/);
      assert.equal(v.gender, v.id[1] === 'f' ? 'female' : 'male', v.id);
      assert.equal(v.accent, v.id[0] === 'a' ? 'american' : 'british', v.id);
      assert.ok(CHARACTERS[v.character], `${v.id} character`);
      assert.ok(v.niches.length >= 2 && v.niches.every((n) => NICHES[n]), `${v.id} niches`);
      assert.ok(v.name && v.name.length <= 12, `${v.id} name`);
    }
    assert.deepEqual(Object.keys(GENDERS), ['female', 'male']);
    assert.deepEqual(Object.keys(ACCENTS), ['american', 'british']);
  });

  test('EV-L2 filters: gender, accent, niche (empty = all)', () => {
    assert.equal(filterLibrary({}).length, VOICE_LIBRARY.length);
    assert.ok(filterLibrary({ gender: 'female' }).every((v) => v.gender === 'female'));
    assert.ok(filterLibrary({ accent: 'british', gender: 'male' }).every((v) => v.id.startsWith('bm_')));
    const sleep = filterLibrary({ niche: 'sleep' });
    assert.ok(sleep.length >= 2 && sleep.every((v) => v.niches.includes('sleep')));
    assert.equal(libraryVoice('bm_daniel').id, 'bm_daniel');
    assert.equal(libraryVoice('nope'), null);
    assert.equal(isLibraryVoice('bm_lewis'), true);
    assert.equal(isLibraryVoice('am_santa'), false);
  });

  test('EV-L3 previews: emotional clip when the emotional voice is on, else the standard clip; never another voice', () => {
    assert.equal(libraryPreviewUrl('bm_lewis', { emotional: true }), '/voices/emotional/bm_lewis.mp3');
    assert.equal(libraryPreviewUrl('bm_lewis', { emotional: false }), '/voices/library/bm_lewis.mp3');
    assert.equal(libraryPreviewUrl('nope', { emotional: true }), null);
  });

  test('EV-L4 one small clip per voice in both folders; totals stay small; no stray files', () => {
    for (const dir of ['emotional', 'library']) {
      const abs = path.join(ROOT, 'studio', 'public', 'voices', dir);
      let total = 0;
      for (const v of VOICE_LIBRARY) {
        const f = path.join(abs, `${v.id}.mp3`);
        assert.ok(fs.existsSync(f), `missing ${dir}/${v.id}.mp3`);
        const size = fs.statSync(f).size;
        assert.ok(size > 5_000 && size < 120_000, `${dir}/${v.id}.mp3 is ${size} bytes`);
        total += size;
      }
      assert.ok(total < 2_500_000, `${dir} total ${total} bytes`);
      assert.deepEqual(fs.readdirSync(abs).filter((f) => !VOICE_LIBRARY.some((v) => f === `${v.id}.mp3`)), [], `${dir}: no stray files`);
    }
  });
});

describe('EV-Q: the free-GPU quota guard (studio/lib/gpu-usage.mjs; Python mirrors the same fixture)', () => {
  test('EV-Q1 ISO week keys match the shared fixture', () => {
    for (const c of WEEKS.weeks) assert.equal(isoWeekKey(new Date(c.at)), c.key, c.at);
  });

  test('EV-Q2 summary: this week only, hours rounded, guard at 25 h of Kaggle\'s ~30 h', () => {
    assert.equal(GPU_WEEKLY_LIMIT_HOURS, 30);
    assert.equal(GPU_GUARD_HOURS, 25);
    for (const c of WEEKS.summaries) {
      assert.deepEqual(gpuUsageSummary(c.usage, new Date(c.now)), c.expect, c.name);
    }
    assert.equal(gpuUsageLine(gpuUsageSummary(null, new Date('2026-11-22T10:00:00Z'))), 'Free GPU this week: 0 h of ~30 h');
    assert.equal(gpuUsageLine({ hours: 1.2, limitHours: 30, paused: false }), 'Free GPU this week: 1.2 h of ~30 h');
    assert.match(gpuUsageLine({ hours: 25.5, limitHours: 30, paused: true }), /paused until next week/);
  });

  test('EV-Q4 one file per channel (no commit conflicts), summed for the account', () => {
    assert.equal(gpuUsagePath('money-rulebook'), 'yt-mcp/state/gpu-usage/money-rulebook.json');
    const now = new Date('2026-11-22T12:00:00Z');
    const a = recordGpuRun(null, { at: '2026-11-22T10:00:00Z', slug: 'money-rulebook', seconds: 3600, ok: true });
    const b = recordGpuRun(null, { at: '2026-11-21T10:00:00Z', slug: 'quotequarry', seconds: 1800, ok: true });
    const s = gpuUsageSummary(mergeGpuUsage([a, b, null, { weeks: 'junk' }]), now);
    assert.equal(s.hours, 1.5);
    assert.equal(s.runs, 2);
  });

  test('EV-Q3 recordGpuRun adds to the right week and keeps 8 weeks at most', () => {
    let u = null;
    u = recordGpuRun(u, { at: '2026-11-22T10:00:00Z', slug: 'money-rulebook', seconds: 600, ok: true, kernel: 'muzzamilhassan/quarry-voice-money-rulebook' });
    u = recordGpuRun(u, { at: '2026-11-22T12:00:00Z', slug: 'money-rulebook', seconds: 300, ok: false, kernel: 'k' });
    assert.equal(u.weeks['2026-W47'].seconds, 900);
    assert.equal(u.weeks['2026-W47'].runs.length, 2);
    for (let d = 0; d < 80; d += 7) u = recordGpuRun(u, { at: new Date(Date.UTC(2026, 0, 5 + d)).toISOString(), slug: 's', seconds: 1, ok: true, kernel: 'k' });
    assert.ok(Object.keys(u.weeks).length <= 8);
  });
});

describe('EV-R: the doc lanes (lib/emotional-voice-run.mjs)', () => {
  test('EV-R1 emotionalVoiceArgs: nothing when off; the GPU args with the allowed tags when on', () => {
    assert.deepEqual(emotionalVoiceArgs(null, 'mr'), []);
    assert.deepEqual(emotionalVoiceArgs({ engine: 'kokoro', voice: 'bm_daniel', speed: 1 }, 'mr'), []);
    assert.deepEqual(emotionalVoiceArgs({ engine: 'kokoro', voice: 'bm_daniel', speed: 1, emotional: { model: 'chatterbox-turbo', expression: 'light' } }, 'money-rulebook'),
      ['--gpu-model', 'chatterbox-turbo', '--expression', 'light', '--gpu-tags', expressionTags('light').join(','), '--gpu-slug', 'money-rulebook']);
    assert.deepEqual(emotionalVoiceArgs({ voice: 'x', emotional: { model: 'nope', expression: 'light' } }, 'mr'), [], 'unknown model = the standard voice');
  });

  test('EV-R2 readVoiceReport + the quiet (advisory) fallback warning', () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'rep-'));
    assert.equal(readVoiceReport(dir), null);
    fs.writeFileSync(path.join(dir, 'voice-report.json'), JSON.stringify({ requested: true, ok: false, reason: 'timed out after 30 min' }));
    const rep = readVoiceReport(dir);
    const w = emotionalFallbackWarning('money-rulebook', rep, '2026-11-22');
    assert.equal(w.severity, 'advisory');
    assert.equal(w.code, 'emotional_voice_fallback');
    assert.match(w.title, /emotional voice unavailable today — used the standard voice/);
    assert.equal(w.dedupe_key, 'money-rulebook:emotional_voice_fallback:2026-11-22');
    assert.equal(emotionalFallbackWarning('mr', { requested: true, ok: true }, 'd'), null);
    assert.equal(emotionalFallbackWarning('mr', null, 'd'), null);
  });
});

describe('EV-W: wiring (source scans, CRLF-robust)', () => {
  const DD = read('yt-deepdive.mjs');
  const SB = DD.slice(DD.indexOf('async function renderStorybookVisuals'), DD.indexOf('// ---------- SHIP TAIL'));

  test('EV-W1 the doc writer asks for tags only when on (appended last), and sanitizes the reply', () => {
    assert.match(DD, /const DOC_EMOTIONAL = voiceProfileFor\(slug\)\?\.emotional \|\| null;/);
    assert.match(DD, /const DOC_VOICE_TAGS = DOC_EMOTIONAL \? voiceTagPrompt\(DOC_EMOTIONAL\.expression, DOC_EMOTIONAL\.model\) : '';/);
    assert.ok(DD.includes("'Exactly 8 chapters. Every chapter text MUST be 120-150 words.'}${DOC_VOICE_TAGS}`;"), 'appended after the shape directive (off = byte-identical)');
    assert.ok(DD.includes('const script = sanitizeEpisodeTags(await llmScript(LONG_PROMPT(b, theme, docPlan), longSeed?.title || theme, docTemplateId), DOC_EMOTIONAL?.expression, DOC_EMOTIONAL?.model);'));
  });

  test('EV-W2 everything shown/published is tag-free: renderAndShipEpisode strips first', () => {
    const at = DD.indexOf('async function renderAndShipEpisode(script');
    const body = DD.slice(at, at + 900);
    assert.match(body, /script = stripEpisodeTags\(script\);/);
    assert.ok(body.indexOf('stripEpisodeTags') < DD.indexOf('const sbMeta', at) - at, 'before any lane runs');
  });

  test('EV-W3 storybook speaks the tags back only through spokenBeatTexts, with the GPU args and the report', () => {
    assert.match(SB, /const said = spokenScriptOf\(script\);/);
    assert.match(SB, /spokenBeatTexts\(beats, said === script \? \[\] : buildStorybookBeats\(said,/);
    assert.match(SB, /text: sayText\.get\(x\.i\) \|\| x\.text/);
    assert.match(SB, /\.\.\.emotionalVoiceArgs\(prof, slug\), '--layout', 'edge_batch'\]/);
    assert.match(SB, /if \(prof\) await reportEmotionalVoice\(\{ slug, outDir: audioDir \}\);/);
  });

  test('EV-W4 the diagram lane gets the GPU args (natural delivery: its script is already tag-free)', () => {
    const de = read('lib/diagram-episode.mjs');
    assert.match(de, /export function diagramVoiceArgs\(kit, pres = \{\}, slug = ''\)/);
    assert.match(de, /\.\.\.emotionalVoiceArgs\(prof, slug\)\]/);
    assert.match(de, /const vArgs = diagramVoiceArgs\(kit, pres, slug\);/);
  });

  test('EV-W5 Shorts / legacy narration stay on the Kokoro human voice (narrate.py ignores emotional)', () => {
    const py = read('youtube-flow/narrate.py');
    assert.match(py, /GPU_MODELS = \("chatterbox-turbo",\)/);
    const tryHuman = py.slice(py.indexOf('def try_human'), py.indexOf('def main'));
    assert.doesNotMatch(tryHuman, /emotional|kaggle/i);
  });
});

describe('EV-C: CI (setup + secrets only when needed + timing)', () => {
  const SR = read('.github/actions/setup-render/action.yml');
  const WF = read('.github/workflows/channel-autopilot.yml');

  test('EV-C1 the Kaggle CLI installs only for channels with the emotional voice on (same shared reader)', () => {
    assert.ok(SR.includes("p=m.voiceProfileFor(process.env.SLUG||'');process.exit(p&&p.emotional?0:1)"));
    assert.ok(SR.includes('pip install --quiet "kaggle==2.2.5"'));
    assert.ok(SR.includes('echo "EMOTIONAL_VOICE=1" >> "$GITHUB_ENV"'));
  });

  test('EV-C2 the produce job passes the Kaggle secrets only when EMOTIONAL_VOICE is set', () => {
    const at = WF.indexOf('Kaggle key (emotional-voice channels only)');
    assert.ok(at > WF.indexOf('uses: ./.github/actions/setup-render'));
    const step = WF.slice(at, WF.indexOf('- name:', at + 10));
    assert.ok(step.includes("if: ${{ env.EMOTIONAL_VOICE == '1' }}"));
    assert.ok(step.includes('K_TOKEN: ${{ secrets.KAGGLE_API_TOKEN }}'));
    assert.ok(step.includes('K_USER: ${{ secrets.KAGGLE_USERNAME }}'));
    assert.equal((WF.match(/secrets\.KAGGLE_API_TOKEN/g) || []).length, 1, 'nowhere else in the production workflow');
  });

  test('EV-C3 timing: doc timeout 105 min (75 + the 30-min Kaggle hard timeout), job 150 min, both above each other', () => {
    const pipe = read('channel-pipeline.mjs');
    const docMs = Number(/const DOC_TIMEOUT_MS = (\d+);/.exec(pipe)[1]);
    assert.equal(docMs, 105 * 60000);
    const job = Number(/timeout-minutes: (\d+)\n\s+env:\n\s+SLUG: \$\{\{ matrix\.slug\.slug \}\}/.exec(WF)[1]);
    assert.equal(job, 150);
    assert.ok(job * 60000 > docMs + 30 * 60000, 'setup + Shorts fit before the doc lane');
    assert.match(read('explainer/kaggle_voice.py'), /TIMEOUT_S = 30 \* 60/);
  });

  test('EV-C4 GPU usage is committed with the publishing state (one file per channel under yt-mcp/state/)', () => {
    assert.match(WF, /git add yt-mcp\/state\//);
    assert.match(read('explainer/kaggle_voice.py'), /USAGE_DIR = os\.path\.join\(ROOT, "yt-mcp", "state", "gpu-usage"\)/);
  });

  test('EV-C5 the token never lands in a file: only env / the CLI reads it', () => {
    for (const f of ['explainer/kaggle_voice.py', 'scripts/generate-emotional-previews.py', 'scripts/emotional-voice-dryrun.mjs', 'scripts/enable-emotional-voice.mjs', '.github/workflows/emotional-voice-dryrun.yml']) {
      const src = read(f);
      assert.doesNotMatch(src, /KGAT_[A-Za-z0-9]/, f);
      assert.doesNotMatch(src, /open\([^)]*access_token/, `${f} never opens the token file`);
    }
  });
});

describe('EV-X: enable script + EV-P proof run', () => {
  test('EV-X1 enable-emotional-voice plans from DATA, dry run by default, --apply via setChannelKitFields', async () => {
    const { planEmotionalVoice } = await import('../scripts/enable-emotional-voice.mjs');
    const reg = { channels: [{ slug: 'mr', kit: { voice: 'bm_daniel', voiceProfile: { human: true, mood: 'calm', speed: 0.95 } } }, { slug: 'edge', kit: { voice: 'en-US-AndrewNeural' } }] };
    const p = planEmotionalVoice(reg, {}, 'mr', { expression: 'light' });
    assert.equal(p.ok, true);
    assert.deepEqual(p.voiceProfile, { human: true, mood: 'calm', speed: 0.95, emotional: true, expression: 'light', model: 'chatterbox-turbo' });
    assert.deepEqual(p.after.emotional, { model: 'chatterbox-turbo', expression: 'light' });
    assert.equal(planEmotionalVoice(reg, {}, 'mr').voiceProfile.expression, 'none', 'default = none');
    assert.equal(planEmotionalVoice(reg, {}, 'edge').ok, false);
    assert.equal(planEmotionalVoice(reg, {}, 'nope').ok, false);
    assert.equal(planEmotionalVoice(reg, {}, 'mr', { expression: 'loud' }).ok, false);
    assert.equal(planEmotionalVoice(reg, {}, 'mr', { off: true }).after.emotional, undefined);
    const src = read('scripts/enable-emotional-voice.mjs');
    assert.match(src, /const APPLY = argv\.includes\('--apply'\);/);
    assert.match(src, /if \(!APPLY\) \{/);
    assert.match(src, /setChannelKitFields\(plan\.slug, \{ voiceProfile: plan\.voiceProfile \}/);
    assert.doesNotMatch(src, /upsertChannel/);
  });

  test('EV-P1 the proof run uses the lane\'s own steps and never uploads', async () => {
    const { proofProfile } = await import('../scripts/emotional-voice-dryrun.mjs');
    const saved = { engine: 'kokoro', voice: 'bm_daniel', speed: 0.95, mood: 'calm' };
    assert.deepEqual(proofProfile(saved, { expression: 'light' }).emotional, { model: 'chatterbox-turbo', expression: 'light' });
    assert.equal(proofProfile(saved, { asIs: true }), saved);
    assert.equal(proofProfile(null), null);
    const src = read('scripts/emotional-voice-dryrun.mjs');
    for (const fn of ['sanitizeEpisodeTags', 'stripEpisodeTags', 'spokenBeatTexts', 'emotionalVoiceArgs', 'buildStorybookBeats']) assert.ok(src.includes(fn), fn);
    assert.doesNotMatch(src, /googleapis|uploadWithIntent|DATABASE_URL/);
    const wf = read('.github/workflows/emotional-voice-dryrun.yml');
    assert.match(wf, /workflow_dispatch:/);
    assert.match(wf, /permissions:\n {2}contents: read/);
    assert.doesNotMatch(wf, /git push|git commit|YT_TOKEN|DATABASE_URL/);
    assert.match(wf, /default: "none"/, 'natural delivery is the default proof');
  });
});

describe('EV-P: the panel (source scans)', () => {
  const PANEL = read('studio/components/VoicePanel.js');
  const EMO = read('studio/components/EmotionalVoiceSection.js');
  const LIB = read('studio/components/VoiceLibraryPicker.js');
  const PAGE = read('studio/app/channels/add/page.js');
  const ROUTE = read('studio/app/api/voice/gpu-usage/route.js');

  test('EV-P2 the Voice drawer: library picker, human pacing, emotional section; saves voiceProfile + the library voice', () => {
    assert.match(PANEL, /import EmotionalVoiceSection from '@\/components\/EmotionalVoiceSection'/);
    assert.match(PANEL, /import VoiceLibraryPicker from '@\/components\/VoiceLibraryPicker'/);
    // each key only when it changed: a voice-only save never writes default settings over a static profile
    assert.ok(PANEL.includes('body: JSON.stringify({ slug, kit: { ...(settingsChanged ? { voiceProfile: draft } : {}), ...(voiceChanged ? { voice: voiceDraft } : {}) } })'));
    assert.ok(PANEL.includes('const dirty = settingsChanged || voiceChanged;'));
    assert.ok(PANEL.indexOf('const voiceChanged') < PANEL.indexOf('useEffect('), 'declared before any effect');
    assert.ok(PANEL.indexOf('const settingsChanged') < PANEL.indexOf('useEffect('), 'declared before any effect');
    assert.ok(PANEL.indexOf('<VoiceLibraryPicker') < PANEL.indexOf('<HumanVoiceSection') && PANEL.indexOf('<HumanVoiceSection') < PANEL.indexOf('<EmotionalVoiceSection'));
    assert.match(PANEL, /<EmotionalVoiceSection\b[^>]*readOnly=\{!isOwner\}/);
  });

  test('EV-P3 the emotional section: the switch label, None/Light/Rich, turning on turns human pacing on, the GPU line', () => {
    assert.ok(EMO.includes('{EMOTIONAL_LABEL}'));
    assert.match(EMO, /<Switch\b/);
    assert.ok(EMO.includes('role="radiogroup" aria-label="Expression"'));
    assert.ok(EMO.includes('EXPRESSIONS.map('));
    assert.ok(EMO.includes('set(next ? { emotional: true, human: true } : { emotional: false })'));
    assert.ok(EMO.includes("fetch('/api/voice/gpu-usage')"));
    assert.ok(EMO.includes('{usage.line}'));
    assert.equal(EMOTIONAL_LABEL, 'Emotional voice (laughs, sighs) — free GPU');
  });

  test('EV-P4 the library picker: gender / accent / niche filters and one ▶ per voice (emotional clip when on)', () => {
    for (const l of ["select('Gender'", "select('Accent'", "select('Niche'"]) assert.ok(LIB.includes(l), l);
    assert.ok(LIB.includes('filterLibrary({ gender, accent, niche })'));
    assert.ok(LIB.includes('libraryPreviewUrl(id, { emotional: true })'));
    assert.ok(LIB.includes('previewUrl(id, mood, PREVIEW_VOICE_IDS) || libraryPreviewUrl(id, { emotional: false })'));
    assert.ok(LIB.includes('useEffect(() => () => audio.current?.pause(), [])'));
  });

  test('EV-P5 Edit profile Look & sound: the library under the voice list, the emotional section under human pacing', () => {
    const look = PAGE.slice(PAGE.indexOf("current.id === 'look'"), PAGE.indexOf("current.id === 'thumbnails'"));
    assert.ok(look.indexOf('<VoicePicker') < look.indexOf('<VoiceLibraryPicker') && look.indexOf('<VoiceLibraryPicker') < look.indexOf('<HumanVoiceSection'));
    assert.ok(look.indexOf('<HumanVoiceSection') < look.indexOf('<EmotionalVoiceSection'));
    assert.ok(look.includes("<EmotionalVoiceSection voice={form.voice} value={voiceSettingsOf(form.voiceProfile)} onChange={(v) => setField('voiceProfile', v)} />"));
  });

  test('EV-P6 the GPU-use route: read-only, owner + staff, sums every channel file; studio never imports outside studio/', () => {
    assert.match(ROUTE, /export async function GET\(req\)/);
    assert.doesNotMatch(ROUTE, /export async function (POST|PUT|DELETE)/);
    assert.ok(ROUTE.includes("requireRole(req, ['owner', 'staff'])"));
    assert.ok(ROUTE.includes('mergeGpuUsage(usages)'));
    for (const src of [PANEL, EMO, LIB, ROUTE, read('studio/lib/emotional-voice.mjs'), read('studio/lib/voice-library.mjs'), read('studio/lib/gpu-usage.mjs')]) {
      assert.doesNotMatch(src, /from '\.\.\/\.\.\//, 'studio never imports outside studio/');
    }
  });
});
