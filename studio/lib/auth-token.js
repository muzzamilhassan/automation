// Shared, dependency-free HMAC helper (works in Edge middleware + Node).
// 10-05: HMAC for connect links — state the callback can verify in ANY browser
// without a Studio session (only Studio can mint these; they expire).
// #117 removed authToken() (the SHA-256 password hash the legacy qs_key
// cookie carried) — that cookie is no longer minted nor accepted anywhere.
export async function hmacToken(payload, keyMaterial) {
  // #58: no in-repo fallback key — callers must pass real secret material
  if (!keyMaterial) throw new Error('hmac key material missing');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyMaterial),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(payload)));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
