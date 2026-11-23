import React from "react";

// COURSE teaching widgets — C1b "paper-native" (docs/qa/course-template-c1b-refine-qa.md).
// Reference grammar (owner-approved direction): elements sit NAKED on a white page,
// one focal visual per beat, stacked and centred. Pure functions of (spec, applied
// cues, ms) — seek-safe. Layout is computed here from the widget list; plans never
// carry pixels. A consecutive left+right pair shares one row.

export type WRect = { x: number; y: number; w: number; h: number };
export type Applied = { t: number; do: string; index?: number; value?: string; tone?: string; step?: number; text?: string; ok?: boolean; line?: number; series?: number; to?: number };

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
const INK = "#15191F";
const GOOD = "#1FA463";
const BAD = "#E0384B";
const POINT = "#E8892B"; // the pointer / "current" highlight
const SHADOW = `0 6px 18px ${rgba(INK, 0.1)}`;
const last = <T,>(arr: T[]): T | undefined => arr[arr.length - 1];

// ---- layout -----------------------------------------------------------------
// design units: the whole teaching layer is drawn at 1/UI_SCALE and scaled up uniformly,
// so every widget grows together (C1b scale pass: the reference visuals fill ~1.4x more).
export const UI_SCALE = 1.36;
const STAGE = { x: 92, y: 148, w: 1228, h: 560 };
const NATURAL_H: Record<string, (w: any) => number> = {
  boxes: (w) => (w.label ? 40 : 0) + (w.labels?.length ? 48 : 0) + 150 + 44,
  stepper: () => 240,
  code: (w) => 66 + Math.min(10, (w.lines || []).length) * 54 + 22,
  chart: () => 440,
  takeaway: () => 300,
  roadmap: () => 180,
};
// widgets whose content is drawn at a FIXED width (it ignores r.w) — the layer
// scales them down when their slot is narrower (stepper: 250 card + 30 + 620 note)
const RIGID_W: Record<string, number> = { stepper: 900 };
const NATURAL_W: Record<string, (w: any) => number> = {
  boxes: (w) => Math.min(STAGE.w, Math.max(4, (w.cells || []).length) * 168),
  stepper: () => 900,
  code: () => 1200,
  chart: () => 1180,
  takeaway: (w) => Math.min(STAGE.w, Math.max(2, (w.items || []).length) * 520),
  roadmap: () => 1500,
};

export function layoutWidgets(widgets: any[]): Record<string, WRect> {
  type Row = { items: any[]; h: number };
  const rows: Row[] = [];
  for (let i = 0; i < widgets.length; i++) {
    const w = widgets[i], nx = widgets[i + 1];
    if (w.slot === "left" && nx && nx.slot === "right") {
      rows.push({ items: [w, nx], h: Math.max(NATURAL_H[w.type]?.(w) ?? 240, NATURAL_H[nx.type]?.(nx) ?? 240) });
      i++;
    } else rows.push({ items: [w], h: NATURAL_H[w.type]?.(w) ?? 240 });
  }
  const GAP = 56;
  let total = rows.reduce((s, r) => s + r.h, 0) + GAP * Math.max(0, rows.length - 1);
  const k = total > STAGE.h ? STAGE.h / total : 1; // shrink rows to fit
  total *= k;
  let y = STAGE.y + Math.max(0, (STAGE.h - total) / 2) * 0.7; // sit a little above centre
  const out: Record<string, WRect> = {};
  for (const r of rows) {
    const h = r.h * k;
    if (r.items.length === 2) {
      const cw = (STAGE.w - 80) / 2;
      r.items.forEach((w, j) => {
        const nw = Math.min(cw, NATURAL_W[w.type]?.(w) ?? cw);
        const cx = STAGE.x + j * (cw + 80) + (cw - nw) / 2;
        out[w.id] = { x: cx, y, w: nw, h };
      });
    } else {
      const w = r.items[0];
      const nw = Math.min(STAGE.w, NATURAL_W[w.type]?.(w) ?? STAGE.w);
      out[w.id] = { x: STAGE.x + (STAGE.w - nw) / 2, y, w: nw, h };
    }
    y += h + GAP * k;
  }
  return out;
}

// ---- widgets ------------------------------------------------------------------
type WP = { spec: any; ap: Applied[]; accent: string; pop: (t: number) => number; r: WRect };

const Caption: React.FC<{ text?: string }> = ({ text }) => (text ? (
  <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 18, letterSpacing: 2, textTransform: "uppercase", color: rgba(INK, 0.5), textAlign: "center", marginBottom: 14 }}>{text}</div>
) : null);

const Boxes: React.FC<WP> = ({ spec, ap, accent, pop, r }) => {
  const cells: string[] = spec.cells || [];
  const labels: string[] = spec.labels || [];
  const fills = new Map<number, { v: string; tone?: string; t: number }>();
  let mark = -1, markT = 0;
  ap.forEach((c) => {
    if (c.do === "fill") fills.set(c.index as number, { v: c.value ?? "", tone: c.tone, t: c.t });
    if (c.do === "mark") { mark = c.index as number; markT = c.t; }
  });
  const n = Math.max(1, cells.length);
  const gap = 14;
  const cell = Math.min(140, (r.w - gap * (n - 1)) / n);
  const digit = Math.round(cell * (cells.some((c, i) => String(fills.get(i)?.v ?? c).length > 3) ? 0.3 : 0.5));
  const mp = mark >= 0 ? pop(markT) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Caption text={spec.label} />
      {labels.length > 0 && (
        <div style={{ display: "flex", gap, marginBottom: 12 }}>
          {cells.map((_, i) => (
            <div key={i} style={{ width: cell, display: "flex", justifyContent: "center" }}>
              <span style={{
                fontFamily: MONO, fontWeight: 700, fontSize: 17, padding: "3px 12px", borderRadius: 8,
                color: i === mark ? POINT : rgba(INK, 0.7),
                border: `1.5px solid ${i === mark ? POINT : rgba(INK, 0.25)}`, background: "#FFFFFF",
              }}>{labels[i] ?? ""}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap }}>
        {cells.map((c, i) => {
          const f = fills.get(i);
          const p = f ? pop(f.t) : 0;
          const solid = f && (f.tone === "good" || f.tone === "bad");
          const bg = !solid ? "#FFFFFF" : f!.tone === "bad" ? BAD : accent;
          const v = f ? f.v : c;
          return (
            <div key={i} style={{
              width: cell, height: cell, borderRadius: Math.round(cell * 0.16),
              border: solid ? `2px solid ${bg}` : `2px solid ${rgba(INK, i === mark ? 0.75 : 0.32)}`,
              background: bg, boxShadow: solid ? `0 8px 20px ${rgba(bg, 0.35)}` : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: MONO, fontWeight: 700, fontSize: digit, color: solid ? "#FFFFFF" : INK,
              transform: `scale(${1 + 0.08 * Math.sin(Math.PI * Math.min(1, p))})`,
            }}>
              {v !== "" && v !== undefined ? <span style={{ opacity: f ? p : 1 }}>{v}</span> : null}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap, height: 36, marginTop: 8 }}>
        {cells.map((_, i) => (
          <div key={i} style={{ width: cell, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
            {i === mark && (
              <svg width={26} height={20} style={{ opacity: mp, transform: `translateY(${(1 - mp) * 10}px)` }}>
                <path d="M13 0 L26 20 L0 20 Z" fill={POINT} />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const Stepper: React.FC<WP> = ({ spec, ap, accent, pop }) => {
  const steps = ap.filter((c) => c.do === "step");
  const cur = last(steps);
  const p = cur ? pop(cur.t) : 0;
  const val = cur && cur.step !== undefined ? cur.step : spec.value ?? 0;
  const okCol = cur?.ok === undefined ? null : cur.ok ? GOOD : BAD;
  return (
    <div style={{ display: "flex", gap: 30, alignItems: "stretch", justifyContent: "center", height: 220 }}>
      <div style={{
        width: 250, borderRadius: 18, background: "#FFFFFF", boxShadow: SHADOW,
        border: `2px solid ${okCol && cur?.ok ? rgba(GOOD, 0.8) : rgba(INK, 0.12)}`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 16, letterSpacing: 2, textTransform: "uppercase", color: rgba(INK, 0.5) }}>{spec.label || "count"}</div>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: String(val).length > 5 ? 50 : 72, color: okCol && cur?.ok ? GOOD : INK, transform: `scale(${1 + 0.06 * Math.sin(Math.PI * Math.min(1, p))})` }}>
          {typeof val === "number" ? val.toLocaleString("en-US") : val}{spec.unit ? <span style={{ fontSize: 26, color: rgba(INK, 0.5) }}> {spec.unit}</span> : null}
        </div>
      </div>
      <div style={{
        width: 620, position: "relative", background: "#FFFFFF", borderRadius: 4,
        border: `2px solid ${rgba(INK, 0.22)}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 26,
        clipPath: "polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 0 100%)",
      }}>
        <svg width={26} height={26} style={{ position: "absolute", right: 0, top: 0 }}>
          <path d="M0 0 L26 26 L0 26 Z" fill={rgba(INK, 0.12)} />
        </svg>
        {cur?.text ? (
          <>
            <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 38, color: INK, opacity: p }}>{cur.text}</span>
            {okCol && (
              <span style={{
                width: 46, height: 46, borderRadius: 23, background: okCol, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900,
                transform: `scale(${p})`,
              }}>{cur.ok ? "✓" : "✕"}</span>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

const Code: React.FC<WP> = ({ spec, ap, accent, pop, r }) => {
  const cur = last(ap.filter((c) => c.do === "line"));
  const lines: string[] = (spec.lines || []).slice(0, 10);
  return (
    <div style={{
      width: r.w, background: "#FFFFFF", borderRadius: 16, border: `1.5px solid ${rgba(INK, 0.14)}`,
      boxShadow: SHADOW, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: `1px solid ${rgba(INK, 0.08)}`, background: rgba(INK, 0.025) }}>
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
        <span style={{ marginLeft: 12, fontFamily: MONO, fontSize: 19, color: rgba(INK, 0.6) }}>{spec.title || "main.py"}</span>
      </div>
      <div style={{ padding: "12px 0 14px", fontFamily: MONO, fontSize: 30, lineHeight: "54px" }}>
        {lines.map((l, i) => {
          const hot = cur && cur.line === i + 1;
          const p = hot ? pop((cur as Applied).t) : 0;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 18, paddingLeft: 20,
              background: hot ? rgba(accent, 0.1 * Math.min(1, p) + 0.02) : "transparent",
              boxShadow: hot ? `inset 5px 0 0 ${accent}` : "none",
            }}>
              <span style={{ width: 30, textAlign: "right", color: rgba(INK, 0.28), fontSize: 20 }}>{i + 1}</span>
              <span style={{ color: hot ? INK : rgba(INK, 0.72), fontWeight: hot ? 700 : 400, whiteSpace: "pre" }}>{l}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SHAPES: Record<string, (x: number) => number> = {
  flat: () => 0.08,
  linear: (x) => 0.1 + 0.78 * x,
  quad: (x) => 0.05 + 0.92 * x * x,
  steep: (x) => 0.03 + Math.pow(x, 3),
  log: (x) => 0.1 + 0.8 * (1 - Math.exp(-3 * x)),
};
const Chart: React.FC<WP> = ({ spec, ap, accent, pop, r }) => {
  const W = r.w, H = Math.min(r.h, 440) - 40;
  const x0 = 70, y0 = H - 40, gw = W - x0 - 230, gh = y0 - 20;
  const plotted = new Map<number, number>();
  ap.filter((c) => c.do === "plot").forEach((c) => plotted.set(c.series as number, c.t));
  const series: any[] = spec.series || [];
  const palette = [INK, accent, POINT, GOOD];
  return (
    <div>
      <Caption text={spec.label} />
      <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
        <line x1={x0} y1={y0} x2={x0 + gw} y2={y0} stroke={rgba(INK, 0.35)} strokeWidth={2.5} />
        <line x1={x0} y1={y0} x2={x0} y2={14} stroke={rgba(INK, 0.35)} strokeWidth={2.5} />
        <text x={x0 + gw} y={y0 + 32} textAnchor="end" fontFamily={MONO} fontSize={18} fill={rgba(INK, 0.5)}>DATA →</text>
        <text x={x0 - 16} y={24} textAnchor="end" fontFamily={MONO} fontSize={18} fill={rgba(INK, 0.5)}>WORK</text>
        {series.map((s, i) => {
          const t = plotted.get(i);
          if (t === undefined) return null;
          const shape = SHAPES[s.shape] || SHAPES.linear;
          const col = palette[i % palette.length];
          const p = pop(t);
          const pts = Array.from({ length: 41 }, (_, k) => [x0 + (k / 40) * gw, y0 - Math.min(1, shape(k / 40)) * gh]);
          const d = "M " + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ");
          const [ex, ey] = pts[40];
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={col} strokeWidth={5} strokeLinecap="round" strokeDasharray={3000} strokeDashoffset={3000 * (1 - p)} />
              <text x={ex + 14} y={ey + 8} fontFamily={MONO} fontSize={26} fontWeight={700} fill={col} opacity={p}>{s.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const Takeaway: React.FC<WP> = ({ spec, ap, accent, pop, r }) => {
  const items: string[] = (spec.items || []).slice(0, 4);
  const tickT = new Map<number, number>();
  ap.filter((c) => c.do === "tick").forEach((c) => tickT.set(c.index as number, c.t));
  const gap = 26;
  const cw = Math.min(500, (r.w - gap * (items.length - 1)) / Math.max(1, items.length));
  return (
    <div style={{ display: "flex", gap, justifyContent: "center" }}>
      {items.map((it, i) => {
        const t = tickT.get(i);
        const on = t !== undefined;
        const p = on ? pop(t as number) : 0;
        return (
          <div key={i} style={{
            width: cw, minHeight: 230, borderRadius: 18, background: "#FFFFFF", boxSizing: "border-box",
            border: `2px solid ${on ? rgba(accent, 0.7) : rgba(INK, 0.12)}`, boxShadow: on ? `0 10px 26px ${rgba(accent, 0.18)}` : SHADOW,
            padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{
                width: 34, height: 34, borderRadius: 9, border: `2px solid ${on ? accent : rgba(INK, 0.3)}`,
                background: on ? accent : "#FFFFFF", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, fontWeight: 900,
              }}><span style={{ transform: `scale(${p})` }}>✓</span></span>
              <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 18, color: rgba(INK, 0.45) }}>{String(i + 1).padStart(2, "0")}</span>
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 31, lineHeight: 1.3, color: on ? INK : rgba(INK, 0.55) }}>{it}</div>
          </div>
        );
      })}
    </div>
  );
};

const Roadmap: React.FC<WP> = ({ spec, ap, accent, pop, r }) => {
  const stops: string[] = spec.stops || [];
  let cur = spec.current ?? 0, from = cur, at = -1;
  ap.filter((c) => c.do === "advance").forEach((c) => { from = cur; cur = c.to as number; at = c.t; });
  const p = at >= 0 ? pop(at) : 1;
  const W = r.w, pad = 90, y = 60;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, stops.length - 1);
  const mx = x(from) + (x(cur) - x(from)) * p;
  const here = p >= 0.999 ? cur : from;
  return (
    <svg width={W} height={170} style={{ display: "block", overflow: "visible" }}>
      <line x1={x(0)} y1={y} x2={x(stops.length - 1)} y2={y} stroke={rgba(INK, 0.15)} strokeWidth={8} strokeLinecap="round" />
      <line x1={x(0)} y1={y} x2={mx} y2={y} stroke={accent} strokeWidth={8} strokeLinecap="round" />
      {stops.map((s, i) => {
        const done = i < here || i === here;
        return (
          <g key={i}>
            <circle cx={x(i)} cy={y} r={i === here ? 26 : 18} fill={done ? accent : "#FFFFFF"} stroke={done ? accent : rgba(INK, 0.3)} strokeWidth={3} />
            <text x={x(i)} y={y + 7} textAnchor="middle" fontFamily={MONO} fontSize={i === here ? 20 : 16} fontWeight={700} fill={done ? "#FFFFFF" : rgba(INK, 0.5)}>{String(i + 1).padStart(2, "0")}</text>
            <text x={x(i)} y={y + 66} textAnchor="middle" fontFamily={SANS} fontSize={22} fontWeight={i === here ? 800 : 600} fill={i === here ? INK : rgba(INK, 0.5)}>{s}</text>
          </g>
        );
      })}
      <circle cx={mx} cy={y} r={9} fill="#FFFFFF" opacity={at >= 0 && p < 0.999 ? 1 : 0} />
    </svg>
  );
};

const VIEWS: Record<string, React.FC<WP>> = { boxes: Boxes, stepper: Stepper, code: Code, chart: Chart, takeaway: Takeaway, roadmap: Roadmap };

// all widgets of one scene, auto-laid-out
export const WidgetLayer: React.FC<{ widgets: any[]; cues: any[]; ms: number; accent: string; pop: (t: number) => number; hidden: boolean }> = ({ widgets, cues, ms, accent, pop, hidden }) => {
  const rects = layoutWidgets(widgets);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920 / UI_SCALE, height: 1080 / UI_SCALE, transform: `scale(${UI_SCALE})`, transformOrigin: "0 0" }}>
      {widgets.map((spec) => {
        const View = VIEWS[spec.type];
        const r = rects[spec.id];
        if (!View || !r) return null;
        const { appear, applied } = applyWidgetCues(cues, spec.id, ms);
        const p = appear === -Infinity ? 1 : pop(appear);
        // a widget drawn at a fixed width (RIGID_W) that is wider than its slot
        // renders at its own width and is scaled down to fit — 2026-11-20 CI run:
        // a stepper (900 wide) in a half-row slot (574) spilled off the page edge
        const rigid = RIGID_W[spec.type];
        const fit = rigid && rigid > r.w ? r.w / rigid : 1;
        return (
          <div key={spec.id} style={{
            position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
            opacity: hidden ? 0.15 : Math.max(0, Math.min(1, p)), transform: `translateY(${(1 - Math.max(0, Math.min(1, p))) * 26}px)`,
          }}>
            {fit < 1 ? (
              <div style={{ width: rigid, flex: "none", transform: `scale(${fit})`, transformOrigin: "top center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <View spec={spec} ap={applied} accent={accent} pop={pop} r={{ ...r, w: rigid as number, h: r.h / fit }} />
              </div>
            ) : (
              <View spec={spec} ap={applied} accent={accent} pop={pop} r={r} />
            )}
          </div>
        );
      })}
    </div>
  );
};
