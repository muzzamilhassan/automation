// YouTube AI disclosure (status.containsSyntheticMedia) — option B1, 2026-11-16.
// Policy (https://support.google.com/youtube/answer/14328491): disclose only
// REALISTIC synthetic content — a real person made to say/do something, altered
// footage of a real event/place, a realistic scene that didn't occur, or AI
// music as the main focus. AI help with scripts, thumbnails, titles, captions
// and a narrator voice that is not a real person do not require it.
// "Disclosing AI content alone won't limit a video's audience or affect its
// eligibility to earn money" — declaring true when unsure is never a penalty.
//
// Decision: any reviewed answer YES -> true; else the channel's
// kit.syntheticMedia (owner-set); default false.

export function scriptDisclosureAnswers(script) {
  if (!script) return null;
  let meta = script.meta;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { meta = null; }
  }
  const a = meta?.disclosure_answers;
  return a && typeof a === 'object' ? a : null;
}

export function containsSyntheticMediaFor({ answers = null, kit = null } = {}) {
  if (answers && typeof answers === 'object' && Object.values(answers).some((v) => v === true)) return true;
  return kit?.syntheticMedia === true;
}
