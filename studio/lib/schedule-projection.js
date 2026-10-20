// #100 SCHEDULING PANEL — pure validation + quota projection for the Studio
// scheduling card. Field names are the ENGINE contract (lib/doc-days.mjs,
// shorts-clips.mjs, channel-pipeline shortsSource) — this file and the engine
// must stay in lockstep (see also #96/#98/#99).

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_SET = new Set(DAY_NAMES);
const PER_UPLOAD = 1700;   // insert 1,600 + thumbnail 50 + pinned comment 50
const READS_MARGIN = 100;  // daily read-calls reservation — keep in lockstep with lib/quota-ledger.mjs

const normDays = (days) =>
  (Array.isArray(days) ? days : [])
    .map((d) => String(d || '').trim())
    .filter((d) => {
      const cap = d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
      return DAY_SET.has(cap);
    })
    .map((d) => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase());

// {ok, clean:{docDays, shortDays, shortsSource}, errors[], warnings[]}
export function validateSchedule({ docDays, shortDays, shortsSource } = {}) {
  const errors = [];
  const warnings = [];
  const clean = {
    docDays: normDays(docDays),
    shortDays: normDays(shortDays),
    shortsSource: shortsSource === 'clips' ? 'clips' : 'generated',
  };
  if (Array.isArray(docDays) && normDays(docDays).length !== docDays.filter(Boolean).length) {
    errors.push('unknown day name in docDays');
  }
  if (Array.isArray(shortDays) && normDays(shortDays).length !== shortDays.filter(Boolean).length) {
    errors.push('unknown day name in shortDays');
  }
  if (shortsSource && !['generated', 'clips'].includes(shortsSource)) {
    errors.push('shortsSource must be "generated" or "clips"');
  }
  if (clean.shortsSource === 'clips' && !clean.docDays.length) {
    warnings.push('Clips source is selected but no doc days are set — with no long-forms there is nothing to clip from.');
  }
  if (clean.shortsSource === 'clips' && clean.docDays.length) {
    const supply = clean.docDays.length * 4 + 1; // one 10-min doc yields ~4 usable clips
    if (clean.shortDays.length > supply) {
      warnings.push(`Short days (${clean.shortDays.length}) outpace clip supply (≈${supply}/week from ${clean.docDays.length} docs) — dry days will skip.`);
    }
  }
  if (clean.shortDays.length && !clean.shortDays.some((d) => clean.docDays.includes(d)) && clean.docDays.length) {
    warnings.push('No short day shares a doc day — clips will post from the queue backlog only.');
  }
  return { ok: errors.length === 0, clean, errors, warnings };
}

// Quota projection against the shared daily pool (#99 constants). The worst
// day is what matters: uploads landing on the same weekday stack in one pool
// window. tone: 'ok' (<=70%), 'warn' (70-100%), 'over' (>100%, must block).
export function projection({ docDays = [], shortDays = [], dailyLimit = 10000, perUpload = PER_UPLOAD, margin = READS_MARGIN } = {}) {
  const perDay = {};
  for (const d of docDays) perDay[d] = (perDay[d] || 0) + 1;
  for (const d of shortDays) perDay[d] = (perDay[d] || 0) + 1;
  const worstDayUploads = Math.max(0, ...Object.values(perDay));
  const weeklyUploads = docDays.length + shortDays.length;
  const worstDayUnits = worstDayUploads * perUpload;
  const avgDayUnits = Math.round(((weeklyUploads / 7) * perUpload + margin) * 10) / 10;
  const budget = dailyLimit - margin;
  const pct = Math.round((worstDayUnits / budget) * 100);
  const blocked = worstDayUnits + perUpload > budget;
  const tone = blocked || pct > 100 ? 'over' : pct > 70 ? 'warn' : 'ok';
  return { worstDayUploads, weeklyUploads, worstDayUnits, avgDayUnits, budget, pct, tone, blocked };
}
