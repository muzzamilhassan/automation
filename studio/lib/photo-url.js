// Which photo URLs the thumbnail preview may fetch server-side.
// The /thumbs page only ever sends Pexels image URLs (from /api/thumbs/photos);
// uploads arrive as dataURLs and never trigger a fetch. Anything else is
// refused so the route cannot be used as an open fetch proxy (audit
// 2026-11-13 #1). Callers must also pass `redirect: 'error'` to fetch.
const ALLOWED_PHOTO_HOSTS = new Set(['images.pexels.com']);

export function isAllowedPhotoUrl(raw) {
  if (typeof raw !== 'string' || !raw) return false;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return (
    u.protocol === 'https:' &&
    u.username === '' &&
    u.password === '' &&
    u.port === '' &&
    ALLOWED_PHOTO_HOSTS.has(u.hostname)
  );
}
