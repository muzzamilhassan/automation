import React from "react";
import {
  AbsoluteFill, Audio, Easing, Sequence, continueRender, delayRender,
  spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { getLength, getPointAtLength, getTangentAtLength } from "@remotion/paths";
import { Icon } from "./icons";
import { WidgetLayer } from "./Widgets";

// LIVING DIAGRAM — one persistent canvas that the narration mutates word by
// word (research/motion-storytelling-templates-2026-11-16.md §2; spec
// docs/qa/living-diagram-demo-qa.md). Everything here is a pure function of
// the frame (seek-safe, R5). Cue times arrive pre-resolved to the real TTS word
// timestamps by lib/diagram-cues.mjs. Brand colours come from the props (R6).
// Two looks: "tile" (rounded tiles, v1) and "glow" (the Visualcoders grammar:
// glowing duotone icons, marching dashed curves, badges, cards, statements).

type DNode = { id: string; kind: string; label: string; keep?: boolean; value?: string; scale?: number; color?: string };
type DEdge = { id: string; from: string; to: string };
type Scene = { n: number; total: number; title: string; startMs: number; endMs: number; layoutKind?: "flow" | "hub"; nodes: DNode[]; edges: DEdge[]; layout: Record<string, { x: number; y: number }>;
  badge?: string; module?: number; widgets?: any[] };
type Cue = {
  t: number; scene: number; do: string; node?: string; edge?: string; from?: number; to?: number; prefix?: string; suffix?: string;
  label?: string; tone?: string; text?: string; zoom?: number; forMs?: number; durMs?: number; burst?: boolean;
  card?: string; title?: string; lines?: string[]; side?: "left" | "right" | "bottom";
  widget?: string; index?: number; value?: string; line?: number; series?: number; ok?: boolean; step?: number;
};
export type DiagramDoc = {
  title: string; fps: number; width: number; height: number; totalMs: number; style?: "tile" | "glow" | "paper";
  theme: { bg: string; accent: string; label: string };
  scenes: Scene[]; cues: Cue[]; lines: Array<{ audio: string | null; startMs: number; ms: number }>;
  course?: { modules?: Array<{ n: number; title: string }>; palette?: string[] } | null;
  // the channel's approved music bed (public-relative path), ducked under the voice
  music?: string | null; musicVolume?: number;
};

const TILE = 112;
const FG = "#E9F1EE";
const BAD = "#FF5D5D";
const GOOD = "#2EE5A0";
// paper look (Course template C1): light textbook canvas, ink text, one accent
// colour per module. Our own palette — not the reference channel's.
const PAPER_BG = "#FFFFFF"; // C1b: pure white page (the reference lesson grammar)
const PAPER_INK = "#1A2028";
const MODULE_COLORS = ["#5B4FDB", "#D96A2B", "#1FA463", "#2B6CB0", "#B3375B", "#8A6A2F"];
// category colours for the glow look — generic, not per channel ("cyan" = brand accent)
const CAT: Record<string, string> = { blue: "#3B9BFF", purple: "#A56BFF", green: "#2EE5A0", yellow: "#FFC93C", red: "#FF5D5D", orange: "#FF9A3C", white: "#E9F1EE" };
const MONO = "JetBrains Mono, monospace";
const SANS = "Inter, sans-serif";

const rgba = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);
const prog = (ms: number, t: number, dur: number, ease = easeOut) => ease(clamp01((ms - t) / dur));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const lastOf = <T,>(arr: T[], pred: (x: T) => boolean): T | undefined => {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return arr[i];
  return undefined;
};

const useFonts = () => {
  const [h] = React.useState(() => delayRender("diagram fonts"));
  React.useEffect(() => {
    const want: Array<[string, string, string]> = [
      ["Inter", "fonts/inter-600.ttf", "600"],
      ["Inter", "fonts/inter-800.ttf", "800"],
      ["Inter", "fonts/inter-900.ttf", "900"],
      ["JetBrains Mono", "fonts/jetbrains-mono.ttf", "400 700"],
    ];
    Promise.all(want.map(([fam, file, weight]) => new FontFace(fam, `url(${staticFile(file)})`, { weight })
      .load().then((f) => { document.fonts.add(f); }).catch(() => undefined)))
      .finally(() => continueRender(h));
  }, [h]);
};

// two-tone "*accent*" text → spans (base = the non-accent colour)
const twoTone = (text: string, accent: string, style: React.CSSProperties, appear: (i: number) => number, base = FG) =>
  text.split(/\s+/).map((w, i) => {
    const hot = /^\*|\*$/.test(w) || /^\*.*\*[.,!?]?$/.test(w);
    const p = appear(i);
    return (
      <span key={i} style={{ ...style, color: hot ? accent : base, opacity: p, transform: `translateY(${(1 - p) * 26}px)`, display: "inline-block" }}>
        {w.replace(/\*/g, "")}
      </span>
    );
  });

export const LivingDiagram: React.FC<{ doc: DiagramDoc }> = ({ doc }) => {
  useFonts();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const { scenes, cues, theme } = doc;
  const glow = doc.style === "glow";
  const paper = doc.style === "paper";
  const A = theme.accent;
  const ink = paper ? PAPER_INK : FG;
  const bg = paper ? PAPER_BG : theme.bg;
  const R = glow ? 64 : TILE / 2; // node radius for edge endpoints
  const spr = (tMs: number, damping = 14) => spring({ frame: frame - (tMs / 1000) * fps, fps, config: { damping, stiffness: 170 } });
  const colorOf = (n?: DNode) => (n?.color ? (n.color === "cyan" ? A : CAT[n.color] || A) : glow ? A : FG);

  const si = Math.max(0, scenes.reduce((k, s, i) => (s.startMs <= ms ? i : k), 0));
  const sc = scenes[si];
  const prev = si > 0 ? scenes[si - 1] : undefined;
  const hub = sc.layoutKind === "hub";
  // module colour (paper): the scene's module cycles the paper palette; a course
  // plan can override the palette wholesale (no-static-maps: data, not code)
  const modColors = doc.course?.palette?.length ? doc.course.palette : MODULE_COLORS;
  const modColor = paper ? modColors[((sc.module ?? 1) - 1) % modColors.length] : A;

  // ---- node positions (keep-nodes glide from the previous layout, R4) ----
  const glide = prog(ms, sc.startMs, 1100, easeInOut);
  const posOf = (id: string) => {
    const L = sc.layout[id];
    const node = sc.nodes.find((n) => n.id === id);
    const P = prev?.layout[id];
    if (node?.keep && P) return { x: lerp(P.x, L.x, glide), y: lerp(P.y, L.y, glide) };
    return L;
  };
  const appearAt = (n: DNode) => {
    if (n.keep && prev?.layout[n.id]) return -Infinity;
    const c = cues.find((q) => q.scene === si && q.do === "appear" && q.node === n.id);
    return c ? c.t : sc.startMs + 250;
  };

  // ---- camera ----
  const camCues = cues.filter((c) => c.scene === si && (c.do === "focus" || c.do === "wide"));
  const camState = (c?: Cue) => {
    if (!c || c.do === "wide" || !c.node) return { x: width / 2, y: height / 2, z: 1 };
    const p = posOf(c.node);
    return { x: p.x, y: p.y, z: c.zoom || 1.3 };
  };
  const k = camCues.reduce((acc, c, i) => (c.t <= ms ? i : acc), -1);
  const camFrom = camState(k > 0 ? camCues[k - 1] : undefined);
  const camTo = camState(k >= 0 ? camCues[k] : undefined);
  const cp = k >= 0 ? prog(ms, camCues[k].t, 1000, easeInOut) : 1;
  const camZ = lerp(camFrom.z, camTo.z, cp);
  // never zoom past the canvas edge (a focus near the border used to crop nodes off-screen)
  const clampC = (v: number, size: number) => Math.min(size - size / (2 * camZ), Math.max(size / (2 * camZ), v));
  const cam = { x: clampC(lerp(camFrom.x, camTo.x, cp), width), y: clampC(lerp(camFrom.y, camTo.y, cp), height), z: camZ };
  const camTransform = `translate(${width / 2}px, ${height / 2}px) scale(${cam.z}) translate(${-cam.x}px, ${-cam.y}px)`;

  // ---- statement (title) dims the diagram ----
  const titleCue = lastOf(cues, (c) => c.do === "title" && c.scene === si && c.t <= ms && ms < c.t + (c.durMs || 2600));
  const titleOn = titleCue ? Math.min(prog(ms, titleCue.t, 350), 1 - prog(ms, titleCue.t + (titleCue.durMs || 2600) - 400, 400)) : 0;

  // ---- edge geometry ----
  const edgePath = (a: { x: number; y: number }, b: { x: number; y: number }, straight: boolean) => {
    if (straight || Math.abs(b.x - a.x) < 40) {
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.max(1, Math.hypot(dx, dy));
      // a node's label sits under it, so leave more room on vertical approaches
      const off = (ux: number, uy: number) => R + 14 + (uy > 0.3 ? 46 * uy : 0) + (Math.abs(ux) > 0.3 ? 10 : 0);
      const ux = dx / L, uy = dy / L;
      const o1 = off(ux, uy), o2 = off(-ux, -uy);
      return `M ${a.x + ux * o1} ${a.y + uy * o1} L ${b.x - ux * o2} ${b.y - uy * o2}`;
    }
    const dir = b.x > a.x ? 1 : -1;
    const x1 = a.x + dir * (R + 16), y1 = a.y, x2 = b.x - dir * (R + 16), y2 = b.y;
    if (Math.abs(y1 - y2) < 2) return `M ${x1} ${y1} L ${x2} ${y2}`;
    if (glow) {
      const c = Math.abs(x2 - x1) * 0.5;
      return `M ${x1} ${y1} C ${x1 + dir * c} ${y1} ${x2 - dir * c} ${y2} ${x2} ${y2}`;
    }
    const mx = (x1 + x2) / 2;
    const r = Math.min(16, Math.abs(y2 - y1) / 2, Math.abs(mx - x1));
    const s = y2 > y1 ? 1 : -1;
    return `M ${x1} ${y1} L ${mx - dir * r} ${y1} Q ${mx} ${y1} ${mx} ${y1 + s * r} L ${mx} ${y2 - s * r} Q ${mx} ${y2} ${mx + dir * r} ${y2} L ${x2} ${y2}`;
  };

  // ---- edges ----
  const edgeLayer = (s: Scene, fadeOut: number) => s.edges.map((e) => {
    const isCur = s === sc;
    const a = isCur ? posOf(e.from) : s.layout[e.from];
    const b = isCur ? posOf(e.to) : s.layout[e.to];
    if (!a || !b) return null;
    const d = edgePath(a, b, s.layoutKind === "hub");
    const len = getLength(d);
    const sIdx = scenes.indexOf(s);
    const eCues = cues.filter((c) => c.scene === sIdx && c.edge === e.id);
    const carried = isCur && prev && prev.edges.some((pe) => pe.id === e.id) && sc.nodes.find((n) => n.id === e.from)?.keep && sc.nodes.find((n) => n.id === e.to)?.keep;
    // in the glow look an edge draws itself once both ends are on stage (VC style)
    const fromN = s.nodes.find((n) => n.id === e.from);
    const toN = s.nodes.find((n) => n.id === e.to);
    const bothAt = isCur && fromN && toN ? Math.max(appearAt(fromN), appearAt(toN)) : -Infinity;
    const firstCue = eCues[0]?.t ?? Infinity;
    const drawAt = carried ? -Infinity : glow ? Math.min(firstCue, bothAt + 200) : firstCue;
    const drawn = isCur ? (drawAt === -Infinity ? 1 : prog(ms, drawAt, 650)) : 1;
    if (drawn <= 0) return null;
    const flow = lastOf(eCues, (c) => c.do === "flow" && c.t <= ms);
    const blocked = eCues.some((c) => c.do === "block" && c.t <= ms) && !(flow && eCues.findIndex((c) => c === flow) > eCues.findIndex((c) => c.do === "block"));
    const flowOn = flow ? clamp01(1 - (ms - (flow.t + (flow.forMs || 2800))) / 450) * prog(ms, flow.t, 250) : 0;
    const label = lastOf(eCues, (c) => c.do === "flow" && !!c.label && c.t <= ms)?.label;
    // tile edges share a vertical bus, so their labels sit on the last leg (near the target)
    const labelAt = getPointAtLength(d, glow ? len * 0.5 : Math.max(0, len - Math.min(110, len * 0.45)));
    const neg = label?.startsWith("-");
    const col = flow?.burst ? BAD : glow ? colorOf(fromN) : A;
    // ARROWS ONLY (owner 2026-11-17: no circles, calmer speed). px per ms:
    // 0.15 = 150 px/s (a 500 px edge takes ~3.3 s); a burst (attack/flood) 0.38.
    const n = flow?.burst ? 8 : 3;
    const speed = flow?.burst ? 0.38 : 0.15;
    const packets = flowOn > 0.01 ? Array.from({ length: n }, (_, j) => {
      const L = ((ms - (flow as Cue).t) * speed + (j * len) / n) % len;
      const p = getPointAtLength(d, L);
      const tg = getTangentAtLength(d, L);
      const ang = (Math.atan2(tg.y, tg.x) * 180) / Math.PI;
      return (
        <path key={j} d="M -7 -7 L 3 0 L -7 7" transform={`translate(${p.x} ${p.y}) rotate(${ang})`} fill="none" stroke={col}
          strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" opacity={flowOn}
          style={glow ? { filter: `drop-shadow(0 0 5px ${rgba(col, 0.85)})` } : undefined} />
      );
    }) : null;
    const dashMarch = glow ? -((ms / 1000) * (flowOn > 0.01 ? 60 : 14)) : 0;
    const baseStroke = blocked ? BAD : glow ? rgba(FG, 0.34) : paper ? rgba(ink, 0.28) : rgba(FG, 0.26);
    const xAt = getPointAtLength(d, len * 0.5);
    return (
      <g key={`${s.n}-${e.id}`} opacity={fadeOut}>
        {glow ? (
          <>
            {/* draw-on mask, then marching dashes */}
            <defs>
              <mask id={`m-${s.n}-${e.id}`} maskUnits="userSpaceOnUse">
                <path d={d} fill="none" stroke="#fff" strokeWidth={10} strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - drawn)} />
              </mask>
            </defs>
            <path d={d} fill="none" stroke={baseStroke} strokeWidth={2.2} strokeDasharray="7 8" strokeDashoffset={dashMarch} mask={`url(#m-${s.n}-${e.id})`} />
          </>
        ) : (
          <path d={d} fill="none" stroke={baseStroke} strokeWidth={2.4} strokeDasharray={blocked ? "10 9" : `${len} ${len}`} strokeDashoffset={blocked ? 0 : len * (1 - drawn)} />
        )}
        {flowOn > 0.01 && <path d={d} fill="none" stroke={col} strokeWidth={2.4} opacity={0.5 * flowOn} style={{ filter: `drop-shadow(0 0 6px ${rgba(col, 0.8)})` }} />}
        {packets}
        {blocked && (
          <g transform={`translate(${xAt.x} ${xAt.y})`}>
            <circle r={17} fill={doc.theme.bg} stroke={BAD} strokeWidth={2.5} />
            <path d="M -7 -7 L 7 7 M 7 -7 L -7 7" stroke={BAD} strokeWidth={3.2} strokeLinecap="round" />
          </g>
        )}
        {label && !blocked && (() => {
          const lp = prog(ms, (lastOf(eCues, (c) => c.label === label && c.t <= ms) as Cue).t, 400);
          const w = label.length * 13.5 + 26;
          const lc = neg ? BAD : col;
          return (
            <g transform={`translate(${labelAt.x} ${labelAt.y - 30})`} opacity={lp * (0.55 + 0.45 * Math.max(flowOn, 0))}>
              <rect x={-w / 2} y={-18} width={w} height={34} rx={8} fill={doc.theme.bg} stroke={rgba(lc, 0.75)} strokeWidth={1.5} />
              <text x={0} y={6} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={20} fill={lc}>{label}</text>
            </g>
          );
        })()}
      </g>
    );
  });

  // ---- nodes ----
  const nodeView = (n: DNode, s: Scene, fadeOut: number) => {
    const isCur = s === sc;
    const p = isCur ? posOf(n.id) : s.layout[n.id];
    const at = isCur ? appearAt(n) : -Infinity;
    const a = at === -Infinity ? 1 : spr(at, 13);
    if (a <= 0.001 || !p) return null;
    const sIdx = scenes.indexOf(s);
    const mine = cues.filter((c) => c.scene === sIdx && c.node === n.id && c.t <= ms);
    const tone = lastOf(mine, (c) => c.do === "tone" || c.do === "fail");
    const failed = tone?.do === "fail";
    const mood = failed ? "bad" : tone?.tone || "neutral";
    const base = colorOf(n);
    const col = mood === "bad" ? BAD : mood === "good" ? (glow ? GOOD : A) : base;
    const counter = lastOf(mine, (c) => c.do === "counter");
    let value = n.value || undefined;
    let counting = 0;
    if (counter) {
      const dur = counter.durMs || 900;
      const v = lerp(counter.from ?? 0, counter.to as number, prog(ms, counter.t, dur, easeInOut));
      value = `${counter.prefix || ""}${Math.round(v).toLocaleString("en-US")}${counter.suffix || ""}`;
      counting = ms < counter.t + dur + 250 ? 1 : 0;
    }
    const badge = lastOf(mine, (c) => c.do === "badge");
    const badgePop = badge ? spr(badge.t, 11) : 0;
    const badgeCol = badge?.tone === "bad" ? BAD : badge?.tone === "good" ? GOOD : glow ? base : A;
    const failPop = failed && tone ? spr(tone.t, 10) : 0;
    const moodGlow = tone ? prog(ms, tone.t, 500) : 0;
    const pulse = counting ? 1 + 0.04 * Math.sin((ms / 1000) * 14) : 1;
    const S = (n.scale || 1) * (glow ? 1 : 1);
    const iconBox = glow ? 112 : TILE;
    return (
      <div key={`${s.n}-${n.id}`} style={{
        position: "absolute", left: p.x - 180, top: p.y - iconBox / 2, width: 360,
        display: "flex", flexDirection: "column", alignItems: "center",
        opacity: a * fadeOut, transform: `scale(${(0.7 + 0.3 * a) * S})`, transformOrigin: `180px ${iconBox / 2}px`,
      }}>
        <div style={{
          width: iconBox, height: iconBox, position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
          ...(glow
            ? { transform: `scale(${pulse})` }
            : {
              borderRadius: 22, border: `2.5px solid ${mood === "neutral" ? rgba(ink, paper ? 0.35 : 0.55) : col}`,
              background: mood === "neutral" ? (paper ? "#FFFFFF" : rgba(FG, 0.04)) : rgba(col, 0.1),
              boxShadow: mood === "neutral" ? "none" : `0 0 ${36 * moodGlow}px ${rgba(col, 0.45)}`,
            }),
        }}>
          <div style={{
            opacity: failed ? 1 - 0.6 * failPop : 1, display: "flex",
            filter: glow ? `drop-shadow(0 0 ${10 + 14 * moodGlow}px ${rgba(col, 0.75)})` : undefined,
          }}>
            <Icon kind={n.kind} size={glow ? 104 : 62} color={glow || mood !== "neutral" || paper ? col : FG} stroke={glow ? 1.35 : 1.6} fill={glow ? rgba(col, 0.16) : "none"} />
          </div>
          {failed && (
            <svg width={iconBox} height={iconBox} viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, transform: `scale(${failPop})` }}>
              <path d="M 24 24 L 76 76 M 76 24 L 24 76" stroke={BAD} strokeWidth={8} strokeLinecap="round" />
            </svg>
          )}
          {badge && (() => {
            // one line, pill sized to its text, centred above the icon; longer text gets a
            // smaller font and anything past the cap ends in "…" (never wraps out of the pill)
            const txt = String(badge.text || "");
            const fs = txt.length <= 6 ? 19 : txt.length <= 12 ? 17 : 15;
            return (
              <div style={{
                position: "absolute", left: "50%", top: -22, transform: `translateX(-50%) scale(${badgePop})`, transformOrigin: "50% 100%",
                height: 32, padding: "0 12px", maxWidth: 260, borderRadius: 16, background: badgeCol, color: "#05090F",
                display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 700, fontSize: fs,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "32px", zIndex: 2,
                boxShadow: `0 0 18px ${rgba(badgeCol, 0.6)}`,
              }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{txt}</span>
              </div>
            );
          })()}
        </div>
        <div style={{
          marginTop: glow ? 10 : 14, whiteSpace: "nowrap",
          ...(glow
            ? { fontFamily: MONO, fontWeight: 400, fontSize: 21, color: rgba(FG, 0.82), letterSpacing: 0.5 }
            : { fontFamily: SANS, fontWeight: 800, fontSize: 22, letterSpacing: 3, color: rgba(ink, 0.86), textTransform: "uppercase" as const }),
        }}>{n.label}</div>
        {value !== undefined && value !== "" && (
          <div style={{
            marginTop: 6, fontFamily: MONO, fontWeight: 700, fontSize: glow ? 32 : 38,
            color: mood === "bad" ? BAD : counting || mood === "good" ? (glow ? col : A) : ink,
            transform: `scale(${1 + 0.06 * counting})`,
          }}>{value}</div>
        )}
      </div>
    );
  };

  // ---- outgoing scene (nodes/edges that do not carry over fade out) ----
  const outFade = prev ? 1 - prog(ms, sc.startMs, 450) : 0;
  const outgoingNodes = prev && outFade > 0 ? prev.nodes.filter((n) => !sc.nodes.some((m) => m.id === n.id && m.keep)) : [];
  const outgoingEdges = prev && outFade > 0 ? { ...prev, edges: prev.edges.filter((e) => !sc.edges.some((f) => f.id === e.id)) } : undefined;

  // ---- stamp (top band) ----
  const stamp = lastOf(cues, (c) => c.do === "stamp" && c.scene === si && c.t <= ms && ms < c.t + (c.durMs || 2700));
  const stampOut = stamp ? 1 - prog(ms, stamp.t + (stamp.durMs || 2700) - 380, 380) : 0;

  // ---- cards ----
  const cardIds = Array.from(new Set(cues.filter((c) => c.scene === si && c.do === "card").map((c) => c.card as string)));
  const cards = cardIds.map((id) => {
    const show = lastOf(cues, (c) => c.scene === si && c.do === "card" && c.card === id && c.t <= ms);
    if (!show) return null;
    const hide = cues.find((c) => c.scene === si && c.do === "hide" && c.card === id && c.t >= show.t && c.t <= ms);
    const pin = spr(show.t, 15);
    const out = hide ? prog(ms, hide.t, 350) : 0;
    const vis = pin * (1 - out);
    if (vis <= 0.01) return null;
    const tc = show.tone === "bad" ? BAD : show.tone === "good" ? GOOD : A;
    const side = show.side || "right";
    const pos: React.CSSProperties = side === "left" ? { left: 70, top: 300 } : side === "bottom" ? { left: width / 2 - 330, bottom: 90 } : { right: 70, top: 300 };
    const slide = side === "left" ? `translateX(${(1 - vis) * -60}px)` : side === "bottom" ? `translateY(${(1 - vis) * 60}px)` : `translateX(${(1 - vis) * 60}px)`;
    return (
      <div key={id} style={{
        position: "absolute", ...pos, width: 660 > width / 3 ? 520 : 660, opacity: vis, transform: slide,
        background: paper ? "#FFFFFF" : rgba("#0B1018", 0.92), border: `1.5px solid ${rgba(tc, paper ? 0.35 : 0.55)}`, borderTop: `4px solid ${tc}`, borderRadius: 14,
        padding: "22px 28px", boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 40px ${rgba(tc, 0.15)}`,
      }}>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, color: tc, marginBottom: 12 }}>{show.title}</div>
        {(show.lines || []).map((l, i) => {
          const lp = spr(show.t + 140 + i * 110, 16);
          const mark = /^✓/.test(l) ? GOOD : /^✗/.test(l) ? BAD : rgba(ink, 0.86);
          return <div key={i} style={{ fontFamily: MONO, fontSize: 23, color: mark, opacity: lp, transform: `translateX(${(1 - lp) * 14}px)`, lineHeight: 1.55 }}>{l}</div>;
        })}
      </div>
    );
  });

  // ---- chapter chip ----
  const chipIn = spr(sc.startMs + 80, 16);
  const pct = clamp01(ms / doc.totalMs);
  const diagramDim = 1 - 0.8 * titleOn;

  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill={rgba(FG, glow ? 0.045 : 0.06)} />
          </pattern>
          <radialGradient id="vig" cx="50%" cy="50%" r="75%">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </radialGradient>
          <radialGradient id="halo" cx="50%" cy="52%" r="45%">
            <stop offset="0%" stopColor={rgba(A, glow ? 0.07 : 0)} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
        {!paper && <rect width={width} height={height} fill="url(#dots)" />}
        {!paper && <rect width={width} height={height} fill="url(#halo)" />}
      </svg>
      {/* paper: no vignette overlay (the dark looks dim edges below) */}

      <AbsoluteFill style={{ transform: camTransform, transformOrigin: "0 0", opacity: diagramDim, filter: titleOn > 0.01 ? `blur(${3 * titleOn}px)` : undefined }}>
        <svg width={width} height={height} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {outgoingEdges && edgeLayer(outgoingEdges, outFade)}
          {edgeLayer(sc, 1)}
        </svg>
        {outgoingNodes.map((n) => nodeView(n, prev as Scene, outFade))}
        {sc.nodes.map((n) => nodeView(n, sc, 1))}
        {sc.widgets && sc.widgets.length ? (
          <WidgetLayer widgets={sc.widgets} cues={cues.filter((c) => c.scene === si)} ms={ms} accent={modColor} pop={spr} hidden={titleOn > 0.05} />
        ) : null}
      </AbsoluteFill>

      {cards}

      <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {!paper && <rect width={width} height={height} fill="url(#vig)" />}
      </svg>

      {/* statement — centred, two-tone, word by word */}
      {titleCue && titleOn > 0.01 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexWrap: "wrap", alignContent: "center", justifyContent: "center", gap: "0 22px", padding: "0 160px", opacity: titleOn }}>
          {twoTone(titleCue.text || "", paper ? modColor : A, { fontFamily: SANS, fontWeight: 900, fontSize: 84, letterSpacing: -1, textShadow: paper ? "none" : `0 8px 40px rgba(0,0,0,0.7)` }, (i) => spr(titleCue.t + i * 80, 13), ink)}
        </div>
      )}

      {/* chapter chip — paper: the lecture badge + big headline + underline bar */}
      {paper ? (
        <div style={{ position: "absolute", left: 64, top: 40, opacity: chipIn, transform: `translateX(${(1 - chipIn) * -24}px)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {sc.badge && (
              <div style={{ background: modColor, color: "#FFFFFF", fontFamily: MONO, fontWeight: 700, fontSize: 32, width: 68, height: 68, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>{sc.badge}</div>
            )}
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 64, letterSpacing: -1.2, color: ink, display: "flex", flexWrap: "wrap", gap: "0 17px" }}>
              {twoTone(sc.title, modColor, { fontFamily: SANS, fontWeight: 800, fontSize: 64, letterSpacing: -1.2 }, (i) => spr(sc.startMs + 120 + i * 70, 14), ink)}
            </div>
          </div>
          <div style={{ width: 104, height: 8, borderRadius: 4, background: modColor, marginTop: 14 }} />
        </div>
      ) : (
        <div style={{ position: "absolute", left: 64, top: 52, display: "flex", alignItems: "center", gap: 16, opacity: chipIn, transform: `translateX(${(1 - chipIn) * -40}px)` }}>
          <div style={{ background: A, color: theme.bg, fontFamily: MONO, fontWeight: 700, fontSize: 22, padding: "6px 14px", borderRadius: 10 }}>{sc.n}/{sc.total}</div>
          <div style={{ fontFamily: glow ? MONO : SANS, fontWeight: glow ? 700 : 800, fontSize: 24, letterSpacing: glow ? 1 : 4, color: FG, textTransform: glow ? "none" : "uppercase" }}>{glow ? sc.title.toLowerCase() : sc.title}</div>
        </div>
      )}
      {/* paper: course progress pills + the channel mark (a small dark square with
          the channel's initials — our own mark, from the kit label DATA) */}
      {paper ? (
        <div style={{ position: "absolute", right: 64, top: 46, display: "flex", alignItems: "center", gap: 22 }}>
          {doc.course?.modules?.length ? (
            <div style={{ display: "flex", gap: 8 }}>
              {doc.course.modules.map((m) => {
                const here = m.n === sc.module;
                return <div key={m.n} style={{ width: here ? 28 : 12, height: 12, borderRadius: 6, background: here ? modColors[(m.n - 1) % modColors.length] : rgba(ink, 0.16) }} />;
              })}
            </div>
          ) : null}
          <div style={{ width: 72, height: 72, borderRadius: 17, background: ink, color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 900, fontSize: 25, letterSpacing: 0.5 }}>
            {(theme.label || "").replace(/^THE\s+/i, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
        </div>
      ) : (
        <div style={{ position: "absolute", right: 64, top: 60, fontFamily: SANS, fontWeight: 800, fontSize: 18, letterSpacing: 5, color: rgba(ink, 0.45) }}>{theme.label}</div>
      )}

      {stamp && (
        <div style={{ position: "absolute", top: paper ? 984 : 128, left: 0, right: 0, display: "flex", justifyContent: "center", gap: paper ? 14 : 18, opacity: stampOut }}>
          {twoTone(stamp.text || "", paper ? modColor : A, { fontFamily: SANS, fontWeight: paper ? 800 : 900, fontSize: paper ? 46 : 64, letterSpacing: paper ? 0 : 1, textShadow: paper ? "none" : `0 6px 30px rgba(0,0,0,0.6)` }, (i) => spr(stamp.t + i * 70, 12), ink)}
        </div>
      )}

      <div style={{ position: "absolute", left: 0, bottom: 0, height: 5, width: `${pct * 100}%`, background: rgba(paper ? modColor : A, 0.7) }} />

      {doc.music ? (
        <Audio
          src={staticFile(doc.music)}
          loop
          volume={(f) => {
            const t = (f / fps) * 1000;
            const v = doc.musicVolume ?? 0.11;
            return v * clamp01(t / 1500) * clamp01((doc.totalMs - t) / 2000);
          }}
        />
      ) : null}
      {doc.lines.map((l, i) => l.audio ? (
        <Sequence key={i} from={Math.round((l.startMs / 1000) * fps)} durationInFrames={Math.max(1, Math.ceil((l.ms / 1000) * fps))}>
          <Audio src={staticFile(l.audio)} />
        </Sequence>
      ) : null)}
    </AbsoluteFill>
  );
};
