// Live fix wave A1 (T1-14) — the ONLY messages the login page shows from
// ?error=. The URL carries a short code; the text is fixed here, so a crafted
// link can never put its own words on the sign-in screen. Unknown codes show
// nothing. Pure (no '@/' imports).
//
// Who sets these codes:
//   signed_out     — the app frame, when /api/me says the session is gone (T1-10)
//   google_expired — /api/auth/google/callback, state cookie missing/mismatched
//   google_failed  — /api/auth/google/callback, Google gave no usable identity
//   not_invited    — /api/auth/google/callback, the email is not on the team list
export const LOGIN_ERRORS = Object.freeze({
  signed_out: 'You were signed out — please sign in again.',
  google_expired: 'Sign-in expired — try again.',
  google_failed: 'Google sign-in failed — try again.',
  not_invited: 'This Google account is not invited. Ask the owner to add it to the team list.',
});

export function loginErrorMessage(code) {
  if (typeof code !== 'string' || !Object.hasOwn(LOGIN_ERRORS, code)) return '';
  return LOGIN_ERRORS[code];
}
