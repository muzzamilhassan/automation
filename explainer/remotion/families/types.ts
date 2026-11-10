import type React from "react";
import type { V2Beat } from "../longscenes2";

// A template FAMILY = a scene system (research/full-template-families-
// 2026-11-09.md). A family covers ANY SUBSET of the engine's layouts; the
// uncovered layouts fall through to the engine's own theme-styled layouts,
// so family × theme remains a valid combination everywhere.
export type FamilyScene = React.FC<{ b: V2Beat }>;
export type Family = {
  name: string;
  scenes: Partial<Record<V2Beat["layout"], FamilyScene>>;
  // Optional family-branded caption renderer (karaoke band). Absent = the
  // engine's theme captions, byte-identically (default-inert).
  captions?: FamilyScene;
};
