// #115 — pure helpers for the Add Channel wizard's production-template
// hover previews. Framework-free (no DOM imports) so node --test can pin
// them: tests/wizard-template-previews.test.mjs.

// Preview source for one template: its OWN rendered sample row only (the
// gallery's rule). An mp4-less row still previews via its poster; nothing at
// all returns null and the card shows no preview affordance.
// 2026-11-23: the visual-family fallback was removed — every registry
// template shares the family "documentary-frames", so a template without its
// own row showed ANOTHER template's video under its name (owner: "its preview
// showing something else"). familyId/familySamples stay in the signature so
// callers don't break; they are deliberately ignored.
// eslint-disable-next-line no-unused-vars
export function previewSourceFor(templateId, familyId, samples = {}, familySamples = {}) {
  const usable = (s) => s && typeof s === 'object' && (s.mp4 || s.poster)
    ? { mp4: s.mp4 || null, poster: s.poster || null }
    : null;
  return usable(samples?.[templateId]);
}

// Where a zoomed hover popup goes, given the card's rect, the popup size and
// the viewport: prefer the card's right side, flip left on overflow, and as a
// last resort drop below the card clamped to both margins. Vertically the
// popup always ends fully on-screen (margin respected). Plain numbers in and
// out — the caller converts from/to DOM rects.
export function popupAnchorFor(cardRect, popup, viewport, margin = 12, gap = 10) {
  const vw = viewport?.width ?? 0;
  const vh = viewport?.height ?? 0;
  const pw = popup?.width ?? 0;
  const ph = popup?.height ?? 0;
  let placement = 'right';
  let left = cardRect.right + gap;
  if (left + pw + margin > vw) {
    placement = 'left';
    left = cardRect.left - gap - pw;
  }
  if (left < margin) {
    placement = 'below';
    left = Math.max(margin, Math.min(cardRect.left, vw - pw - margin));
  }
  let top = cardRect.top;
  if (top + ph + margin > vh) top = Math.max(margin, vh - ph - margin);
  return { left: Math.round(left), top: Math.round(top), placement };
}
