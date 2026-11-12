import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Content, fitText, useT, BeatBackdrop, type V2Beat } from "../longscenes2";
import { Letterbox, PanPhoto, usePan } from "../kits";
import type { Family } from "./types";

// F4 LANDSCAPE-QUOTE LONGFORM — Fall of Civilizations grammar: the tempo
// INVERSION. Minutes-long landscape pans under letterbox bars, full-sentence
// serif quotes held calmly, fade-to-black chapter devices. No photo beat
// renders a seeded gradient field so the pan identity still reads.

const GradientField: React.FC<{ seed?: number }> = ({ seed = 0 }) => {
  const T = useT();
  const pan = usePan(seed, 1.15);
  const hue = (seed * 47) % 360;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `linear-gradient(${120 + hue % 60}deg, ${T.bg} 0%, ${T.ghost} 55%, ${T.bg} 100%)`, ...pan }} />
    </AbsoluteFill>
  );
};

const Backdrop: React.FC<{ b: V2Beat; iSeed?: number }> = ({ b, iSeed = 0 }) => {
  const vid = b.broll || b.video;
  if (vid) return <BeatBackdrop file={vid} />;
  return b.photo ? <PanPhoto file={b.photo} seed={iSeed} tint="rgba(6,8,12,0.45)" /> : <GradientField seed={iSeed} />;
};

const PanScene: React.FC<{ b: V2Beat; size?: number }> = ({ b, size }) => {
  const T = useT();
  const f = useCurrentFrame();
  const barIn = interpolate(f, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const qIn = interpolate(f, [16, 48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const len = (b.headline || "").length;
  return (
    <>
      <Backdrop b={b} />
      <Letterbox progress={barIn} height={130} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 240px" }}>
        <div style={{ textAlign: "center", opacity: qIn, transform: `translateY(${(1 - qIn) * 18}px)` }}>
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
    </>
  );
};

const FadeChapter: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const nIn = interpolate(f, [10, 44], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const barIn = interpolate(f, [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <AbsoluteFill style={{ background: "#050607" }} />
      <Letterbox progress={barIn} height={130} />
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
  const barIn = interpolate(f, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tIn = interpolate(f, [16, 44], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeBlack = interpolate(f, [durationInFrames - 26, durationInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Backdrop b={b} />
      <Letterbox progress={barIn} height={130} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 260px" }}>
        <div style={{ textAlign: "center", fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 76, color: "#F4EFE6", opacity: tIn, lineHeight: 1.3 }}>
          {fitText(b.headline || "Follow for the next story.", 90)}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#000", opacity: fadeBlack, pointerEvents: "none" }} />
    </>
  );
};

export const landscapeQuote: Family = {
  name: "landscape-quote",
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
