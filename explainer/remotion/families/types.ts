import type React from "react";
import type { V2Beat, V2Shot } from "../longscenes2";

// A template FAMILY = a scene system (research/full-template-families-
// 2026-11-09.md). A family covers ANY SUBSET of the engine's layouts; the
// uncovered layouts fall through to the engine's own theme-styled layouts,
// so family × theme remains a valid combination everywhere.
export type FamilyScene = React.FC<{ b: V2Beat }>;
export type Family = {
  name: string;
  scenes: Partial<Record<V2Beat["layout"], FamilyScene>>;
  // Continuous flow (2026-11-27): a family that owns a full-bleed background
  // draws it per SHOT (DocV2's persistent, crossfaded shot layer — never per
  // sentence) and its frame furniture ONCE for the whole episode. Absent =
  // the engine's own shot backdrop (beat media only) and no frame.
  Backdrop?: React.FC<{ shot: V2Shot; seed: number }>;
  hasBackdrop?: (shot: V2Shot) => boolean;
  Frame?: React.FC;
};
