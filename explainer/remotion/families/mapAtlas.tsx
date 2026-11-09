import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { geoEquirectangular, geoPath, geoGraticule10 } from "d3-geo";
import { feature } from "topojson-client";
import countries110m from "world-atlas/countries-110m.json";
import { Content, fitText, useT, useMotion, type V2Beat } from "../longscenes2";
import { DateBar } from "../kits";
import type { Family } from "./types";

// F6 MAP ATLAS — Kings and Generals grammar: a persistent map canvas, border
// draw-ons, route arcs, and an ADVANCING DATE BAR as the chapter device.
// Geography is rendered offline from public-domain Natural Earth data
// (world-atlas npm) through a pure-math projection — no tile engines, fully
// deterministic. Route arcs are seeded per beat until beat data grows real
// coordinates (commented hook below).

const world = feature(countries110m as any, (countries110m as any).objects.countries) as any;
const PROJECTION = geoEquirectangular().fitSize([1920, 1080], { type: "Sphere" } as any);
const PATH_GEN = geoPath(PROJECTION);
const LAND_PATHS: string[] = (world.features as any[]).map((f) => PATH_GEN(f) || "");
const GRATICULE_PATH = PATH_GEN(geoGraticule10()) || "";

const MapCanvas: React.FC<{ drawProgress: number; fillProgress?: number; highlight?: number }> = ({ drawProgress, fillProgress = 1, highlight = -1 }) => {
  const T = useT();
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: T.bg }}>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid meet">
        {/* land masses fill in as the atlas opens */}
        {LAND_PATHS.map((d, i) => (
          <path key={i} d={d} fill={T.line} opacity={0.9 * fillProgress * interpolate(f, [i * 0.6, i * 0.6 + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
        ))}
        {/* graticule: the atlas grid */}
        <path d={GRATICULE_PATH} fill="none" stroke={T.dot} strokeWidth={1} opacity={0.5 * drawProgress} pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - drawProgress)} />
        {/* borders draw on along the coastline */}
        {LAND_PATHS.map((d, i) => (
          <path key={`s${i}`} d={d} fill="none" stroke={i === highlight ? T.accent : T.accent2} strokeWidth={i === highlight ? 3.5 : 1.6} opacity={0.9} pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - drawProgress)} />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

// seeded great-circle-ish arcs — beat data grows real coordinates later; the
// deterministic seed keeps every render byte-identical meanwhile.
const RouteArcs: React.FC<{ seed: number; progress: number; count?: number }> = ({ seed, progress, count = 3 }) => {
  const T = useT();
  return (
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid meet">
      {Array.from({ length: count }).map((_, i) => {
        const s = (seed + i * 37) % 100;
        const x1 = 200 + ((s * 17) % 1500);
        const y1 = 220 + ((s * 29) % 640);
        const x2 = 200 + (((s * 41) + 500) % 1500);
        const y2 = 220 + (((s * 13) + 260) % 640);
        const mx = (x1 + x2) / 2;
        const my = Math.min(y1, y2) - 140 - (s % 90);
        const d = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={T.accent} strokeWidth={4} strokeLinecap="round" opacity={0.95} pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - interpolate(progress, [i / count, (i + 0.7) / count], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }))} />
            <circle cx={x1} cy={y1} r={9} fill={T.accent2} opacity={progress > i / count ? 1 : 0} />
            <circle cx={x2} cy={y2} r={13} fill="none" stroke={T.accent2} strokeWidth={5} opacity={progress >= (i + 0.7) / count ? 1 : 0} />
          </g>
        );
      })}
    </svg>
  );
};

const AtlasOpen: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const draw = interpolate(f, [0, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tIn = useMotion(30);
  return (
    <>
      <MapCanvas drawProgress={draw} fillProgress={interpolate(f, [0, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", opacity: tIn, transform: `translateY(${(1 - tIn) * 20}px)` }}>
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 28, letterSpacing: "0.4em", color: T.accent, marginBottom: 30, textShadow: `0 2px 20px ${T.bg}` }}>
            THE ATLAS
          </div>
          <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 96, color: T.ink, lineHeight: 1.2, textShadow: `0 4px 40px ${T.bg}, 0 0 60px ${T.bg}` }}>
            {fitText(b.headline || "", 66)}
          </div>
          {b.sub ? (
            <div style={{ marginTop: 36, fontFamily: T.body, fontWeight: 600, fontSize: 34, color: T.ink, opacity: 0.85 }}>
              {fitText(b.sub, 80)}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </>
  );
};

const RouteScene: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const draw = interpolate(f, [0, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const arcs = interpolate(f, [14, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tIn = useMotion(20);
  return (
    <>
      <MapCanvas drawProgress={draw} fillProgress={1} />
      <RouteArcs seed={b.i * 7 + (b.n || 1)} progress={arcs} />
      <div style={{ position: "absolute", top: 170, left: 150, right: 150 }}>
        <div style={{ opacity: tIn, background: `linear-gradient(90deg, ${T.bg}d9, transparent)`, paddingLeft: 20, paddingBottom: 8 }}>
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 24, letterSpacing: "0.3em", color: T.accent, marginBottom: 16 }}>
            {b.kicker || `MOVEMENT ${String(b.n || 1).padStart(2, "0")}`}
          </div>
          <HeadlineSafe text={fitText(b.headline || "", 84)} />
        </div>
        {b.sub ? (
          <div style={{ marginTop: 22, fontFamily: T.body, fontWeight: 600, fontSize: 34, color: T.ink, opacity: tIn, background: `${T.bg}b0`, padding: "8px 20px", display: "inline-block" }}>
            {fitText(b.sub, 110)}
          </div>
        ) : null}
      </div>
    </>
  );
};

const HeadlineSafe: React.FC<{ text: string }> = ({ text }) => {
  const T = useT();
  return (
    <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 62, color: T.ink, lineHeight: 1.25, textShadow: `0 2px 24px ${T.bg}` }}>
      {text}
    </div>
  );
};

const DateChapter: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const draw = interpolate(f, [0, 60], [0, 0.35 + 0.65 * Math.min((b.n || 1) / Math.max(b.total || b.chapterCount || 3, 1), 1)], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tIn = useMotion(14);
  const labels = Array.from({ length: Math.max(b.total || b.chapterCount || 3, 1) }).map((_, i) => `PHASE ${String(i + 1).padStart(2, "0")}`);
  return (
    <>
      <MapCanvas drawProgress={draw} fillProgress={1} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end" }}>
        <div style={{ marginBottom: 170, textAlign: "center", opacity: tIn }}>
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 26, letterSpacing: "0.36em", color: T.accent, marginBottom: 22 }}>
            PART {String(b.n || 1).padStart(2, "0")} OF {String(b.total || b.chapterCount || 3).padStart(2, "0")}
          </div>
          <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 84, color: T.ink, textShadow: `0 3px 30px ${T.bg}` }}>
            {b.chapterTitle}
          </div>
        </div>
      </AbsoluteFill>
      <DateBar labels={labels} progress={draw} color={T.accent} sub={T.ink} />
    </>
  );
};

const TerritoryStat: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const draw = interpolate(f, [0, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sIn = useMotion(24);
  const highlight = (b.i * 13) % 40;
  return (
    <>
      <MapCanvas drawProgress={draw} fillProgress={1} highlight={highlight} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", opacity: sIn, transform: `scale(${0.9 + sIn * 0.1})` }}>
          <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 200, lineHeight: 1, color: T.accent, textShadow: `0 0 60px ${T.bg}, 0 0 90px ${T.bg}` }}>
            {b.big}
          </div>
          <div style={{ marginTop: 40, fontFamily: T.body, fontWeight: 600, fontSize: 40, color: T.ink, maxWidth: 1200, marginLeft: "auto", marginRight: "auto", textShadow: `0 2px 24px ${T.bg}` }}>
            {b.label}
          </div>
        </div>
      </AbsoluteFill>
    </>
  );
};

export const mapAtlas: Family = {
  name: "map-atlas",
  scenes: {
    hero: AtlasOpen,
    split: RouteScene,
    quote: RouteScene,
    chapter: DateChapter,
    stat: TerritoryStat,
    versus: RouteScene,
    timeline: RouteScene,
  },
};
