import React from "react";

// Living Diagram icon set — our own line drawings on a 24×24 grid (no third-
// party icon licence involved). A plan names a `kind`; unknown kinds fall back
// to "dot", so a new kind never breaks a render. `body` = closed shapes that get
// the duotone fill in the glow style; `line` = strokes only.
type Glyph = { body?: React.ReactNode; line: React.ReactNode };
const G: Record<string, Glyph> = {
  cash: { body: <rect x="2.5" y="6" width="19" height="12" rx="2" />, line: <><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v5M18 9.5v5" /></> },
  bank: { body: <path d="M3 9.5 12 4l9 5.5z" />, line: <><path d="M5 10.5v7M9.5 10.5v7M14.5 10.5v7M19 10.5v7" /><path d="M3 20h18" /></> },
  home: { body: <path d="M6 9.5V20h12V9.5L12 4.8z" />, line: <><path d="M3.5 11 12 4l8.5 7" /><path d="M10 20v-5.5h4V20" /></> },
  receipt: { body: <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" />, line: <path d="M9 8h6M9 11.5h6M9 15h3.5" /> },
  bag: { body: <path d="M5 8h14l-1.2 12.5H6.2z" />, line: <path d="M9 10V7a3 3 0 0 1 6 0v3" /> },
  vault: { body: <rect x="3" y="4" width="18" height="15" rx="2" />, line: <><circle cx="12" cy="11.5" r="3.6" /><path d="M12 9.2v1.2M12 12.6v1.2M9.7 11.5h1.2M13.1 11.5h1.2" /><path d="M6 19v1.8M18 19v1.8" /></> },
  person: { body: <circle cx="12" cy="8" r="3.6" />, line: <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /> },
  user: { body: <circle cx="12" cy="8" r="3.6" />, line: <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /> },
  card: { body: <rect x="2.5" y="5.5" width="19" height="13" rx="2" />, line: <path d="M2.5 9.5h19M6 15h4" /> },
  chart: { line: <><path d="M3.5 20.5h17" /><path d="M4.5 16 9 11.5l3.5 3L19.5 7" /><path d="M15.5 7h4v4" /></> },
  building: { body: <rect x="5" y="3" width="14" height="18" rx="1" />, line: <path d="M9 7h1.5M13.5 7H15M9 11h1.5M13.5 11H15M9 15h1.5M13.5 15H15" /> },
  clock: { body: <circle cx="12" cy="12" r="8.5" />, line: <path d="M12 7.5V12l3 2" /> },
  // tech set
  laptop: { body: <rect x="4" y="4.5" width="16" height="11" rx="1.5" />, line: <><path d="M2 19.5h20l-1.6-3.5H3.6z" /><path d="M7 8h6M7 10.5h9M7 13h4" /></> },
  phone: { body: <rect x="7" y="2.5" width="10" height="19" rx="2.2" />, line: <><path d="M10.5 5h3" /><circle cx="12" cy="18.3" r=".9" /></> },
  server: { body: <><rect x="3" y="3.5" width="18" height="5" rx="1.2" /><rect x="3" y="9.5" width="18" height="5" rx="1.2" /><rect x="3" y="15.5" width="18" height="5" rx="1.2" /></>, line: <path d="M6 6h.01M6 12h.01M6 18h.01M10 6h7M10 12h7M10 18h7" /> },
  database: { body: <path d="M4.5 5.5c0-1.7 3.4-3 7.5-3s7.5 1.3 7.5 3v13c0 1.7-3.4 3-7.5 3s-7.5-1.3-7.5-3z" />, line: <><ellipse cx="12" cy="5.5" rx="7.5" ry="3" /><path d="M4.5 10c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3M4.5 14.3c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" /></> },
  api: { body: <rect x="2.5" y="5" width="19" height="14" rx="2.5" />, line: <path d="m9 9.2-2.8 2.8L9 14.8M15 9.2l2.8 2.8-2.8 2.8M13 8.5l-2 7" /> },
  gateway: { body: <path d="M12 2.8 19.5 6v5.6c0 4.6-3.2 8.2-7.5 9.6-4.3-1.4-7.5-5-7.5-9.6V6z" />, line: <path d="m8.6 12 2.4 2.4 4.6-4.8" /> },
  bot: { body: <rect x="4" y="7.5" width="16" height="12" rx="3" />, line: <><path d="M12 7.5V4.2M10.4 3.6h3.2" /><circle cx="9" cy="13" r="1.3" /><circle cx="15" cy="13" r="1.3" /><path d="M9.5 16.6h5M2 12v3.5M22 12v3.5" /></> },
  bucket: { body: <path d="M4 7h16l-2 13.5H6z" />, line: <><ellipse cx="12" cy="7" rx="8" ry="2.2" /><path d="M8.5 12.5h.01M12 15h.01M15.5 12.5h.01M10 17.5h.01M14 17.5h.01" /></> },
  globe: { body: <circle cx="12" cy="12" r="9" />, line: <><path d="M3 12h18" /><path d="M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" /></> },
  lock: { body: <rect x="4.5" y="10.5" width="15" height="10.5" rx="2" />, line: <><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><path d="M12 14.5v2.5" /></> },
  queue: { body: <><rect x="2.5" y="8" width="5" height="8" rx="1" /><rect x="9.5" y="8" width="5" height="8" rx="1" /><rect x="16.5" y="8" width="5" height="8" rx="1" /></>, line: <path d="M5 12h.01M12 12h.01M19 12h.01" /> },
  dot: { body: <circle cx="12" cy="12" r="4" />, line: null },
};

export const ICON_KINDS = Object.keys(G);

export const Icon: React.FC<{ kind: string; size: number; color: string; stroke?: number; fill?: string }> = ({ kind, size, color, stroke = 1.6, fill = "none" }) => {
  const g = G[kind] || G.dot;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ overflow: "visible" }}>
      {g.body ? <g fill={fill}>{g.body}</g> : null}
      {g.line}
    </svg>
  );
};
