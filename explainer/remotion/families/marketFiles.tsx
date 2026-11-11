import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fitText, useMotion, type V2Beat } from "../longscenes2";
import { sceneForBeat } from "../../../lib/market-scenes.mjs";
import type { Family } from "./types";
import {
  BigBoard, Chip, ClockBadge, Confetti, Desk, HandText, INK, Monitor, Room, ScatterPaper,
  SceneShell, StickyNote, TickerWall, Character, ensureToonFonts, paletteFor, type ToonMood,
  useToonArt, PeepSprite, Prop3D, propsForMood, LottieAccent, SceneImage, type ToonArt, type PeepEntry,
} from "./cartoonKit";

// F9 MARKET FILES — the Paper Billions grammar as a family (P1 spec + P1.5
// library art pass, docs/qa/market-files-p1.5-qa.md): flat cartoon rooms with
// a REAL hand-drawn cast (Open Peeps, CC0) sitting at desks and posing under
// spotlights, glossy 3D props (3dicons, CC0) floating by mood, handwritten
// labels, day chips, clock badges, fictional ticker walls, glowing % boards.
// Fail-soft doctrine: when the fetched art is missing (fresh clone without
// scripts/market-art.mjs) every scene falls back to the P1 parametric rig —
// a render never dies on art. Scenes derive from the beat (same beat → same
// scene), every text is DOM text. Layouts NOT covered here (map/terminal/
// versus) fall through to the engine (R2).

// scene mood → character face mood — the FALLBACK rig still reacts to the day
const faceMood = (mood: string, slot: number): ToonMood => {
  if (mood === "crash") return slot % 3 === 0 ? "shocked" : "worried";
  if (mood === "party") return "happy";
  if (mood === "night") return slot % 2 === 0 ? "sad" : "worried";
  if (mood === "data") return slot % 2 === 0 ? "calm" : "worried";
  return slot % 3 === 0 ? "happy" : "calm";
};

// ---- the four built sets -------------------------------------------------------

const TradingFloor: React.FC<{ mood: string; seed: number; art: ToonArt; showBoard?: boolean; boardTitle?: string; boardBig?: string; seats?: "all" | "right" | "left" | "none" }> = ({ mood, seed, art, showBoard, boardTitle, boardBig, seats: seatsMode = "all" }) => {
  // the cast sits BEHIND the desks (peep HTML layer first, furniture svg in
  // front covers the bottoms). With the board shown, desks spread to the
  // edges so nobody hides behind it. `seats` trims one side when a card or
  // headline owns the other (frame-review fix: heads never sit under text).
  const spread = Boolean(showBoard);
  const deskY = 620;
  const seatH = 380; // heads stay below the headline zone (review fix)
  const seatXs = spread ? [330, 545, 1375, 1590] : [430, 640, 1310, 1520];
  const seatScales = spread ? [0.95, 0.88, 0.88, 0.95] : [1.02, 0.92, 0.92, 1.02];
  const seedOffsets = [0, 2, 4, 1];
  const visible = [0, 1, 2, 3].filter((i) => {
    const leftSide = seatXs[i] < 960;
    return seatsMode === "all" || (seatsMode === "right" && !leftSide) || (seatsMode === "left" && leftSide);
  });
  const backSeats = spread
    ? [[330, 0.95], [545, 0.88], [1375, 0.88], [1590, 0.95]]
    : [[430, 1.02], [640, 0.92], [1310, 0.92], [1520, 1.02]];
  return (
    <Room mood={mood}>
      {art.ok &&
        visible.map((i) => (
          <PeepSprite key={i} art={art} seed={seed + seedOffsets[i]} pose="sitting" x={seatXs[i]} groundY={deskY + 30} h={seatH * seatScales[i]} delay={i * 2} bobAmp={2} />
        ))}
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid slice">
        {/* wall panel seams */}
        {[380, 760, 1140, 1520].map((px) => (
          <line key={px} x1={px} y1={150} x2={px} y2={820} stroke="rgba(0,0,0,0.18)" strokeWidth={3} />
        ))}
        {/* fallback: the P1 rig keeps the floor populated when art is missing */}
        {!art.ok &&
          visible.map((i) => <Character key={i} x={backSeats[i][0]} y={deskY - 196 * backSeats[i][1] + 14} s={backSeats[i][1]} slot={(seed + seedOffsets[i]) % 5} back />)}
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

const Office: React.FC<{ mood: string; seed: number; art: ToonArt }> = ({ mood, seed, art }) => {
  const notes = ["SAFE", "BORING", "SET IT & FORGET IT", "BUY MORE", "HOLD"];
  const noteSlots = [0, 1, 2].map((k) => notes[(seed + k * 2) % notes.length]);
  const props = propsForMood(mood);
  return (
    <Room mood={mood}>
      {art.ok && <PeepSprite art={art} seed={seed + 3} pose="sitting" x={800} groundY={718} h={500} bobAmp={2} />}
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid slice">
        {/* mint wall panels */}
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x={i * 240} y={0} width={240} height={880} fill={i % 2 === 0 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
        ))}
        {/* the cork board (the notes themselves are the HTML StickyNotes above) */}
        <rect x={1150} y={190} width={560} height={380} rx={14} fill="#8a6b4f" stroke={INK} strokeWidth={8} />
        {/* fallback worker (chars first, desk covers the legs) */}
        {!art.ok && <Character x={800} y={700 - 211 * 1.3 + 12} s={1.3} slot={(seed + 3) % 5} mood={faceMood(mood, seed)} pose={mood === "party" ? "raised" : "down"} />}
        <Desk x={560} y={700} w={520} s={1.2} />
        <Monitor x={560} y={628} trend="up" s={1.4} />
        {/* plant */}
        <g transform="translate(1780 800)">
          <path d="M -34 0 q -6 -90 34 -130 q 6 60 -4 130 Z" fill="#5b7a45" stroke={INK} strokeWidth={5} />
          <path d="M 4 0 q 44 -70 20 -140 q -34 44 -44 140 Z" fill="#6d8f55" stroke={INK} strokeWidth={5} />
          <path d="M -60 0 h 120 l -14 74 h -92 Z" fill="#b0653f" stroke={INK} strokeWidth={6} />
        </g>
      </svg>
      {art.ok && <Prop3D icon={props[seed % props.length]} x={655} y={648} s={112} delay={10} tilt={5} />}
      {noteSlots.map((t, i) => (
        <StickyNote key={i} text={t} x={1215 + (i % 2) * 285} y={235 + Math.floor(i / 2) * 150} r={i % 2 === 0 ? -4 : 3} bg={["#f7e359", "#f2b3a0", "#bfe3b0"][i % 3]} />
      ))}
    </Room>
  );
};

const DataCenter: React.FC<{ mood: string; seed: number; art: ToonArt; noPeep?: boolean }> = ({ mood, seed, art, noPeep = false }) => (
  // the room follows the mood like every other set (R5); only the machine
  // racks stay fixed navy — they're the hardware. `noPeep` clears the aisle
  // walker when the calling scene brings its own presenter (review fix).
  <Room mood={mood}>
    {art.ok && !noPeep && <PeepSprite art={art} seed={seed + 1} pose="standing" x={1060} groundY={872} h={560} delay={4} />}
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
      {!art.ok && <Character x={1240} y={655} s={0.85} slot={(seed + 1) % 5} back />}
    </svg>
    {art.ok && (
      <>
        <Prop3D icon="money-bag" x={820} y={742} s={150} delay={10} tilt={3} />
        <Prop3D icon="3d-coin" x={965} y={790} s={120} delay={16} tilt={-6} />
      </>
    )}
  </Room>
);

const Stage: React.FC<{ mood: string; seed: number; art: ToonArt; quoteMood?: ToonMood; solo?: boolean; side?: "left" | "right"; bust?: boolean }> = ({ mood, seed, art, quoteMood, solo, side = "left", bust = false }) => (
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
    </svg>
    {bust && art.ok ? null : art.ok ? (
      solo ? (
        <PeepSprite art={art} seed={seed} pose="standing" x={side === "left" ? 560 : 1360} groundY={1008} h={680} bobAmp={4} />
      ) : (
        <g>
          <PeepSprite art={art} seed={seed} pose="standing" x={560} groundY={1008} h={680} bobAmp={4} />
          <PeepSprite art={art} seed={seed + 2} pose="standing" x={1360} groundY={1008} h={680} flip bobAmp={4} delay={3} />
        </g>
      )
    ) : solo ? (
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid slice">
        <Character x={side === "left" ? 560 : 1360} y={685} s={1.5} slot={seed % 5} mood={quoteMood || "calm"} pose="down" />
      </svg>
    ) : (
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid slice">
        <Character x={560} y={685} s={1.5} slot={seed % 5} mood={quoteMood || "calm"} pose="down" />
        <Character x={1360} y={685} s={1.5} slot={(seed + 2) % 5} mood="worried" pose={quoteMood === "shocked" ? "raised" : "down"} flip />
      </svg>
    )}
  </AbsoluteFill>
);

// ---- the eight layout scenes ----------------------------------------------------

const HeroScene: React.FC<{ b: V2Beat }> = ({ b }) => {
  ensureToonFonts();
  const s = sceneForBeat(b);
  const art = useToonArt();
  const headIn = useMotion(8);
  const hasScenes = art.ok && art.scenes.length > 0;
  return (
    <SceneShell beatIndex={b.i}>
      {hasScenes ? (
        <Room mood={s.mood}>
          <SceneImage art={art} mood={s.mood} beatIndex={b.i} height={720} dim={0.12} />
        </Room>
      ) : s.location === "office" ? <Office mood={s.mood} seed={b.i + 1} art={art} /> : <TradingFloor mood={s.mood} seed={b.i + 1} art={art} seats="right" />}
      {s.day && <Chip text={s.day} bg={paletteFor(s.mood).chip} color={paletteFor(s.mood).chipText} x={60} y={620} />}
      <ClockBadge time={s.time} x={170} y={470} s={0.9} />
      <div style={{ position: "absolute", left: 160, right: 160, top: 165, opacity: headIn }}>
        <HandText text={fitText(b.headline || "", 46)} size={104} color="#f8f5ec" glow="rgba(0,0,0,0.55)" rotate={-1.2} />
      </div>
      {!hasScenes && art.ok && (
        <>
          <PeepSprite art={art} seed={b.i + 7} pose="standing" x={430} groundY={935} h={600} delay={5} bobAmp={4} />
          <Prop3D icon={propsForMood(s.mood)[b.i % propsForMood(s.mood).length]} x={175} y={805} s={150} delay={16} drift={s.mood === "crash" ? "down" : s.mood === "party" ? "up" : "flat"} tilt={5} />
        </>
      )}
    </SceneShell>
  );
};

const ChapterScene: React.FC<{ b: V2Beat }> = ({ b }) => {
  ensureToonFonts();
  const s = sceneForBeat(b);
  const art = useToonArt();
  const tIn = useMotion(6);
  const f = useCurrentFrame();
  const hasScenes = art.ok && art.scenes.length > 0;
  return (
    <SceneShell beatIndex={b.i}>
      {hasScenes ? (
        <Room mood={s.mood}>
          <SceneImage art={art} mood={s.mood} beatIndex={b.i} height={740} dim={0.34} />
        </Room>
      ) : (
        <div style={{ position: "absolute", inset: 0, opacity: 0.55 }}>
          {s.location === "datacenter" ? <DataCenter mood={s.mood} seed={b.i + 1} art={art} /> : s.location === "office" ? <Office mood={s.mood} seed={b.i + 1} art={art} /> : s.location === "stage" ? <Stage mood={s.mood} seed={b.i + 1} art={art} /> : <TradingFloor mood={s.mood} seed={b.i + 1} art={art} />}
        </div>
      )}
      {!hasScenes && <AbsoluteFill style={{ background: "rgba(12,10,14,0.45)" }} />}
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
  const art = useToonArt();
  const tIn = useMotion(10);
  const side = (b.photoSide || (b.i % 2 === 0 ? "left" : "right")) as "left" | "right";
  const hasScenes = art.ok && art.scenes.length > 0;
  const set = hasScenes ? (
    <Room mood={s.mood}>
      <SceneImage art={art} mood={s.mood} beatIndex={b.i} height={700} dim={0.08} />
    </Room>
  ) : s.location === "office" ? <Office mood={s.mood} seed={b.i + 1} art={art} /> : s.location === "datacenter" ? <DataCenter mood={s.mood} seed={b.i + 1} art={art} /> : s.location === "stage" ? <Stage mood={s.mood} seed={b.i + 1} art={art} solo side={side} /> : <TradingFloor mood={s.mood} seed={b.i + 1} art={art} seats={side === "left" ? "right" : "left"} />;
  const props = propsForMood(s.mood);
  return (
    <SceneShell beatIndex={b.i}>
      {set}
      {!hasScenes && art.ok && s.location !== "stage" && (
        <>
          <PeepSprite art={art} seed={b.i + 5} pose="sitting" x={side === "left" ? 1580 : 340} groundY={920} h={480} delay={6} bobAmp={2} />
          <Prop3D icon={props[(b.i + 2) % props.length]} x={side === "left" ? 1830 : 95} y={500} s={130} delay={14} tilt={6} />
        </>
      )}
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
  const art = useToonArt();
  const props = propsForMood(s.mood);
  const drift = s.mood === "crash" ? "down" : s.mood === "party" ? "up" : "flat";
  const hasScenes = art.ok && art.scenes.length > 0;
  return (
    <SceneShell beatIndex={b.i}>
      {hasScenes ? (
        <Room mood={s.mood}>
          <div style={{ position: "absolute", inset: 0, left: "24%" }}>
            <SceneImage art={art} mood={s.mood} beatIndex={b.i} height={660} dim={0.12} />
          </div>
          <BigBoard title={(b.headline || "THE MARKET").toUpperCase().slice(0, 24)} big={b.big || "-1%"} mood={s.mood} x={150} y={330} w={600} />
        </Room>
      ) : (
        <TradingFloor mood={s.mood} seed={b.i + 1} art={art} showBoard seats="none" boardTitle={(b.headline || "THE MARKET").toUpperCase().slice(0, 24)} boardBig={b.big || "-1%"} />
      )}
      {s.day && <Chip text={s.day} bg={paletteFor(s.mood).chip} color={paletteFor(s.mood).chipText} x={60} y={620} />}
      <ClockBadge time={s.time} x={170} y={430} s={0.9} />
      {art.ok && (
        <>
          <Prop3D icon={props[b.i % props.length]} x={300} y={660} s={200} delay={6} drift={drift} tilt={6} />
          <Prop3D icon={props[(b.i + 1) % props.length]} x={1620} y={660} s={200} delay={12} drift={drift} tilt={-6} />
          {/* the live pulse ring on the board's corner — Route C accent */}
          {hasScenes ? <LottieAccent name="pulse" x={700} y={270} s={130} opacity={0.9} /> : <LottieAccent name="pulse" x={1215} y={168} s={130} opacity={0.9} />}
          {!hasScenes && <PeepSprite art={art} seed={b.i + 11} pose="bust" x={285} groundY={1030} h={340} delay={9} bobAmp={2} />}
        </>
      )}
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
  const art = useToonArt();
  const qIn = useMotion(8);
  const who = s.mood === "crash" ? "shocked" : s.mood === "party" ? "happy" : "calm";
  const hasScenes = art.ok && art.scenes.length > 0;
  return (
    <SceneShell beatIndex={b.i}>
      {hasScenes ? (
        <Room mood={s.mood}>
          <SceneImage art={art} mood={s.mood} beatIndex={b.i} height={700} dim={0.22} />
        </Room>
      ) : (
        <Stage mood={s.mood} seed={b.i + 1} art={art} quoteMood={who as ToonMood} solo side="left" bust={art.ok} />
      )}
      {!hasScenes && art.ok && <PeepSprite art={art} seed={b.i + 13} pose="bust" x={520} groundY={1035} h={620} delay={4} bobAmp={3} />}
      <div style={{ position: "absolute", left: 560, right: 180, top: 140, opacity: qIn }}>
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
  const art = useToonArt();
  const steps = (b.lines && b.lines.length ? b.lines : [b.headline || ""]).slice(0, 4);
  const tIn = useMotion(10);
  const hasScenes = art.ok && art.scenes.length > 0;
  return (
    <SceneShell beatIndex={b.i}>
      {hasScenes ? (
        <Room mood={s.mood}>
          <SceneImage art={art} mood={s.mood} beatIndex={b.i} height={700} dim={0.3} />
        </Room>
      ) : (
        <div style={{ position: "absolute", inset: 0, opacity: 0.9 }}>
          {s.location === "datacenter" ? <DataCenter mood={s.mood} seed={b.i + 1} art={art} noPeep /> : <Office mood={s.mood} seed={b.i + 1} art={art} />}
        </div>
      )}
      {!hasScenes && art.ok && <PeepSprite art={art} seed={b.i + 17} pose="standing" x={1650} groundY={940} h={580} delay={4} bobAmp={4} />}
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
  const art = useToonArt();
  const ticks = (b.ticks || []).map((t) => (typeof t === "string" ? t : t.label || t.year || "")).filter(Boolean);
  const rail = ticks.length ? ticks : (b.steps || []).slice(0, 5);
  const headIn = useMotion(8);
  const props = propsForMood(s.mood);
  const hasScenes = art.ok && art.scenes.length > 0;
  return (
    <SceneShell beatIndex={b.i}>
      {hasScenes ? (
        <Room mood={s.mood}>
          <SceneImage art={art} mood={s.mood} beatIndex={b.i} height={720} dim={0.3} />
        </Room>
      ) : (
        <TradingFloor mood={s.mood} seed={b.i + 1} art={art} seats="right" />
      )}
      <ClockBadge time={s.time} x={960} y={415} s={1.55} />
      {s.day && <Chip text={s.day} bg={paletteFor(s.mood).chip} color={paletteFor(s.mood).chipText} x={60} y={140} />}
      {art.ok && (
        <>
          <Prop3D icon={props[b.i % props.length]} x={150} y={590} s={120} delay={10} tilt={5} />
          <Prop3D icon={props[(b.i + 1) % props.length]} x={1770} y={590} s={120} delay={16} tilt={-5} />
        </>
      )}
      <div style={{ position: "absolute", left: 160, right: 160, top: 170, opacity: headIn }}>
        <HandText text={fitText(b.headline || "", 44)} size={84} color="#f8f5ec" glow="rgba(0,0,0,0.6)" />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 260, display: "flex", justifyContent: "center", gap: 26, flexWrap: "wrap" }}>
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
  const art = useToonArt();
  const tIn = useMotion(6);
  const cheerful = s.mood !== "crash";
  const hasScenes = art.ok && art.scenes.length > 0;
  return (
    <SceneShell beatIndex={b.i}>
      {hasScenes ? (
        <Room mood={cheerful ? s.mood : "calm"}>
          <SceneImage art={art} mood={cheerful ? s.mood : "calm"} beatIndex={b.i} height={720} dim={0.4} />
        </Room>
      ) : (
        <TradingFloor mood={cheerful ? s.mood : "calm"} seed={b.i + 1} art={art} />
      )}
      {!hasScenes && <AbsoluteFill style={{ background: "rgba(12,10,14,0.4)" }} />}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26, opacity: tIn, paddingBottom: 260 }}>
        <HandText text={fitText(b.headline || b.text || "FOLLOW FOR MORE", 30).toUpperCase()} size={110} color="#f8f5ec" glow="rgba(0,0,0,0.55)" />
      </div>
      {!hasScenes && art.ok ? (
        <>
          <PeepSprite art={art} seed={b.i % 13} pose="standing" x={1660} groundY={940} h={560} bobAmp={5} />
          {cheerful && (
            <>
              <Prop3D icon="trophy" x={1370} y={720} s={190} delay={8} drift="up" tilt={5} />
              <Prop3D icon="star" x={1830} y={640} s={150} delay={14} drift="up" tilt={-5} />
            </>
          )}
        </>
      ) : (
        /* the fallback waver needs its own svg — a bare <g> inside a div renders nothing */
        <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid slice">
          <Character x={1740} y={620} s={1.35} slot={b.i % 5} mood="happy" pose="wave" />
        </svg>
      )}
    </SceneShell>
  );
};

// ---- the market caption band (owner fix 2026-11-11: the engine's theme
// captions render spoken words in the theme's DARK capColor — invisible on
// our dark cartoon rooms). This band keeps the engine's karaoke window
// (4 words, one line) but every word is WHITE with a heavy outline + shadow,
// so it reads on ANY mood backdrop; the active word pops on the mood accent.
const CapWindow = 4;
const MarketCaptions: React.FC<{ b: V2Beat }> = ({ b }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (f / fps) * 1000;
  const words = b.words || [];
  if (!words.length) return null;
  const idx = words.findIndex((w) => ms >= w.t0 - 40 && ms < w.t1 + 150);
  if (idx < 0) return null;
  const winStart = Math.max(0, Math.min(idx - 1, words.length - CapWindow));
  const win = words.slice(winStart, Math.min(winStart + CapWindow, words.length));
  const pop = spring({ frame: f - (words[idx].t0 / 1000) * fps, fps, config: { damping: 12, stiffness: 200 } });
  const accent = paletteFor(String(b.scene?.mood || "calm")).accent;
  const outline = "0 4px 18px rgba(0,0,0,0.85), 0 1px 4px rgba(0,0,0,0.9), -2px 0 0 rgba(0,0,0,0.55), 2px 0 0 rgba(0,0,0,0.55), 0 -2px 0 rgba(0,0,0,0.55), 0 2px 0 rgba(0,0,0,0.55)";
  return (
    <div style={{ position: "absolute", bottom: 170, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ display: "flex", gap: 18, justifyContent: "center", alignItems: "baseline", whiteSpace: "nowrap" }}>
        {win.map((w, i) => {
          const gi = winStart + i;
          const active = gi === idx;
          return (
            <span key={i} style={{
              fontFamily: "'Inter','Segoe UI',sans-serif", fontWeight: 900, fontSize: 58, lineHeight: 1.1,
              color: active ? "#FFFFFF" : gi < idx ? "#FFFFFF" : "rgba(255,255,255,0.62)",
              background: active ? accent : "transparent",
              borderRadius: active ? 14 : 0,
              padding: active ? "4px 20px" : 0,
              transform: `scale(${active ? 1 + 0.06 * Math.max(pop, 0) : 1})`,
              transformOrigin: "center bottom", display: "inline-block",
              textShadow: active ? "0 3px 16px rgba(0,0,0,0.5)" : outline,
            }}>{w.w}</span>
          );
        })}
      </div>
    </div>
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
  captions: MarketCaptions,
};

// PeepEntry re-exported for tests that assert the art contract
export type { PeepEntry };
