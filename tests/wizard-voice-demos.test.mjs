// #111 — pin-tests for the wizard's voice picker.
// Three contracts: (1) the picker offers EVERY voice production uses — any
// voice found in lib/brands.json must be listed in studio/lib/voices.js,
// (2) the data is sane (unique ids, Kokoro-shaped ids, labeled, demo paths),
// (3) every listed demo MP3 exists on disk — the wizard must never render a
// broken player, and it hides Play only via the `demo` field, never a 404.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { VOICES } = await import(pathToFileURL(join(ROOT, 'studio', 'lib', 'voices.js')).href);

test('#111: every voice production uses (lib/brands.json) is offered in the picker', () => {
  const brands = JSON.parse(readFileSync(join(ROOT, 'lib', 'brands.json'), 'utf8'));
  const kits = brands.brands || brands;
  const used = new Set(
    Object.values(kits)
      .map((k) => k?.voice || k?.voiceProfile?.voice)
      .filter(Boolean),
  );
  const offered = new Set(VOICES.map((v) => v.id));
  assert.ok(
    [...used].every((id) => offered.has(id)),
    `brands.json voices missing from studio/lib/voices.js: ${[...used].filter((id) => !offered.has(id)).join(', ')}`,
  );
});

test('#111: voice ids are unique and Kokoro-shaped', () => {
  const ids = VOICES.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate voice ids');
  for (const id of ids) assert.match(id, /^[ab][fm]_[a-z]+$/, `not a Kokoro voice id: ${id}`);
});

test('#111: every voice has a human label that says gender, not just an id', () => {
  for (const v of VOICES) {
    assert.ok(v.label && v.label.length >= 10, `empty/short label for ${v.id}`);
    assert.match(v.label, /male|female/i, `label should say the voice gender: ${v.id}`);
  }
});

test('#111: demo paths are repo-relative voice URLs', () => {
  for (const v of VOICES) {
    assert.match(v.demo, /^\/voices\/[ab][fm]_[a-z]+\.mp3$/, `bad demo path for ${v.id}: ${v.demo}`);
    assert.equal(v.demo, `/voices/${v.id}.mp3`, 'demo path must match the generator output name');
  }
});

test('#111: every listed demo MP3 exists on disk — never a broken player', () => {
  for (const v of VOICES) {
    const onDisk = existsSync(join(ROOT, 'studio', 'public', v.demo));
    assert.ok(onDisk, `demo file missing (regenerate with scripts/generate-voice-demos.py): ${v.demo}`);
  }
});
