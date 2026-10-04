// Route guard for Studio APIs that touch secrets/OAuth.
import { authToken } from './auth-token';

export async function isAuthed(req) {
  const expected = process.env.STUDIO_PASSWORD;
  if (!expected) return false;
  const key = await authToken(expected);
  return (req.headers.get('cookie') || '').includes(`qs_key=${key}`);
}
