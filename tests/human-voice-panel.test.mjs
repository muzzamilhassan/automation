// Human voice as a panel setting (owner-approved 2026-11-21).
// Spec (EARS) + plain-English QA: docs/qa/human-voice-panel-qa.md.
//
// One per-channel kit field, kit.voiceProfile = { human, mood, speed }, set in
// the panel (Voice drawer + the Edit profile wizard's Look & sound step) and
// read by EVERY narrating lane through one precedence rule:
//   registry kit.voiceProfile (the panel)  >  lib/brands.json voiceProfile (static)
// human:false = the channel's normal voice chain. No kit field = today's
// behaviour, byte-identical.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  HUMAN_MOODS, MOOD_LABEL, SPEED_MIN, SPEED_MAX, SPEED_STEP, DEFAULT_VOICE_SETTINGS, HUMAN_PACING_HINT,
  clampSpeed, parseVoiceProfile, voiceSettingsOf, sameVoiceSettings, speedWord, previewUrl,
  staticVoiceProfile, resolveVoiceProfile, isKokoroVoice,
} from '../studio/lib/human-voice.mjs';
import { kitFieldPatch, kitOnlySave, KIT_ONLY_KEYS } from '../studio/lib/channel-kit-fields.mjs';
import { voiceProfileFor } from '../lib/voice-profile.mjs';
import { planVoiceProfileMigration } from '../scripts/migrate-voice-profile.mjs';
import { channelReadiness, READINESS_KEYS } from '../studio/lib/channel-readiness.mjs';
import { EMPTY_FORM, draftSnapshot, parseDraft, sameForm, reviewSummary } from '../studio/lib/wizard-steps.mjs';
import { editPayload } from '../studio/lib/edit-prefill.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const { VOICES } = await import(pathToFileURL(path.join(ROOT, 'studio', 'lib', 'voices.js')).href);
const CASES = JSON.parse(read('tests/fixtures/voice-profile-cases.json'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'human-voice-'));
const writeJson = (name, data) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, JSON.stringify(data));
  return p;
};

// today's reader, verbatim (before this feature) — the default-inert oracle
function legacyVoiceProfileFor(slug, file) {
  if (!slug) return null;
  let kits;
  try { kits = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  kits = kits && typeof kits === 'object' ? (kits.brands || kits) : {};
  const p = kits[slug] && typeof kits[slug] === 'object' ? kits[slug].voiceProfile : null;
  if (!p || typeof p !== 'object' || p.engine !== 'kokoro' || !String(p.voice || '').trim()) return null;
  const speed = Number(p.speed);
  return { engine: 'kokoro', voice: String(p.voice).trim(), speed: Number.isFinite(speed) && speed > 0 ? speed : 1, ...(p.mood ? { mood: String(p.mood) } : {}) };
}

describe('HV-D: the setting itself (studio/lib/human-voice.mjs)', () => {
  test('HV-D1: the 7 moods are exactly the human lane moods in explainer/voice_lines.py MOOD', () => {
    const src = read('explainer/voice_lines.py');
    const block = src.slice(src.indexOf('MOOD = {'), src.indexOf('}', src.indexOf('MOOD = {')));
    const pyMoods = [...block.matchAll(/^\s*"([a-z]+)":/gm)].map((m) => m[1]);
    assert.deepEqual([...HUMAN_MOODS], pyMoods);
    assert.equal(HUMAN_MOODS.length, 7);
    for (const m of HUMAN_MOODS) assert.match(MOOD_LABEL[m], /^[A-Z][a-z]+$/, `plain word for ${m}`);
  });

  test('HV-D2: speed range 0.8-1.2, clamped and rounded', () => {
    assert.equal(SPEED_MIN, 0.8);
    assert.equal(SPEED_MAX, 1.2);
    assert.ok(SPEED_STEP > 0 && SPEED_STEP <= 0.05);
    assert.equal(clampSpeed(0.5), 0.8);
    assert.equal(clampSpeed(3), 1.2);
    assert.equal(clampSpeed(0.95), 0.95);
    assert.equal(clampSpeed(1.0000001), 1);
  });

  test('HV-D3: parseVoiceProfile accepts { human, mood, speed } and keeps only those keys', () => {
    assert.deepEqual(parseVoiceProfile({ human: true, mood: 'calm', speed: 0.95, engine: 'x' }), { ok: true, value: { human: true, mood: 'calm', speed: 0.95 } });
    assert.deepEqual(parseVoiceProfile({ human: false }), { ok: true, value: { human: false, mood: 'warm', speed: 1 } });
    assert.deepEqual(parseVoiceProfile({ human: true, mood: 'sad', speed: 1.5 }).value, { human: true, mood: 'sad', speed: 1.2 });
  });

  test('HV-D4: parseVoiceProfile refuses junk with a plain sentence', () => {
    for (const bad of [null, 'on', [], { mood: 'calm' }, { human: 'yes' }, { human: true, mood: 'furious' }, { human: true, speed: 'fast' }, { human: true, speed: Number.NaN }]) {
      const r = parseVoiceProfile(bad);
      assert.equal(r.ok, false, JSON.stringify(bad));
      assert.match(r.error, /^voiceProfile/);
    }
    assert.match(parseVoiceProfile({ human: true, mood: 'furious' }).error, /calm, warm, excited, serious, tense, sad, playful/);
  });

  test('HV-D5: UI helpers — defaults, equality, the slider words, the copy line', () => {
    assert.deepEqual(DEFAULT_VOICE_SETTINGS, { human: false, mood: 'warm', speed: 1 });
    assert.deepEqual(voiceSettingsOf(undefined), DEFAULT_VOICE_SETTINGS);
    assert.deepEqual(voiceSettingsOf({ human: true, mood: 'tense', speed: 1.1 }), { human: true, mood: 'tense', speed: 1.1 });
    assert.deepEqual(voiceSettingsOf({ human: 'junk' }), DEFAULT_VOICE_SETTINGS);
    assert.equal(sameVoiceSettings({ human: true, mood: 'calm', speed: 0.95 }, { speed: 0.95, mood: 'calm', human: true }), true);
    assert.equal(sameVoiceSettings(undefined, DEFAULT_VOICE_SETTINGS), true);
    assert.equal(sameVoiceSettings({ human: true }, DEFAULT_VOICE_SETTINGS), false);
    assert.equal(speedWord(0.8), 'Slower');
    assert.equal(speedWord(1), 'Normal');
    assert.equal(speedWord(1.2), 'Faster');
    assert.equal(HUMAN_PACING_HINT, 'Natural pauses and pace between sentences');
  });

  test('HV-D6: previews exist only for voices with clips; never a different voice', () => {
    const ids = VOICES.map((v) => v.id);
    assert.equal(previewUrl('bm_daniel', 'calm', ids), '/voices/human/bm_daniel-calm.mp3');
    assert.equal(previewUrl('am_liam', 'calm', ids), null, 'custom voice: no preview, never a stand-in');
    assert.equal(previewUrl('bm_daniel', 'furious', ids), null);
    assert.equal(previewUrl('', 'calm', ids), null);
    assert.equal(isKokoroVoice('bm_daniel'), true);
    assert.equal(isKokoroVoice('en-US-AndrewNeural'), false);
  });
});

describe('HV-E: engine precedence (lib/voice-profile.mjs voiceProfileFor)', () => {
  const brandsFile = writeJson('brands.json', CASES.brands);
  CASES.cases.forEach((c, i) => {
    test(c.name, () => {
      const regFile = writeJson(`registry-${i}.json`, c.registry);
      assert.deepEqual(voiceProfileFor(c.slug, brandsFile, regFile), c.expect);
      // the pure rule says the same (Python mirrors it from the same table)
      const entry = (c.registry.channels || []).find((e) => e.slug === c.slug) || null;
      assert.deepEqual(resolveVoiceProfile({ staticKit: CASES.brands[c.slug] || null, entry }), c.expect);
    });
  });

  test('HV-E3 default-inert: with no kit field anywhere, every real channel reads byte-identically to before', () => {
    const real = path.join(ROOT, 'lib', 'brands.json');
    const kits = JSON.parse(fs.readFileSync(real, 'utf8'));
    const noKitRegistry = writeJson('registry-nokit.json', {
      channels: Object.keys(kits.brands || kits).map((slug) => ({ slug, kit: { voice: 'am_michael' } })),
    });
    const missingRegistry = path.join(tmp, 'does-not-exist.json');
    for (const slug of [...Object.keys(kits.brands || kits), 'nope', '']) {
      const before = JSON.stringify(legacyVoiceProfileFor(slug, real));
      assert.equal(JSON.stringify(voiceProfileFor(slug, real, noKitRegistry)), before, slug);
      assert.equal(JSON.stringify(voiceProfileFor(slug, real, missingRegistry)), before, slug);
    }
    assert.equal(JSON.stringify(staticVoiceProfile(kits['money-rulebook'])), JSON.stringify(legacyVoiceProfileFor('money-rulebook', real)));
  });

  test('HV-E7: the default registry is the engine file yt-mcp/studio-channels.json', () => {
    const src = read('lib/voice-profile.mjs');
    assert.match(src, /'yt-mcp', 'studio-channels\.json'/);
    assert.match(src, /import \{ resolveVoiceProfile \} from '\.\.\/studio\/lib\/human-voice\.mjs'/);
  });
});

describe('HV-L: every narrating lane reads the same profile', () => {
  test('HV-L1 storybook + diagram doc lanes call voiceProfileFor (same reader)', () => {
    const dd = read('yt-deepdive.mjs');
    assert.match(dd, /const prof = voiceProfileFor\(slug\)/);
    assert.match(dd, /kit: \{ \.\.\.b, voiceProfile: voiceProfileFor\(slug\) \}/);
  });

  test('HV-L2 Shorts + legacy doc narration go through narrate.py voice_profile(), which reads the registry kit first', () => {
    const py = read('youtube-flow/narrate.py');
    assert.match(py, /def voice_profile\(slug=None, brands_path=None, registry_path=None\):/);
    assert.match(py, /"yt-mcp", "studio-channels\.json"/);
    assert.match(read('youtube-engine.mjs'), /youtube-flow\/narrate\.py/);
  });

  test('HV-L3 the render setup installs the aligner for exactly the channels the shared reader says are human', () => {
    const yml = read('.github/actions/setup-render/action.yml');
    assert.match(yml, /voiceProfileFor\(process\.env\.SLUG/);
    assert.doesNotMatch(yml, /k&&k\.voiceProfile/, 'no second copy of the rule reading lib/brands.json alone');
  });
});

describe('HV-S: saving the setting', () => {
  test('HV-S1 kitFieldPatch validates voiceProfile (unknown mood -> error -> 400)', () => {
    assert.deepEqual(kitFieldPatch({ voiceProfile: { human: true, mood: 'calm', speed: 0.95 } }), { patch: { voiceProfile: { human: true, mood: 'calm', speed: 0.95 } } });
    assert.deepEqual(kitFieldPatch({ voiceProfile: { human: true, mood: 'calm', speed: 9 } }).patch.voiceProfile.speed, 1.2);
    const bad = kitFieldPatch({ voiceProfile: { human: true, mood: 'furious' } });
    assert.deepEqual(bad.patch, {});
    assert.match(bad.error, /mood/);
    assert.deepEqual(kitFieldPatch({ tagline: 'x' }), { patch: {} }, 'absent key = never patched');
  });

  test('HV-S2 a voice-only save is recognised (and nothing else is)', () => {
    // + 'voice': the Voice drawer's library pick (docs/qa/emotional-voice-qa.md EV-D5)
    assert.deepEqual([...KIT_ONLY_KEYS], ['voiceProfile', 'voice']);
    assert.equal(kitOnlySave({ slug: 'mr', kit: { voiceProfile: { human: true } } }), true);
    assert.equal(kitOnlySave({ slug: 'mr', kit: { voiceProfile: {} , tagline: 'x' } }), false);
    assert.equal(kitOnlySave({ slug: 'mr', label: 'X', kit: { voiceProfile: {} } }), false);
    assert.equal(kitOnlySave({ slug: 'mr', kit: { thumbTemplates: [] } }), false, 'other panels keep their save path');
    assert.equal(kitOnlySave({ slug: 'mr', kit: {} }), false);
    assert.equal(kitOnlySave({ slug: 'mr' }), false);
    assert.equal(kitOnlySave(null), false);
  });

  test('HV-S3 the profile route saves a voice-only body through setChannelKitFields, never the full upsert', () => {
    const src = read('studio/app/api/channels/profile/route.js');
    assert.match(src, /import \{[^}]*setChannelKitFields[^}]*\} from '@\/lib\/channels-registry'/);
    assert.match(src, /import \{ kitFieldPatch, kitOnlySave \} from '@\/lib\/channel-kit-fields\.mjs'/);
    const at = src.indexOf('if (kitOnlySave(body))');
    assert.ok(at > 0, 'fast path present');
    const fast = src.slice(at, src.indexOf('\n  }\n', at));
    assert.match(fast, /const one = kitFieldPatch\(body\.kit\);/);
    assert.match(fast, /status: 400/);
    assert.match(fast, /await setChannelKitFields\(slug, one\.patch/);
    assert.doesNotMatch(fast, /upsertChannel/);
    assert.match(fast, /appendAudit\(/);
    assert.ok(at < src.indexOf('await readRegistry()', src.indexOf('export async function POST')), 'decided before the full-entry read');
    // owner-only, same as every other profile write
    assert.match(src, /export async function POST\(req\) \{\n  if \(!\(await requireRole\(req, \['owner'\]\)\)\)/);
  });

  test('HV-S4 the wizard carries voiceProfile only when set (an untouched edit never sends it)', () => {
    const vp = { human: true, mood: 'calm', speed: 0.95 };
    assert.equal(sameForm({ ...EMPTY_FORM }, { ...EMPTY_FORM, voiceProfile: undefined }), true);
    assert.equal(sameForm({ ...EMPTY_FORM, voiceProfile: vp }, { ...EMPTY_FORM, voiceProfile: { ...vp } }), true);
    assert.equal(sameForm({ ...EMPTY_FORM, voiceProfile: vp }, { ...EMPTY_FORM, voiceProfile: { ...vp, mood: 'sad' } }), false);
    const back = parseDraft(JSON.stringify(draftSnapshot({ ...EMPTY_FORM, voiceProfile: { ...vp, junk: 1 } })));
    assert.deepEqual(back.form.voiceProfile, vp);
    assert.equal(parseDraft(JSON.stringify(draftSnapshot({ ...EMPTY_FORM, voiceProfile: { human: 'x' } }))).form.voiceProfile, undefined);
    // edit save: unchanged voiceProfile is not sent; a change is
    const base = { slug: 's', kit: { voiceProfile: vp } };
    assert.equal(editPayload({ slug: 's', kit: { voiceProfile: { ...vp } } }, base).kit, undefined);
    assert.deepEqual(editPayload({ slug: 's', kit: { voiceProfile: { ...vp, human: false } } }, base).kit, { voiceProfile: { ...vp, human: false } });
    const page = read('studio/app/channels/add/page.js');
    assert.match(page, /\.\.\.\(form\.voiceProfile \? \{ voiceProfile: form\.voiceProfile \} : \{\}\)/);
    assert.match(page, /voiceProfile: entry\.kit\?\.voiceProfile \? voiceSettingsOf\(entry\.kit\.voiceProfile\) : undefined/);
  });

  test('HV-S5 Review lists human pacing only once it is set', () => {
    const look = (f) => reviewSummary(f).find((s) => s.step === 'look').rows.map((r) => r[0]);
    assert.ok(!look({ ...EMPTY_FORM }).includes('Human pacing'));
    const rows = reviewSummary({ ...EMPTY_FORM, voiceProfile: { human: true, mood: 'calm', speed: 0.95 } }).find((s) => s.step === 'look').rows;
    assert.deepEqual(rows.find((r) => r[0] === 'Human pacing'), ['Human pacing', 'On · Calm · 0.95×']);
    const off = reviewSummary({ ...EMPTY_FORM, voiceProfile: { human: false, mood: 'calm', speed: 1 } }).find((s) => s.step === 'look').rows;
    assert.deepEqual(off.find((r) => r[0] === 'Human pacing'), ['Human pacing', 'Off']);
  });
});

describe('HV-M: migration (scripts/migrate-voice-profile.mjs)', () => {
  const statics = {
    'money-rulebook': { voice: 'bm_daniel', voiceProfile: { engine: 'kokoro', voice: 'bm_daniel', speed: 0.95, mood: 'calm' } },
    other: { voice: 'am_adam', voiceProfile: { engine: 'kokoro', voice: 'am_adam', speed: 1 } },
    swapped: { voice: 'am_adam', voiceProfile: { engine: 'kokoro', voice: 'am_adam', speed: 1 } },
    done: { voice: 'am_adam', voiceProfile: { engine: 'kokoro', voice: 'am_adam', speed: 1 } },
    parked: { voice: 'am_adam', voiceProfile: { engine: 'kokoro', voice: 'am_adam' } },
    plain: { voice: 'am_michael' },
  };
  const registry = { channels: [
    { slug: 'money-rulebook', kit: { voice: 'bm_daniel' } },
    { slug: 'other', kit: { voice: 'am_adam' } },
    { slug: 'swapped', kit: { voice: 'af_heart' } },
    { slug: 'done', kit: { voice: 'am_adam', voiceProfile: { human: false } } },
    { slug: 'plain', kit: { voice: 'am_michael' } },
  ] };

  test('HV-M1 copies every static voiceProfile into the registry kit, data-driven (MR = on, calm, 0.95)', () => {
    const plan = planVoiceProfileMigration(statics, registry);
    assert.deepEqual(plan.copies, [
      { slug: 'money-rulebook', voiceProfile: { human: true, mood: 'calm', speed: 0.95 } },
      { slug: 'other', voiceProfile: { human: true, mood: 'warm', speed: 1 } },
    ]);
  });

  test('HV-M2 never changes the audio: already set, not in the registry, or a different voice -> skipped with a reason', () => {
    const plan = planVoiceProfileMigration(statics, registry);
    const why = Object.fromEntries(plan.skipped.map((s) => [s.slug, s.reason]));
    assert.match(why.done, /already set in the panel/);
    assert.match(why.parked, /not in the engine registry/);
    assert.match(why.swapped, /would change what the channel sounds like/);
    assert.equal(why.plain, undefined, 'channels without a static profile are not mentioned');
  });

  test('HV-M3 after the copy, every lane resolves the SAME profile as before', () => {
    const plan = planVoiceProfileMigration(statics, registry);
    // a mood-less profile narrates with 'warm' in every lane (voice_lines.py MOOD default)
    const sound = (p) => ({ ...p, mood: p.mood || 'warm' });
    for (const c of plan.copies) {
      const entry = registry.channels.find((e) => e.slug === c.slug);
      const before = resolveVoiceProfile({ staticKit: statics[c.slug], entry });
      const after = resolveVoiceProfile({ staticKit: statics[c.slug], entry: { ...entry, kit: { ...entry.kit, voiceProfile: c.voiceProfile } } });
      assert.deepEqual(sound(after), sound(before), c.slug);
    }
    // Money Rulebook: byte-identical, mood included
    const mr = registry.channels[0];
    assert.deepEqual(
      resolveVoiceProfile({ staticKit: statics['money-rulebook'], entry: { ...mr, kit: { ...mr.kit, voiceProfile: plan.copies[0].voiceProfile } } }),
      resolveVoiceProfile({ staticKit: statics['money-rulebook'], entry: mr }),
    );
  });

  test('HV-M4 dry run by default; --apply writes through setChannelKitFields', () => {
    const src = read('scripts/migrate-voice-profile.mjs');
    assert.match(src, /const APPLY = process\.argv\.includes\('--apply'\);/);
    assert.match(src, /if \(!APPLY\) \{/);
    assert.match(src, /setChannelKitFields\(c\.slug, \{ voiceProfile: c\.voiceProfile \}/);
    assert.doesNotMatch(src, /upsertChannel/);
  });

  test('HV-M5 the real data: Money Rulebook is planned as on / calm / 0.95', () => {
    const kits = JSON.parse(read('lib/brands.json'));
    const reg = JSON.parse(read('yt-mcp/studio-channels.json'));
    const plan = planVoiceProfileMigration(kits.brands || kits, reg);
    const mr = plan.copies.find((c) => c.slug === 'money-rulebook');
    const already = reg.channels.find((e) => e.slug === 'money-rulebook')?.kit?.voiceProfile;
    if (already) assert.deepEqual(already, { human: true, mood: 'calm', speed: 0.95 });
    else assert.deepEqual(mr, { slug: 'money-rulebook', voiceProfile: { human: true, mood: 'calm', speed: 0.95 } });
  });
});

describe('HV-P: the panel', () => {
  const DRAWERS = read('studio/components/ChannelDrawers.js');
  const PANEL = read('studio/components/VoicePanel.js');
  const SECTION = read('studio/components/HumanVoiceSection.js');
  const PAGE = read('studio/app/channels/add/page.js');

  test('HV-P1 a staff-only "Voice" drawer, wired like the other panels', () => {
    assert.match(DRAWERS, /\bvoice: \{ label: 'Voice', title: 'Voice', description: '[^']+', icon: Mic, size: 'md', staffOnly: true \}/);
    const desc = /\bvoice: \{[^}]*description: '([^']+)'/.exec(DRAWERS)[1];
    assert.ok(desc.split(/\s+/).length <= 5, 'drawer descriptions stay at five words or fewer');
    assert.match(DRAWERS, /import VoicePanel from '@\/components\/VoicePanel'/);
    assert.match(DRAWERS, /if \(open === 'voice'\) return <VoicePanel key=\{k\} slug=\{slug\} frame=\{frame\} \/>;/);
  });

  test('HV-P2 VoicePanel: same frame(body, footer, { dirty }) contract, owner saves only voiceProfile', () => {
    assert.match(PANEL, /export default function VoicePanel\(\{ slug, frame \}\)/);
    assert.match(PANEL, /if \(frame\) return frame\(body, footer, \{ dirty \}\);/);
    assert.match(PANEL, /fetch\(`\/api\/channels\/profile\?slug=\$\{encodeURIComponent\(slug\)\}`\)/);
    // + the library voice when one was picked (docs/qa/emotional-voice-qa.md EV-P2)
    assert.match(PANEL, /body: JSON\.stringify\(\{ slug, kit: \{ \.\.\.\(settingsChanged \? \{ voiceProfile: draft \} : \{\}\), \.\.\.\(voiceChanged \? \{ voice: voiceDraft \} : \{\}\) \} \}\)/);
    assert.match(PANEL, /const settingsChanged = loaded && !sameVoiceSettings\(draft, saved\);/);
    assert.match(PANEL, /const dirty = settingsChanged \|\| voiceChanged;/);
    assert.match(PANEL, /const isOwner = me\?\.role === 'owner';/);
    assert.match(PANEL, /<HumanVoiceSection\b[^>]*readOnly=\{!isOwner\}/);
    // declared before any hook/effect uses them
    assert.ok(PANEL.indexOf('const [saved, setSaved]') < PANEL.indexOf('useEffect('));
    assert.ok(PANEL.indexOf('const [draft, setDraft]') < PANEL.indexOf('useEffect('));
  });

  test('HV-P3 the section: switch + one-line hint, 7 plain-word moods, 0.8-1.2 slider with Slower/Normal/Faster', () => {
    assert.match(SECTION, /Human pacing/);
    assert.match(SECTION, /\{HUMAN_PACING_HINT\}/);
    assert.match(SECTION, /<Switch\b/);
    assert.match(SECTION, /role="radiogroup" aria-label="Mood"/);
    assert.match(SECTION, /HUMAN_MOODS\.map\(/);
    assert.match(SECTION, /MOOD_LABEL\[m\]/);
    assert.match(SECTION, /type="range"[\s\S]{0,200}min=\{SPEED_MIN\}[\s\S]{0,80}max=\{SPEED_MAX\}[\s\S]{0,80}step=\{SPEED_STEP\}/);
    for (const w of ['Slower', 'Normal', 'Faster']) assert.match(SECTION, new RegExp(String.raw`>${w}<`));
  });

  test('HV-P4 Preview plays THIS voice + mood; speed is applied as playbackRate; no clip = no fake', () => {
    assert.match(SECTION, /previewUrl\(voice, value\.mood, PREVIEW_VOICE_IDS\)/);
    assert.match(SECTION, /const PREVIEW_VOICE_IDS = VOICES\.map\(\(v\) => v\.id\);/);
    assert.match(SECTION, /el\.playbackRate = value\.speed/);
    assert.match(SECTION, /No preview for this voice/);
    assert.match(SECTION, /useEffect\(\(\) => \(\) => audio\.current\?\.pause\(\), \[\]\)/, 'closing stops the preview');
  });

  test('HV-P5 the Edit profile wizard shows the same section in Look & sound', () => {
    assert.match(PAGE, /import HumanVoiceSection from '@\/components\/HumanVoiceSection'/);
    assert.match(PAGE, /<HumanVoiceSection voice=\{form\.voice\} value=\{voiceSettingsOf\(form\.voiceProfile\)\} onChange=\{\(v\) => setField\('voiceProfile', v\)\} \/>/);
    const look = PAGE.slice(PAGE.indexOf("current.id === 'look'"), PAGE.indexOf("current.id === 'thumbnails'"));
    assert.ok(look.indexOf('<VoicePicker') < look.indexOf('<HumanVoiceSection'), 'right under the voice picker');
  });
});

describe('HV-C: preview clips (studio/public/voices/human)', () => {
  const dir = path.join(ROOT, 'studio', 'public', 'voices', 'human');
  test('HV-C1 one clip per picker voice x mood, each small; the total stays small', () => {
    let total = 0;
    for (const v of VOICES) {
      for (const m of HUMAN_MOODS) {
        const f = path.join(dir, `${v.id}-${m}.mp3`);
        assert.ok(fs.existsSync(f), `missing preview ${v.id}-${m}.mp3 (python scripts/generate-human-voice-previews.py)`);
        const size = fs.statSync(f).size;
        assert.ok(size > 5_000 && size < 60_000, `${v.id}-${m}.mp3 is ${size} bytes`);
        total += size;
      }
    }
    assert.ok(total < 2_500_000, `total ${total} bytes`);
    const extra = fs.readdirSync(dir).filter((f) => !VOICES.some((v) => HUMAN_MOODS.some((m) => f === `${v.id}-${m}.mp3`)));
    assert.deepEqual(extra, [], 'no stray files');
  });

  test('HV-C2 the generator uses the real human_tts path, minus alignment, and the picker voice list', () => {
    const py = read('scripts/generate-human-voice-previews.py');
    assert.match(py, /voice_lines\.human_tts\(/);
    assert.doesNotMatch(py, /whisper_aligner|human_tts_to_mp3/);
    assert.match(py, /studio", "lib", "voices\.js"/);
    assert.match(py, /PREVIEW_TEXT = "Here's the thing\.\.\. Why does it matter\? Small habits compound\."/);
  });
});

describe('HV-R: readiness is unchanged', () => {
  test('HV-R1 still 7 items; a voiceProfile neither adds an item nor changes any', () => {
    assert.equal(READINESS_KEYS.length, 7);
    const entry = { slug: 'x', tokenSecretSaved: true, niche: 'n', cron: '21 3 * * *', kit: { voice: 'bm_daniel', templateId: 't', storyShape: 'template', description: 'd', tags: ['a'], thumbTemplates: ['a', 'b'], slots: ['00:05'], longSlot: '22:30' } };
    const schedule = { docDays: ['Thu'] };
    const a = channelReadiness({ entry, schedule });
    const b = channelReadiness({ entry: { ...entry, kit: { ...entry.kit, voiceProfile: { human: true, mood: 'calm', speed: 0.95 } } }, schedule });
    const c = channelReadiness({ entry: { ...entry, kit: { ...entry.kit, voiceProfile: { human: false } } }, schedule });
    assert.deepEqual(b, a);
    assert.deepEqual(c, a);
  });
});
