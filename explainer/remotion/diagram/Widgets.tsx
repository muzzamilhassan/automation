import React from "react";
import { getPointAtLength } from "@remotion/paths";

// COURSE teaching widgets (docs/qa/course-template-c1-qa.md W1/W2/W4) — pure
// functions of (spec, applied cues, ms), seek-safe like everything else in the
// diagram renderer. The plan NEVER carries pixel positions; slot rects live here.
// W2 verbs feed `applied` (each cue with its time); a widget with no `show` cue
// appears at the scene start (W4).

export type WRect = { x: number; y: number; w: number; h: number };
export const SLOTS: Record<string, WRect> = {
  top: { x: 230, y: 170, w: 1460, h: 240 },
  center: { x: 460, y: 430, w: 1000, h: 420 },
  left: { x: 110, y: 420, w: 680, h: 450 },
  right: { x: 1130, y: 420, w: 680, h: 450 },
  bottom: { x: 230, y: 890, w: 1460, h: 150 },
  full: { x: 120, y: 160, w: 1680, h: 790 },
};

export type Applied = { t: number; do: string; index?: number; value?: string; tone?: string; step?: number; text?: string; ok?: boolean; line?: number; series?: number; to?: number };

// cues for ONE widget, resolved (t in ms), up to ms, in time order
export function applyWidgetCues(cues: any[], widgetId: string, ms: number): { appear: number; applied: Applied[] } {
  const mine = cues.filter((c) => c.widget === widgetId && c.t <= ms).sort((a, b) => a.t - b.t);
  const show = cues.find((c) => c.widget === widgetId && c.do === "show");
  return { appear: show ? show.t : -Infinity, applied: mine };
}

const rgba = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const MONO = "JetBrains Mono, monospace";
const SANS = "Inter, sans-serif";
const INK = "#1A2028";
const GOOD = "#1FA463";
const BAD = "#D64545";

const panel = (r: WRect, accent: string): React.CSSProperties => ({
  position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h,
  background: "#FFFFFF", border: `1.5px solid ${rgba(INK, 0.14)}`, borderRadius: 18,
  boxShadow: `0 10px 30px ${rgba(INK, 0.07)}`,
});
// panels INSIDE a slot rect: fill the slot, no absolute positioning
const innerPanel = (): React.CSSProperties => ({
  background: "#FFFFFF", border: `1.5px solid ${rgba(INK, 0.14)}`, borderRadius: 18,
  boxShadow: `0 10px 30px ${rgba(INK, 0.07)}`, width: "100%", height: "100%", boxSizing: "border-box",
});
const cap = (t: string, colour = rgba(INK, 0.55)): React.CSSProperties => ({
  fontFamily: SANS, fontWeight: 800, fontSize: 17, letterSpacing: 2.5, textTransform: "uppercase", color: colour, marginBottom: 10,
});
const last = <T,>(arr: T[]): T | undefined => arr[arr.length - 1];

const Boxes: React.FC<{ spec: any; ap: Applied[]; accent: string; pop: (t: number) => number }> = ({ spec, ap, accent, pop }) => {
  const cells: string[] = spec.cells || [];
  const labels: string[] = spec.labels || [];
  const fills = new Map<number, { v: string; tone?: string; t: number }>();
  let mark = -1;
  ap.forEach((c) => {
    if (c.do === "fill") fills.set(c.index as number, { v: c.value || "", tone: c.tone, t: c.t });
    if (c.do === "mark") mark = c.index as number;
  });
  return (
    <div>
      <div style={{ ...cap(), display: "flex", gap: 24, alignItems: "baseline" }}>
        <span>{spec.label || "Cells"}</span>
        {mark >= 0 && <span style={{ color: accent, fontSize: 15 }}>checking #{labels[mark] ?? mark}</span>}
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        {cells.map((c, i) => {
          const f = fills.get(i);
          const isMark = i === mark;
          const p = f ? pop(f.t) : 0;
          return (
            <div key={i} style={{
              width: 150, height: 96, borderRadius: 14, position: "relative",
              border: `${isMark ? 3 : 2}px solid ${isMark ? accent : rgba(INK, 0.22)}`,
              background: isMark ? rgba(accent, 0.07) : "#FFFFFF",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: MONO, fontWeight: 700, fontSize: 27,
              color: f?.tone === "bad" ? BAD : f?.tone === "good" ? GOOD : INK,
              transform: `scale(${1 + 0.05 * p})`, transition: "none",
            }}>
              {f ? <span style={{ opacity: p }}>{f.v}</span> : <span style={{ color: rgba(INK, 0.15) }}>·</span>}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
        {labels.map((l, i) => (
          <div key={i} style={{ width: 150, textAlign: "center", fontFamily: MONO, fontSize: 18, color: rgba(INK, 0.55) }}>{l}</div>
        ))}
      </div>
    </div>
  );
};

const Stepper: React.FC<{ spec: any; ap: Applied[]; accent: string; pop: (t: number) => number }> = ({ spec, ap, accent, pop }) => {
  const steps = ap.filter((c) => c.do === "step");
  const cur = last(steps);
  const p = cur ? pop(cur.t) : 0;
  return (
    <div style={{ ...innerPanel(), padding: "30px 36px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 18 }}>
      <div style={cap(spec.label ? undefined : rgba(INK, 0))}>{spec.label || "Checking"}</div>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 84, color: INK, transform: `scale(${1 + 0.06 * p})`, transformOrigin: "left center" }}>
        {cur ? (cur.step !== undefined ? cur.step : (spec.value ?? 0)) : (spec.value ?? 0)}
        <span style={{ fontSize: 30, color: rgba(INK, 0.5), marginLeft: 14 }}>{spec.unit || ""}</span>
      </div>
      {cur?.text && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, opacity: p }}>
          <span style={{ fontFamily: MONO, fontSize: 30, color: INK, background: rgba(INK, 0.06), padding: "8px 18px", borderRadius: 10 }}>{cur.text}</span>
          {cur.ok !== undefined && (
            <span style={{
              width: 44, height: 44, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center",
              background: cur.ok ? GOOD : BAD, color: "#fff", fontSize: 26, fontWeight: 900,
            }}>{cur.ok ? "✓" : "✗"}</span>
          )}
        </div>
      )}
    </div>
  );
};

const Code: React.FC<{ spec: any; ap: Applied[]; accent: string; pop: (t: number) => number }> = ({ spec, ap, accent, pop }) => {
  const marks = ap.filter((c) => c.do === "line");
  const cur = last(marks);
  const lines: string[] = spec.lines || [];
  return (
    <div style={{ ...innerPanel(), overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: `1px solid ${rgba(INK, 0.1)}` }}>
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
        <span style={{ marginLeft: 10, fontFamily: MONO, fontSize: 19, color: rgba(INK, 0.65) }}>{spec.title || "main.py"}</span>
      </div>
      <div style={{ padding: "18px 0", fontFamily: MONO, fontSize: 24, lineHeight: "40px" }}>
        {lines.map((l, i) => {
          const hot = cur && cur.line === i + 1;
          const p = hot ? pop(cur.t) : 0;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 16, paddingLeft: 20,
              background: hot ? rgba(accent, 0.1) : "transparent",
              boxShadow: hot ? `inset 4px 0 0 ${accent}` : "none",
            }}>
              <span style={{ width: 34, textAlign: "right", color: rgba(INK, 0.3), fontSize: 19 }}>{i + 1}</span>
              <span style={{ color: hot ? INK : rgba(INK, 0.75), opacity: hot ? Math.max(p, 0.55) : 1, whiteSpace: "pre" }}>{l}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// growth-curve shapes -> SVG path on a 520x260 plot
const SHAPES: Record<string, (x: number) => number> = {
  flat: () => 0.06,
  linear: (x) => 0.12 + 0.75 * x,
  quad: (x) => 0.05 + 0.92 * x * x,
  steep: (x) => 0.03 + Math.pow(x, 3),
  log: (x) => 0.1 + 0.8 * (1 - Math.exp(-3 * x)),
};
const Chart: React.FC<{ spec: any; ap: Applied[]; accent: string; pop: (t: number) => number }> = ({ spec, ap, accent, pop }) => {
  const W = 540, H = 280, x0 = 54, y0 = H - 46, gw = W - x0 - 26, gh = y0 - 30;
  const plotted = new Map<number, number>();
  ap.filter((c) => c.do === "plot").forEach((c) => plotted.set(c.series as number, c.t));
  const series: any[] = spec.series || [];
  return (
    <div style={{ ...innerPanel(), padding: "22px 26px", overflow: "hidden" }}>
      <div style={cap()}>{spec.label || "How work grows"}</div>
      <svg width={W} height={H} style={{ display: "block" }}>
        <line x1={x0} y1={y0} x2={x0 + gw} y2={y0} stroke={rgba(INK, 0.25)} strokeWidth={2} />
        <line x1={x0} y1={y0} x2={x0} y2={30} stroke={rgba(INK, 0.25)} strokeWidth={2} />
        <text x={x0 + gw} y={y0 + 30} textAnchor="end" fontFamily={SANS} fontSize={17} fill={rgba(INK, 0.5)}>data →</text>
        <text x={x0 - 12} y={38} textAnchor="end" fontFamily={SANS} fontSize={17} fill={rgba(INK, 0.5)} transform={`rotate(-90 ${x0 - 12} 38)`}>work</text>
        {series.map((s, i) => {
          const t = plotted.get(i);
          if (t === undefined) return null;
          const shape = SHAPES[s.shape] || SHAPES.linear;
          const col = i === 0 ? INK : accent;
          const pts = Array.from({ length: 41 }, (_, k) => {
            const x = k / 40;
            return [x0 + x * gw, y0 - Math.min(1, shape(x)) * gh];
          });
          const d = "M " + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ");
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={col} strokeWidth={4} strokeLinecap="round" strokeDasharray={2200} strokeDashoffset={2200 * (1 - pop(t))} />
              <rect x={x0 + gw - 226} y={30 + i * 36} width={220} height={30} rx={8} fill={rgba(col, 0.1)} />
              <text x={x0 + gw - 214} y={50 + i * 36} fontFamily={MONO} fontSize={18} fontWeight={700} fill={col}>{s.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const Takeaway: React.FC<{ spec: any; ap: Applied[]; accent: string; pop: (t: number) => number }> = ({ spec, ap, accent, pop }) => {
  const items: string[] = spec.items || [];
  const ticks = new Set<number>();
  let lastT = 0;
  ap.filter((c) => c.do === "tick").forEach((c) => { ticks.add(c.index as number); lastT = Math.max(lastT, c.t); });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", justifyContent: "center" }}>
      <div style={cap()}>{spec.label || "What to take away"}</div>
      {items.map((it, i) => {
        const on = ticks.has(i);
        const p = on ? pop(lastT) : 0;
        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 18, background: "#FFFFFF",
            border: `1.5px solid ${on ? rgba(accent, 0.6) : rgba(INK, 0.14)}`, borderRadius: 14, padding: "16px 22px",
          }}>
            <span style={{
              width: 36, height: 36, borderRadius: 10, border: `2px solid ${on ? accent : rgba(INK, 0.3)}`,
              background: on ? accent : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, fontWeight: 900, transform: `scale(${on ? 0.7 + 0.3 * p : 1})`,
            }}>✓</span>
            <span style={{ fontFamily: SANS, fontWeight: on ? 800 : 600, fontSize: 26, color: INK }}>{it}</span>
          </div>
        );
      })}
    </div>
  );
};

const Roadmap: React.FC<{ spec: any; ap: Applied[]; accent: string; pop: (t: number) => number }> = ({ spec, ap, accent, pop }) => {
  const stops: string[] = spec.stops || [];
  let cur = spec.current ?? 0;
  let from = cur, at = -1;
  ap.filter((c) => c.do === "advance").forEach((c) => { from = cur; cur = c.to as number; at = c.t; });
  const p = at >= 0 ? pop(at) : 1;
  const pos = (i: number) => ({ x: 70 + (i * (1000 - 140)) / Math.max(1, stops.length - 1), y: 56 });
  const a = pos(from), b = pos(Math.min(cur, stops.length - 1));
  const marker = { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
  return (
    <div style={{ ...innerPanel(), padding: "10px 0 0", overflow: "hidden" }}>
      <svg width="100%" height="100%" viewBox="0 0 1000 130" preserveAspectRatio="none" style={{ display: "block" }}>
        <line x1={pos(0).x} y1={pos(0).y} x2={pos(stops.length - 1).x} y2={pos(stops.length - 1).y} stroke={rgba(INK, 0.18)} strokeWidth={5} />
        <line x1={pos(0).x} y1={pos(0).y} x2={marker.x} y2={marker.y} stroke={accent} strokeWidth={5} />
        {stops.map((s, i) => {
          const q = pos(i);
          const on = i <= cur + (at >= 0 && p >= 1 ? 0 : 0);
          const here = i === (at >= 0 && p >= 1 ? cur : from);
          return (
            <g key={i}>
              <circle cx={q.x} cy={q.y} r={here ? 26 : 17} fill={i < cur || here ? accent : "#FFFFFF"} stroke={i < cur || here ? accent : rgba(INK, 0.3)} strokeWidth={3} />
              <text x={q.x} y={q.y + 6} textAnchor="middle" fontFamily={MONO} fontSize={here ? 19 : 15} fontWeight={700} fill={i < cur || here ? "#fff" : rgba(INK, 0.55)}>{i + 1}</text>
              <text x={q.x} y={q.y + 56} textAnchor="middle" fontFamily={SANS} fontSize={18} fontWeight={here ? 800 : 600} fill={here ? INK : rgba(INK, 0.55)}>{s}</text>
            </g>
          );
        })}
        <circle cx={marker.x} cy={marker.y} r={11} fill={accent} opacity={at >= 0 ? p : 0} />
      </svg>
    </div>
  );
};

const VIEWS: Record<string, React.FC<any>> = { boxes: Boxes, stepper: Stepper, code: Code, chart: Chart, takeaway: Takeaway, roadmap: Roadmap };

export const WidgetView: React.FC<{ spec: any; ap: Applied[]; accent: string; pop: (t: number) => number; appear: number; hidden: boolean }> = ({ spec, ap, accent, pop, appear, hidden }) => {
  const View = VIEWS[spec.type];
  if (!View) return null;
  const r = SLOTS[spec.slot || "center"];
  const p = hidden ? 1 : appear === -Infinity ? 1 : pop(appear);
  return (
    <div style={{
      position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h,
      opacity: Math.max(0, p), transform: `translateY(${(1 - Math.max(0, p)) * 30}px)`,
    }}>
      {spec.type === "boxes"
        ? <Boxes spec={spec} ap={ap} accent={accent} pop={pop} />
        : <View spec={spec} ap={ap} accent={accent} pop={pop} />}
    </div>
  );
};
