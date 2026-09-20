import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  delayRender,
  continueRender,
  Easing,
} from "remotion";

// ---------------------------------------------------------------------------
// PsychToon — hand-drawn "stick figure explainer" style engine.
// Reference: PsychToons "Psychology of Intelligence" (2M views, 15 min).
// Every scene is drawn as vector art from a JSON spec: flat horizontal color
// bands, ink-line characters with big round white heads, simple wooden props,
// big handwritten caps labels, paper grain on top.
// ---------------------------------------------------------------------------

const INK = "#2f2b26";
const PAPER = "#f2e8d5";
const WOOD = "#a9743f";
const WOOD_DARK = "#7d5528";
const PROP_PAPER = "#f8f2e2";

// Palette cycle: [wall, floor] — muted earthy pairs sampled from the reference.
const PALETTES: [string, string][] = [
  ["#e6c368", "#bf5f45"], // mustard / rust
  ["#b4c49c", "#d8c29c"], // sage / tan
  ["#e7dcc0", "#7d9d8e"], // cream / teal
  ["#cf7f4e", "#e5d3a0"], // terra / sand
  ["#8fa79f", "#d8c29c"], // teal-grey / tan
  ["#e5d3a0", "#b0613f"], // sand / rust
];

const SHIRTS = ["#c96f4a", "#5f8f8a", "#d9a441", "#6c7f9b", "#7c9a5e", "#b0523d"];

// ---- fonts ----------------------------------------------------------------

let fontsLoaded = false;
const ensureFonts = () => {
  if (fontsLoaded) return;
  fontsLoaded = true;
  for (const [family, file] of [
    ["Patrick Hand", "fonts/PatrickHand-Regular.ttf"],
    ["Caveat", "fonts/Caveat.ttf"],
  ] as [string, string][]) {
    const handle = delayRender(`font ${family}`);
    const face = new FontFace(family, `url(${staticFile(file)})`);
    face
      .load()
      .then((f) => {
        document.fonts.add(f);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }
};

// ---- spec types ------------------------------------------------------------

export type PsychProp = {
  t: string;
  x?: number;
  y?: number; // baseline on the floor line
  s?: number;
  text?: string;
  color?: string;
  delay?: number;
  front?: boolean; // render after characters (hides legs behind desks)
};

export type PsychChar = {
  pose:
    | "stand"
    | "walk"
    | "sit"
    | "write"
    | "read"
    | "point"
    | "think"
    | "celebrate"
    | "shrug"
    | "carry"
    | "phone";
  x?: number;
  y?: number;
  shirt?: number | string;
  flip?: boolean;
  s?: number;
  face?: boolean;
  delay?: number;
};

export type PsychScene = {
  audio?: string | null;
  ms: number;
  startMs?: number;
  set?: "room" | "field" | "night" | "textcard";
  palette?: number;
  label?: { text: string; y?: number; size?: number };
  signText?: string;
  cardText?: string;
  props?: PsychProp[];
  chars?: PsychChar[];
  zoom?: "in" | "out";
};

export type PsychDoc = {
  title?: string;
  fps: number;
  width: number;
  height: number;
  totalMs: number;
  music?: { src: string; volume?: number } | null;
  scenes: PsychScene[];
};

// ---- primitives ------------------------------------------------------------

const Line = ({
  d,
  w = 4,
  color = INK,
}: {
  d: string;
  w?: number;
  color?: string;
}) => <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;

const O = ({
  cx,
  cy,
  rx,
  ry,
  fill,
  stroke = INK,
  sw = 4,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
  stroke?: string | null;
  sw?: number;
}) => <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} stroke={stroke ?? "none"} strokeWidth={sw} />;

const Box = ({
  x,
  y,
  w,
  h,
  fill,
  stroke = INK,
  sw = 4,
  rx = 4,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke?: string | null;
  sw?: number;
  rx?: number;
}) => <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} stroke={stroke ?? "none"} strokeWidth={sw} />;

// ---- character rig (origin = feet center, total height ≈ 265 at s=1) -------

const Char: React.FC<PsychChar & { f: number }> = ({ pose, x = 960, y = 810, shirt = 0, flip, s = 1, face, f }) => {
  const shirtColor = typeof shirt === "number" ? SHIRTS[shirt % SHIRTS.length] : shirt;
  const bob = Math.sin(f / 28) * 2.5;
  const swing = Math.sin(f / 7) * 16; // walk cycle
  const armW = 4.5;

  // arm + leg endpoints per pose (local coords, y negative = up)
  let armL: [number, number] = [-34, -62];
  let armR: [number, number] = [34, -62];
  let legs: [string, string] = ["M -10 -84 L -16 0", "M 10 -84 L 16 0"];
  let extra: React.ReactNode = null;
  let sitting = false;

  switch (pose) {
    case "walk":
      armL = [-34 + swing * 0.6, -62];
      armR = [34 - swing * 0.6, -62];
      legs = [`M -10 -84 L ${-16 + swing} 0`, `M 10 -84 L ${16 - swing} 0`];
      break;
    case "point":
      armR = [88, -118];
      break;
    case "think":
      armR = [34, -168];
      armL = [-38, -70];
      break;
    case "celebrate":
      armL = [-58, -232];
      armR = [58, -232];
      break;
    case "shrug":
      armL = [-52, -132];
      armR = [52, -132];
      break;
    case "carry":
      armR = [40, -70];
      armL = [-40, -70];
      extra = <Box x={-52} y={-108} w={104} h={40} fill={WOOD} sw={4} rx={4} />;
      break;
    case "phone":
      armR = [46, -108];
      extra = (
        <g>
          <Box x={38} y={-132} w={26} h={44} fill={INK} rx={6} sw={0} />
          <Box x={42} y={-128} w={18} h={32} fill="#cfe3dd" rx={2} sw={0} />
        </g>
      );
      break;
    case "write":
      sitting = true;
      armR = [58, -96];
      armL = [-30, -66];
      legs = ["M -10 -92 L -34 -92 L -34 -4", "M 10 -92 L 22 -92 L 34 -30 L 40 -2"];
      break;
    case "read":
      sitting = true;
      armR = [34, -124];
      armL = [-34, -124];
      extra = (
        <g transform="rotate(-4 0 -120)">
          <Box x={-34} y={-148} w={68} h={48} fill={PROP_PAPER} sw={4} rx={4} />
          <Line d="M -22 -134 L 22 -134" w={3} />
          <Line d="M -22 -122 L 22 -122" w={3} />
          <Line d="M -22 -110 L 12 -110" w={3} />
        </g>
      );
      legs = ["M -10 -92 L -34 -92 L -34 -4", "M 10 -92 L 22 -92 L 34 -30 L 40 -2"];
      break;
    case "sit":
      sitting = true;
      legs = ["M -10 -92 L -34 -92 L -34 -4", "M 10 -92 L 22 -92 L 34 -30 L 40 -2"];
      break;
    default:
      break;
  }

  const hipY = sitting ? -92 : -84;
  const legEls =
    pose === "walk" || pose === "write" || pose === "read" || pose === "sit" ? (
      <>
        <Line d={legs[0]} w={armW} />
        <Line d={legs[1]} w={armW} />
      </>
    ) : (
      <>
        <Line d={`M -10 ${hipY} L ${-16 + (swing > 0 ? 0 : 0)} 0`} w={armW} />
        <Line d={`M 10 ${hipY} L 16 0`} w={armW} />
      </>
    );

  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s}) translate(0 ${bob})`}>
      {/* legs */}
      {legEls}
      {/* torso */}
      <g transform={`translate(0 ${bob > 0 ? 0 : 0})`}>
        <Box x={-26} y={-156} w={52} h={76} fill={shirtColor} rx={18} sw={4.5} />
        {/* arms */}
        <Line d={`M -22 -138 L ${armL[0]} ${armL[1]}`} w={armW} />
        <Line d={`M 22 -138 L ${armR[0]} ${armR[1]}`} w={armW} />
        {/* head */}
        <g transform={`rotate(${Math.sin(f / 45) * 1.6} 0 -190)`}>
          <Line d="M 0 -156 L 0 -148" w={5} />
          <O cx={0} cy={-206} rx={54} ry={58} fill="#faf5e8" sw={4.5} />
          {face && (
            <g>
              <O cx={-16} cy={-208} rx={3.4} ry={4.6} fill={INK} sw={0} />
              <O cx={16} cy={-208} rx={3.4} ry={4.6} fill={INK} sw={0} />
              <Line d="M -12 -184 Q 0 -176 12 -184" w={3.5} />
            </g>
          )}
        </g>
        {extra}
      </g>
    </g>
  );
};

// ---- props -----------------------------------------------------------------

const Prop: React.FC<PsychProp & { f: number }> = ({ t, x = 960, y = 810, s = 1, text, color, f }) => {
  let el: React.ReactNode = null;
  switch (t) {
    case "desk":
      el = (
        <g>
          <Box x={-235} y={-172} w={470} h={26} fill={WOOD} sw={4.5} rx={6} />
          <Line d="M -205 -146 L -205 0 M 205 -146 L 205 0 M -190 -60 L 190 -60" w={10} />
          <Line d="M -205 -146 L -205 0" w={11} color={WOOD_DARK} />
          <Line d="M 205 -146 L 205 0" w={11} color={WOOD_DARK} />
        </g>
      );
      break;
    case "chair":
      el = (
        <g>
          <Box x={-38} y={-64} w={76} h={16} fill={WOOD} sw={4} rx={4} />
          <Box x={30} y={-172} w={12} h={110} fill={WOOD} sw={4} rx={5} />
          <Line d="M -30 -48 L -30 0 M 30 -48 L 30 0" w={8} color={WOOD_DARK} />
        </g>
      );
      break;
    case "stool":
      el = (
        <g>
          <Box x={-34} y={-72} w={68} h={14} fill={WOOD} sw={4} rx={4} />
          <Line d="M -26 -58 L -30 0 M 26 -58 L 30 0" w={7} color={WOOD_DARK} />
        </g>
      );
      break;
    case "books":
      el = (
        <g>
          <Box x={-42} y={-26} w={84} h={26} fill={color ?? "#b0523d"} sw={4} rx={3} />
          <Box x={-36} y={-50} w={72} h={24} fill={color ?? "#5f8f8a"} sw={4} rx={3} />
          <Box x={-30} y={-72} w={60} h={22} fill={color ?? "#d9a441"} sw={4} rx={3} />
          <Line d="M -42 -13 L 42 -13 M -36 -38 L 36 -38" w={2.5} color="#00000022" />
        </g>
      );
      break;
    case "sign":
      el = (
        <g>
          <Line d="M -60 0 L -60 -170 M 60 0 L 60 -170" w={10} color={WOOD_DARK} />
          <Box x={-190} y={-290} w={380} h={130} fill={PROP_PAPER} sw={5} rx={8} />
          {(text ?? "").toUpperCase().split("\n").map((ln, i, arr) => (
            <text
              key={i}
              x={0}
              y={-290 + 130 / 2 + 6 + (i - (arr.length - 1) / 2) * 44}
              textAnchor="middle"
              fontFamily="Patrick Hand"
              fontSize={44}
              fill={INK}
            >
              {ln}
            </text>
          ))}
        </g>
      );
      break;
    case "calendar": {
      const [title, xed] = (text ?? "9 DAYS|12").split("|");
      el = (
        <g>
          <Box x={-130} y={-210} w={260} h={210} fill={PROP_PAPER} sw={5} rx={6} />
          <text x={0} y={-172} textAnchor="middle" fontFamily="Patrick Hand" fontSize={40} fill={INK}>
            {title.toUpperCase()}
          </text>
          {Array.from({ length: 28 }).map((_, i) => {
            const col = i % 7;
            const row = Math.floor(i / 7);
            const cx = -112 + col * 37;
            const cy = -148 + row * 40;
            const isX = i < Number(xed || 0);
            return (
              <g key={i}>
                <Box x={cx} y={cy} w={30} h={32} fill={isX ? "#e8d8b8" : "#ffffff"} sw={2.5} rx={2} />
                {isX && <Line d={`M ${cx + 5} ${cy + 5} L ${cx + 25} ${cy + 27} M ${cx + 25} ${cy + 5} L ${cx + 5} ${cy + 27}`} w={3.5} />}
              </g>
            );
          })}
        </g>
      );
      break;
    }
    case "clocks":
      el = (
        <g>
          <O cx={-30} cy={-40} rx={42} ry={42} fill={PROP_PAPER} />
          <O cx={38} cy={-58} rx={46} ry={46} fill={PROP_PAPER} />
          <O cx={-4} cy={-118} rx={48} ry={48} fill={PROP_PAPER} />
          <Line d="M -4 -118 L 14 -138 M -4 -118 L 10 -104" w={3.5} />
          <Line d="M 38 -58 L 54 -70 M 38 -58 L 50 -44" w={3.5} />
          <Line d="M -92 -160 L 84 6" w={13} />
          <Line d="M -92 -160 L 84 6" w={7} color={PAPER} opacity={0.0} />
          <Line d="M -88 0 L 80 -166" w={13} />
        </g>
      );
      break;
    case "wall":
      el = (
        <g>
          <Box x={-170} y={-190} w={340} h={190} fill="#6b6157" sw={5} rx={2} />
          <Box x={-140} y={-165} w={110} h={74} fill={color ?? "#d9a441"} sw={0} rx={2} opacity={0.85} />
        </g>
      );
      break;
    case "loop":
      el = (
        <g>
          {[0, 120, 240].map((a) => (
            <g key={a} transform={`rotate(${a} 0 -90)`}>
              <path
                d="M 0 -172 A 82 82 0 0 1 71 -49"
                fill="none"
                stroke={INK}
                strokeWidth={7}
                strokeLinecap="round"
              />
              <path d="M 71 -49 L 46 -58 M 71 -49 L 66 -76" fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round" />
            </g>
          ))}
        </g>
      );
      break;
    case "phone":
      el = (
        <g>
          <Box x={-24} y={-64} w={48} h={84} fill={INK} rx={9} sw={0} />
          <Box x={-17} y={-56} w={34} h={60} fill="#cfe3dd" rx={3} sw={0} />
          <Line d="M -60 -140 Q 0 -190 60 -140" w={4} />
          <Line d="M -70 -170 Q 0 -230 70 -170" w={4} />
        </g>
      );
      break;
    case "snack":
      el = (
        <g>
          <Box x={-44} y={-40} w={88} h={40} fill={color ?? "#b0523d"} sw={4} rx={8} />
          <Line d="M -44 -20 L 44 -20" w={3} color="#00000033" />
        </g>
      );
      break;
    case "brain":
      el = (
        <g>
          <path
            d="M -90 -60 Q -110 -130 -40 -140 Q -10 -185 50 -160 Q 110 -165 100 -100 Q 130 -50 70 -30 Q 40 0 -20 -14 Q -80 -8 -90 -60 Z"
            fill="#e8b294"
            stroke={INK}
            strokeWidth={5}
          />
          <Line d="M -40 -135 Q -20 -100 -45 -60 M 10 -158 Q 30 -110 5 -60 M 55 -152 Q 70 -110 50 -45" w={3.5} />
          <Line d="M -10 -14 L -10 18 M 18 -16 L 18 14" w={6} />
        </g>
      );
      break;
    case "blocks":
      el = (
        <g>
          <Box x={-92} y={-52} w={92} h={52} fill="#b0523d" sw={4.5} />
          <Box x={0} y={-52} w={92} h={52} fill="#5f8f8a" sw={4.5} />
          <Box x={-46} y={-104} w={92} h={52} fill="#d9a441" sw={4.5} />
          <Box x={-23} y={-156} w={46} h={52} fill="#7c9a5e" sw={4.5} />
        </g>
      );
      break;
    case "plant":
      el = (
        <g>
          <path d="M -26 -46 L 26 -46 L 18 0 L -18 0 Z" fill="#b0523d" stroke={INK} strokeWidth={4} />
          <Line d="M 0 -46 L 0 -96" w={4} color="#5c7a4a" />
          {[[-1, -70], [1, -78], [-1, -90]].map(([dir, yy], i) => (
            <path key={i} d={`M 0 ${yy} Q ${dir * 34} ${yy - 16} ${dir * 40} ${yy - 40} Q ${dir * 12} ${yy - 34} 0 ${yy}`} fill="#7c9a5e" stroke={INK} strokeWidth={3} />
          ))}
        </g>
      );
      break;
    case "window":
      el = (
        <g>
          <Box x={-80} y={-190} w={160} h={150} fill="#cfe3dd" sw={5} rx={4} />
          <Line d="M 0 -190 L 0 -40 M -80 -115 L 80 -115" w={4} />
          <Box x={-92} y={-40} w={184} h={12} fill={WOOD} sw={4} rx={3} />
        </g>
      );
      break;
    case "door":
      el = (
        <g>
          <Box x={-62} y={-196} w={124} h={196} fill={WOOD} sw={5} rx={3} />
          <O cx={38} cy={-100} rx={7} ry={7} fill={INK} sw={0} />
        </g>
      );
      break;
    case "rug":
      el = <O cx={0} cy={0} rx={210} ry={34} fill={color ?? "#c96f4a"} stroke={INK} sw={4} />;
      break;
    case "tree":
      el = (
        <g>
          <Line d="M 0 0 L 0 -70" w={9} color={WOOD_DARK} />
          <O cx={0} cy={-118} rx={62} ry={62} fill={color ?? "#8aa572"} sw={4.5} />
        </g>
      );
      break;
    case "road":
      el = (
        <g>
          <path
            d="M -700 0 C -420 -140 -160 -60 40 -150 C 240 -240 480 -180 700 -240"
            fill="none"
            stroke="#c9b691"
            strokeWidth={64}
            strokeLinecap="round"
          />
          <path
            d="M -700 0 C -420 -140 -160 -60 40 -150 C 240 -240 480 -180 700 -240"
            fill="none"
            stroke="#ffffff"
            strokeWidth={4}
            strokeDasharray="26 30"
            opacity={0.7}
          />
        </g>
      );
      break;
    case "moon":
      el = (
        <g>
          <Box x={-1920} y={-1080} w={3840} h={260} fill="#232c3d" sw={0} />
          <path d="M 1250 -160 A 34 34 0 1 0 1250 -110 A 27 27 0 1 1 1250 -160" fill="#f0e3b2" />
          {[980, 1090, 1360, 1470, 1600].map((sx, i) => (
            <O key={i} cx={sx} cy={-140 + (i % 3) * 40} rx={4} ry={4} fill="#f0e3b2" sw={0} />
          ))}
        </g>
      );
      break;
    case "clockBig":
      el = (
        <g>
          <Line d="M -26 0 L 0 -96 L 26 0" w={9} color={WOOD_DARK} />
          <O cx={0} cy={-166} rx={78} ry={78} fill={PROP_PAPER} sw={5.5} />
          <Line d="M 0 -166 L 0 -216 M 0 -166 L 34 -150" w={6} />
        </g>
      );
      break;
    case "flag":
      el = (
        <g>
          <Line d="M 0 0 L 0 -190" w={7} />
          <path d="M 0 -190 L 110 -168 L 0 -146 Z" fill={color ?? "#b0523d"} stroke={INK} strokeWidth={4} />
        </g>
      );
      break;
    default:
      el = null;
  }
  return <g transform={`translate(${x} ${y}) scale(${s})`}>{el}</g>;
};

// ---- sets ------------------------------------------------------------------

const SetBg: React.FC<{ set: string; palette: number }> = ({ set, palette }) => {
  const [wall, floor] = PALETTES[palette % PALETTES.length];
  if (set === "textcard") {
    return <AbsoluteFill style={{ backgroundColor: PAPER }} />;
  }
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: "0 0 22% 0", backgroundColor: wall }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "22%", backgroundColor: floor }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: "22%", height: 10, backgroundColor: "#00000018" }} />
      {set === "night" && <Prop t="moon" x={960} y={0} f={0} />}
    </AbsoluteFill>
  );
};

// ---- grain + vignette ------------------------------------------------------

const Grain: React.FC = () => (
  <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
    <filter id="papergrain">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} seed={7} result="n" />
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.6 0.6 0.6 0 0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#papergrain)" opacity={0.07} />
    <radialGradient id="vig" cx="50%" cy="46%" r="75%">
      <stop offset="70%" stopColor="#000" stopOpacity={0} />
      <stop offset="100%" stopColor="#000" stopOpacity={0.14} />
    </radialGradient>
    <rect width="100%" height="100%" fill="url(#vig)" />
  </svg>
);

// ---- scene -----------------------------------------------------------------

const PsychSceneView: React.FC<{ scene: PsychScene; index: number }> = ({ scene, index }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const set = scene.set ?? "room";
  const palette = scene.palette ?? index % PALETTES.length;
  const fade = interpolate(frame, [0, 8], [1, 0], { extrapolateRight: "clamp" });
  const pop = (d = 0) =>
    spring({ frame: frame - d, fps, config: { damping: 14, stiffness: 130, mass: 0.7 } });

  // Ken Burns
  const zb = scene.zoom === "out" ? [1.07, 1.0] : [1.0, 1.07];
  const scale = interpolate(frame, [0, durationInFrames], zb, { easing: Easing.inOut(Easing.ease) });
  const drift = interpolate(frame, [0, durationInFrames], [index % 2 ? -14 : 14, index % 2 ? 14 : -14]);

  if (set === "textcard") {
    const s = pop(4);
    const under = interpolate(frame, [12, 34], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
    return (
      <AbsoluteFill style={{ backgroundColor: PAPER }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${0.92 + s * 0.08})`,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontFamily: "Patrick Hand",
                fontSize: (scene.label?.size ?? 150),
                color: INK,
                letterSpacing: 6,
                lineHeight: 1.05,
                opacity: s,
              }}
            >
              {(scene.cardText ?? "").toUpperCase()}
            </div>
            <svg width={620} height={40} style={{ marginLeft: "auto", marginRight: "auto", display: "block" }}>
              <path
                d="M 10 20 Q 310 6 610 22"
                fill="none"
                stroke={INK}
                strokeWidth={9}
                strokeLinecap="round"
                strokeDasharray={620}
                strokeDashoffset={620 * (1 - under)}
              />
            </svg>
          </div>
        </div>
        <AbsoluteFill style={{ backgroundColor: PAPER, opacity: fade }} />
        <Grain />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${scale}) translateX(${drift}px)` }}>
        <SetBg set={set} palette={palette} />

        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          {/* floor-y baseline: props stand on y=810 (78.5% of 1080) */}
          {(scene.props ?? [])
            .filter((p) => !p.front)
            .map((p, i) => {
              const ps = pop(p.delay ?? 6 + i * 5);
              return (
                <g key={i} style={{ opacity: ps, transform: `scale(${0.7 + ps * 0.3})`, transformOrigin: `${p.x ?? 960}px ${p.y ?? 810}px` }}>
                  <Prop {...p} f={frame} />
                </g>
              );
            })}

          {(scene.chars ?? []).map((c, i) => {
            const cs = pop(c.delay ?? 0);
            return (
              <g key={`c${i}`} style={{ opacity: Math.min(1, cs * 1.2) }}>
                <Char {...c} f={frame} s={(c.s ?? 1) * (0.85 + cs * 0.15)} />
              </g>
            );
          })}

          {scene.signText && (
            <g>
              <Prop t="sign" x={960} y={810} text={scene.signText} f={frame} />
            </g>
          )}

          {(scene.props ?? [])
            .filter((p) => p.front)
            .map((p, i) => {
              const ps = pop(p.delay ?? 6);
              return (
                <g key={`f${i}`} style={{ opacity: ps, transform: `scale(${0.7 + ps * 0.3})`, transformOrigin: `${p.x ?? 960}px ${p.y ?? 810}px` }}>
                  <Prop {...p} f={frame} />
                </g>
              );
            })}
        </svg>

        {scene.label && (
          <div
            style={{
              position: "absolute",
              top: scene.label.y ?? 120,
              left: 0,
              right: 0,
              textAlign: "center",
              fontFamily: "Patrick Hand",
              fontSize: scene.label.size ?? 104,
              color: INK,
              letterSpacing: 4,
              transform: `rotate(${-1 + (index % 2) * 2}deg) scale(${0.8 + pop(8) * 0.2})`,
              opacity: pop(8),
            }}
          >
            {scene.label.text.toUpperCase()}
          </div>
        )}
      </AbsoluteFill>

      <AbsoluteFill style={{ backgroundColor: PAPER, opacity: fade }} />
      <Grain />
      {scene.audio && (
        <Audio src={staticFile(scene.audio as string)} />
      )}
    </AbsoluteFill>
  );
};

// ---- root -------------------------------------------------------------------

export const PsychToon: React.FC<{ psych?: PsychDoc }> = (raw) => {
  // --props passes the doc raw, merged shallowly over defaultProps (which keeps
  // the empty {psych} key) — so the raw shape must win.
  const psych = (Array.isArray((raw as any).scenes) && (raw as any).scenes.length > 0
    ? (raw as unknown as PsychDoc)
    : raw.psych) as PsychDoc;
  if (!psych || !Array.isArray(psych.scenes) || psych.scenes.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: PAPER }} />;
  }
  ensureFonts();
  const { fps } = useVideoConfig();
  const totalFrames = Math.ceil((psych.totalMs / 1000) * fps);
  const musicVol = psych.music?.volume ?? 0.12;
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      {psych.scenes.map((s, i) => {
        const start = Math.round(((s.startMs ?? 0) / 1000) * fps);
        const dur = Math.max(1, Math.round((s.ms / 1000) * fps));
        return (
          <Sequence key={i} from={start} durationInFrames={dur}>
            <PsychSceneView scene={s} index={i} />
          </Sequence>
        );
      })}
      {psych.music && (
        <Audio
          src={staticFile(psych.music.src)}
          loop
          volume={(f: number) =>
            f < totalFrames - fps * 2.5 ? musicVol : Math.max(0, musicVol * ((totalFrames - f) / (fps * 2.5)))
          }
        />
      )}
    </AbsoluteFill>
  );
};
