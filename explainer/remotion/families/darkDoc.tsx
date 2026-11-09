import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Content, fitText, useT, type V2Beat } from "../longscenes2";
import { GlowRule } from "../kits";
import type { Family } from "./types";

// F2 DARK-DOC GLOW-TRACE — LEMMiNO grammar: ONE idea per screen, giant type,
// a single glowing line that draws beneath the claim, 8-20s holds, long slow
// fades. The structural inverse of the dense engine: nothing else on screen.

const bigLines = (text: string, max = 4) => {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += max) lines.push(words.slice(i, i + max).join(" "));
  return lines.slice(0, 4);
};

const SlowText: React.FC<{ text: string; size: number; delay?: number; glow?: boolean }> = ({ text, size, delay = 8, glow = true }) => {
  const T = useT();
  const f = useCurrentFrame();
  const inP = interpolate(f, [delay, delay + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ruleP = interpolate(f, [delay + 22, delay + 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lines = bigLines(text);
  return (
    <div style={{ textAlign: "center", width: "100%" }}>
      {lines.map((ln, i) => (
        <div key={i} style={{
          fontFamily: T.display, fontWeight: T.displayWeight, fontSize: size, lineHeight: 1.22,
          color: T.ink, opacity: interpolate(f, [delay + i * 8, delay + i * 8 + 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          transform: `translateY(${(1 - inP) * 16}px)`,
        }}>
          {ln}
        </div>
      ))}
      {glow ? (
        <div style={{ marginTop: 46, display: "flex", justifyContent: "center" }}>
          <GlowRule progress={ruleP} width={Math.min(900, 240 + text.length * 6)} color={T.accent} thickness={3} />
        </div>
      ) : null}
    </div>
  );
};

const Statement: React.FC<{ b: V2Beat }> = ({ b }) => {
  const len = (b.headline || "").length;
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 220px" }}>
        <SlowText text={fitText(b.headline || "", 120)} size={len > 90 ? 66 : len > 50 ? 84 : 104} />
      </AbsoluteFill>
    </Content>
  );
};

const GlowChapter: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const numIn = interpolate(f, [4, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tIn = interpolate(f, [20, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ruleP = interpolate(f, [30, 68], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 30, letterSpacing: "0.4em", color: T.sub, opacity: numIn }}>
            {String(b.n || 1).padStart(2, "0")}
          </div>
          <div style={{ marginTop: 40, opacity: tIn, transform: `translateY(${(1 - tIn) * 14}px)` }}>
            <SlowText text={b.chapterTitle || ""} size={92} delay={26} glow={false} />
          </div>
          <div style={{ marginTop: 50, display: "flex", justifyContent: "center" }}>
            <GlowRule progress={ruleP} width={720} color={T.accent} />
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const GlowStat: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const nIn = interpolate(f, [6, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ruleP = interpolate(f, [30, 64], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div>
          <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: (b.big || "").length > 7 ? 190 : 240, lineHeight: 1, color: T.ink, opacity: nIn, textShadow: `0 0 60px ${T.ghost}` }}>
            {b.big}
          </div>
          <div style={{ marginTop: 48, display: "flex", justifyContent: "center" }}>
            <GlowRule progress={ruleP} width={640} color={T.accent} />
          </div>
          <div style={{ marginTop: 44, fontFamily: T.body, fontWeight: 600, fontSize: 40, color: T.sub, maxWidth: 1200, marginLeft: "auto", marginRight: "auto", lineHeight: 1.4, opacity: interpolate(f, [50, 78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            {b.label}
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const GlowEnd: React.FC<{ b: V2Beat }> = ({ b }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fadeBlack = interpolate(f, [durationInFrames - 24, durationInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Content beat={b}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 240px" }}>
          <SlowText text={b.headline || "Follow for the next story."} size={88} />
        </AbsoluteFill>
      </Content>
      <AbsoluteFill style={{ background: "#000", opacity: fadeBlack, pointerEvents: "none" }} />
    </>
  );
};

export const darkDoc: Family = {
  name: "dark-doc",
  scenes: {
    hero: Statement,
    split: Statement,
    quote: Statement,
    process: Statement,
    versus: Statement,
    timeline: Statement,
    map: Statement,
    terminal: Statement,
    chapter: GlowChapter,
    stat: GlowStat,
    end: GlowEnd,
  },
};

// NOTE: one idea per screen is the grammar — every sentence slide maps to the
// same Statement system; only chapter/stat/end differ. Slow fades (26f in,
// fade-to-black out) replace the engine's quick beat fades.
