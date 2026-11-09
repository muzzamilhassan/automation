import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Content, fitText, useT, useMotion, type V2Beat } from "../longscenes2";
import type { Family } from "./types";

// F8 BOARD SYSTEMS — the index-board grammar: split-flap cascades (airport
// departure board), flip-checklist rows, ticket-stub quote cards. Hand-rolled
// flap math (two rotateX halves per char, staggered cascade) — pure frame
// math, no deps (research/style-engines-remotion-2026-11-09.md item 10).

const FLAP_DUR = 8; // frames per char flip

const FlapCell: React.FC<{ ch: string; revealAt: number; accent?: boolean }> = ({ ch, revealAt, accent = false }) => {
  const T = useT();
  const f = useCurrentFrame();
  const p = interpolate(f, [revealAt, revealAt + FLAP_DUR], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shown = p >= 1;
  const midChar = GLYPH_FOR(ch, Math.floor(f / 2) + revealAt);
  const flap = p < 1 ? Math.abs(Math.cos(p * Math.PI)) : 0; // 1 → 0 → 1 flip
  return (
    <div style={{ position: "relative", width: 74, height: 96, background: "#12151A", borderRadius: 8, border: `2px solid ${T.line}`, overflow: "hidden", perspective: 300 }}>
      {/* top + bottom halves of the TARGET char, revealed by the flap */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "50%", display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden", fontFamily: "'JetBrains Mono', Consolas, monospace", fontWeight: 700, fontSize: 64, lineHeight: 1, color: accent ? T.accent : T.ink }}>
        <span style={{ transform: `translateY(${flap * -100}%)` }}>{shown ? ch : midChar}</span>
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "50%", display: "flex", alignItems: "flex-start", justifyContent: "center", overflow: "hidden", fontFamily: "'JetBrains Mono', Consolas, monospace", fontWeight: 700, fontSize: 64, lineHeight: 1, color: accent ? T.accent : T.ink }}>
        <span style={{ transform: `translateY(${flap * 100}%)` }}>{shown ? ch : midChar}</span>
      </div>
      <div style={{ position: "absolute", top: "48%", left: 0, right: 0, height: 2, background: "rgba(0,0,0,0.55)" }} />
    </div>
  );
};

const GLYPH_FOR = (target: string, tick: number): string => {
  const pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  if (target === " ") return " ";
  return pool[(tick * 11 + target.charCodeAt(0)) % pool.length];
};

const FlapRow: React.FC<{ text: string; startAt: number; accent?: boolean; scale?: number }> = ({ text, startAt, accent = false, scale = 1 }) => (
  <div style={{ display: "flex", gap: 8, justifyContent: "center", transform: `scale(${scale})`, transformOrigin: "center" }}>
    {text.split("").map((ch, i) => (
      <FlapCell key={i} ch={ch === " " ? " " : ch.toUpperCase()} revealAt={startAt + i * 3} accent={accent} />
    ))}
  </div>
);

const wrapWords = (text: string, perRow: number): string[] => {
  const words = (text || "").toUpperCase().split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > perRow) { rows.push(cur.trim()); cur = w; } else { cur = (cur + " " + w).trim(); }
  }
  if (cur) rows.push(cur);
  return rows.slice(0, 3);
};

const BoardTitle: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const rows = wrapWords(b.headline || "", 14);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 26, alignItems: "center" }}>
          {rows.map((r, i) => (
            <FlapRow key={i} text={r} startAt={8 + i * 22} accent={i === 0} scale={rows.length > 2 ? 0.85 : 1} />
          ))}
          {b.sub ? (
            <div style={{ marginTop: 40, fontFamily: T.mono, fontWeight: 700, fontSize: 24, letterSpacing: "0.3em", color: T.sub, opacity: interpolate(f, [40, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
              {b.sub}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const FlapStat: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const lIn = useMotion(40);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <FlapRow text={b.big || "000"} startAt={6} accent />
          <div style={{ marginTop: 56, fontFamily: T.body, fontWeight: 600, fontSize: 40, color: T.ink, maxWidth: 1200, marginLeft: "auto", marginRight: "auto", lineHeight: 1.4, opacity: lIn }}>
            {b.label}
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const FlapChapter: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const tIn = useMotion(30);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <FlapRow text={`PART ${String(b.n || 1).padStart(2, "0")}`} startAt={6} accent scale={0.8} />
          <div style={{ marginTop: 54, opacity: tIn }}>
            <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 82, color: T.ink, lineHeight: 1.25 }}>
              {fitText(b.chapterTitle || "", 54)}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const TicketCard: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const tIn = useMotion(6);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ opacity: tIn, transform: `translateY(${(1 - tIn) * 30}px) rotate(-1deg)`, maxWidth: 1300, background: "#F4EFE6", borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,0.5)", position: "relative" }}>
          <div style={{ position: "absolute", left: -14, top: "50%", width: 28, height: 28, borderRadius: "50%", background: T.bg, border: "2px solid rgba(0,0,0,0.15)", transform: "translateY(-50%)" }} />
          <div style={{ position: "absolute", right: -14, top: "50%", width: 28, height: 28, borderRadius: "50%", background: T.bg, border: "2px solid rgba(0,0,0,0.15)", transform: "translateY(-50%)" }} />
          <div style={{ padding: "60px 90px" }}>
            <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 20, letterSpacing: "0.3em", color: "#8A8171", borderBottom: "2px dashed rgba(0,0,0,0.25)", paddingBottom: 20, marginBottom: 30 }}>
              TICKET — {b.kicker || "ADMIT ONE"}
            </div>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 46, lineHeight: 1.4, color: "#171310" }}>
              “{fitText(b.headline || b.text || "", 140)}”
            </div>
            <div style={{ marginTop: 28, fontFamily: T.mono, fontWeight: 700, fontSize: 22, letterSpacing: "0.18em", color: "#5A5344" }}>
              {b.label || b.sub || "KEEP THIS STUB"}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const Checklist: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const rows = (b.lines && b.lines.length ? b.lines : [b.headline || ""]).slice(0, 5);
  return (
    <Content beat={b}>
      <div style={{ position: "absolute", top: 250, left: 150, right: 150 }}>
        {b.lines?.length ? (
          <div style={{ marginBottom: 50 }}>
            <KickerRow text={b.kicker || "THE CHECKLIST"} />
            <div style={{ marginTop: 18 }}><div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 54, color: T.ink }}>{fitText(b.headline, 66)}</div></div>
          </div>
        ) : null}
        {rows.map((ln, i) => <CheckRow key={i} i={i} ln={ln} />)}
      </div>
    </Content>
  );
};

const KickerRow: React.FC<{ text: string }> = ({ text }) => {
  const T = useT();
  return <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 26, letterSpacing: "0.24em", color: T.accent }}>{text}</div>;
};

const CheckRow: React.FC<{ i: number; ln: string }> = ({ i, ln }) => {
  const T = useT();
  const f = useCurrentFrame();
  const rIn = useMotion(16 + i * 10);
  const flip = interpolate(f, [30 + i * 14, 38 + i * 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const springPop = flip >= 1 ? Math.min((f - (38 + i * 14)) / 6, 1) : 0;
  return (
    <div style={{ display: "flex", gap: 24, alignItems: "center", marginBottom: 32, opacity: rIn, transform: `translateX(${(1 - rIn) * -28}px)` }}>
      <div style={{
        width: 50, height: 50, borderRadius: 10, border: `4px solid ${T.accent}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: T.mono, fontWeight: 700, fontSize: 30, color: T.accent,
        transform: `rotate(${(1 - springPop) * -90}deg)`, opacity: flip >= 1 ? 1 : 0.25,
      }}>
        ✓
      </div>
      <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 38, color: T.ink }}>
        {fitText(ln, 84)}
      </div>
    </div>
  );
};

const BoardClose: React.FC<{ b: V2Beat }> = ({ b }) => {
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <FlapRow text={(b.headline || "FOLLOW FOR MORE").toUpperCase().slice(0, 16)} startAt={8} accent scale={0.72} />
      </AbsoluteFill>
    </Content>
  );
};

export const boardSystem: Family = {
  name: "board-system",
  scenes: {
    hero: BoardTitle,
    stat: FlapStat,
    chapter: FlapChapter,
    quote: TicketCard,
    process: Checklist,
    end: BoardClose,
  },
};
