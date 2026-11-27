import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fitText, useT, BeatBackdrop, type V2Beat, type V2Shot } from "../longscenes2";
import { Letterbox, PanPhoto, usePan } from "../kits";
import type { Family } from "./types";

// F4 LANDSCAPE-QUOTE LONGFORM — Fall of Civilizations grammar: the tempo
// INVERSION. Minutes-long landscape pans under letterbox bars, full-sentence
// serif quotes held calmly, fade-to-black chapter devices. No photo beat
// renders a seeded gradient field so the pan identity still reads.
//
// Continuous flow (2026-11-27 owner complaint, QQ): the backdrop is drawn per
// SHOT by DocV2's persistent shot layer (one clip / one pan across ~15-30 s,
// crossfaded, pan direction varies per shot) and the letterbox slides in ONCE
// for the whole episode. Scenes only crossfade their text — nothing re-enters
// per sentence.

const GradientField: React.FC<{ seed?: number }> = ({ seed = 0 }) => {
  const T = useT();
  const pan = usePan(seed, 1.15);
  const hue = (seed * 47) % 360;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `linear-gradient(${120 + hue % 60}deg, ${T.bg} 0%, ${T.ghost} 55%, ${T.bg} 100%)`, ...pan }} />
      {/* the quotes are light serif — the field is tinted so they stay readable */}
      <AbsoluteFill style={{ background: "rgba(6,8,12,0.55)" }} />
    </AbsoluteFill>
  );
};

// one backdrop per SHOT: its clip (darkened), else its first photo panned,
// else the gradient field — never black
const ShotBackdrop: React.FC<{ shot: V2Shot; seed: number }> = ({ shot, seed }) => {
  const vid = shot.beats.map((b) => b.broll || b.video).find(Boolean);
  if (vid) return <BeatBackdrop file={vid} />;
  const photo = shot.beats.map((b) => b.photo).find(Boolean);
  return photo ? <PanPhoto file={photo} seed={seed} tint="rgba(6,8,12,0.45)" /> : <GradientField seed={seed} />;
};

// the cinema frame: slides in once at the episode start, then holds
const FrameBars: React.FC = () => {
  const f = useCurrentFrame();
  const barIn = interpolate(f, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <Letterbox progress={barIn} height={130} />;
};

// per-beat text crossfade: short fade in, short fade out, no slide
const useTextFade = (inFrames = 6, outFrames = 5) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const a = interpolate(f, [0, inFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const z = durationInFrames > inFrames + outFrames
    ? interpolate(f, [durationInFrames - outFrames, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  return Math.min(a, z);
};

const PanScene: React.FC<{ b: V2Beat; size?: number }> = ({ b, size }) => {
  const T = useT();
  const qIn = useTextFade();
  const len = (b.headline || "").length;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 240px" }}>
      <div style={{ textAlign: "center", opacity: qIn }}>
        <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: size || (len > 110 ? 54 : len > 60 ? 68 : 84), lineHeight: 1.35, color: "#F4EFE6", textShadow: "0 4px 30px rgba(0,0,0,0.6)" }}>
          {b.headline}
        </div>
        {b.sub ? (
          <div style={{ marginTop: 40, fontFamily: T.mono, fontWeight: 700, fontSize: 24, letterSpacing: "0.3em", color: "rgba(244,239,230,0.75)" }}>
            {b.sub}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const FadeChapter: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const nIn = interpolate(f, [10, 44], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <AbsoluteFill style={{ background: "#050607" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", opacity: nIn }}>
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 28, letterSpacing: "0.44em", color: "rgba(232,220,200,0.55)" }}>
            PART {String(b.n || 1).padStart(2, "0")}
          </div>
          <div style={{ marginTop: 38, fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 90, color: "#E8DCC8", lineHeight: 1.25 }}>
            {b.chapterTitle}
          </div>
        </div>
      </AbsoluteFill>
    </>
  );
};

const FadeEnd: React.FC<{ b: V2Beat }> = ({ b }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const T = useT();
  const tIn = interpolate(f, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeBlack = interpolate(f, [durationInFrames - 26, durationInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 260px" }}>
        <div style={{ textAlign: "center", fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 76, color: "#F4EFE6", opacity: tIn, lineHeight: 1.3, textShadow: "0 4px 30px rgba(0,0,0,0.6)" }}>
          {fitText(b.headline || "Follow for the next story.", 90)}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#000", opacity: fadeBlack, pointerEvents: "none" }} />
    </>
  );
};

export const landscapeQuote: Family = {
  name: "landscape-quote",
  Backdrop: ShotBackdrop,
  hasBackdrop: () => true, // clip -> photo -> gradient: every shot has one
  Frame: FrameBars,
  scenes: {
    hero: (p) => <PanScene {...p} size={88} />,
    split: PanScene,
    quote: PanScene,
    process: PanScene,
    versus: PanScene,
    timeline: PanScene,
    map: PanScene,
    terminal: PanScene,
    stat: PanScene,
    chapter: FadeChapter,
    end: FadeEnd,
  },
};
