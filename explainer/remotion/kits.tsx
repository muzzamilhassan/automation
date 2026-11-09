import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// Shared kit for the template FAMILIES (research/full-template-families-2026-11-09.md).
// Every component is a pure function of useCurrentFrame() + seeded values —
// deterministic under chrome-headless-shell, zero runtime network, zero assets.
// Families compose these with the engine's own primitives (Content/Kicker/
// Headline/useT) exported from longscenes2.

// ---- Ken Burns pan — the engine had entrance springs only; families hold ----
export const usePan = (seed: number = 0, maxScale = 1.09): { transform: string } => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const dir = seed % 4;
  const p = interpolate(f, [0, Math.max(durationInFrames, 2)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.sin) });
  const s = 1 + 0.08 * p * (maxScale - 1 > 0 ? 1 : 1);
  const dx = (dir === 0 || dir === 2 ? -1 : 1) * 26 * p;
  const dy = (dir === 0 || dir === 1 ? -1 : 1) * 18 * p;
  return { transform: `scale(${s}) translate(${dx}px, ${dy}px)` };
};

// ---- glow rule: a straight line that draws on and glows (F2 dark-doc) ----
export const GlowRule: React.FC<{ progress: number; width: number; color: string; thickness?: number; glow?: number }> = ({ progress, width, color, thickness = 3, glow = 14 }) => (
  <svg width={width} height={thickness + glow * 2} style={{ overflow: "visible", display: "block" }}>
    <line
      x1={0} y1={thickness / 2 + glow} x2={width} y2={thickness / 2 + glow}
      stroke={color} strokeWidth={thickness} strokeLinecap="round"
      strokeDasharray={width} strokeDashoffset={width * (1 - progress)}
      style={{ filter: `drop-shadow(0 0 ${glow}px ${color})` }}
    />
  </svg>
);

// ---- impact stamp: scale-spring slam with a settle wobble (F1 verdicts) ----
export const useStamp = (delay = 6) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: { damping: 9, stiffness: 200, mass: 0.7 } });
  return Math.max(s, 0.01);
};

// ---- stat counter: count a number up frame-driven (F5 glass / F1 verdicts) ----
export const useCounter = (target: number, delay = 4, durFrames = 40): string => {
  const f = useCurrentFrame();
  const v = interpolate(f, [delay, delay + durFrames], [0, target], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return String(Math.round(v));
};

// ---- scramble/decode text: deterministic char rain (F5) ----
const GLYPHS = "ABCDEFGHKMNPRSTUVWXYZ0123456789#$%&";
export const ScrambleText: React.FC<{ text: string; delay?: number; perChar?: number; color?: string; style?: React.CSSProperties }> = ({ text, delay = 0, perChar = 2, color, style }) => {
  const f = useCurrentFrame();
  const chars = text.split("");
  return (
    <span style={style}>
      {chars.map((ch, i) => {
        const reveal = delay + i * perChar;
        if (f >= reveal) return <span key={i}>{ch}</span>;
        if (ch === " ") return <span key={i}> </span>;
        const g = GLYPHS[(f * 7 + i * 13 + ch.charCodeAt(0)) % GLYPHS.length];
        return <span key={i} style={{ opacity: 0.45, color }}>{g}</span>;
      })}
    </span>
  );
};

// ---- light sweep: diagonal sheen crossing a card (F5) ----
export const LightSweep: React.FC<{ delay?: number; dur?: number; opacity?: number }> = ({ delay = 0, dur = 30, opacity = 0.16 }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [delay, delay + dur], [-0.6, 1.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", borderRadius: "inherit" }}>
      <div style={{ position: "absolute", top: "-20%", bottom: "-20%", left: `${p * 120 - 20}%`, width: "26%", transform: "skewX(-18deg)", background: "linear-gradient(90deg, transparent, rgba(255,255,255," + opacity + "), transparent)" }} />
    </div>
  );
};

// ---- letterbox bars: slide-in cinema frame (F4) ----
export const Letterbox: React.FC<{ progress: number; height?: number }> = ({ progress, height = 120 }) => (
  <>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: height, background: "#000", transform: `translateY(${-100 * (1 - progress)}%)` }} />
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: height, background: "#000", transform: `translateY(${100 * (1 - progress)}%)` }} />
  </>
);

// ---- advancing date bar: the chapter device of F6 map-atlas ----
export const DateBar: React.FC<{ labels: string[]; progress: number; color: string; sub?: string }> = ({ labels, progress, color, sub }) => {
  const n = labels.length || 1;
  const idx = Math.min(n - 1, Math.floor(progress * n));
  return (
    <div style={{ position: "absolute", bottom: 40, left: 130, right: 130 }}>
      <div style={{ height: 6, background: "rgba(255,255,255,0.14)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${progress * 100}%`, background: color }} />
      </div>
      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', Consolas, monospace", fontWeight: 700, fontSize: 24, letterSpacing: "0.18em", color: sub || color }}>
        <span>{labels[idx]}</span>
        <span style={{ opacity: 0.6 }}>{labels[n - 1]}</span>
      </div>
    </div>
  );
};

// ---- paper card + tape: the F1 receipt / F7 collage substrate ----
export const PaperCard: React.FC<{ children: React.ReactNode; rotate?: number; tape?: boolean; style?: React.CSSProperties }> = ({ children, rotate = -1.2, tape = true, style }) => (
  <div style={{ position: "relative", background: "#FBF7EE", color: "#1A1A1A", borderRadius: 6, boxShadow: "0 24px 60px rgba(0,0,0,0.4)", transform: `rotate(${rotate}deg)`, padding: "44px 56px", ...style }}>
    {tape ? (
      <div style={{ position: "absolute", top: -18, left: "50%", transform: `translateX(-50%) rotate(${(rotate || 0) * -1.6}deg)`, width: 190, height: 40, background: "rgba(233,214,160,0.75)", boxShadow: "0 4px 14px rgba(0,0,0,0.18)" }} />
    ) : null}
    {children}
  </div>
);

// ---- hand-drawn annotation (rough-notation, seeded = deterministic) ----
// The package exports ONE COMPONENT PER TYPE (Highlight/Underline/Circle/Box/
// StrikeThrough) — there is no generic RoughNotation export.
import { Box as RoughBox, Circle as RoughCircle, Highlight as RoughHighlight, StrikeThrough as RoughStrike, Underline as RoughUnderline } from "@remotion/rough-notation";

const HAND_COMPONENTS = {
  highlight: RoughHighlight,
  underline: RoughUnderline,
  circle: RoughCircle,
  box: RoughBox,
  "strike-through": RoughStrike,
} as const;

export const Hand: React.FC<{ type: "highlight" | "underline" | "circle" | "box" | "strike-through"; color: string; progress: number; seed?: number; children: React.ReactNode; padding?: number; strokeWidth?: number }> = ({ type, color, progress, seed = 7, children, padding = 6, strokeWidth = 3 }) => {
  const C = HAND_COMPONENTS[type];
  return (
    <C color={color} seed={seed} progress={progress} strokeWidth={strokeWidth} padding={padding}>
      {children}
    </C>
  );
};

// ---- full-bleed panned photo with tint (F4/F7 backdrops) ----
export const PanPhoto: React.FC<{ file: string; seed?: number; tint?: string }> = ({ file, seed = 0, tint = "rgba(8,8,10,0.35)" }) => {
  const pan = usePan(seed, 1.12);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <img src={staticFile(file)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...pan }} />
      <AbsoluteFill style={{ background: tint }} />
    </AbsoluteFill>
  );
};
