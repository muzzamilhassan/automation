import React, { useEffect } from "react";
import { useSteppedFrame } from "./stylepacks";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, continueRender, delayRender } from "remotion";

// ============ DOCUMENTARY V2 — themed layout engine with safe zones ============
// Rules baked in:
//  - TOP band (0-110) and BOTTOM band (900+) are furniture-only; content never enters
//  - on-screen text: max ~90 chars per beat (2 lines), auto-sized, ellipsized
//  - layouts rotate: hero / split-left / split-right / stat / chapter / end
//  - brand strip + hairline live below content, never overlapped
//  - doc.theme picks the look: "investing" | "vox" | "poster"

export type Theme = {
  bg: string; ink: string; sub: string; accent: string; accent2: string;
  line: string; dot: string; furn: string; ghost: string; photoTint: string;
  display: string; body: string; mono: string;
  displayWeight: number; upper: boolean; grain: boolean;
  subStyle: "bar" | "marker" | "none"; highlight: string;
  capColor: string;
  brand: string; eyebrow: string; badge: string;
  // P2 motion grammar — per-theme entrance style. Absent = the original
  // smooth spring, byte-identically (default-inert).
  motion?: { kind: "spring" | "stepped" | "typewriter"; step?: number };
};

const SERIF = "'Playfair Display', Georgia, serif";
const GROT = "Inter, Arial, sans-serif";
const MONO = "'JetBrains Mono', Consolas, 'DejaVu Sans Mono', monospace";

export const THEMES: Record<string, Theme> = {
  investing: {
    bg: "#0B1220", ink: "#F2EEE3", sub: "#8B98AC", accent: "#E8C15A", accent2: "#58C08A",
    line: "rgba(242,238,227,0.14)", dot: "rgba(242,238,227,0.18)", furn: "rgba(242,238,227,0.55)",
    ghost: "rgba(232,193,90,0.5)", photoTint: "rgba(11,18,32,0.32)",
    display: GROT, body: GROT, mono: MONO,
    displayWeight: 900, upper: false, grain: false,
    subStyle: "bar", highlight: "transparent", capColor: "#FFD97A",
    brand: "INVESTOR'S COMPASS", eyebrow: "MARKET WISDOM // INVESTOR'S COMPASS", badge: "IC",
  },
  vox: {
    bg: "#FAF5EE", ink: "#1A1A1A", sub: "#6B645A", accent: "#C1272D", accent2: "#1D6F5C",
    line: "rgba(26,26,26,0.16)", dot: "rgba(26,26,26,0.22)", furn: "rgba(26,26,26,0.6)",
    ghost: "rgba(193,39,45,0.35)", photoTint: "rgba(26,26,26,0.22)",
    display: SERIF, body: GROT, mono: MONO,
    displayWeight: 800, upper: false, grain: true,
    subStyle: "marker", highlight: "#FFE45C", capColor: "#FF8A7A",
    brand: "QUARRY EXPLAINS", eyebrow: "THE BIG IDEA // QUARRY EXPLAINS", badge: "QX",
  },
  poster: {
    bg: "#0A0A0A", ink: "#FFFFFF", sub: "#9AA0A6", accent: "#FF3366", accent2: "#3D7BFF",
    line: "rgba(255,255,255,0.16)", dot: "rgba(255,255,255,0.22)", furn: "rgba(255,255,255,0.5)",
    ghost: "rgba(255,51,102,0.45)", photoTint: "rgba(10,10,10,0.38)",
    display: "'Archivo Black', Inter, Arial, sans-serif", body: GROT, mono: MONO,
    displayWeight: 400, upper: true, grain: false,
    subStyle: "none", highlight: "transparent", capColor: "#FF5C82",
    brand: "SIGNAL LAB", eyebrow: "TECH DECODED // SIGNAL LAB", badge: "SL",
  },
  // Template-factory batch palettes (2026-11-05) — adapted from the Hassan
  // skills' theme tokens (research/hassan-video-skills-findings-2026-11-05.md).
  // Selected by storybook DATA: doc_presentation.theme; templates without the
  // field stay on vox byte-identically (default-inert, same rule as every
  // storybook DATA toggle).
  history: {
    bg: "#F5F3EE", ink: "#1D2025", sub: "#6B6455", accent: "#3659E3", accent2: "#8A6D3B",
    line: "rgba(29,32,37,0.16)", dot: "rgba(29,32,37,0.22)", furn: "rgba(29,32,37,0.6)",
    ghost: "rgba(54,89,227,0.35)", photoTint: "rgba(29,32,37,0.2)",
    display: SERIF, body: GROT, mono: MONO,
    displayWeight: 800, upper: false, grain: true,
    subStyle: "marker", highlight: "#FFD84D", capColor: "#3659E3",
    motion: { kind: "typewriter", step: 3 }, // the record unfolds line by line
    brand: "HISTORY VAULT", eyebrow: "HISTORY STORIES // HV", badge: "HV",
  },
  wisdom: {
    bg: "#181A1C", ink: "#F2EFE9", sub: "#8A8F98", accent: "#578AE0", accent2: "#CB9370",
    line: "rgba(242,239,233,0.14)", dot: "rgba(242,239,233,0.2)", furn: "rgba(242,239,233,0.55)",
    ghost: "rgba(87,138,224,0.4)", photoTint: "rgba(24,26,28,0.35)",
    display: SERIF, body: GROT, mono: MONO,
    displayWeight: 800, upper: false, grain: true,
    subStyle: "marker", highlight: "rgba(87,138,224,0.4)", capColor: "#578AE0",
    motion: { kind: "stepped", step: 4 }, // written on cue, not animated in
    brand: "TIMELESS WISDOM", eyebrow: "WISDOM STORIES // TW", badge: "TW",
  },
  travel: {
    bg: "#241812", ink: "#F7EFE2", sub: "#A08B78", accent: "#E8853D", accent2: "#2E9E8F",
    line: "rgba(247,239,226,0.15)", dot: "rgba(247,239,226,0.2)", furn: "rgba(247,239,226,0.55)",
    ghost: "rgba(232,133,61,0.4)", photoTint: "rgba(36,24,18,0.3)",
    display: SERIF, body: GROT, mono: MONO,
    displayWeight: 800, upper: false, grain: true,
    subStyle: "marker", highlight: "rgba(232,133,61,0.45)", capColor: "#F2A65A",
    motion: { kind: "stepped", step: 3 },
    brand: "TRAVEL EXPLAINED", eyebrow: "MAPS & ROUTES // TE", badge: "TE",
  },
  focus: {
    bg: "#EDF5F1", ink: "#0E2A23", sub: "#5E7A72", accent: "#0FA36B", accent2: "#F2B84B",
    line: "rgba(14,42,35,0.14)", dot: "rgba(14,42,35,0.2)", furn: "rgba(14,42,35,0.55)",
    ghost: "rgba(15,163,107,0.32)", photoTint: "rgba(14,42,35,0.16)",
    display: SERIF, body: GROT, mono: MONO,
    displayWeight: 800, upper: false, grain: false,
    subStyle: "bar", highlight: "rgba(15,163,107,0.28)", capColor: "#0E2A23",
    motion: { kind: "typewriter", step: 2 },
    brand: "DEEP FOCUS", eyebrow: "SYSTEMS // DEEP FOCUS", badge: "DF",
  },
  science: {
    bg: "#EEF1F6", ink: "#1D2070", sub: "#5A5F73", accent: "#1D2070", accent2: "#FEAF1D",
    line: "rgba(29,32,112,0.16)", dot: "rgba(29,32,112,0.22)", furn: "rgba(29,32,112,0.6)",
    ghost: "rgba(29,32,112,0.3)", photoTint: "rgba(29,32,112,0.18)",
    display: SERIF, body: GROT, mono: MONO,
    displayWeight: 800, upper: false, grain: false,
    subStyle: "bar", highlight: "rgba(254,175,29,0.5)", capColor: "#1D2070",
    motion: { kind: "stepped", step: 2 }, // measured, on 2s
    brand: "SCIENCE EXPLAINED", eyebrow: "SCIENCE STORIES // SE", badge: "SE",
  },
  // Style-catalog batch (2026-11-09, research/video-style-catalog-2026-11-09.md) —
  // eight popular faceless looks as pure token themes. Drafts carry their own
  // brand/eyebrow/badge (these theme defaults are placeholders — longscenes2
  // line ~707 lets doc_presentation override them).
  brief: {
    // Modern MBA / How Money Works — clean corporate diagram deck
    bg: "#F6F8FA", ink: "#10202E", sub: "#5B6B7A", accent: "#0F62FE", accent2: "#DA1E28",
    line: "rgba(16,32,46,0.14)", dot: "rgba(16,32,46,0.2)", furn: "rgba(16,32,46,0.55)",
    ghost: "rgba(15,98,254,0.32)", photoTint: "rgba(16,32,46,0.16)",
    display: GROT, body: GROT, mono: MONO,
    displayWeight: 900, upper: true, grain: false,
    subStyle: "bar", highlight: "rgba(15,98,254,0.18)", capColor: "#0F62FE",
    brand: "STRAIGHT BOOK", eyebrow: "BUSINESS BRIEFS // SB", badge: "SB",
  },
  stoic: {
    // Einzelgänger-class dark discipline — charcoal, bone ink, gold, Cinzel
    bg: "#0D0B08", ink: "#E8DCC8", sub: "#8A7D68", accent: "#C9A227", accent2: "#7A1F2B",
    line: "rgba(232,220,200,0.14)", dot: "rgba(232,220,200,0.2)", furn: "rgba(232,220,200,0.55)",
    ghost: "rgba(201,162,39,0.4)", photoTint: "rgba(13,11,8,0.35)",
    display: "'Cinzel', 'Playfair Display', Georgia, serif", body: GROT, mono: MONO,
    displayWeight: 700, upper: true, grain: true,
    subStyle: "bar", highlight: "rgba(201,162,39,0.32)", capColor: "#C9A227",
    motion: { kind: "stepped", step: 4 }, // carved on cue, not animated in
    brand: "IRON CODE", eyebrow: "DISCIPLINE STORIES // IC", badge: "IC",
  },
  legacy: {
    // Old-money quiet luxury — ivory, deep navy, burgundy, serif
    bg: "#F4EFE6", ink: "#1B2A4A", sub: "#6E6255", accent: "#7A1F2B", accent2: "#8C6D3F",
    line: "rgba(27,42,74,0.14)", dot: "rgba(27,42,74,0.2)", furn: "rgba(27,42,74,0.55)",
    ghost: "rgba(122,31,43,0.3)", photoTint: "rgba(27,42,74,0.18)",
    display: SERIF, body: GROT, mono: MONO,
    displayWeight: 800, upper: false, grain: true,
    subStyle: "marker", highlight: "rgba(140,109,63,0.35)", capColor: "#7A1F2B",
    brand: "HEIRLOOM", eyebrow: "OLD MONEY STORIES // HL", badge: "HL",
  },
  midnight: {
    // LEMMiNO/Fern minimal dark essay — near-black navy, one cool glow
    bg: "#0A0E1A", ink: "#E8EAF0", sub: "#7C8AA5", accent: "#4F8CFF", accent2: "#3FBFAD",
    line: "rgba(232,234,240,0.13)", dot: "rgba(232,234,240,0.18)", furn: "rgba(232,234,240,0.5)",
    ghost: "rgba(79,140,255,0.4)", photoTint: "rgba(10,14,26,0.4)",
    display: SERIF, body: GROT, mono: MONO,
    displayWeight: 800, upper: false, grain: false,
    subStyle: "bar", highlight: "rgba(79,140,255,0.3)", capColor: "#9CC3FF",
    brand: "NIGHT ARCHIVE", eyebrow: "SLEEP & NIGHT SCIENCE // NA", badge: "NA",
  },
  signal: {
    // Coffeezilla evidence desk — dark board, red flag / verified green
    bg: "#101214", ink: "#E6E8EA", sub: "#8A9199", accent: "#FF4747", accent2: "#37C871",
    line: "rgba(230,232,234,0.14)", dot: "rgba(230,232,234,0.2)", furn: "rgba(230,232,234,0.5)",
    ghost: "rgba(255,71,71,0.35)", photoTint: "rgba(16,18,20,0.4)",
    display: GROT, body: GROT, mono: MONO,
    displayWeight: 800, upper: true, grain: false,
    subStyle: "marker", highlight: "rgba(255,71,71,0.25)", capColor: "#FF8A8A",
    motion: { kind: "typewriter", step: 2 }, // the record types itself
    brand: "EVIDENCE ROOM", eyebrow: "AI & TECH DECODED // ER", badge: "ER",
  },
  volt: {
    // ColdFusion / Jikh sleek tech — pure black glass, cyan glow, mono labels
    bg: "#050607", ink: "#F5F6F7", sub: "#6E747C", accent: "#00E5FF", accent2: "#7C4DFF",
    line: "rgba(245,246,247,0.12)", dot: "rgba(245,246,247,0.18)", furn: "rgba(245,246,247,0.45)",
    ghost: "rgba(0,229,255,0.35)", photoTint: "rgba(5,6,7,0.45)",
    display: GROT, body: GROT, mono: MONO,
    displayWeight: 700, upper: false, grain: false,
    subStyle: "bar", highlight: "rgba(0,229,255,0.22)", capColor: "#66F0FF",
    motion: { kind: "typewriter", step: 1 }, // electric tick
    brand: "FULL CURRENT", eyebrow: "FOCUS SYSTEMS // FC", badge: "FC",
  },
  frontier: {
    // History war-room — parchment on dark wood, crimson wax, map/timeline heroes
    bg: "#14100A", ink: "#EAD9A2", sub: "#9C8B6C", accent: "#B8332A", accent2: "#3E6B4F",
    line: "rgba(234,217,162,0.15)", dot: "rgba(234,217,162,0.22)", furn: "rgba(234,217,162,0.55)",
    ghost: "rgba(184,51,42,0.4)", photoTint: "rgba(20,16,10,0.35)",
    display: SERIF, body: GROT, mono: MONO,
    displayWeight: 800, upper: false, grain: true,
    subStyle: "marker", highlight: "rgba(184,51,42,0.3)", capColor: "#E8B04B",
    motion: { kind: "typewriter", step: 3 }, // the chronicle unfolds line by line
    brand: "SALT & IRON", eyebrow: "HISTORY STORIES // SI", badge: "SI",
  },
  letterpress: {
    // Monumental quote cards — warm paper, ink black, deep red, giant serif
    bg: "#EFEAE2", ink: "#171310", sub: "#6B625A", accent: "#8C1D18", accent2: "#2F4A3C",
    line: "rgba(23,19,16,0.16)", dot: "rgba(23,19,16,0.22)", furn: "rgba(23,19,16,0.6)",
    ghost: "rgba(140,29,24,0.32)", photoTint: "rgba(23,19,16,0.2)",
    display: SERIF, body: GROT, mono: MONO,
    displayWeight: 900, upper: false, grain: true,
    subStyle: "marker", highlight: "rgba(140,29,24,0.18)", capColor: "#8C1D18",
    motion: { kind: "stepped", step: 3 }, // pressed, on 3s
    brand: "MARBLE QUILL", eyebrow: "TIMELESS WISDOM // MQ", badge: "MQ",
  },
};

const ThemeCtx = React.createContext<Theme>(THEMES.investing);
const useT = () => React.useContext(ThemeCtx);

// P2 motion grammar — the theme-aware entrance. With no motion profile the
// math is IDENTICAL to the original spring (default-inert); stepped themes
// quantize the frame (the "on Ns" feel), typewriter themes hard-reveal on a
// quantized ticker (the typed pacing).
const useMotion = (delay: number): number => {
  const T = useT();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = T.motion;
  if (!m || m.kind === "spring") return spring({ frame: f - delay, fps, config: { damping: 200 } });
  const step = m.kind === "typewriter" ? (m.step ?? 2) : (m.step ?? 3);
  const qf = Math.floor(f / step) * step;
  if (m.kind === "typewriter") return interpolate(qf - delay, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return spring({ frame: qf - delay, fps, config: { damping: 200 } });
};

export type V2Beat = {
  layout: "hero" | "chapter" | "split" | "stat" | "end" | "quote" | "process" | "versus" | "timeline" | "map" | "terminal";
  steps?: string[]; ticks?: Array<{ year?: string; label?: string } | string>;
  lines?: string[]; from?: string; to?: string;
  leftTitle?: string; leftPoints?: string[]; rightTitle?: string; rightPoints?: string[];
  kicker?: string; headline?: string; sub?: string; big?: string; label?: string;
  n?: number; chapterTitle?: string; chapterCount?: number; total?: number;
  photo?: string; photoSide?: "left" | "right";
  words?: Array<{ w: string; t0: number; t1: number; key?: boolean }>;
  pop?: { kind: string; text: string; w: number; logo?: string };
  cues?: Array<{ t0: number; t1: number; text: string }>;
  startMs: number; ms: number; audio: string | null; i: number;
};

// badge/progressParts: the storybook doc lane's furniture overrides — BOTH
// default-inert. Docs that don't set them render byte-identically to before
// (brand/eyebrow/badge fall back to the theme; the progress track counts beats).
// badge          the circular end-card mark + the furniture's bottom-right
//                circle (the reference's "MR" coin)
// progressParts  ONE dash per part (capped 16) instead of one per beat, filled
//                by the beat's chapter progress (beat.n) — the reference's
//                10-dash chapter track
export type V2Doc = { title: string; theme?: string; brand?: string; eyebrow?: string; badge?: string; progressParts?: number; beats: V2Beat[]; totalMs: number; fps: number };

const loadFonts = () => {
  const h = delayRender("lv2 fonts");
  const wants: Array<[string, string, string]> = [
    ...[400, 600, 800, 900].map((w) => [`Inter`, `fonts/inter-${w}.ttf`, String(w)] as [string, string, string]),
    ["Playfair Display", "fonts/playfair-display.ttf", "400 900"],
    ["JetBrains Mono", "fonts/jetbrains-mono.ttf", "400 700"],
    ["Archivo Black", "fonts/archivo-black.ttf", "400"],
  ];
  Promise.all(wants.map(([fam, file, weight]) => new Promise<void>((res) => {
    const f = new FontFace(fam, `url(${staticFile(file)})`, { weight });
    f.load().then((l) => { document.fonts.add(l); res(); }).catch(() => res());
  }))).then(() => continueRender(h)).catch(() => continueRender(h));
};

const usePop = (delay = 0) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping: 200 } });
};

// clamp on-screen text: max ~2 lines at the chosen size, ellipsis at word boundary
function fitText(text: string, maxChars: number) {
  const t = (text || "").trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

// content frame: everything renders inside these safe bounds
const SAFE = { top: 130, bottom: 150, x: 150 };

const Content: React.FC<{ children: React.ReactNode; beat: V2Beat }> = ({ children, beat }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fade = durationInFrames > 24
    ? interpolate(f, [0, 5, durationInFrames - 6, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  return (
    <AbsoluteFill style={{ opacity: fade, paddingTop: SAFE.top, paddingBottom: SAFE.bottom, paddingLeft: SAFE.x, paddingRight: SAFE.x }}>
      {children}
    </AbsoluteFill>
  );
};

const Furniture: React.FC<{ beat: V2Beat; total: number; kicker: string; showBadge?: boolean; progressParts?: number }> = ({ beat, total, kicker, showBadge, progressParts }) => {
  const T = useT();
  return (
    <>
      <div style={{ position: "absolute", top: 52, left: 130, fontFamily: T.mono, fontWeight: 700, fontSize: 22, letterSpacing: "0.28em", color: T.accent }}>
        {kicker}
      </div>
      <div style={{ position: "absolute", top: 52, right: 130, display: "flex", gap: 10 }}>
        {(() => {
          const parts = progressParts && progressParts > 0 ? Math.min(progressParts, 16) : 0;
          if (parts > 0) {
            // one dash per part, filled = parts completed (this beat's chapter)
            const part = beat.n || (beat.layout === "end" ? progressParts || parts : 0);
            const filled = Math.min(Math.max(part, 0), parts);
            return Array.from({ length: parts }).map((_, i) => (
              <div key={i} style={{ width: 26, height: 5, borderRadius: 3, background: i < filled ? T.accent : T.dot }} />
            ));
          }
          const shown = Math.min(total, 16);
          const filled = total <= shown ? beat.i + 1 : Math.round(((beat.i + 1) / total) * shown);
          return Array.from({ length: shown }).map((_, i) => (
            <div key={i} style={{ width: 26, height: 5, borderRadius: 3, background: i < filled ? T.accent : T.dot }} />
          ));
        })()}
      </div>
      <div style={{ position: "absolute", bottom: 46, left: 130, right: 130, height: 2, background: T.line }} />
      <div style={{ position: "absolute", bottom: 30, left: 130, fontFamily: T.mono, fontWeight: 700, fontSize: 19, letterSpacing: "0.26em", color: T.furn }}>
        {T.brand}
      </div>
      {showBadge ? (
        <div style={{ position: "absolute", bottom: 26, right: 130, width: 44, height: 44, borderRadius: "50%", background: T.accent2, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.mono, fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", color: "#FFFFFF" }}>
          {T.badge}
        </div>
      ) : null}
    </>
  );
};

// paper grain for the vox look — deterministic feTurbulence, multiply blend
const Grain: React.FC = () => (
  <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.05, mixBlendMode: "multiply", pointerEvents: "none" }}>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" />
    </filter>
    <rect width="100%" height="100%" filter="url(#grain)" />
  </svg>
);

const Photo: React.FC<{ file: string; side: "left" | "right"; width: string }> = ({ file, side, width }) => {
  const T = useT();
  return (
    <div style={{ position: "absolute", top: 170, bottom: 320, [side]: SAFE.x, width, overflow: "hidden", borderRadius: 22, boxShadow: "0 26px 60px rgba(0,0,0,0.45)" }}>
      <Img src={staticFile(file)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent, ${T.photoTint})` }} />
    </div>
  );
};

const Kicker: React.FC<{ text: string; center?: boolean }> = ({ text, center }) => {
  const T = useT();
  return (
    <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 26, letterSpacing: center ? "0.32em" : "0.22em", color: T.accent, textTransform: T.upper ? "uppercase" : "none" }}>
      {text}
    </div>
  );
};

const Headline: React.FC<{ text: string; size: number }> = ({ text, size }) => {
  const T = useT();
  return (
    <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: size, lineHeight: 1.18, letterSpacing: T.upper ? "0.01em" : "-0.01em", color: T.ink, textTransform: T.upper ? "uppercase" : "none" }}>
      {text}
    </div>
  );
};

const Sub: React.FC<{ text: string; align?: string; size?: number }> = ({ text, align, size = 36 }) => {
  const T = useT();
  const base: React.CSSProperties = {
    marginTop: 34, fontFamily: T.body, fontWeight: 600, fontSize: size, lineHeight: 1.4,
    color: T.ink, textTransform: T.upper ? "uppercase" : "none", display: "inline-block",
  };
  if (T.subStyle === "marker") Object.assign(base, { background: T.highlight, padding: "8px 18px", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" });
  if (T.subStyle === "bar") Object.assign(base, { borderLeft: `6px solid ${T.accent}`, paddingLeft: 30, color: T.sub });
  return <div style={base}>{text}</div>;
};

// ---------------- layouts ----------------
const HeroLayout: React.FC<{ b: V2Beat }> = ({ b }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const kIn = useMotion(4);
  const hIn = useMotion(10);
  const len = (b.headline || "").length;
  const size = len > 66 ? 68 : 88;
  return (
    <Content beat={b}>
      <div style={{ position: "absolute", top: 210, left: 0, right: 0, textAlign: "center", opacity: kIn }}>
        <Kicker text={b.kicker || ""} center />
      </div>
      <div style={{ position: "absolute", top: 330, left: 140, right: 140, textAlign: "center", opacity: hIn, transform: `translateY(${(1 - hIn) * 30}px)` }}>
        <Headline text={fitText(b.headline || "", 76)} size={size} />
        {b.sub ? (
          <div style={{ marginTop: 32 }}>
            <Sub text={fitText(b.sub, 62)} size={34} />
          </div>
        ) : null}
      </div>
    </Content>
  );
};

const SplitLayout: React.FC<{ b: V2Beat; side: "left" | "right" }> = ({ b, side }) => {
  const T = useT();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tIn = useMotion(6);
  const textW = 900, imgW = 620;
  // photo sits OPPOSITE the text column — they must never overlap
  const textSide = side === "left" ? "left" : "right";
  const photoSide = side === "left" ? "right" : "left";
  return (
    <Content beat={b}>
      {b.photo ? <Photo file={b.photo} side={photoSide} width={imgW} /> : null}
      <div style={{ position: "absolute", top: 280, [textSide]: SAFE.x, width: textW, textAlign: textSide, opacity: tIn, transform: `translateY(${(1 - tIn) * 30}px)` }}>
        <div style={{ marginBottom: 30 }}>
          <Kicker text={b.kicker || `PART ${String(b.n || 1).padStart(2, "0")}`} />
        </div>
        <Headline text={fitText(b.headline || "", 88)} size={(b.headline || "").length > 66 ? 66 : 78} />
        {b.sub ? (
          <div style={{ marginTop: 30, display: "inline-block" }}>
            <Sub text={fitText(b.sub, 80)} size={36} />
          </div>
        ) : null}
      </div>
    </Content>
  );
};

const StatLayout: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const o = interpolate(useCurrentFrame(), [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", width: "100%", opacity: o }}>
          <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: b.big && b.big.length > 6 ? 210 : 280, lineHeight: 1, color: T.accent, letterSpacing: "-0.02em" }}>
            {b.big}
          </div>
          <div style={{ marginTop: 46, fontFamily: T.body, fontWeight: 600, fontSize: 44, lineHeight: 1.35, color: T.ink, maxWidth: 1300, marginLeft: "auto", marginRight: "auto" }}>
            {b.label}
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const ChapterLayout: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const numS = useMotion(0);
  const tS = useMotion(8);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 60 }}>
          <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 340, color: "transparent", WebkitTextStroke: `4px ${T.ghost}`, lineHeight: 1, transform: `translateX(${(1 - numS) * -140}px)` }}>
            {String(b.n || 1).padStart(2, "0")}
          </div>
          <div style={{ width: 4, alignSelf: "stretch", background: T.line, margin: "60px 0" }} />
          <div style={{ maxWidth: 850, opacity: tS, transform: `translateX(${(1 - tS) * 50}px)` }}>
            <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 26, letterSpacing: "0.3em", color: T.accent, marginBottom: 26 }}>
              CHAPTER {String(b.n || 1).padStart(2, "0")}
            </div>
            <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 88, lineHeight: 1.15, color: T.ink, textTransform: T.upper ? "uppercase" : "none" }}>
              {b.chapterTitle}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const EndLayout: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - 6, fps, config: { damping: 13, stiffness: 160 } });
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 150px" }}>
        <div style={{ transform: `scale(${Math.max(s, 0.01)})` }}>
          <div style={{ width: 110, height: 110, borderRadius: 26, background: T.accent, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 58, color: T.bg }}>
            {T.badge}
          </div>
          <div style={{ marginTop: 46, fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 92, color: T.ink, textTransform: T.upper ? "uppercase" : "none" }}>
            {T.brand}
          </div>
          <div style={{ marginTop: 36, fontFamily: T.body, fontWeight: 600, fontSize: 42, color: T.sub, lineHeight: 1.4 }}>
            {b.headline || "Follow for daily breakdowns."}
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

// STYLE 2 — KARAOKE HIGHLIGHT (user pick 09-16): full phrase shown, spoken words
// turn accent, active word pops inside an accent box, upcoming words dimmed.
const CapWindow = 4; // ONE line at a time (user requirement) — 4 words max, never wraps
// The word-timed stat chip (step 4): when the planner attached b.pop, the
// chip springs in at the POP WORD's timing (b.words[b.pop.w].t0) and holds in
// the safe area just below the top furniture band. Beats without a pop never
// render it (default-inert).
const BeatPop: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = b.pop as { kind: string; text: string; w: number; logo?: string } | undefined;
  if (!pop || !b.words || !b.words[pop.w]) return null;
  const at = (b.words[pop.w].t0 / 1000) * fps;
  const s = spring({ frame: f - at, fps, config: { damping: 11, stiffness: 190 } });
  if (s <= 0.01) return null;
  // R13 (step 6): a mapped brand fires its LOGO on a white plate, name
  // beneath — the plate keeps any brand's colors legible on every palette.
  if (pop.kind === 'entity' && pop.logo) {
    return (
      <div style={{ position: 'absolute', top: 120, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ transform: `scale(${Math.max(s, 0.01)}) rotate(-1deg)`, background: '#FFFFFF', borderRadius: 14, padding: '20px 38px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Img src={staticFile(pop.logo)} style={{ maxHeight: 92, maxWidth: 210, objectFit: 'contain' }} />
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 22, letterSpacing: '0.16em', color: T.ink, textTransform: 'uppercase' }}>{pop.text}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: "absolute", top: 150, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{
        transform: `scale(${Math.max(s, 0.01)}) rotate(-1.2deg)`,
        // stat chips are bordered; entity chips are filled — visually distinct kinds
        background: pop.kind === "entity" ? T.accent : T.bg,
        border: `3px solid ${T.accent}`, borderRadius: 10,
        padding: "10px 34px", boxShadow: "0 6px 22px rgba(0,0,0,0.14)",
        fontFamily: T.mono, fontWeight: 700, fontSize: 52, letterSpacing: "0.04em",
        color: pop.kind === "entity" ? T.bg : T.accent,
      }}>
        {pop.text}
      </div>
    </div>
  );
};

// ---------------- P1 batch: six niche layouts (2026-11-05) ----------------
// Each is one theme-styled composition inside the standard Content contract
// (SAFE padding, useT palette, spring entrances). DocV2's dispatcher routes
// beats with matching `layout` here; beats without them never touch this code
// (default-inert).

const QuoteLayout: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const qIn = useMotion(4);
  const aIn = useMotion(16);
  const quote = b.headline || "";
  const size = quote.length > 140 ? 52 : quote.length > 90 ? 64 : 76;
  return (
    <Content beat={b}>
      <div style={{ position: "absolute", top: 40, left: 30, fontFamily: T.display, fontSize: 420, lineHeight: 1, color: T.ghost, opacity: 0.55, userSelect: "none" }}>“</div>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 170px" }}>
        <div style={{ opacity: qIn, transform: `translateY(${(1 - qIn) * 26}px)`, textAlign: "center" }}>
          <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: size, lineHeight: 1.3, color: T.ink }}>
            {quote}
          </div>
          {b.sub ? (
            <div style={{ marginTop: 44, fontFamily: T.mono, fontWeight: 700, fontSize: 26, letterSpacing: "0.28em", color: T.accent, opacity: aIn }}>
              {b.sub}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const ProcessLayout: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const steps = Array.isArray(b.steps) ? b.steps.slice(0, 5) : [];
  return (
    <Content beat={b}>
      {b.headline ? (
        <div style={{ position: "absolute", top: 170, left: SAFE.x, right: SAFE.x }}>
          <Kicker text={b.kicker || "THE PROCESS"} />
          <div style={{ marginTop: 22 }}><Headline text={fitText(b.headline, 70)} size={64} /></div>
        </div>
      ) : null}
      <div style={{ position: "absolute", top: b.headline ? 400 : 220, left: SAFE.x, right: SAFE.x, display: "flex", flexDirection: "column", gap: 26 }}>
        {steps.map((st, i) => {
          const s = useMotion(10 + i * 12);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 30, opacity: s, transform: `translateX(${(1 - s) * -60}px)` }}>
              <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 30, color: T.accent, border: `3px solid ${T.accent}`, borderRadius: "50%", width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 42, lineHeight: 1.3, color: T.ink }}>{st}</div>
            </div>
          );
        })}
      </div>
    </Content>
  );
};

const VersusLayout: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const col = (title: string, pts: string[], side: -1 | 1, delay: number, colAccent: string) => {
    const s = useMotion(delay);
    return (
      <div style={{ flex: 1, opacity: s, transform: `translateX(${side * (1 - s) * 70}px)`, border: `3px solid ${colAccent}`, borderRadius: 12, padding: "30px 40px" }}>
        <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 26, letterSpacing: "0.2em", color: colAccent, marginBottom: 20 }}>{title}</div>
        {pts.map((p, i) => (
          <div key={i} style={{ fontFamily: T.body, fontWeight: 600, fontSize: 34, lineHeight: 1.4, color: T.ink, marginBottom: 14 }}>
            <span style={{ color: colAccent, marginRight: 12 }}>—</span>{p}
          </div>
        ))}
      </div>
    );
  };
  const pts = (v: any) => (Array.isArray(v) ? v.map(String) : []);
  return (
    <Content beat={b}>
      {b.headline ? (
        <div style={{ position: "absolute", top: 150, left: 0, right: 0, textAlign: "center" }}>
          <Headline text={fitText(b.headline, 60)} size={56} />
        </div>
      ) : null}
      <div style={{ position: "absolute", top: b.headline ? 300 : 210, left: SAFE.x, right: SAFE.x, bottom: 60, display: "flex", gap: 40, alignItems: "stretch" }}>
        {col(b.leftTitle || "SIDE A", pts(b.leftPoints), -1, 4, T.accent)}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 72, color: T.accent }}>VS</div>
        </div>
        {col(b.rightTitle || "SIDE B", pts(b.rightPoints), 1, 14, T.accent2)}
      </div>
    </Content>
  );
};

const TimelineLayout: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ticks = (Array.isArray(b.ticks) ? b.ticks : []).slice(0, 5);
  const railIn = useMotion(4);
  return (
    <Content beat={b}>
      {b.headline ? (
        <div style={{ position: "absolute", top: 170, left: SAFE.x, right: SAFE.x }}>
          <Kicker text={b.kicker || "THE TIMELINE"} />
          <div style={{ marginTop: 22 }}><Headline text={fitText(b.headline, 70)} size={64} /></div>
        </div>
      ) : null}
      <div style={{ position: "absolute", top: b.headline ? 430 : 330, left: SAFE.x, right: SAFE.x }}>
        <div style={{ height: 5, background: T.line, borderRadius: 3, transform: `scaleX(${railIn})`, transformOrigin: "left" }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 0 }}>
          {ticks.map((tk, i) => {
            const s = useMotion(14 + i * 14);
            const year = typeof tk === "object" && tk ? String(tk.year ?? "") : String(tk ?? "");
            const label = typeof tk === "object" && tk ? String(tk.label ?? "") : "";
            return (
              <div key={i} style={{ width: 260, opacity: s, transform: `translateY(${(1 - s) * 24}px)`, textAlign: "left" }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: T.accent, margin: "-10px 0 18px -8px" }} />
                <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 40, color: T.accent }}>{year}</div>
                <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 26, lineHeight: 1.35, color: T.ink, marginTop: 8 }}>{label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Content>
  );
};

const MapLayout: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = interpolate(f, [10, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const circ = 1500;
  const aIn = useMotion(6);
  const bIn = useMotion(62);
  const dot = (x: number, y: number, label: string, s: number) => (
    <div style={{ position: "absolute", left: x, top: y, opacity: s, transform: `scale(${Math.max(s, 0.01)})` }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: T.accent, boxShadow: `0 0 0 8px ${T.ghost}` }} />
      <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 26, letterSpacing: "0.18em", color: T.ink, marginTop: 12, whiteSpace: "nowrap" }}>{label}</div>
    </div>
  );
  return (
    <Content beat={b}>
      {b.headline ? (
        <div style={{ position: "absolute", top: 165, left: SAFE.x, right: SAFE.x }}>
          <Kicker text={b.kicker || "THE ROUTE"} />
          <div style={{ marginTop: 20 }}><Headline text={fitText(b.headline, 70)} size={62} /></div>
        </div>
      ) : null}
      <div style={{ position: "absolute", top: b.headline ? 380 : 240, left: 0, right: 0, bottom: 40 }}>
        <svg viewBox="0 0 1600 560" style={{ width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid meet">
          {Array.from({ length: 14 }).map((_, r) => (
            <line key={`h${r}`} x1="60" y1={40 + r * 38} x2="1540" y2={40 + r * 38} stroke={T.line} strokeWidth="1" />
          ))}
          {Array.from({ length: 26 }).map((_, c) => (
            <line key={`v${c}`} x1={60 + c * 60} y1="40" x2={60 + c * 60} y2="520" stroke={T.line} strokeWidth="1" />
          ))}
          <path d="M 180 430 C 500 120, 900 520, 1420 160" fill="none" stroke={T.accent} strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - draw)} />
        </svg>
        {dot(160, 400, String(b.from || "A"), aIn)}
        {dot(1390, 130, String(b.to || "B"), bIn)}
      </div>
    </Content>
  );
};

const TerminalLayout: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useSteppedFrame(2);
  const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 9);
  const shown = Math.max(1, Math.ceil(interpolate(f, [6, 6 + lines.length * 10], [1, lines.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  return (
    <Content beat={b}>
      {b.headline ? (
        <div style={{ position: "absolute", top: 165, left: SAFE.x, right: SAFE.x }}>
          <Kicker text={b.kicker || "INSIDE THE MACHINE"} />
          <div style={{ marginTop: 20 }}><Headline text={fitText(b.headline, 70)} size={62} /></div>
        </div>
      ) : null}
      <div style={{ position: "absolute", top: b.headline ? 380 : 220, left: 180, right: 180 }}>
        <div style={{ background: "#0C1014", borderRadius: 12, border: `2px solid ${T.line}`, boxShadow: "0 14px 40px rgba(0,0,0,0.3)", overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 10, padding: "16px 20px", borderBottom: `2px solid ${T.line}` }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#FF5F57" }} />
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#FEBC2E" }} />
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#28C840" }} />
            <div style={{ fontFamily: T.mono, fontSize: 20, color: T.sub, marginLeft: 12 }}>{b.label || "session"}</div>
          </div>
          <div style={{ padding: "28px 34px", fontFamily: T.mono, fontSize: 30, lineHeight: 1.75 }}>
            {lines.slice(0, shown).map((ln, i) => (
              <div key={i} style={{ color: i === shown - 1 ? T.accent : T.ink, opacity: 0.95, whiteSpace: "pre-wrap" }}>
                <span style={{ color: T.accent2, marginRight: 16 }}>$</span>{ln}
              </div>
            ))}
            <div style={{ color: T.accent2 }}><span style={{ marginRight: 16 }}>$</span><span style={{ opacity: f % 2 ? 1 : 0.2 }}>▊</span></div>
          </div>
        </div>
      </div>
    </Content>
  );
};

const Captions: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (f / fps) * 1000;
  const words = b.words || [];
  if (!words.length) return null;
  const idx = words.findIndex((w) => ms >= w.t0 - 40 && ms < w.t1 + 150);
  if (idx < 0) return null;
  const winStart = Math.max(0, Math.min(idx - 1, words.length - CapWindow));
  const win = words.slice(winStart, Math.min(winStart + CapWindow, words.length));
  const pop = spring({ frame: f - (words[idx].t0 / 1000) * fps, fps, config: { damping: 12, stiffness: 200 } });
  return (
    <div style={{ position: "absolute", bottom: 170, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ display: "flex", gap: 18, justifyContent: "center", alignItems: "baseline", whiteSpace: "nowrap" }}>
        {win.map((w, i) => {
          const gi = winStart + i;
          const active = gi === idx;
          return (
            <span key={i} style={{
              fontFamily: GROT, fontWeight: 900, fontSize: 58, lineHeight: 1.1,
              color: gi < idx ? T.capColor : active ? "#FFFFFF" : "rgba(255,255,255,0.55)",
              background: active ? T.capColor : "transparent",
              borderRadius: active ? 14 : 0,
              padding: active ? "4px 20px" : 0,
              transform: `scale(${active ? 1 + 0.06 * Math.max(pop, 0) : 1})`,
              transformOrigin: "center bottom", display: "inline-block",
              textShadow: "0 3px 16px rgba(0,0,0,0.4)",
            }}>{w.w}</span>
          );
        })}
      </div>
    </div>
  );
};

// ---------------- composition ----------------
export const DocV2: React.FC<any> = (input) => {
  const doc = input?.docv2?.beats?.length ? input.docv2 : (Array.isArray(input?.beats) && input.beats.length ? input : null);
  const { fps, durationInFrames } = useVideoConfig();
  useEffect(() => { loadFonts(); }, []);
  const base = THEMES[doc?.theme] || THEMES.investing;
  const T: Theme = { ...base, brand: doc?.brand || base.brand, eyebrow: doc?.eyebrow || base.eyebrow, badge: doc?.badge || base.badge };
  if (!doc) return <AbsoluteFill style={{ background: T.bg }} />;
  const total = doc.beats.length;

  const vw = doc.width || 1920;
  const vh = doc.height || 1080;
  const sc = vw / 1920;
  const stage = sc === 1 ? null : { width: 1920, height: 1080, transform: `scale(${sc})`, transformOrigin: "top left" as const };
  return (
    <ThemeCtx.Provider value={T}>
      <AbsoluteFill style={{ background: T.bg }}>
        {T.grain ? <Grain /> : null}
        <AbsoluteFill style={stage || undefined}>
        {doc.beats.map((b: V2Beat, i: number) => {
          const from = Math.round((b.startMs / 1000) * fps);
          const dur = Math.max(Math.ceil((b.ms / 1000) * fps), 2);
          const comp = b.layout === "hero" ? <HeroLayout b={b} /> : b.layout === "chapter" ? <ChapterLayout b={b} /> : b.layout === "stat" ? <StatLayout b={b} /> : b.layout === "end" ? <EndLayout b={b} />
            : b.layout === "quote" ? <QuoteLayout b={b} /> : b.layout === "process" ? <ProcessLayout b={b} /> : b.layout === "versus" ? <VersusLayout b={b} />
            : b.layout === "timeline" ? <TimelineLayout b={b} /> : b.layout === "map" ? <MapLayout b={b} /> : b.layout === "terminal" ? <TerminalLayout b={b} />
            : <SplitLayout b={b} side={(b.photoSide || (i % 2 === 0 ? "left" : "right")) as "left" | "right"} />;
          return (
            <Sequence key={`${b.layout}-${b.i}`} from={from} durationInFrames={dur} name={`b${b.i}-${b.layout}`}>
              {comp}
              <Furniture beat={{ ...b, i }} total={total} kicker={T.eyebrow} showBadge={Boolean(doc?.badge)} progressParts={doc?.progressParts} />
              {b.pop ? <BeatPop b={b} /> : null}
              {b.words && b.words.length ? <Captions b={b} /> : null}
            </Sequence>
          );
        })}
        {doc.beats.filter((b: V2Beat) => b.audio).map((b: V2Beat) => (
          <Sequence key={`a${b.i}`} from={Math.round((b.startMs / 1000) * fps)} durationInFrames={Math.ceil((b.ms / 1000) * fps)}>
            <Audio src={staticFile(b.audio!)} />
          </Sequence>
        ))}
        {doc.music ? (
          <Audio
            src={staticFile(doc.music)}
            loop
            volume={(f: number) => interpolate(f, [0, 30, durationInFrames - 45, durationInFrames - 1], [0, 0.15, 0.15, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
          />
        ) : null}
        </AbsoluteFill>
      </AbsoluteFill>
    </ThemeCtx.Provider>
  );
};
