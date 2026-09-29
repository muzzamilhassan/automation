// Shared, dependency-free auth token (works in Edge middleware + Node routes).
// The cookie never stores the password — only this one-way hash of it.
const SALT = 'quarry-studio-v1';

export async function authToken(password) {
  const data = new TextEncoder().encode(`${password || ''}::${SALT}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
