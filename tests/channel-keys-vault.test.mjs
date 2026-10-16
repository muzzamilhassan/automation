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
