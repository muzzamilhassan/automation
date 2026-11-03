// #106 INCIDENT (the four black Money Rulebook docs, Oct 28 -> Nov 2) — the
// doc lane's visual-layer helpers as pure, importable functions.
// yt-deepdive.mjs executes top-level code, so its logic lives in lib/ for the
// suite (the lib/doc-template.mjs pattern).
//
//   chapterLowerThirdSvg — the chapter lower-third as a TRANSPARENT 1920x1080
//     overlay (DEFECT 2). The old card built on frameSvg: a full-frame opaque
//     gradient + glow, which segment() composites overlay=0:0 — the card
//     COVERED the chapter b-roll 100%, so even a fetched Pixabay clip was
//     invisible (black docs with voice). Only the bottom band (fill-opacity
//     0.58), the 14px accent bar, and the two text lines are painted; sharp
//     keeps the alpha into the PNG and the existing overlay binding shows the
//     b-roll through. frameSvg stays opaque in yt-deepdive for the intro/end
//     cards — those are static gradient cards by design.
//
//   docBrollGate — the loud fail-closed verdict. Per-chapter fetches are
//     best-effort, but a run where ZERO chapters carry a clip is systemic
//     (dead key, network down, empty search — or a swallowed regression like
//     the undefined-`page` ReferenceError this lane shipped for weeks) and
//     the render must REFUSE before the upload. A black doc never ships
//     again; a partially covered episode is degraded (flat fallback chapters),
//     not black, and still ships.
import { EMBEDDED_FONTS_CSS } from '../typography-poster-engine.mjs';

// Local per the repo convention (every renderer defines its own esc).
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function chapterLowerThirdSvg({ num, title, accent }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
  <defs><style>${EMBEDDED_FONTS_CSS}</style></defs>
  <rect x="0" y="872" width="1920" height="208" fill="#000000" fill-opacity="0.58"/>
  <rect x="0" y="872" width="14" height="208" fill="${accent}"/>
  <text x="70" y="948" font-family="Oswald" font-weight="600" font-size="30" letter-spacing="8" fill="${accent}">CHAPTER ${String(num).padStart(2, '0')} / 08</text>
  <text x="70" y="1028" font-family="Oswald" font-weight="700" font-size="56" fill="#FFFFFF">${esc(String(title).slice(0, 46).toUpperCase())}</text>
</svg>`;
}

export function docBrollGate(totalChapters, chaptersWithClips) {
  const total = Number(totalChapters) || 0;
  const withClips = Number(chaptersWithClips) || 0;
  if (total < 1 || withClips > 0) return { ok: true, total, withClips };
  return {
    ok: false,
    total,
    withClips,
    reason: `0/${total} chapters carry b-roll — every fetch failed or returned nothing, so the episode would render as a black video; refusing before any upload`,
  };
}
