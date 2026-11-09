import React from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Content, Kicker, Headline, fitText, useT, useMotion, type V2Beat } from "../longscenes2";
import { Hand, useStamp } from "../kits";
import type { Family } from "./types";

// F3 RANK COUNTDOWN — the only LIST macro-structure (WatchMojo × SunnyV2):
// criteria line up front, rank reveals over photo panels, a rank-tick progress
// rail between entries, podium close. Rank = beat.n; total rides chapterCount
// (the preview lane counts chapters as entries).

const RankTicks: React.FC<{ current: number; total: number }> = ({ current, total }) => {
  const T = useT();
  const f = useCurrentFrame();
  return (
    <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 44 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: 54, height: 10, borderRadius: 5,
          background: i < current ? T.accent : T.dot,
          opacity: interpolate(f, [10 + i * 3, 16 + i * 3], [0.3, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }} />
      ))}
    </div>
  );
};

const CriteriaIntro: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const nIn = useMotion(4);
  const tIn = useMotion(14);
  const total = b.total || b.chapterCount || 5;
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div>
          <div style={{ opacity: nIn, transform: `scale(${0.9 + nIn * 0.1})` }}>
            <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 28, letterSpacing: "0.34em", color: T.sub, marginBottom: 20 }}>
              THE COUNTDOWN
            </div>
            <Headline text={`TOP ${total}`} size={230} />
          </div>
          <div style={{ marginTop: 50, opacity: tIn }}>
            <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 42, color: T.ink, maxWidth: 1200, marginLeft: "auto", marginRight: "auto", lineHeight: 1.4 }}>
              {fitText(b.headline || "", 90)}
            </div>
            {b.sub ? <div style={{ marginTop: 20, fontFamily: T.body, fontWeight: 600, fontSize: 32, color: T.sub }}>{fitText(b.sub, 80)}</div> : null}
          </div>
          <RankTicks current={0} total={total} />
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const RankEntry: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const nIn = useMotion(4);
  const tIn = useMotion(14);
  const photoIn = useMotion(10);
  const f = useCurrentFrame();
  const hand = interpolate(f, [22, 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rank = b.n || 1;
  const total = b.total || b.chapterCount || 5;
  return (
    <Content beat={b}>
      {b.photo ? (
        <div style={{ position: "absolute", top: 280, right: 150, bottom: 320, width: 600, overflow: "hidden", borderRadius: 10, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", opacity: photoIn, transform: `translateX(${(1 - photoIn) * 60}px)` }}>
          <img src={staticFile(b.photo)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : null}
      <div style={{ position: "absolute", top: 300, left: 150, width: b.photo ? 880 : 1600 }}>
        <div style={{ opacity: nIn, display: "flex", alignItems: "baseline", gap: 34 }}>
          <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 190, lineHeight: 1, color: "transparent", WebkitTextStroke: `5px ${T.accent}` }}>
            {String(rank).padStart(2, "0")}
          </div>
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 26, letterSpacing: "0.3em", color: T.sub }}>
            RANK {rank} OF {total}
          </div>
        </div>
        <div style={{ marginTop: 40, opacity: tIn, transform: `translateY(${(1 - tIn) * 26}px)` }}>
          <Hand type="highlight" color={T.highlight} progress={hand} seed={9}>
            <Headline text={fitText(b.headline || "", 82)} size={(b.headline || "").length > 64 ? 60 : 74} />
          </Hand>
        </div>
        {b.sub ? (
          <div style={{ marginTop: 34, fontFamily: T.body, fontWeight: 600, fontSize: 34, color: T.sub, lineHeight: 1.45, opacity: tIn }}>
            {fitText(b.sub, 120)}
          </div>
        ) : null}
        <RankTicks current={rank} total={total} />
      </div>
    </Content>
  );
};

const RankDivider: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const nIn = useMotion(4);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ opacity: nIn, transform: `scale(${0.92 + nIn * 0.08})` }}>
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 30, letterSpacing: "0.34em", color: T.sub }}>
            COMING UP
          </div>
          <div style={{ marginTop: 26 }}>
            <Headline text={fitText(b.chapterTitle || "", 56)} size={96} />
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const JudgeNote: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const stamp = useStamp(18);
  const tIn = useMotion(6);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 1340, textAlign: "center", opacity: tIn }}>
          <Kicker text={b.kicker || "THE VERDICT"} center />
          <div style={{ marginTop: 34 }}>
            <Headline text={`“${fitText(b.headline || "", 130)}”`} size={58} />
          </div>
          {b.sub ? (
            <div style={{ marginTop: 36, fontFamily: T.body, fontWeight: 600, fontSize: 34, color: T.sub }}>
              {fitText(b.sub, 90)}
            </div>
          ) : null}
          <div style={{ marginTop: 50, transform: `rotate(-3deg) scale(${stamp})`, display: "inline-block", border: `8px solid ${T.accent}`, color: T.accent, fontFamily: T.mono, fontWeight: 700, fontSize: 44, letterSpacing: "0.18em", padding: "14px 44px" }}>
            {b.label || "ON THE LIST"}
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const RankStat: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const nIn = useMotion(4);
  const lIn = useMotion(20);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div>
          <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: (b.big || "").length > 7 ? 200 : 260, lineHeight: 1, color: T.accent, opacity: nIn, transform: `scale(${0.9 + nIn * 0.1})` }}>
            {b.big}
          </div>
          <div style={{ marginTop: 44, fontFamily: T.body, fontWeight: 600, fontSize: 42, color: T.ink, maxWidth: 1300, marginLeft: "auto", marginRight: "auto", lineHeight: 1.35, opacity: lIn }}>
            {b.label}
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const CriteriaBoard: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const rows = (b.lines && b.lines.length ? b.lines : [b.headline || ""]).slice(0, 5);
  return (
    <Content beat={b}>
      <div style={{ position: "absolute", top: 250, left: 150, right: 150 }}>
        <Kicker text={b.kicker || "THE CRITERIA"} />
        <div style={{ marginTop: 20, marginBottom: 50 }}>
          <Headline text={b.lines?.length ? fitText(b.headline, 70) : ""} size={b.lines?.length ? 56 : 70} />
        </div>
        {rows.map((ln, i) => (
          <BoardRow key={i} i={i} ln={ln} />
        ))}
      </div>
    </Content>
  );
};

const BoardRow: React.FC<{ i: number; ln: string }> = ({ i, ln }) => {
  const T = useT();
  const rIn = useMotion(18 + i * 12);
  return (
    <div style={{ display: "flex", gap: 24, alignItems: "center", marginBottom: 32, opacity: rIn, transform: `translateX(${(1 - rIn) * -28}px)` }}>
      <div style={{ width: 46, height: 46, borderRadius: 8, border: `4px solid ${T.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.mono, fontWeight: 700, fontSize: 26, color: T.accent }}>
        ✓
      </div>
      <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 38, color: T.ink }}>
        {fitText(ln, 84)}
      </div>
    </div>
  );
};

const Podium: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const sIn = useMotion(8);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ opacity: sIn, transform: `translateY(${(1 - sIn) * 30}px)` }}>
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 28, letterSpacing: "0.32em", color: T.accent }}>
            THE LIST IS DONE
          </div>
          <div style={{ marginTop: 34 }}>
            <Headline text={fitText(b.headline || "Follow for the next countdown.", 60)} size={70} />
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

export const rankCountdown: Family = {
  name: "rank-countdown",
  scenes: {
    hero: CriteriaIntro,
    split: RankEntry,
    versus: RankEntry,
    chapter: RankDivider,
    quote: JudgeNote,
    stat: RankStat,
    process: CriteriaBoard,
    end: Podium,
  },
};
