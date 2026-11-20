// Live fix wave B3 (T1-04/T1-05) — where a topbar popover goes on screen.
// Pure: no React, no '@/' imports (tested in tests/wave-b3.test.mjs).
//
// The popover hangs `gap` px below its trigger, right-aligned to the
// trigger's right edge (the desktop look), then is clamped so it never leaves
// the viewport: width ≤ viewport − 2·margin, left ≥ margin, right ≤ viewport −
// margin. On a 390px phone the 340px bell list used to start at x = −34.
export function placePopover({ anchor, width, viewportWidth, margin = 8, gap = 10 }) {
  const vw = Math.max(0, Number(viewportWidth) || 0);
  const w = Math.max(0, Math.min(Number(width) || 0, vw - margin * 2));
  const right = Number(anchor?.right) || 0;
  const maxLeft = vw - margin - w;
  const left = Math.max(margin, Math.min(right - w, maxLeft));
  return { top: (Number(anchor?.bottom) || 0) + gap, left, width: w };
}
