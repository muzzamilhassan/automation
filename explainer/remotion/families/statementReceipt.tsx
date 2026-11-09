import React from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Content, Kicker, Headline, Sub, fitText, useT, useMotion, type V2Beat } from "../longscenes2";
import { Hand, PaperCard, useStamp } from "../kits";
import type { Family } from "./types";

// F1 STATEMENT-RECEIPT — the investigation desk (How Money Works ×
// Coffeezilla). Claim slide → verbatim receipt with a red-circle draw →
// verdict stamp; the receipt rhythm REPLACES chapter cards. The least
// commoditized archetype cluster on the market (research/template-layout-
// market-catalog-2026-11-09.md).

const EXHIBIT: React.FC<{ n?: number }> = ({ n }) => {
  const T = useT();
  return (
    <div style={{ position: "absolute", top: -34, left: 24, background: T.accent, color: "#FFFFFF", fontFamily: T.mono, fontWeight: 700, fontSize: 20, letterSpacing: "0.22em", padding: "6px 18px" }}>
      EXHIBIT {String(n || 1).padStart(2, "0")}
    </div>
  );
};

const CaseOpen: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const kIn = useMotion(4);
  const hIn = useMotion(12);
  const hand = interpolate(useCurrentFrame(), [24, 54], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Content beat={b}>
      <div style={{ position: "absolute", top: 230, left: 0, right: 0, textAlign: "center", opacity: kIn }}>
        <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 30, letterSpacing: "0.34em", color: T.accent }}>
          CASE FILE // {T.badge}
        </div>
      </div>
      <div style={{ position: "absolute", top: 350, left: 150, right: 150, textAlign: "center" }}>
        <div style={{ opacity: hIn, transform: `translateY(${(1 - hIn) * 26}px)` }}>
          <Hand type="underline" color={T.accent} progress={hand} strokeWidth={5} seed={11}>
            <Headline text={fitText(b.headline || "", 74)} size={(b.headline || "").length > 60 ? 70 : 88} />
          </Hand>
        </div>
        {b.sub ? (
          <div style={{ marginTop: 46, display: "inline-block" }}>
            <Sub text={fitText(b.sub, 66)} size={34} />
          </div>
        ) : null}
      </div>
    </Content>
  );
};

const ClaimStatement: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const tIn = useMotion(6);
  const hand = interpolate(useCurrentFrame(), [20, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Content beat={b}>
      {b.photo ? (
        <div style={{ position: "absolute", top: 300, right: 150, bottom: 330, width: 560, overflow: "hidden", borderRadius: 8, border: `3px solid ${T.line}`, transform: "rotate(1.2deg)", boxShadow: "0 18px 50px rgba(0,0,0,0.35)" }}>
          <img src={staticFile(b.photo)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : null}
      <div style={{ position: "absolute", top: 330, left: 150, width: b.photo ? 900 : 1600 }}>
        <div style={{ marginBottom: 36, opacity: tIn }}>
          <Kicker text={b.kicker || `CLAIM ${String(b.n || 1).padStart(2, "0")}`} />
        </div>
        <div style={{ opacity: tIn, transform: `translateY(${(1 - tIn) * 24}px)` }}>
          <Hand type="highlight" color={T.highlight} progress={hand} seed={5}>
            <Headline text={fitText(b.headline || "", 96)} size={(b.headline || "").length > 84 ? 58 : 68} />
          </Hand>
        </div>
        {b.sub ? (
          <div style={{ marginTop: 40 }}>
            <Sub text={fitText(b.sub, 84)} size={34} />
          </div>
        ) : null}
      </div>
    </Content>
  );
};

const ReceiptCard: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const cardIn = useMotion(4);
  const hand = interpolate(f, [26, 62], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const quote = b.headline || b.text || "";
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ opacity: cardIn, transform: `translateY(${(1 - cardIn) * 40}px)` }}>
          <PaperCard rotate={-1.4} style={{ maxWidth: 1360 }}>
            <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 20, letterSpacing: "0.3em", color: "#8A8171", marginBottom: 26 }}>
              RECEIPT — VERBATIM
            </div>
            <div style={{ fontFamily: "Georgia, 'Playfair Display', serif", fontWeight: 700, fontSize: 52, lineHeight: 1.4, color: "#1A1A1A", maxWidth: 1200 }}>
              “{fitText(quote, 150)}”
            </div>
            <div style={{ marginTop: 30, display: "inline-block" }}>
              <Hand type="circle" color="#D33A2C" progress={hand} seed={23} strokeWidth={4} padding={10}>
                <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 26, letterSpacing: "0.14em", color: "#5A5344" }}>
                  {b.label || b.kicker || "CITED SOURCE ON FILE"}
                </span>
              </Hand>
            </div>
          </PaperCard>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const VerdictStamp: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const stamp = useStamp(10);
  const labelIn = useMotion(26);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ transform: `rotate(-4deg) scale(${stamp})`, display: "inline-block", border: `12px solid ${T.accent}`, color: T.accent, fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 130, lineHeight: 1.05, padding: "26px 70px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {b.big || "VERIFIED"}
          </div>
          <div style={{ marginTop: 54, opacity: labelIn, fontFamily: T.body, fontWeight: 600, fontSize: 42, color: T.ink, maxWidth: 1300, marginLeft: "auto", marginRight: "auto", lineHeight: 1.35 }}>
            {b.label}
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const EvidenceTimeline: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const n = b.n || 1;
  const count = Math.max(b.total || b.chapterCount || 3, n);
  const track = interpolate(f, [8, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tIn = useMotion(18);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 1500 }}>
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 24, letterSpacing: "0.3em", color: T.accent, marginBottom: 34, textAlign: "center" }}>
            EVIDENCE TRACK
          </div>
          <div style={{ position: "relative", height: 8, background: T.dot, borderRadius: 4 }}>
            <div style={{ position: "absolute", inset: 0, width: `${track * 100}%`, background: T.accent, borderRadius: 4 }} />
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} style={{ position: "absolute", top: -12, left: `${((i + 0.5) / count) * 100}%`, transform: "translateX(-50%)" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: i < n ? T.accent : T.bg, border: `4px solid ${i < n ? T.accent : T.line}`, boxShadow: i < n ? `0 0 18px ${T.ghost}` : "none" }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 60, textAlign: "center", opacity: tIn }}>
            <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 26, letterSpacing: "0.3em", color: T.sub, marginBottom: 20 }}>
              PART {String(n).padStart(2, "0")} OF {String(count).padStart(2, "0")}
            </div>
            <Headline text={fitText(b.chapterTitle || "", 60)} size={82} />
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const LedgerRow: React.FC<{ i: number; ln: string }> = ({ i, ln }) => {
  const T = useT();
  const rIn = useMotion(16 + i * 10);
  return (
    <div style={{ display: "flex", gap: 26, alignItems: "baseline", marginBottom: 30, opacity: rIn, transform: `translateX(${(1 - rIn) * -30}px)` }}>
      <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 40, color: T.accent, minWidth: 70 }}>
        {String(i + 1).padStart(2, "0")}
      </div>
      <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 38, color: T.ink, lineHeight: 1.4 }}>
        {fitText(ln, 82)}
      </div>
    </div>
  );
};

const LedgerSteps: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const rows = (b.lines && b.lines.length ? b.lines : [b.headline || b.text || ""]).slice(0, 6);
  return (
    <Content beat={b}>
      <div style={{ position: "absolute", top: 240, left: 150, right: 150 }}>
        {b.headline && b.lines?.length ? (
          <div style={{ marginBottom: 44 }}>
            <Kicker text={b.kicker || "THE LEDGER"} />
            <div style={{ marginTop: 18 }}><Headline text={fitText(b.headline, 66)} size={54} /></div>
          </div>
        ) : null}
        {rows.map((ln, i) => <LedgerRow key={i} i={i} ln={ln} />)}
      </div>
    </Content>
  );
};

const TwoReceipts: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const lIn = useMotion(6);
  const rIn = useMotion(16);
  return (
    <Content beat={b}>
      {b.headline && (b.leftTitle || b.rightTitle) ? (
        <div style={{ position: "absolute", top: 210, left: 0, right: 0, textAlign: "center" }}>
          <Kicker text={b.kicker || "SIDE BY SIDE"} center />
          <div style={{ marginTop: 20 }}><Headline text={fitText(b.headline, 70)} size={58} /></div>
        </div>
      ) : null}
      <div style={{ position: "absolute", top: 400, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 60 }}>
        <div style={{ opacity: lIn, transform: `translateY(${(1 - lIn) * 30}px) rotate(-1.5deg)` }}>
          <PaperCard rotate={-1.5} style={{ width: 620 }}>
            <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 22, letterSpacing: "0.2em", color: T.accent, marginBottom: 18 }}>{b.leftTitle || "SIDE A"}</div>
            {(b.leftPoints && b.leftPoints.length ? b.leftPoints : [b.sub || ""]).slice(0, 3).map((p, i) => (
              <div key={i} style={{ fontFamily: T.body, fontWeight: 600, fontSize: 30, lineHeight: 1.5, color: "#1A1A1A" }}>— {fitText(p, 46)}</div>
            ))}
          </PaperCard>
        </div>
        <div style={{ opacity: rIn, transform: `translateY(${(1 - rIn) * 30}px) rotate(1.2deg)` }}>
          <PaperCard rotate={1.2} style={{ width: 620 }}>
            <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 22, letterSpacing: "0.2em", color: T.accent2, marginBottom: 18 }}>{b.rightTitle || "SIDE B"}</div>
            {(b.rightPoints && b.rightPoints.length ? b.rightPoints : [""]).slice(0, 3).map((p, i) => (
              <div key={i} style={{ fontFamily: T.body, fontWeight: 600, fontSize: 30, lineHeight: 1.5, color: "#1A1A1A" }}>— {fitText(p, 46)}</div>
            ))}
          </PaperCard>
        </div>
      </div>
    </Content>
  );
};

const CaseClose: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const stamp = useStamp(8);
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div>
          <div style={{ transform: `rotate(-3deg) scale(${stamp})`, display: "inline-block", border: `10px solid ${T.accent}`, color: T.accent, fontFamily: T.mono, fontWeight: 700, fontSize: 64, letterSpacing: "0.2em", padding: "22px 56px" }}>
            CASE CLOSED
          </div>
          <div style={{ marginTop: 60 }}>
            <Headline text={fitText(b.headline || "Follow for the next case file.", 60)} size={62} />
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

export const statementReceipt: Family = {
  name: "statement-receipt",
  scenes: {
    hero: CaseOpen,
    split: ClaimStatement,
    quote: ReceiptCard,
    stat: VerdictStamp,
    chapter: EvidenceTimeline,
    process: LedgerSteps,
    versus: TwoReceipts,
    terminal: LedgerSteps,
    end: CaseClose,
  },
};
