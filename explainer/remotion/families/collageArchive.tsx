import React from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Content, Kicker, Headline, fitText, useT, useMotion, type V2Beat } from "../longscenes2";
import { Hand, PaperCard, usePan } from "../kits";
import type { Family } from "./types";

// F7 COLLAGE ARCHIVE — the Vox grammar DEEPENED past the token theme: photo
// cutouts with white borders + tape that parallax-drift, hand-drawn annotation
// layers (rough-notation), newspaper-clipping quote cards, torn-paper chapter
// strips. Shares the paper substrate with the existing vox pack but replaces
// its scene structure.

const Cutout: React.FC<{ file: string; seed: number; w?: number }> = ({ file, seed, w = 560 }) => {
  const pan = usePan(seed, 1.06);
  const rot = ((seed * 13) % 7) - 3.5;
  return (
    <div style={{ position: "relative", transform: `rotate(${rot}deg)`, boxShadow: "0 30px 70px rgba(0,0,0,0.45)", background: "#FFFFFF", padding: 18, paddingBottom: 64, width: w }}>
      <div style={{ overflow: "hidden" }}>
        <img src={staticFile(file)} style={{ width: "100%", display: "block", transform: pan.transform }} />
      </div>
      <div style={{ position: "absolute", bottom: 14, left: 18, right: 18, fontFamily: "'JetBrains Mono', Consolas, monospace", fontWeight: 700, fontSize: 17, letterSpacing: "0.14em", color: "#6B6455", textAlign: "center" }}>
        FIG. {String((seed % 89) + 1)}
      </div>
      <div style={{ position: "absolute", top: -16, left: "50%", transform: `translateX(-50%) rotate(${rot * -1.4}deg)`, width: 150, height: 34, background: "rgba(233,214,160,0.78)", boxShadow: "0 3px 10px rgba(0,0,0,0.2)" }} />
    </div>
  );
};

const CollageOpen: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const tIn = useMotion(6);
  const hIn = useMotion(14);
  const hand = interpolate(f, [26, 58], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Content beat={b}>
      {b.photo ? (
        <div style={{ position: "absolute", top: 300, right: 170, opacity: hIn, transform: `translateX(${(1 - hIn) * 50}px) rotate(2deg)` }}>
          <Cutout file={b.photo} seed={b.i + 3} w={520} />
        </div>
      ) : null}
      <div style={{ position: "absolute", top: 330, left: 170, width: b.photo ? 920 : 1580 }}>
        <div style={{ opacity: tIn, marginBottom: 34 }}>
          <Kicker text={b.kicker || "FROM THE ARCHIVE"} />
        </div>
        <div style={{ opacity: hIn, transform: `translateY(${(1 - hIn) * 24}px)` }}>
          <Hand type="circle" color={T.accent} progress={hand} seed={17} strokeWidth={4} padding={14}>
            <Headline text={fitText(b.headline || "", 74)} size={(b.headline || "").length > 62 ? 64 : 80} />
          </Hand>
        </div>
        {b.sub ? (
          <div style={{ marginTop: 42, fontFamily: T.body, fontWeight: 600, fontSize: 34, color: T.sub, lineHeight: 1.45, opacity: hIn }}>
            {fitText(b.sub, 100)}
          </div>
        ) : null}
      </div>
    </Content>
  );
};

const CollageSplit: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const tIn = useMotion(6);
  const hand = interpolate(f, [24, 56], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Content beat={b}>
      {b.photo ? (
        <div style={{ position: "absolute", top: 320, left: 170, opacity: tIn, transform: "rotate(-1.6deg)" }}>
          <Cutout file={b.photo} seed={b.i + 5} w={540} />
        </div>
      ) : null}
      <div style={{ position: "absolute", top: 350, right: 170, width: b.photo ? 950 : 1580, textAlign: "right" }}>
        <div style={{ opacity: tIn, marginBottom: 30, display: "inline-block" }}>
          <Kicker text={b.kicker || `PART ${String(b.n || 1).padStart(2, "0")}`} />
        </div>
        <div style={{ opacity: tIn, transform: `translateY(${(1 - tIn) * 22}px)` }}>
          <Hand type="highlight" color={T.highlight} progress={hand} seed={8}>
            <Headline text={fitText(b.headline || "", 92)} size={(b.headline || "").length > 84 ? 56 : 66} />
          </Hand>
        </div>
        {b.sub ? (
          <div style={{ marginTop: 38, fontFamily: T.body, fontWeight: 600, fontSize: 32, color: T.sub, lineHeight: 1.45, opacity: tIn }}>
            {fitText(b.sub, 110)}
          </div>
        ) : null}
      </div>
    </Content>
  );
};

const ClippingCard: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const cIn = useMotion(4);
  const hand = interpolate(useCurrentFrame(), [28, 64], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ opacity: cIn, transform: `translateY(${(1 - cIn) * 36}px) rotate(0.8deg)` }}>
          <PaperCard rotate={0.8} style={{ maxWidth: 1300 }}>
            <div style={{ borderBottom: "3px double #8A8171", paddingBottom: 18, marginBottom: 30, fontFamily: T.mono, fontWeight: 700, fontSize: 20, letterSpacing: "0.3em", color: "#8A8171", display: "flex", justifyContent: "space-between" }}>
              <span>THE ARCHIVE TIMES</span>
              <span>CLIPPING №{String((b.i % 40) + 1)}</span>
            </div>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 48, lineHeight: 1.35, color: "#171310", maxWidth: 1150 }}>
              “{fitText(b.headline || b.text || "", 150)}”
            </div>
            <div style={{ marginTop: 30, display: "inline-block" }}>
              <Hand type="underline" color={T.accent} progress={hand} seed={31} strokeWidth={4}>
                <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 22, letterSpacing: "0.2em", color: "#5A5344" }}>
                  {b.label || b.kicker || "FILED & DATED"}
                </span>
              </Hand>
            </div>
          </PaperCard>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const TornChapter: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const sIn = useMotion(4);
  const tIn = useMotion(16);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ opacity: sIn, transform: `rotate(-2deg) scale(${0.92 + sIn * 0.08})` }}>
            <PaperCard rotate={-2} tape={true} style={{ display: "inline-block", padding: "26px 90px" }}>
              <span style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 130, color: "#171310", lineHeight: 1 }}>
                {String(b.n || 1).padStart(2, "0")}
              </span>
            </PaperCard>
          </div>
          <div style={{ marginTop: 60, opacity: tIn }}>
            <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 24, letterSpacing: "0.32em", color: T.sub, marginBottom: 22 }}>
              CHAPTER {String(b.n || 1).padStart(2, "0")} OF {String(b.total || b.chapterCount || 3).padStart(2, "0")}
            </div>
            <Headline text={fitText(b.chapterTitle || "", 60)} size={84} />
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const ScrapEnd: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const sIn = useMotion(6);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ opacity: sIn, transform: `rotate(-1.2deg) translateY(${(1 - sIn) * 30}px)` }}>
          <PaperCard rotate={-1.2} style={{ padding: "70px 110px", textAlign: "center" }}>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 62, color: "#171310", lineHeight: 1.3 }}>
              {fitText(b.headline || "Follow for the next archive dive.", 70)}
            </div>
            <div style={{ marginTop: 34, fontFamily: T.mono, fontWeight: 700, fontSize: 20, letterSpacing: "0.3em", color: "#8A8171" }}>
              — {T.brand} —
            </div>
          </PaperCard>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

export const collageArchive: Family = {
  name: "collage-archive",
  scenes: {
    hero: CollageOpen,
    split: CollageSplit,
    quote: ClippingCard,
    stat: ClippingCard,
    chapter: TornChapter,
    process: CollageSplit,
    versus: CollageSplit,
    end: ScrapEnd,
  },
};
