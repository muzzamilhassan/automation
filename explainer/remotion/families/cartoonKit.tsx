import React from "react";
import { AbsoluteFill, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Lottie } from "@remotion/lottie";
import { sceneForBeat, tickersFor, MOODS } from "../../../lib/market-scenes.mjs";

// CARTOON KIT — the market-files family's drawing primitives (P1,
// docs/superpowers/specs/2026-11-10-market-files-family-p1-spec.md). The
// Paper Billions grammar as vector React: flat 2D rooms, round-headed
// characters (mood faces, blink, breathe), handwritten Caveat labels, day
// chips + clock badges, fictional ticker walls, big glowing boards. Every
// scene text is DOM text (never rasterized) and every choice derives from
// the beat (same beat → same scene, R3). No AI images, no assets to fetch —
// the set draws itself.

// ---- fonts (R4: fail-soft — a missing file never blocks a render) -----------
let fontsDone = false;
export const ensureToonFonts = () => {
  if (fontsDone) return;
  fontsDone = true;
  for (const [family, file] of [
    ["Caveat", "fonts/Caveat.ttf"],
    ["Patrick Hand", "fonts/PatrickHand-Regular.ttf"],
  ] as [string, string][]) {
    const handle = delayRender(`toon font ${family}`);
    new FontFace(family, `url(${staticFile(file)})`)
      .load()
      .then((f) => {
        document.fonts.add(f);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }
};

export const HAND = "'Caveat', 'Patrick Hand', cursive";
export const INK = "#1f1d1a"; // the family's single outline color

// ---- the palette (R5) --------------------------------------------------------
export type ToonPalette = (typeof MOODS)[keyof typeof MOODS];
export const paletteFor = (mood: string): ToonPalette => (MOODS as any)[mood] || MOODS.calm;

// ---- handwritten text + chips (HTML layer) -----------------------------------
export const HandText: React.FC<{ text: string; size?: number; color?: string; weight?: number; rotate?: number; glow?: string; style?: React.CSSProperties; opacity?: number }> = ({ text, size = 56, color = "#f2efe6", weight = 700, rotate = -1, glow, style, opacity = 1 }) => (
  <div
    style={{
      fontFamily: HAND, fontWeight: weight, fontSize: size, lineHeight: 1.05, color,
      transform: `rotate(${rotate}deg)`, textShadow: glow ? `0 0 18px ${glow}, 0 0 42px ${glow}` : undefined,
      whiteSpace: "pre-wrap", textAlign: "center", opacity, ...style,
    }}
  >
    {text}
  </div>
);

// the day chip (THURSDAY red / WEDNESDAY green — mood decides the color)
export const Chip: React.FC<{ text: string; bg?: string; color?: string; x?: number | string; y?: number | string; size?: number; rotate?: number; style?: React.CSSProperties }> = ({ text, bg = "#c9362c", color = "#ffffff", x = 60, y = 585, size = 40, rotate = -2, style }) => (
  <div
    style={{
      position: "absolute", left: x, top: y, background: bg, color, borderRadius: 10,
      border: `4px solid ${INK}`, padding: "6px 22px", transform: `rotate(${rotate}deg)`,
      fontFamily: HAND, fontWeight: 700, fontSize: size, letterSpacing: "0.02em", boxShadow: "0 6px 0 rgba(0,0,0,0.25)", ...style,
    }}
  >
    {text}
  </div>
);

// wall clock + ET time badge (the Thursday grammar's timestamp)
export const ClockBadge: React.FC<{ time?: string | null; x?: number; y?: number; s?: number }> = ({ time, x = 130, y = 215, s = 1 }) => {
  const f = useCurrentFrame();
  if (!time) return null;
  const [hh, mm] = time.split(":").map(Number);
  const baseMin = Number.isFinite(mm) ? mm : 0;
  const minute = (baseMin + f * 0.12) % 60; // the clock slowly ticks — the room is alive
  const hour = Number.isFinite(hh) ? hh : 12;
  const hourA = ((hour % 12) + minute / 60) * 30; // rotate(0) = 12 o'clock, + = clockwise
  const minA = minute * 6;
  return (
    <div style={{ position: "absolute", left: x - 62 * s, top: y - 62 * s, transform: `scale(${s})`, transformOrigin: "top left" }}>
      <div style={{ width: 124, height: 124, borderRadius: "50%", background: "#f4f1e8", border: `6px solid ${INK}`, position: "relative" }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 5, height: 34, background: INK, borderRadius: 3, transformOrigin: "50% 100%", transform: `translate(-50%, -100%) rotate(${hourA}deg)` }} />
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 4, height: 46, background: INK, borderRadius: 3, transformOrigin: "50% 100%", transform: `translate(-50%, -100%) rotate(${minA}deg)` }} />
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 10, height: 10, borderRadius: "50%", background: INK, transform: "translate(-50%, -50%)" }} />
      </div>
      <div style={{ marginTop: 14, marginLeft: -20, background: "#f4f1e8", border: `4px solid ${INK}`, borderRadius: 8, padding: "2px 16px", fontFamily: HAND, fontWeight: 700, fontSize: 30, color: "#c9362c", whiteSpace: "nowrap", textAlign: "center" }}>{time}</div>
    </div>
  );
};

// ---- the character rig (R6: mood faces, blink, breathe) -----------------------
export type ToonMood = "calm" | "happy" | "worried" | "shocked" | "sad";
const SKINS = ["#e8c9a8", "#caa07e", "#a9805e", "#f2d7bd", "#8d6e5a"];
const HAIRS = ["#3d2f23", "#1e1a18", "#8a8378", "#5a4632", "#b9b3a8"];
const SHIRTS = ["#8c3b3b", "#33507a", "#5b7a45", "#7a5b8c", "#c9803b", "#4a6d6d", "#a84a6b"];

// deterministic look per character slot — same slot → same person every render
export const lookFor = (slot: number) => ({
  skin: SKINS[slot % SKINS.length],
  hair: HAIRS[Math.floor(slot / 2) % HAIRS.length],
  shirt: SHIRTS[slot % SHIRTS.length],
});

const Face: React.FC<{ mood: ToonMood; blink: boolean; ink?: string }> = ({ mood, blink, ink = INK }) => {
  if (blink) {
    return (
      <g stroke={ink} strokeWidth={5} strokeLinecap="round">
        <line x1={-30} y1={-2} x2={-12} y2={-2} />
        <line x1={12} y1={-2} x2={30} y2={-2} />
      </g>
    );
  }
  const shocked = mood === "shocked";
  const eyes = shocked ? (
    <g>
      <ellipse cx={-21} cy={-4} rx={11} ry={14} fill="#ffffff" stroke={ink} strokeWidth={4} />
      <ellipse cx={21} cy={-4} rx={11} ry={14} fill="#ffffff" stroke={ink} strokeWidth={4} />
      <circle cx={-21} cy={-1} r={4.5} fill={ink} />
      <circle cx={21} cy={-1} r={4.5} fill={ink} />
    </g>
  ) : (
    <g fill={ink}>
      <circle cx={-21} cy={-4} r={6.5} />
      <circle cx={21} cy={-4} r={6.5} />
    </g>
  );
  const brows =
    mood === "worried" ? (
      <g stroke={ink} strokeWidth={5} strokeLinecap="round">
        <line x1={-32} y1={-26} x2={-12} y2={-20} />
        <line x1={12} y1={-20} x2={32} y2={-26} />
      </g>
    ) : mood === "shocked" ? (
      <g stroke={ink} strokeWidth={5} strokeLinecap="round">
        <line x1={-32} y1={-32} x2={-12} y2={-32} />
        <line x1={12} y1={-32} x2={32} y2={-32} />
      </g>
    ) : mood === "sad" ? (
      <g stroke={ink} strokeWidth={5} strokeLinecap="round">
        <line x1={-32} y1={-22} x2={-12} y2={-26} />
        <line x1={12} y1={-26} x2={32} y2={-22} />
      </g>
    ) : null;
  const mouth =
    mood === "happy" ? (
      <path d="M -18 22 Q 0 40 18 22" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" />
    ) : mood === "shocked" ? (
      <ellipse cx={0} cy={26} rx={9} ry={13} fill={ink} />
    ) : mood === "sad" ? (
      <path d="M -16 30 Q 0 18 16 30" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" />
    ) : mood === "worried" ? (
      <path d="M -14 28 q 5 -6 10 0 q 5 6 10 0" fill="none" stroke={ink} strokeWidth={4.5} strokeLinecap="round" />
    ) : (
      <path d="M -12 24 q 12 8 24 0" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" />
    );
  return (
    <g>
      {eyes}
      {brows}
      {mouth}
    </g>
  );
};

const Hair: React.FC<{ i: number; back?: boolean }> = ({ i, back }) => {
  const c = HAIRS[Math.floor(i / 2) % HAIRS.length];
  const style = i % 5;
  if (back) return <path d="M -58 -8 a 58 52 0 0 1 116 0 l 0 34 a 14 14 0 0 1 -14 14 l -88 0 a 14 14 0 0 1 -14 -14 Z" fill={c} />;
  if (style === 2) {
    // bald with side patches
    return (
      <g fill={c}>
        <path d="M -56 -14 a 20 16 0 0 1 14 -10 l 0 14 Z" />
        <path d="M 56 -14 a 20 16 0 0 0 -14 -10 l 0 14 Z" />
      </g>
    );
  }
  if (style === 3) {
    // long hair framing the face — opening stays well above the eyes
    return <path d="M -62 -6 a 62 54 0 0 1 124 0 l 0 58 a 12 12 0 0 1 -12 12 l -10 0 l 0 -34 a 52 40 0 0 0 -80 0 l 0 34 l -10 0 a 12 12 0 0 1 -12 -12 Z" fill={c} />;
  }
  if (style === 4) {
    // grey pomp
    return <path d="M -58 -10 a 58 52 0 0 1 116 0 q -20 -26 -58 -24 q -38 -2 -58 24 Z" fill={c} />;
  }
  // side-part swoop
  return <path d="M -58 -12 a 58 52 0 0 1 116 0 q -14 -30 -62 -26 q -30 2 -40 18 q 8 -6 22 -6 q -22 2 -36 14 Z" fill={c} />;
};

export const Character: React.FC<{ x: number; y: number; s?: number; slot?: number; mood?: ToonMood; back?: boolean; pose?: "down" | "wave" | "raised"; flip?: boolean }> = ({ x, y, s = 1.35, slot = 0, mood = "calm", back = false, pose = "down", flip = false }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const look = lookFor(slot);
  const blink = !back && (f + slot * 23 + 18) % Math.round(fps * 3.6) < 2;
  const breathe = Math.sin(f / 26 + slot) * 2; // torso bob — never frozen (R6)
  const shirt = back ? shade(look.shirt, -12) : look.shirt;
  // one per-pose table decides BOTH arms and BOTH hands — a hand never floats
  // without its arm (review fix 2026-11-10)
  const POSES: Record<string, { armL: string; armR: string; handL: [number, number]; handR: [number, number] }> = {
    down: { armL: "M -48 30 q -12 34 -6 62", armR: "M 48 30 q 12 34 6 62", handL: [-52, 94], handR: [54, 94] },
    raised: { armL: "M -48 30 q -34 -34 -20 -74", armR: "M 48 30 q 34 -34 20 -74", handL: [-68, -46], handR: [68, -46] },
    wave: { armL: "M -48 30 q -12 34 -6 62", armR: "M 48 30 q 36 -20 30 -72", handL: [-52, 94], handR: [78, -44] },
  };
  const p = POSES[pose] || POSES.down;
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <ellipse cx={0} cy={0} rx={70} ry={16} fill="rgba(0,0,0,0.18)" />
      {/* legs */}
      <g stroke={INK} strokeWidth={9} strokeLinecap="round">
        <line x1={-22} y1={130} x2={-26} y2={196} />
        <line x1={22} y1={130} x2={26} y2={196} />
      </g>
      <g fill={INK}>
        <ellipse cx={-30} cy={202} rx={18} ry={9} />
        <ellipse cx={30} cy={202} rx={18} ry={9} />
      </g>
      <g transform={`translate(0 ${breathe})`}>
        {/* torso */}
        <rect x={-52} y={38} width={104} height={100} rx={26} fill={shirt} stroke={INK} strokeWidth={6} />
        {/* arms + hands (from the same per-pose table) */}
        <g fill="none" stroke={INK} strokeWidth={9} strokeLinecap="round">
          <path d={p.armL} />
          <path d={p.armR} />
        </g>
        <circle cx={p.handL[0]} cy={p.handL[1]} r={11} fill={look.skin} stroke={INK} strokeWidth={5} />
        <circle cx={p.handR[0]} cy={p.handR[1]} r={11} fill={look.skin} stroke={INK} strokeWidth={5} />
        {/* neck + head */}
        <rect x={-10} y={16} width={20} height={26} fill={look.skin} stroke={INK} strokeWidth={5} />
        <g transform="translate(0 -42)">
          <ellipse cx={0} cy={0} rx={58} ry={53} fill={look.skin} stroke={INK} strokeWidth={6} />
          <Hair i={slot} back={back} />
          {!back && <Face mood={mood} blink={blink} />}
        </g>
      </g>
    </g>
  );
};

const shade = (hex: string, amt: number) => {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amt);
  const g = clamp(((n >> 8) & 0xff) + amt);
  const b = clamp((n & 0xff) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
};

// ---- desks + monitors ---------------------------------------------------------
export const Desk: React.FC<{ x: number; y: number; w?: number; s?: number }> = ({ x, y, w = 300, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x={-w / 2} y={0} width={w} height={30} rx={8} fill="#4a4e5c" stroke={INK} strokeWidth={5} />
    <rect x={-w / 2 + 26} y={30} width={16} height={110} fill="#3a3d49" stroke={INK} strokeWidth={4} />
    <rect x={w / 2 - 42} y={30} width={16} height={110} fill="#3a3d49" stroke={INK} strokeWidth={4} />
  </g>
);

export const Monitor: React.FC<{ x: number; y: number; trend?: "down" | "up"; s?: number }> = ({ x, y, trend = "down", s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x={-72} y={-50} width={144} height={100} rx={8} fill="#12131a" stroke={INK} strokeWidth={5} />
    <polyline
      points={trend === "down" ? "-58,-28 -32,-14 -12,-20 16,6 36,0 54,18" : "-58,18 -32,4 -12,10 16,-16 36,-10 54,-28"}
      fill="none"
      stroke={trend === "down" ? "#ff6b5e" : "#57c988"}
      strokeWidth={6}
      strokeLinecap="round"
    />
    <rect x={-10} y={50} width={20} height={16} fill={INK} />
  </g>
);

// ---- set dressing --------------------------------------------------------------
export const StickyNote: React.FC<{ text: string; x: number; y: number; r?: number; bg?: string; size?: number }> = ({ text, x, y, r = -3, bg = "#f7e359", size = 30 }) => (
  <div style={{ position: "absolute", left: x, top: y, background: bg, width: 230, height: 130, transform: `rotate(${r}deg)`, boxShadow: "0 8px 14px rgba(0,0,0,0.3)", border: `3px solid rgba(0,0,0,0.2)`, display: "flex", alignItems: "center", justifyContent: "center", padding: 10 }}>
    <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: size, color: "#3a3226", textAlign: "center", lineHeight: 1.05 }}>{text}</div>
  </div>
);

export const ScatterPaper: React.FC<{ seed: number; n?: number; y?: number }> = ({ seed, n = 6, y = 700 }) => (
  <g>
    {Array.from({ length: n }).map((_, i) => {
      const h = (seed * 7919 + i * 104729) % 1000;
      const px = 140 + ((h * 7) % 1640);
      const py = y + ((h * 13) % 300);
      const rot = ((h % 30) - 15);
      return <rect key={i} x={px} y={py} width={52} height={34} rx={5} fill="#f4f1e8" stroke={INK} strokeWidth={3} transform={`rotate(${rot} ${px} ${py})`} />;
    })}
  </g>
);

export const Confetti: React.FC<{ seed: number; n?: number }> = ({ seed, n = 40 }) => {
  const f = useCurrentFrame();
  const COLORS = ["#f2efe6", "#57c988", "#f7e359", "#ff8a7a", "#7d9bd6"];
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const h = (seed * 6151 + i * 3571) % 4096;
        const px = (h % 1920);
        const py = ((h * 13) % 900 + f * (1.4 + (h % 10) / 6)) % 1080;
        const rot = (h % 360) + f * 2;
        return <rect key={i} x={px} y={py} width={12} height={20} rx={2} fill={COLORS[i % COLORS.length]} transform={`rotate(${rot} ${px} ${py})`} opacity={0.9} />;
      })}
    </g>
  );
};

// fictional ticker wall (R7 — names come from lib/market-scenes.mjs pool).
// Sits BELOW the engine's top furniture band (kicker + progress dashes) so
// the two never collide.
export const TickerWall: React.FC<{ seed: number; rows?: number; cols?: number; x?: number; y?: number; size?: number; dim?: boolean }> = ({ seed, rows = 2, cols = 6, x = 40, y = 118, size = 34, dim = false }) => {
  const all = tickersFor(seed, rows * cols);
  return (
    <div style={{ position: "absolute", left: x, top: y, right: x, display: "flex", flexDirection: "column", gap: 14, opacity: dim ? 0.4 : 0.85 }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "flex", justifyContent: "space-between", padding: "0 12px" }}>
          {all.slice(r * cols, (r + 1) * cols).map((t, c) => (
            <div key={c} style={{ fontFamily: HAND, fontWeight: 700, fontSize: size, color: "#e8e6df", transform: `rotate(${(c % 3) - 1}deg)` }}>
              {t.name}{" "}
              <span style={{ color: t.dir === "down" ? "#ff6b5e" : "#57c988" }}>
                {t.dir === "down" ? "" : "+"}
                {t.delta}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

// the big glowing market board (the NASDAQ −4% grammar)
export const BigBoard: React.FC<{ title: string; big: string; mood: string; x?: number; y?: number; w?: number }> = ({ title, big, mood, x = 330, y = 150, w = 620 }) => {
  const p = paletteFor(mood);
  const f = useCurrentFrame();
  const pulse = 0.82 + Math.sin(f / 14) * 0.18; // the % glows — alive, not a still
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w }}>
      <div style={{ background: `linear-gradient(180deg, ${p.boardBg[0]}, ${p.boardBg[1]})`, borderRadius: 12, border: `5px solid ${INK}`, padding: "34px 40px 40px", boxShadow: "0 18px 60px rgba(0,0,0,0.45)" }}>
        <HandText text={title} size={64} color={p.boardText} glow={p.boardText} style={{ marginBottom: 18 }} />
        <div style={{ background: "rgba(0,0,0,0.28)", borderRadius: 10, border: `4px solid rgba(0,0,0,0.5)`, padding: "18px 0 26px" }}>
          <HandText text={big} size={96} color={p.accent} glow={p.accent} opacity={0.75 + pulse * 0.25} />
        </div>
      </div>
    </div>
  );
};

// ---- room shell (R5: mood gradient + wall washes + a real FLOOR) ----------------
// Owner fix 2026-11-11: the old rooms were near-black voids — the cast floated
// in darkness and the dark captions vanished. Every mood now gets a rich
// color-matched wall (crash = crimson, night = clear indigo, party = emerald,
// data = steel teal) with an actual floor line at the cast's feet.
export const Room: React.FC<{ mood: string; children?: React.ReactNode }> = ({ mood, children }) => {
  const p = paletteFor(mood);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${p.room[0]}, ${p.room[1]})` }}>
      {/* soft center glow — the reference's lit-room feel */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 62% 48% at 50% 38%, ${p.accent}2e, transparent 70%)` }} />
      {/* corner vignette keeps the frame edges rich, not flat */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 120% 90% at 50% 45%, transparent 60%, rgba(0,0,0,0.28) 100%)" }} />
      {/* the floor: a horizon at the cast's feet — desks straddle it (tops
          against the wall, legs on the ground), characters stand ON it */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 700, bottom: 0, background: "rgba(0,0,0,0.16)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 698, height: 6, background: p.accent, opacity: 0.22 }} />
      {children}
    </AbsoluteFill>
  );
};

// ---- scene shell: entrance + slow Ken Burns (scenes breathe, never sit) --------
export const SceneShell: React.FC<{ children: React.ReactNode; beatIndex?: number }> = ({ children, beatIndex = 0 }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const enter = interpolate(f, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const zoom = 1 + interpolate(f, [0, Math.max(durationInFrames, 1)], [0, 0.035], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const drift = Math.sin((f + beatIndex * 40) / 90) * 8;
  return (
    <AbsoluteFill style={{ opacity: enter }}>
      <AbsoluteFill style={{ transform: `scale(${zoom}) translate(${drift}px, ${drift / 2}px)` }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

// =================================================================================
// P1.5 — THE LIBRARY ART PASS (Route B+C, docs/qa/market-files-p1.5-qa.md).
// The cast becomes real hand-drawn characters (Open Peeps, CC0) and stat/board
// beats float glossy 3D props (3dicons, CC0). Everything is fetched ONCE by
// scripts/market-art.mjs into public/assets/market/ and committed — the render
// itself needs no network. Fail-soft: if the assets are missing (fresh clone
// that skipped the fetcher) the P1 stick-figure rig below still draws every
// scene, so a render never dies on art.
// =================================================================================

export type PeepEntry = { file: string; pose: "bust" | "standing" | "sitting"; url: string };
export type SceneEntry = { file: string; url: string; tags: string[]; moods: string[] };
type ToonArt = { ok: boolean; peeps: PeepEntry[]; scenes: SceneEntry[] };

let artPromise: Promise<ToonArt> | null = null;
const loadArt = (): Promise<ToonArt> => {
  if (!artPromise) {
    artPromise = fetch(staticFile("assets/market/manifest.json"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((m: { peeps: PeepEntry[]; scenes?: SceneEntry[] }) => ({ ok: true, peeps: m.peeps || [], scenes: m.scenes || [] }))
      .catch(() => ({ ok: false, peeps: [] as PeepEntry[], scenes: [] as SceneEntry[] }));
  }
  return artPromise;
};

// One fetch per browser session, gated by delayRender so frames wait for the
// manifest (the fonts pattern); resolves ok:false when the fetcher never ran.
export const useToonArt = (): ToonArt => {
  const [art, setArt] = React.useState<ToonArt>({ ok: false, peeps: [], scenes: [] });
  React.useEffect(() => {
    const h = delayRender("market art manifest");
    let alive = true;
    loadArt().then((a) => {
      if (alive) {
        setArt(a);
        continueRender(h);
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  return art;
};

// mood-matched deterministic scene pick (P1.7) — filters by the beat's mood
// first, then rotates; if the previous beat's pick (same pool) collides, the
// very next candidate is taken so two beats never show the same image twice.
export const pickScene = (scenes: SceneEntry[], mood: string, beatIndex: number): SceneEntry | null => {
  if (!scenes.length) return null;
  const matched = scenes.filter((s) => s.moods?.includes(mood));
  const pool = matched.length ? matched : scenes;
  const pickAt = (i: number) => pool[Math.abs((i + 1) * 2654435761) % 4096 % pool.length];
  const first = pickAt(beatIndex);
  if (pool.length > 1 && beatIndex > 0 && first.file === pickAt(beatIndex - 1)) return pool[(Math.abs((beatIndex + 1) * 2654435761) % 4096 + 1) % pool.length];
  return first;
};

// A full-screen Storyset scene image (the P1.7 "image to image" layer):
// the beat's professional cartoon illustration, slow-zoomed by the scene
// shell, on the mood backdrop. Ken Burns lives in SceneShell — the image
// itself only breathes.
export const SceneImage: React.FC<{ art: ToonArt; mood: string; beatIndex: number; height?: number; dim?: number }> = ({ art, mood, beatIndex, height = 760, dim = 0 }) => {
  const scene = pickScene(art.scenes, mood, beatIndex);
  if (!art.ok || !scene) return null;
  const f = useCurrentFrame();
  const enter = interpolate(f, [0, 12], [0.96, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <img
        src={staticFile(`assets/market/scenes/${scene.file}`)}
        style={{
          height, width: "auto", maxWidth: "92%", transform: `scale(${enter}) translateY(${Math.sin(f / 50) * 4}px)`,
          filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.35))",
        }}
      />
      {dim > 0 ? <AbsoluteFill style={{ background: `rgba(10,10,16,${dim})` }} /> : null}
    </div>
  );
};

// deterministic cast pick — same seed+pose → same character every render
export const peepFor = (peeps: PeepEntry[], seed: number, pose: PeepEntry["pose"]): PeepEntry | null => {
  const pool = peeps.filter((p) => p.pose === pose);
  if (!pool.length) return null;
  const h = Math.abs(seed * 2654435761) % 4096; // Knuth hash — stable across episodes
  return pool[h % pool.length];
};

// A hand-drawn character sprite (HTML layer, bottom-center anchored at
// groundY): entrance pop + gentle breathe bob so nobody freezes.
export const PeepSprite: React.FC<{
  art: ToonArt; seed: number; pose: PeepEntry["pose"]; x: number; groundY: number;
  h: number; flip?: boolean; delay?: number; bobAmp?: number; opacity?: number;
}> = ({ art, seed, pose, x, groundY, h, flip = false, delay = 0, bobAmp = 3, opacity = 1 }) => {
  const f = useCurrentFrame();
  const peep = peepFor(art.peeps, seed, pose);
  if (!art.ok || !peep) return null;
  const enter = interpolate(f, [delay, delay + 9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bob = Math.sin(f / 26 + seed % 7) * bobAmp;
  const pop = 0.92 + enter * 0.08;
  return (
    <img
      src={staticFile(`assets/market/peeps/${peep.file}`)}
      style={{
        position: "absolute", left: x, top: groundY - h, height: h, width: "auto",
        transform: `translateX(-50%) scaleX(${flip ? -1 : 1}) scale(${pop}) translateY(${(1 - enter) * 16 + bob}px)`,
        transformOrigin: "50% 100%", opacity: enter * opacity,
        filter: "drop-shadow(0 14px 22px rgba(0,0,0,0.35))",
      }}
    />
  );
};

// mood → glossy 3D props (3dicons, CC0): crash drowns in red, party celebrates
const MOOD_PROPS: Record<string, string[]> = {
  crash: ["thumb-down", "fire", "money-bag", "chart"],
  party: ["rocket", "star", "trophy", "medal"],
  calm: ["chart", "3d-coin", "wallet", "card"],
  data: ["computer", "chart", "calculator", "file-text"],
  night: ["wallet", "lock", "file-text", "card"],
};
export const propsForMood = (mood: string): string[] => MOOD_PROPS[mood] || MOOD_PROPS.calm;

// A glossy 3D prop (HTML layer, center-anchored): entrance pop, slow float,
// optional drift direction (crash props sink, rally props rise).
export const Prop3D: React.FC<{
  icon: string; x: number; y: number; s: number; delay?: number; drift?: "up" | "down" | "flat"; tilt?: number; opacity?: number;
}> = ({ icon, x, y, s, delay = 0, drift = "flat", tilt = 0, opacity = 1 }) => {
  const f = useCurrentFrame();
  const enter = interpolate(f, [delay, delay + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const float = Math.sin(f / 30 + x % 13) * 6;
  const sink = drift === "down" ? interpolate(f, [0, 120], [0, 90], { extrapolateLeft: "clamp" }) * (0.6 + (x % 5) / 10) : 0;
  const rise = drift === "up" ? interpolate(f, [0, 120], [0, 90], { extrapolateLeft: "clamp" }) * (0.6 + (x % 5) / 10) : 0;
  const rot = tilt ? Math.sin(f / 46) * tilt : 0;
  return (
    <img
      src={staticFile(`assets/market/icons/${icon}.png`)}
      style={{
        position: "absolute", left: x, top: y + sink - rise, width: s, height: s,
        transform: `translate(-50%, -50%) scale(${0.85 + enter * 0.15}) rotate(${rot}deg)`,
        opacity: enter * opacity,
        filter: "drop-shadow(0 16px 26px rgba(0,0,0,0.4))",
      }}
    />
  );
};

// Route C — an animated accent through @remotion/lottie (fail-soft): a missing
// or broken .json renders nothing; the render never dies on an accent.
// Curated accents live in public/assets/market/lottie/<name>.json (any
// community file MUST get a license note in manifest.json — CREDITS.md).
export const LottieAccent: React.FC<{ name: string; x: number; y: number; s?: number; opacity?: number }> = ({ name, x, y, s = 200, opacity = 1 }) => {
  const [data, setData] = React.useState<object | null>(null);
  React.useEffect(() => {
    let alive = true;
    const h = delayRender(`lottie accent ${name}`);
    fetch(staticFile(`assets/market/lottie/${name}.json`))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: object) => {
        if (alive) {
          setData(j);
          continueRender(h);
        }
      })
      .catch(() => continueRender(h));
    return () => {
      alive = false;
    };
  }, [name]);
  if (!data) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: s, height: s, opacity }}>
      <Lottie animationData={data} style={{ width: s, height: s }} loop />
    </div>
  );
};
