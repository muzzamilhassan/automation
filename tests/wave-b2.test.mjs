// live fix wave B2 — AI kit draft, voice demo, thumbnails studio.
// Pure logic is imported; client components (with '@/' imports) are pinned
// by source scans that tolerate CRLF. EARS criteria live in
// docs/qa/live-fix-wave-b2-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planKitDraft, applyDraftField, mergePillars, draftValue } from '../studio/lib/kit-draft-merge.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const WIZ = (f) => read(`studio/components/wizard/${f}`);

const EMPTY = { label: 'QA', niche: 'stoicism', subNiches: '', style: 'cinematic', voice: 'am_michael', eyebrow: '', tagline: '', tags: '', description: '' };
const DRAFT = {
  kit: {
    niches: ['Stoic Habits', 'power of silence'],
    description: 'Stoic wisdom in 60 seconds.',
    tags: ['stoic quotes, timeless wisdom', 'Stoic Quotes', 'x'],
    eyebrow: 'STOIC RULES',
    tagline: 'Calm wins.',
  },
  suggestion: { voice: 'bm_daniel', style: 'doc' },
};

/* ------------------------- T4-06: fill only empty ------------------------- */

test('T4-06: WHEN the form is empty, the draft fills every empty field and says so', () => {
  const { form, status } = planKitDraft(EMPTY, DRAFT);
  assert.equal(form.subNiches, 'stoic habits, power of silence');
  assert.equal(form.description, 'Stoic wisdom in 60 seconds.');
  assert.equal(form.tags, 'stoic quotes, timeless wisdom', 'tags normalised: split, deduped, fragments dropped');
  assert.equal(form.eyebrow, 'STOIC RULES');
  assert.equal(form.tagline, 'Calm wins.');
  for (const k of ['subNiches', 'description', 'tags', 'eyebrow', 'tagline']) assert.equal(status[k], 'filled', k);
});

test('T4-06: voice and style are never auto-applied — they stay suggestions', () => {
  const { form, status } = planKitDraft(EMPTY, DRAFT);
  assert.equal(form.voice, 'am_michael');
  assert.equal(form.style, 'cinematic');
  assert.equal(status.voice, 'pending');
  assert.equal(status.style, 'pending');
});

test('T4-06: WHEN the user already filled a field, the draft keeps their text and offers the suggestion', () => {
  const mine = { ...EMPTY, description: 'My own words.', tagline: 'Mine.', subNiches: 'my custom pillar', tags: 'my tag' };
  const { form, status } = planKitDraft(mine, DRAFT);
  assert.equal(form.description, 'My own words.');
  assert.equal(form.tagline, 'Mine.');
  assert.equal(form.subNiches, 'my custom pillar', 'custom pillar is never dropped');
  assert.equal(form.tags, 'my tag');
  assert.equal(form.eyebrow, 'STOIC RULES', 'the still-empty field is filled');
  assert.equal(status.description, 'pending');
  assert.equal(status.tagline, 'pending');
  assert.equal(status.subNiches, 'pending');
  assert.equal(status.tags, 'pending');
  assert.equal(status.eyebrow, 'filled');
});

test('T4-06: "Use this" on pillars MERGES — the custom pillar survives', () => {
  const mine = { ...EMPTY, subNiches: 'my custom pillar, stoic habits' };
  const next = applyDraftField(mine, 'subNiches', DRAFT);
  assert.equal(next.subNiches, 'my custom pillar, stoic habits, power of silence');
  assert.equal(mergePillars('A, b', ['B', 'c']), 'a, b, c');
});

test('T4-06: "Use this" on other fields replaces with the draft (explicit choice)', () => {
  const mine = { ...EMPTY, description: 'mine', tags: 'old' };
  assert.equal(applyDraftField(mine, 'description', DRAFT).description, 'Stoic wisdom in 60 seconds.');
  assert.equal(applyDraftField(mine, 'tags', DRAFT).tags, 'stoic quotes, timeless wisdom');
  assert.equal(applyDraftField(mine, 'voice', DRAFT).voice, 'bm_daniel');
  assert.equal(applyDraftField(mine, 'style', DRAFT).style, 'doc');
  assert.equal(applyDraftField(mine, 'nope', DRAFT), mine, 'unknown keys change nothing');
});

test('T4-06: a field that already matches the draft is marked same; empty draft values make no row', () => {
  const same = { ...EMPTY, eyebrow: 'STOIC RULES', voice: 'bm_daniel' };
  const { status } = planKitDraft(same, { kit: { eyebrow: 'STOIC RULES', tagline: '' }, suggestion: { voice: 'bm_daniel' } });
  assert.equal(status.eyebrow, 'same');
  assert.equal(status.voice, 'same');
  assert.ok(!('tagline' in status), 'no drafted tagline → no row');
  assert.ok(!('style' in status));
  assert.equal(draftValue('tags', { kit: {} }), '');
});

/* ------------------------- wizard wiring (sources) ------------------------ */

test('T4-06: IdentityStep drafts through planKitDraft — never a wholesale overwrite', () => {
  const id = WIZ('IdentityStep.js');
  assert.match(id, /import \{ planKitDraft, applyDraftField \} from '@\/lib\/kit-draft-merge\.mjs'/);
  assert.match(id, /fetch\('\/api\/channels\/kit', \{[\s\S]*?useLLM: true/);
  assert.match(id, /planKitDraft\(f, next\)/);
  assert.doesNotMatch(id, /kit\.onAutoFill/, 'the old page-level overwrite path is no longer used');
  assert.match(id, /status\[key\] === 'pending'/, 'Apply all only touches pending fields');
});

test('T4-06: AiDraftPanel shows per-field "Use this", keeps "Apply all", and marks auto-filled rows', () => {
  const p = WIZ('AiDraftPanel.js');
  assert.match(p, />\s*Use this\s*</);
  assert.match(p, /Apply all/);
  assert.match(p, /Filled/);
  assert.match(p, /status\[key\]/);
});

test('T4-07: the SEO-tags input normalises on blur with the shared helper', () => {
  const id = WIZ('IdentityStep.js');
  assert.match(id, /import \{ tagsToField, TAG_LIMITS \} from '@\/lib\/tag-normalize\.mjs'/);
  assert.match(id, /onBlur=\{\(e\) => setField\('tags', tagsToField\(e\.target\.value\)\)\}/);
});

test('T4-07: the kit route normalises tags on both paths and splits a comma niche', () => {
  const r = read('studio/app/api/channels/kit/route.js');
  assert.match(r, /import \{ normalizeTags \} from '@\/lib\/tag-normalize\.mjs'/);
  assert.match(r, /const tags = normalizeTags\(/);
  assert.match(r, /tags: normalizeTags\(llmDraft\.tags/);
  assert.match(r, /low\.split\(','\)/, 'a niche like "a, b" is split before suffixes are added');
});

test('P9: the kit route logs and audits the full Groq error detail (no key)', () => {
  const r = read('studio/app/api/channels/kit/route.js');
  assert.match(r, /console\.error\('\[kit-llm-draft\]'/);
  assert.match(r, /\.slice\(0, 300\)/, 'the audit note keeps Groq\'s message, not just "groq 400"');
  assert.doesNotMatch(r, /GROQ_API_KEY\}/, 'the key is never interpolated into text');
});

/* -------------------------- T4-12: voice demo ---------------------------- */

test('T4-12: a stale play() rejection cannot clear a newer demo (token guard)', () => {
  const v = WIZ('VoicePicker.js');
  assert.match(v, /const playToken = useRef\(0\)/);
  assert.match(v, /const token = \+\+playToken\.current;/);
  assert.match(v, /if \(playToken\.current === token\) setPlaying\(null\)/);
  assert.doesNotMatch(v, /el\.play\(\)\.catch\(\(\) => setPlaying\(null\)\)/, 'the unguarded reset is gone');
  assert.match(v, /el\.src = voice\.demo/);
  assert.equal((v.match(/<audio\b/g) || []).length, 1, 'one audio element');
});

/* ------------------------- thumbnails studio ----------------------------- */

const THUMBS = read('studio/app/thumbs/page.js');

test('P14: no hard-coded brand text as editor defaults', () => {
  assert.doesNotMatch(THUMBS, /useState\('RULES'\)|useState\('MONEY HABITS'\)|useState\('Killing'\)/);
  assert.match(THUMBS, /const \[accentWord, setAccentWord\] = useState\(''\)/);
  assert.match(THUMBS, /const \[chip, setChip\] = useState\(''\)/);
  assert.match(THUMBS, /const \[eyebrow, setEyebrow\] = useState\(''\)/);
});

test('P14: defaults come from the selected channel — saved branding, then its own kit eyebrow', () => {
  assert.match(THUMBS, /setEyebrow\(b\.eyebrow \|\| d\.kit\?\.eyebrow \|\| ''\)/);
  assert.match(THUMBS, /setChip\(b\.chip \|\| ''\)/);
  const br = read('studio/app/api/thumbs/branding/route.js');
  assert.match(br, /kit: await kitDefaults\(slug\)/);
  assert.match(br, /entry\?\.kit\?\.eyebrow/);
});

test('T5-14: switching channel resets the per-channel fields (headline first)', () => {
  const pick = THUMBS.slice(THUMBS.indexOf('const pickChannel'), THUMBS.indexOf('const saveBranding'));
  for (const call of ["setTitle('')", "setAccentWord('')", "setChip('')", "setEyebrow('')", 'setPreview(null)', 'setAbVariants([])', 'setMoreVariants([])', "setPhotoUrl('')", "setPhotoDataUrl('')"]) {
    assert.ok(pick.includes(call), `pickChannel calls ${call}`);
  }
});

test('T5-02: the editor grid has a mobile column rule and nothing forces 666px', () => {
  assert.match(THUMBS, /grid grid-cols-1 lg:grid-cols-\[minmax\(0,1fr\)_420px\]/);
  assert.doesNotMatch(THUMBS, /grid lg:grid-cols-\[1fr_420px\]/);
  assert.match(THUMBS, /mt-3 flex flex-wrap items-end gap-4/, 'the preview row wraps on phones');
});

test('T5-16: one headline word rule, used by the label and the checklist', () => {
  assert.match(THUMBS, /const HEADLINE_MAX_WORDS = 7;/);
  assert.doesNotMatch(THUMBS, /≤4 words|≤7 recommended/);
  assert.ok((THUMBS.match(/HEADLINE_MAX_WORDS/g) || []).length >= 3, 'declared once, used by the label and the checklist');
});
