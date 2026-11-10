import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { fitText, useMotion, type V2Beat } from "../longscenes2";
import { sceneForBeat } from "../../../lib/market-scenes.mjs";
import type { Family } from "./types";
import {
  BigBoard, Chip, ClockBadge, Confetti, Desk, HandText, INK, Monitor, Room, ScatterPaper,
  SceneShell, StickyNote, TickerWall, Character, ensureToonFonts, paletteFor, type ToonMood,
} from "./cartoonKit";

// F9 MARKET FILES — the Paper Billions grammar as a family (P1,
// docs/superpowers/specs/2026-11-10-market-files-family-p1-spec.md): flat
// cartoon rooms, round-headed characters, handwritten labels, day chips,
// clock badges, fictional ticker walls, glowing % boards. Scenes derive from
// the beat (lib/market-scenes.mjs — same beat → same scene), every text is
// DOM text in Caveat, nothing loads, nothing costs. Layouts NOT covered here
// (map/terminal/versus) fall through to the engine (R2).

// scene mood → character face mood (front characters react to the day)
const faceMood = (mood: string, slot: number): ToonMood => {
  if (mood === "crash") return slot % 3 === 0 ? "shocked" : "worried";
  if (mood === "party") return "happy";
  if (mood === "night") return slot % 2 === 0 ? "sad" : "worried";
  if (mood === "data") return slot % 2 === 0 ? "calm" : "worried";
  return slot % 3 === 0 ? "happy" : "calm";
};

// ---- the four built sets -------------------------------------------------------

const TradingFloor: React.FC<{ mood: string; seed: number; showBoard?: boolean; boardTitle?: string; boardBig?: string }> = ({ mood, seed, showBoard, boardTitle, boardBig }) => {
  // traders sit BEHIND their desks: characters draw first, desks+monitors
  // cover their legs, feet tucked just under the desk slab (y 620 top).
  // With the board shown, desks spread to the edges so nobody hides behind it.
  const spread = Boolean(showBoard);
  const deskY = 620;
  const charY = (s: number) => deskY - 196 * s + 14;
  return (
    <Room mood={mood}>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid slice">
        {/* wall panel seams */}
        {[380, 760, 1140, 1520].map((px) => (
          <line key={px} x1={px} y1={150} x2={px} y2={820} stroke="rgba(0,0,0,0.18)" strokeWidth={3} />
        ))}
        {/* traders from behind (drawn first — the desks sit in front) */}
        {spread ? (
          <g>
            <Character x={330} y={charY(0.95)} s={0.95} slot={seed % 5} back />
            <Character x={545} y={charY(0.88)} s={0.88} slot={(seed + 2) % 5} back />
            <Character x={1375} y={charY(0.88)} s={0.88} slot={(seed + 4) % 5} back />
            <Character x={1590} y={charY(0.95)} s={0.95} slot={(seed + 1) % 5} back />
          </g>
        ) : (
          <g>
            <Character x={430} y={charY(1.02)} s={1.02} slot={seed % 5} back />
            <Character x={640} y={charY(0.92)} s={0.92} slot={(seed + 2) % 5} back />
            <Character x={1310} y={charY(0.92)} s={0.92} slot={(seed + 4) % 5} back />
            <Character x={1520} y={charY(1.02)} s={1.02} slot={(seed + 1) % 5} back />
          </g>
        )}
        {/* desks + monitors in front */}
        <g>
          <Desk x={spread ? 430 : 520} y={deskY} w={430} s={1.15} />
          <Desk x={spread ? 1490 : 1400} y={deskY} w={430} s={1.15} />
          <Monitor x={430} y={556} trend={mood === "party" ? "up" : "down"} s={1.12} />
          <Monitor x={640} y={572} trend={mood === "party" ? "up" : "down"} s={1.02} />
          <Monitor x={1310} y={572} trend={mood === "party" ? "up" : "down"} s={1.02} />
          <Monitor x={1520} y={556} trend={mood === "party" ? "up" : "down"} s={1.12} />
        </g>
        {mood === "crash" && <ScatterPaper seed={seed} n={7} y={660} />}
        {mood === "party" && <Confetti seed={seed} n={44} />}
      </svg>
      <TickerWall seed={seed} rows={2} cols={6} dim={Boolean(showBoard)} />
      {showBoard && <BigBoard title={boardTitle || "MARKET"} big={boardBig || "0%"} mood={mood} x={620} y={230} w={680} />}
    </Room>
  );
};

const Office: React.FC<{ mood: string; seed: number }> = ({ mood, seed }) => {
  const notes = ["SAFE", "BORING", "SET IT & FORGET IT", "BUY MORE", "HOLD"];
  const noteSlots = [0, 1, 2].map((k) => notes[(seed + k * 2) % notes.length]);
  return (
    <Room mood={mood}>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid slice">
        {/* mint wall panels */}
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x={i * 240} y={0} width={240} height={880} fill={i % 2 === 0 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
        ))}
        {/* the cork board (the notes themselves are the HTML StickyNotes above) */}
        <rect x={1150} y={190} width={560} height={380} rx={14} fill="#8a6b4f" stroke={INK} strokeWidth={8} />
        {/* worker behind the desk (chars first, desk covers the legs) */}
        <Character x={800} y={700 - 211 * 1.3 + 12} s={1.3} slot={(seed + 3) % 5} mood={faceMood(mood, seed)} pose={mood === "party" ? "raised" : "down"} />
        <Desk x={560} y={700} w={520} s={1.2} />
        <Monitor x={560} y={628} trend="up" s={1.4} />
        {/* plant */}
        <g transform="translate(1780 800)">
          <path d="M -34 0 q -6 -90 34 -130 q 6 60 -4 130 Z" fill="#5b7a45" stroke={INK} strokeWidth={5} />
          <path d="M 4 0 q 44 -70 20 -140 q -34 44 -44 140 Z" fill="#6d8f55" stroke={INK} strokeWidth={5} />
          <path d="M -60 0 h 120 l -14 74 h -92 Z" fill="#b0653f" stroke={INK} strokeWidth={6} />
        </g>
      </svg>
      {noteSlots.map((t, i) => (
        <StickyNote key={i} text={t} x={1215 + (i % 2) * 285} y={235 + Math.floor(i / 2) * 150} r={i % 2 === 0 ? -4 : 3} bg={["#f7e359", "#f2b3a0", "#bfe3b0"][i % 3]} />
      ))}
    </Room>
  );
};

const DataCenter: React.FC<{ mood: string; seed: number }> = ({ mood, seed }) => (
  // the room follows the mood like every other set (R5); only the machine
  // racks stay fixed navy — they're the hardware
  <Room mood={mood}>
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid slice">
      {/* the aisle: vanishing perspective */}
      <polygon points="860,120 1060,120 1280,880 640,880" fill="rgba(255,255,255,0.045)" />
      {[0, 1].map((side) =>
        [0, 1, 2, 3].map((row) => {
          const w = 200 - row * 34;
          const x = side === 0 ? 60 + row * 190 : 1860 - row * 190 - w;
          const y = 200 + row * 40;
          const h = 560 - row * 90;
          return (
            <g key={`${side}${row}`}>
              <rect x={x} y={y} width={w} height={h} rx={8} fill="#1b2331" stroke="#0e1420" strokeWidth={4} />
              {Array.from({ length: 5 }).map((_, u) =>
                Array.from({ length: Math.floor(w / 40) }).map((_, c) => {
                  const on = (seed * 31 + row * 17 + u * 7 + c * 13 + side * 5) % 5;
                  return <rect key={`${u}${c}`} x={x + 12 + c * 38} y={y + 22 + u * (h - 40) / 5} width={12} height={10} rx={2} fill={on === 0 ? "#63e0a2" : on === 1 ? "#f2b35e" : "#2c3a52"} />;
                }),
              )}
            </g>
          );
        }),
      )}
      {/* ceiling light strips */}
      {[240, 470, 700].map((ly, i) => (
        <rect key={ly} x={900 - i * 60} y={ly} width={120 + i * 120} height={26} rx={10} fill="#dff3ff" opacity={0.85 - i * 0.22} />
      ))}
      {/* money stacks in the aisle */}
      {[0, 1, 2, 3].map((i) => {
        const mx = 780 + (i % 2) * 220;
        const my = 700 + Math.floor(i / 2) * 90;
        return (
          <g key={i} transform={`translate(${mx} ${my})`}>
            {[0, 1, 2, 3].map((b) => (
              <rect key={b} x={-70 + b * 4} y={-16 - b * 14} width={140 - b * 8} height={16} rx={4} fill="#7da062" stroke={INK} strokeWidth={3} />
            ))}
          </g>
        );
      })}
      <Character x={1240} y={655} s={0.85} slot={(seed + 1) % 5} back />
    </svg>
  </Room>
);

const Stage: React.FC<{ mood: string; seed: number; quoteMood?: ToonMood; solo?: boolean; side?: "left" | "right" }> = ({ mood, seed, quoteMood, solo, side = "left" }) => (
  <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 80% at 50% 45%, #b7a4cf 0%, #9587b3 45%, #6f6392 100%)" }}>
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid slice">
      {/* spotlight cones (solo mode lights only the free side) */}
      {solo ? (
        <polygon points={side === "left" ? "560,-40 300,1080 820,1080" : "1360,-40 1100,1080 1620,1080"} fill="rgba(255,255,255,0.12)" />
      ) : (
        <g>
          <polygon points="560,-40 300,1080 820,1080" fill="rgba(255,255,255,0.10)" />
          <polygon points="1360,-40 1100,1080 1620,1080" fill="rgba(255,255,255,0.10)" />
        </g>
      )}
      <ellipse cx={560} cy={1010} rx={280} ry={52} fill="rgba(0,0,0,0.22)" />
      <ellipse cx={1360} cy={1010} rx={280} ry={52} fill="rgba(0,0,0,0.22)" />
      {solo ? (
        <Character x={side === "left" ? 560 : 1360} y={685} s={1.5} slot={seed % 5} mood={quoteMood || "calm"} pose="down" />
      ) : (
        <g>
          <Character x={560} y={685} s={1.5} slot={seed % 5} mood={quoteMood || "calm"} pose="down" />
          <Character x={1360} y={685} s={1.5} slot={(seed + 2) % 5} mood="worried" pose={quoteMood === "shocked" ? "raised" : "down"} flip />
        </g>
      )}
    </svg>
  </AbsoluteFill>
);

// ---- the eight layout scenes ----------------------------------------------------

const HeroScene: React.FC<{ b: V2Beat }> = ({ b }) => {
  ensureToonFonts();
  const s = sceneForBeat(b);
  const headIn = useMotion(8);
  return (
    <SceneShell beatIndex={b.i}>
      {s.location === "office" ? <Office mood={s.mood} seed={b.i + 1} /> : <TradingFloor mood={s.mood} seed={b.i + 1} />}
      {s.day && <Chip text={s.day} bg={paletteFor(s.mood).chip} color={paletteFor(s.mood).chipText} x={60} y={620} />}
      <ClockBadge time={s.time} x={170} y={470} s={0.9} />
      <div style={{ position: "absolute", left: 160, right: 160, top: 165, opacity: headIn }}>
        <HandText text={fitText(b.headline || "", 46)} size={104} color="#f8f5ec" glow="rgba(0,0,0,0.55)" rotate={-1.2} />
      </div>
    </SceneShell>
  );
};

const ChapterScene: React.FC<{ b: V2Beat }> = ({ b }) => {
  ensureToonFonts();
  const s = sceneForBeat(b);
  const tIn = useMotion(6);
  const f = useCurrentFrame();
  return (
    <SceneShell beatIndex={b.i}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.55 }}>
        {s.location === "datacenter" ? <DataCenter mood={s.mood} seed={b.i + 1} /> : s.location === "office" ? <Office mood={s.mood} seed={b.i + 1} /> : s.location === "stage" ? <Stage mood={s.mood} seed={b.i + 1} /> : <TradingFloor mood={s.mood} seed={b.i + 1} />}
      </div>
      <AbsoluteFill style={{ background: "rgba(12,10,14,0.45)" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: tIn }}>
        <HandText text={String(b.n || 1).padStart(2, "0")} size={190} color={paletteFor(s.mood).accent} glow={paletteFor(s.mood).accent} />
        <HandText text={fitText(b.chapterTitle || "", 40)} size={88} color="#f8f5ec" glow="rgba(0,0,0,0.5)" />
      </div>
      <div style={{ position: "absolute", bottom: 40, left: 0, right: 0, textAlign: "center", opacity: interpolate(f, [12, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        <HandText text={s.day || ""} size={34} color="#d8d4c8" />
      </div>
    </SceneShell>
  );
};

const SplitScene: React.FC<{ b: V2Beat }> = ({ b }) => {
  ensureToonFonts();
  const s = sceneForBeat(b);
  const tIn = useMotion(10);
  const side = (b.photoSide || (b.i % 2 === 0 ? "left" : "right")) as "left" | "right";
  const set = s.location === "office" ? <Office mood={s.mood} seed={b.i + 1} /> : s.location === "datacenter" ? <DataCenter mood={s.mood} seed={b.i + 1} /> : s.location === "stage" ? <Stage mood={s.mood} seed={b.i + 1} solo side={side} /> : <TradingFloor mood={s.mood} seed={b.i + 1} />;
  return (
    <SceneShell beatIndex={b.i}>
      {set}
      {s.day && <Chip text={s.day} bg={paletteFor(s.mood).chip} color={paletteFor(s.mood).chipText} x={side === "left" ? 1140 : 60} y={640} />}
      <div
        style={{
          position: "absolute", top: 170, [side === "left" ? "right" : "left"]: 110, width: 620,
          background: "#f4f1e8", borderRadius: 18, border: `5px solid #1f1d1a`, padding: "44px 48px",
          transform: `rotate(${side === "left" ? 1 : -1}deg)`, opacity: tIn, boxShadow: "0 22px 60px rgba(0,0,0,0.4)",
        }}
      >
        <HandText text={fitText(b.headline || b.text || "", 56)} size={64} color="#2a2620" rotate={0} style={{ textAlign: "left" }} />
        {b.sub ? <HandText text={fitText(b.sub, 90)} size={44} color="#6b6353" weight={600} rotate={0} style={{ textAlign: "left", marginTop: 22 }} /> : null}
      </div>
    </SceneShell>
  );
};

const StatScene: React.FC<{ b: V2Beat }> = ({ b }) => {
  ensureToonFonts();
  const s = sceneForBeat(b);
  return (
    <SceneShell beatIndex={b.i}>
      <TradingFloor mood={s.mood} seed={b.i + 1} showBoard boardTitle={(b.headline || "THE MARKET").toUpperCase().slice(0, 24)} boardBig={b.big || "-1%"} />
      {s.day && <Chip text={s.day} bg={paletteFor(s.mood).chip} color={paletteFor(s.mood).chipText} x={60} y={620} />}
      <ClockBadge time={s.time} x={170} y={430} s={0.9} />
      {b.label ? (
        <div style={{ position: "absolute", left: 260, right: 260, bottom: 300, textAlign: "center" }}>
          <HandText text={fitText(b.label, 80)} size={48} color="#f8f5ec" glow="rgba(0,0,0,0.6)" />
        </div>
      ) : null}
    </SceneShell>
  );
};

const QuoteScene: React.FC<{ b: V2Beat }> = ({ b }) => {
  ensureToonFonts();
  const s = sceneForBeat(b);
  const qIn = useMotion(8);
  const who = s.mood === "crash" ? "shocked" : s.mood === "party" ? "happy" : "calm";
  return (
    <SceneShell beatIndex={b.i}>
      <Stage mood={s.mood} seed={b.i + 1} quoteMood={who as ToonMood} />
      <div style={{ position: "absolute", left: 300, right: 300, top: 140, opacity: qIn }}>
        <div style={{ background: "#f8f5ec", borderRadius: 26, border: `6px solid #1f1d1a`, padding: "44px 60px", transform: "rotate(-1deg)", boxShadow: "0 24px 70px rgba(0,0,0,0.35)", position: "relative" }}>
          <div style={{ position: "absolute", left: 90, top: -34, width: 64, height: 64, background: "#f8f5ec", border: `6px solid #1f1d1a`, borderRadius: "50% 50% 50% 0", transform: "rotate(45deg)" }} />
          <HandText text={`“${fitText(b.headline || b.text || "", 110)}”`} size={68} color="#2a2620" rotate={0} />
          {b.label ? <HandText text={`— ${b.label}`} size={42} color="#6b6353" weight={600} rotate={0} style={{ marginTop: 18, textAlign: "right" }} /> : null}
        </div>
      </div>
    </SceneShell>
  );
};

const ProcessScene: React.FC<{ b: V2Beat }> = ({ b }) => {
  ensureToonFonts();
  const s = sceneForBeat(b);
  const steps = (b.lines && b.lines.length ? b.lines : [b.headline || ""]).slice(0, 4);
  const tIn = useMotion(10);
  return (
    <SceneShell beatIndex={b.i}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.9 }}>
        {s.location === "datacenter" ? <DataCenter mood={s.mood} seed={b.i + 1} /> : <Office mood={s.mood} seed={b.i + 1} />}
      </div>
      <div style={{ position: "absolute", left: 150, top: 150, opacity: tIn }}>
        {b.kicker ? <HandText text={b.kicker.toUpperCase()} size={40} color={paletteFor(s.mood).accent} rotate={0} style={{ textAlign: "left", letterSpacing: "0.04em" }} /> : null}
        <HandText text={fitText(b.headline || "", 40)} size={70} color="#f8f5ec" glow="rgba(0,0,0,0.55)" rotate={0} style={{ textAlign: "left", marginTop: 10 }} />
      </div>
      <div style={{ position: "absolute", left: 150, right: 640, top: 400, display: "flex", flexDirection: "column", gap: 34 }}>
        {steps.map((st, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 26, opacity: tIn, transform: `translateX(${(1 - tIn) * -30}px)` }}>
            <div style={{ minWidth: 66, height: 66, borderRadius: 14, background: paletteFor(s.mood).chip, border: `5px solid #1f1d1a`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Caveat','Patrick Hand',cursive", fontWeight: 700, fontSize: 42, color: "#ffffff", transform: `rotate(${i % 2 === 0 ? -3 : 3}deg)` }}>
              {i + 1}
            </div>
            <HandText text={st} size={50} color="#f8f5ec" glow="rgba(0,0,0,0.6)" rotate={0} style={{ textAlign: "left" }} />
          </div>
        ))}
      </div>
    </SceneShell>
  );
};

const TimelineScene: React.FC<{ b: V2Beat }> = ({ b }) => {
  ensureToonFonts();
  const s = sceneForBeat(b);
  const ticks = (b.ticks || []).map((t) => (typeof t === "string" ? t : t.label || t.year || "")).filter(Boolean);
  const rail = ticks.length ? ticks : (b.steps || []).slice(0, 5);
  const headIn = useMotion(8);
  return (
    <SceneShell beatIndex={b.i}>
      <TradingFloor mood={s.mood} seed={b.i + 1} />
      <ClockBadge time={s.time} x={960} y={415} s={1.55} />
      {s.day && <Chip text={s.day} bg={paletteFor(s.mood).chip} color={paletteFor(s.mood).chipText} x={60} y={140} />}
      <div style={{ position: "absolute", left: 160, right: 160, top: 170, opacity: headIn }}>
        <HandText text={fitText(b.headline || "", 44)} size={84} color="#f8f5ec" glow="rgba(0,0,0,0.6)" />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 190, display: "flex", justifyContent: "center", gap: 26, flexWrap: "wrap" }}>
        {rail.slice(0, 5).map((t, i) => {
          const last = i === Math.min(rail.length, 5) - 1; // red emphasis on the LAST RENDERED tick, not rail[-1] beyond the slice
          return (
            <div key={i} style={{ background: "#f4f1e8", border: `4px solid #1f1d1a`, borderRadius: 10, padding: "4px 20px", transform: `rotate(${i % 2 === 0 ? -2 : 2}deg)`, opacity: headIn }}>
              <HandText text={t} size={40} color={last ? "#c9362c" : "#2a2620"} rotate={0} />
            </div>
          );
        })}
      </div>
    </SceneShell>
  );
};

const EndScene: React.FC<{ b: V2Beat }> = ({ b }) => {
  ensureToonFonts();
  const s = sceneForBeat(b);
  const tIn = useMotion(6);
  return (
    <SceneShell beatIndex={b.i}>
      <TradingFloor mood={s.mood === "crash" ? "calm" : s.mood} seed={b.i + 1} />
      <AbsoluteFill style={{ background: "rgba(12,10,14,0.4)" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26, opacity: tIn, paddingBottom: 260 }}>
        <HandText text={fitText(b.headline || b.text || "FOLLOW FOR MORE", 30).toUpperCase()} size={110} color="#f8f5ec" glow="rgba(0,0,0,0.55)" />
      </div>
      {/* the waver needs its own svg — a bare <g> inside a div renders nothing */}
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid slice">
        <Character x={1740} y={620} s={1.35} slot={b.i % 5} mood="happy" pose="wave" />
      </svg>
    </SceneShell>
  );
};

export const marketFiles: Family = {
  name: "market-files",
  scenes: {
    hero: HeroScene,
    chapter: ChapterScene,
    split: SplitScene,
    stat: StatScene,
    quote: QuoteScene,
    process: ProcessScene,
    timeline: TimelineScene,
    end: EndScene,
  },
};
