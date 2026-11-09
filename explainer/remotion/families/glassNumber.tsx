import React from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Content, fitText, useT, useMotion, type V2Beat } from "../longscenes2";
import { LightSweep, ScrambleText, useCounter } from "../kits";
import type { Family } from "./types";

// F5 GLASS NUMBER — sleek tech (Andrei Jikh × ColdFusion): dark glass cards,
// number-scramble reveals, count-up stats, one light sweep per scene. An
// effects LAYER over the stat/terminal inventory — the identity is the glass
// treatment + decode motion, not new information architecture.

const Glass: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{
    position: "relative", borderRadius: 26, overflow: "hidden",
    background: "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))",
    border: "2px solid rgba(255,255,255,0.16)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
    ...style,
  }}>
    {children}
  </div>
);

const GlassTitle: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Glass style={{ padding: "70px 110px", maxWidth: 1500 }}>
          <LightSweep delay={20} dur={34} />
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 26, letterSpacing: "0.34em", color: T.accent, marginBottom: 34, textAlign: "center" }}>
            {b.kicker || T.eyebrow}
          </div>
          <div style={{ textAlign: "center" }}>
            <ScrambleText text={fitText(b.headline || "", 90)} delay={8} perChar={2} color={T.ink} style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: (b.headline || "").length > 60 ? 62 : 80, lineHeight: 1.25 }} />
          </div>
          {b.sub ? (
            <div style={{ marginTop: 40, fontFamily: T.body, fontWeight: 600, fontSize: 34, color: T.sub, textAlign: "center", opacity: 0.9 }}>
              {fitText(b.sub, 80)}
            </div>
          ) : null}
        </Glass>
      </AbsoluteFill>
    </Content>
  );
};

const GlassSplit: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const gIn = useMotion(6);
  const pIn = useMotion(12);
  return (
    <Content beat={b}>
      {b.photo ? (
        <div style={{ position: "absolute", top: 290, right: 150, bottom: 330, width: 580, opacity: pIn, transform: `translateX(${(1 - pIn) * 50}px)` }}>
          <Glass style={{ height: "100%" }}>
            <LightSweep delay={26} />
            <img src={staticFile(b.photo)} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }} />
          </Glass>
        </div>
      ) : null}
      <div style={{ position: "absolute", top: 330, left: 150, width: b.photo ? 920 : 1600, opacity: gIn, transform: `translateY(${(1 - gIn) * 26}px)` }}>
        <Glass style={{ padding: "64px 74px" }}>
          <LightSweep delay={30} />
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 24, letterSpacing: "0.3em", color: T.accent, marginBottom: 30 }}>
            {b.kicker || `PART ${String(b.n || 1).padStart(2, "0")}`}
          </div>
          <ScrambleText text={fitText(b.headline || "", 92)} delay={10} perChar={1} color={T.ink} style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: (b.headline || "").length > 80 ? 54 : 64, lineHeight: 1.3 }} />
          {b.sub ? (
            <div style={{ marginTop: 36, fontFamily: T.body, fontWeight: 600, fontSize: 32, color: T.sub, lineHeight: 1.45 }}>
              {fitText(b.sub, 100)}
            </div>
          ) : null}
        </Glass>
      </div>
    </Content>
  );
};

const GlassStat: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const big = b.big || "";
  const numMatch = big.match(/-?[\d][\d,]*(\.\d+)?/);
  const num = numMatch ? Number(numMatch[0].replace(/,/g, "")) : null;
  const counted = useCounter(num || 0, 8, 44);
  const lIn = useMotion(34);
  const bigText = num !== null && Number.isFinite(num)
    ? big.slice(0, numMatch!.index) + counted + big.slice(numMatch!.index + numMatch![0].length)
    : big;
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Glass style={{ padding: "90px 130px", minWidth: 1000, textAlign: "center" }}>
          <LightSweep delay={44} dur={38} />
          <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 220, lineHeight: 1, color: T.accent, textShadow: `0 0 70px ${T.ghost}` }}>
            {bigText}
          </div>
          <div style={{ marginTop: 46, fontFamily: T.body, fontWeight: 600, fontSize: 40, color: T.ink, maxWidth: 1200, marginLeft: "auto", marginRight: "auto", lineHeight: 1.35, opacity: lIn }}>
            {b.label}
          </div>
        </Glass>
      </AbsoluteFill>
    </Content>
  );
};

const ChapterHeadline: React.FC<{ text: string }> = ({ text }) => {
  const T = useT();
  return (
    <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 86, color: T.ink, lineHeight: 1.2 }}>
      {fitText(text, 50)}
    </div>
  );
};

const GlassChapter: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const nIn = useMotion(4);
  const tIn = useMotion(16);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Glass style={{ padding: "80px 130px", textAlign: "center" }}>
          <LightSweep delay={30} />
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 26, letterSpacing: "0.36em", color: T.accent }}>
            PART {String(b.n || 1).padStart(2, "0")}
          </div>
          <div style={{ marginTop: 34, opacity: tIn }}>
            <ChapterHeadline text={b.chapterTitle || ""} />
          </div>
        </Glass>
      </AbsoluteFill>
    </Content>
  );
};

const GlassEnd: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const tIn = useMotion(6);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Glass style={{ padding: "90px 150px", textAlign: "center" }}>
          <LightSweep delay={10} dur={44} />
          <div style={{ opacity: tIn }}>
            <ChapterHeadline text={b.headline || "Follow for more."} />
          </div>
          <div style={{ marginTop: 40, fontFamily: T.mono, fontWeight: 700, fontSize: 24, letterSpacing: "0.3em", color: T.accent }}>
            {T.badge} // OUT
          </div>
        </Glass>
      </AbsoluteFill>
    </Content>
  );
};

export const glassNumber: Family = {
  name: "glass-number",
  scenes: {
    hero: GlassTitle,
    split: GlassSplit,
    quote: GlassSplit,
    process: GlassSplit,
    versus: GlassSplit,
    timeline: GlassSplit,
    map: GlassSplit,
    terminal: GlassSplit,
    stat: GlassStat,
    chapter: GlassChapter,
    end: GlassEnd,
  },
};
