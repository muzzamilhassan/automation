import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PROVIDERS, encryptKeys, decryptKeys, maskKey } from '../studio/lib/keys-vault.js';
import { PROVIDER_ENV, applyChannelKeys } from '../lib/channel-keys.mjs';

test('keys-vault encrypts and decrypts provider keys cleanly with AES-256-GCM', () => {
  process.env.YOUTUBE_CLIENT_SECRET = 'test-secret-vault-12345';

  const sampleKeys = {
    gemini: 'AIzaSySampleGeminiKey12345',
    groq: 'gsk_SampleGroqKey987654321',
    pixabay: '12345678-abcdef123456',
  };

  const encrypted = encryptKeys(sampleKeys);
  assert.ok(typeof encrypted === 'string', 'Encrypted output should be a string');
  assert.equal(encrypted.split('.').length, 3, 'Ciphertext format must be iv.tag.ct');

  const decrypted = decryptKeys(encrypted);
  assert.deepEqual(decrypted, sampleKeys, 'Decrypted keys must match original object');
});

test('maskKey properly masks keys leaving only the last 4 characters visible', () => {
  assert.equal(maskKey('AIzaSyD-1234567890ABCD'), '••••ABCD');
  assert.equal(maskKey('short'), '••••');
  assert.equal(maskKey(''), '••••');
});

test('keys-vault PROVIDERS map matches PROVIDER_ENV mapping in lib/channel-keys', () => {
  for (const [providerKey, meta] of Object.entries(PROVIDERS)) {
    const ciEnvName = PROVIDER_ENV[providerKey];
    assert.ok(ciEnvName, `CI mapping must exist for provider: ${providerKey}`);
    assert.equal(meta.env, ciEnvName, `Env variable name must match between Studio and CI for: ${providerKey}`);
  }
});

test('decryptKeys gracefully returns null on corrupted ciphertext or wrong secret', () => {
  process.env.YOUTUBE_CLIENT_SECRET = 'original-secret';
  const ciphertext = encryptKeys({ openai: 'sk-12345' });

  // Switch secret
  process.env.YOUTUBE_CLIENT_SECRET = 'wrong-secret';
  const failed = decryptKeys(ciphertext);
  assert.equal(failed, null, 'Decryption with wrong secret should fail-closed and return null');

  // Corrupted ciphertext
  const corrupt = decryptKeys('invalid.iv.format');
  assert.equal(corrupt, null, 'Decryption of corrupted string should return null');
});

// ---- #39: shared-key stash/restore (drop must not leave NO key) ----
import fs from 'node:fs';
import { applyChannelKeys as applyK, dropChannelKeys as dropK, resetSharedKeyStash } from '../lib/channel-keys.mjs';

const KEYS_FILE = 'yt-mcp/channel-keys.json';
const TEST_SLUG = 'zz-keys-test';

test('#39 dropChannelKeys restores the stashed shared key (not delete)', () => {
  process.env.YOUTUBE_CLIENT_SECRET = 'test-secret-vault-12345';
  resetSharedKeyStash();
  // fixture vault: back up the real file, write a test entry, restore after
  const backup = fs.existsSync(KEYS_FILE) ? fs.readFileSync(KEYS_FILE, 'utf8') : null;
  const cipher = encryptKeys({ groq: 'gsk_CHANNEL_OVERRIDE_KEY' });
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify({ [TEST_SLUG]: { enc: cipher } }));
    const fake = { GROQ_API_KEY: 'gsk_SHARED_KEY', GEMINI_API_KEY: 'AIzaShared' };
    const applied = applyK(TEST_SLUG, fake);
    assert.deepEqual(applied, ['groq'], 'only the overridden provider applies');
    assert.equal(fake.GROQ_API_KEY, 'gsk_CHANNEL_OVERRIDE_KEY');
    dropK(['groq'], fake);
    assert.equal(fake.GROQ_API_KEY, 'gsk_SHARED_KEY', 'shared key must RESUME after drop');
  } finally {
    if (backup === null) fs.rmSync(KEYS_FILE, { force: true });
    else fs.writeFileSync(KEYS_FILE, backup);
    resetSharedKeyStash();
  }
});

test('#39 drop with no stashed shared value removes the env entry', () => {
  resetSharedKeyStash();
  const fake = { PIXABAY_API_KEY: 'chan-only-key' };
  dropK(['pixabay'], fake);
  assert.equal(fake.PIXABAY_API_KEY, undefined);
});

test('#39 re-apply after drop keeps stash-once semantics (original shared preserved)', () => {
  process.env.YOUTUBE_CLIENT_SECRET = 'test-secret-vault-12345';
  resetSharedKeyStash();
  const backup = fs.existsSync(KEYS_FILE) ? fs.readFileSync(KEYS_FILE, 'utf8') : null;
  const cipher = encryptKeys({ gemini: 'AIza_CH_KEY_A' });
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify({ [TEST_SLUG]: { enc: cipher } }));
    const fake = { GEMINI_API_KEY: 'AIza_SHARED' };
    applyK(TEST_SLUG, fake); // stash AIza_SHARED, apply CH_KEY_A
    dropK(['gemini'], fake); // restore AIza_SHARED
    fs.writeFileSync(KEYS_FILE, JSON.stringify({ [TEST_SLUG]: { enc: encryptKeys({ gemini: 'AIza_CH_KEY_B' }) } }));
    applyK(TEST_SLUG, fake); // stash-once: must NOT re-stash AIza_CH_KEY_A as "shared"
    assert.equal(fake.GEMINI_API_KEY, 'AIza_CH_KEY_B');
    dropK(['gemini'], fake);
    assert.equal(fake.GEMINI_API_KEY, 'AIza_SHARED', 'original shared value survives re-apply cycles');
  } finally {
    if (backup === null) fs.rmSync(KEYS_FILE, { force: true });
    else fs.writeFileSync(KEYS_FILE, backup);
    resetSharedKeyStash();
  }
});
