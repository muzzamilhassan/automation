import { statementReceipt } from "./statementReceipt";
import { darkDoc } from "./darkDoc";
import { rankCountdown } from "./rankCountdown";
import { landscapeQuote } from "./landscapeQuote";
import { glassNumber } from "./glassNumber";
import { mapAtlas } from "./mapAtlas";
import { collageArchive } from "./collageArchive";
import { boardSystem } from "./boardSystem";
import type { Family } from "./types";

// The FAMILY registry (research/full-template-families-2026-11-09.md): a
// template's doc_presentation.style names one of these keys; DocV2 dispatches
// its beats to the family's scene renderers. Uncovered layouts fall through to
// the engine's own theme-styled layouts, so family × theme stays coherent.
// Absent/unknown style = the original engine, byte-identically (default-inert).
export const FAMILIES: Record<string, Family> = {
  "statement-receipt": statementReceipt,
  "dark-doc": darkDoc,
  "rank-countdown": rankCountdown,
  "landscape-quote": landscapeQuote,
  "glass-number": glassNumber,
  "map-atlas": mapAtlas,
  "collage-archive": collageArchive,
  "board-system": boardSystem,
};

export type { Family, FamilyScene } from "./types";
