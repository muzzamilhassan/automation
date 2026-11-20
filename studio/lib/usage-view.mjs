// Live fix wave C4 (T5-13): the AI usage page's plain facts. Pure — no imports.

const NUMS = ['calls', 'ok_calls', 'fail_calls', 'tokens', 'measured_calls', 'estimated_calls', 'measured_tokens', 'estimated_tokens'];

// Rows whose key is not a real channel (e.g. "web-message", or none) fold
// into ONE "Other" row that lists what it holds. channelSlugs null = the
// registry could not be read → rows stay as they are.
export function groupChannelRows(rows, channelSlugs) {
  if (!Array.isArray(rows) || !Array.isArray(channelSlugs)) return rows;
  const known = new Set(channelSlugs);
  const keep = [];
  const other = { key: 'Other', other: true, parts: [] };
  for (const k of NUMS) other[k] = 0;
  for (const r of rows) {
    if (r && known.has(r.key)) { keep.push(r); continue; }
    other.parts.push(r?.key == null || r.key === '' ? '(none)' : String(r.key));
    for (const k of NUMS) other[k] += Number(r?.[k] || 0);
  }
  return other.parts.length ? [...keep, other] : keep;
}

const REASONS = {
  http_error: 'HTTP error',
  parse_error: 'unreadable reply',
  spawn_error: "couldn't start",
  timeout: 'timed out',
};
export function errorReason(errorClass) {
  const k = String(errorClass || '');
  if (!k) return 'unknown reason';
  return REASONS[k] || k.replace(/_/g, ' ');
}

// "29 of 129 calls failed · most often groq — HTTP error (16)"
export function failureSummary(totals, topErrors) {
  const fail = Number(totals?.fail_calls || 0);
  if (!fail) return '';
  const base = `${fail} of ${Number(totals?.events || 0)} calls failed`;
  const top = Array.isArray(topErrors) ? topErrors[0] : null;
  return top ? `${base} · most often ${top.provider} — ${errorReason(top.error_class)} (${Number(top.n || 0)})` : base;
}
