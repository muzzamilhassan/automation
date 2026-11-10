// market-files family — PURE scene-derivation helpers (P1,
// docs/superpowers/specs/2026-11-10-market-files-family-p1-spec.md R3/R5/R7).
// Zero deps, node-testable (tests/market-scenes.test.mjs); the React family
// (explainer/remotion/families/marketFiles.tsx) imports this for its scene
// choices so the SAME logic runs in renders and in tests. Data only —
// per-channel/brand specifics never live here (no-static-maps).

// ---- R5: mood palettes ------------------------------------------------------
// The Paper Billions grammar: rooms and chips carry the day's emotion.
// crash = red family (the Thursday grammar), party = greens (the Wednesday
// grammar), night = dark blues, data = navy + glow (tech/market machinery),
// calm = neutral warm rooms.
export const MOODS = {
  calm: { room: ["#e8e4da", "#c9c2b2"], ink: "#20242c", accent: "#2e7d5b", chip: "#2e7d5b", chipText: "#ffffff", boardBg: ["#3c4350", "#262b34"], boardText: "#f2efe6" },
  party: { room: ["#2f5240", "#1d3a2c"], ink: "#20242c", accent: "#57c988", chip: "#2e9e5b", chipText: "#ffffff", boardBg: ["#2c4a3a", "#1a2f24"], boardText: "#b8f2cd" },
  crash: { room: ["#5a3a3a", "#33201f"], ink: "#20242c", accent: "#ff5548", chip: "#c9362c", chipText: "#ffffff", boardBg: ["#471512", "#2b0c0a"], boardText: "#ff9d94" },
  night: { room: ["#2a2f4a", "#161a2e"], ink: "#20242c", accent: "#7d9bd6", chip: "#3c4a7a", chipText: "#ffffff", boardBg: ["#232848", "#141730"], boardText: "#b9c6ef" },
  data: { room: ["#232a3d", "#12172a"], ink: "#20242c", accent: "#63e0a2", chip: "#2e6e5b", chipText: "#ffffff", boardBg: ["#1d2b3a", "#101a26"], boardText: "#8fe8c0" },
};

// ---- R3: deterministic mood derivation --------------------------------------
// Explicit beat direction wins (b.scene.mood); otherwise scan the spoken
// text for mood keywords; otherwise calm. Crash words FIRST — a headline
// with both ("record high before the crash") should read as threat.
const MOOD_WORDS = {
  crash: ["crash", "crashed", "crashes", "fell", "fall", "falls", "falling", "drop", "dropped", "dropping", "plunge", "plunged", "plunges", "panic", "sell-off", "selloff", "sink", "sinks", "collapse", "collapsed", "loss", "lost", "slump", "slumped", "down", "wipe", "wiped", "bubble", "pop", "pops", "fear", "worst", "vanish", "vanished", "burn", "burned"],
  party: ["rally", "rallies", "record", "surge", "surged", "surges", "jump", "jumped", "jumps", "celebrate", "celebration", "boom", "gain", "gained", "gains", "party", "win", "won", "wins", "best", "soar", "soared", "soars", "soaring"],
  night: ["night", "midnight", "sleep", "sleeping", "asleep", "dark", "3 am", "dawn", "bed"],
  data: ["chip", "chips", "server", "servers", "data center", "datacenter", "gpu", "gpus", "ai", "cloud", "compute", "electricity", "grid", "power"],
};

// whole-word match — a substring scan would read "plain" as "ai" and turn a
// calm index-fund line into a data-center scene (caught by the R3a test).
const MOOD_RES = Object.fromEntries(
  Object.entries(MOOD_WORDS).map(([m, words]) => [m, new RegExp(`(?:^|[^a-z])(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[^a-z])`, "i")]),
);

export function moodFor(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return "calm";
  for (const mood of ["crash", "party", "night", "data"]) {
    if (MOOD_RES[mood].test(t)) return mood;
  }
  return "calm";
}

export function moodForBeat(beat) {
  const hint = beat && beat.scene && typeof beat.scene === "object" ? String(beat.scene.mood || "").trim() : "";
  if (hint && MOODS[hint]) return hint;
  const text = [beat && beat.headline, beat && beat.text, beat && beat.sub, beat && beat.label, beat && beat.big].filter(Boolean).join(" ");
  return moodFor(text);
}

// ---- R3: location derivation -------------------------------------------------
// Locations are the family's set vocabulary (P1 builds: trading floor,
// office, data center, dialogue stage). Per-layout rotation keeps an
// episode's scenes varied WITHOUT randomness — beat index drives it, so the
// same beat always derives the same location. An explicit
// b.scene.location wins when it names a built set.
export const SETS = ["trading", "office", "datacenter", "stage"];

const LOCATION_CYCLE = {
  hero: ["trading", "office"],
  chapter: ["trading", "office", "datacenter", "stage"],
  split: ["office", "datacenter", "stage", "trading"],
  stat: ["trading"],
  quote: ["stage"],
  process: ["office", "datacenter"],
  timeline: ["trading"],
  end: ["trading"],
};

export function locationFor(layout, i, hint) {
  const cycle = LOCATION_CYCLE[layout] || ["office"];
  if (hint && SETS.includes(hint)) return hint;
  return cycle[Math.abs(Number(i) || 0) % cycle.length];
}

export function sceneForBeat(beat) {
  const b = beat && typeof beat === "object" ? beat : {};
  const hint = b.scene && typeof b.scene === "object" ? b.scene : {};
  return {
    mood: moodForBeat(b),
    location: locationFor(b.layout, b.i, hint.location),
    time: String(hint.time || "").trim() || null, // "10:35 AM ET" — clock badge text
    day: String(hint.day || "").trim() || null, // "THURSDAY" — day chip text
  };
}

// ---- R7: fictional ticker pool -----------------------------------------------
// Scene art NEVER shows a real trademark (the reference's PIKE/QUAY/RIFT
// pattern). Prices and deltas are deterministic per seed so a re-render
// reproduces the same wall.
export const TICKER_POOL = ["PIKE", "QUAY", "RIFT", "SAGE", "TERN", "UMBR", "VOLT", "MOSS", "NOVA", "HALO", "GRID", "KITE", "LUME", "JOLT", "DYNA", "CRUX", "BOLT", "FLUX", "IRON", "OPAL"];

const hash32 = (seed, salt) => {
  let h = (Number(seed) || 0) ^ (salt * 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
};

export function tickersFor(seed, n = 6) {
  const count = Math.max(1, Math.min(TICKER_POOL.length, Number(n) || 6));
  const out = [];
  const used = new Set();
  for (let k = 0; k < count; k++) {
    const h = hash32(seed, k + 1);
    let idx = h % TICKER_POOL.length;
    while (used.has(idx)) idx = (idx + 1) % TICKER_POOL.length;
    used.add(idx);
    const price = 12 + ((h >>> 8) % 16000) / 100; // 12.00–172.00
    const dir = (h >>> 24) % 2 === 0 ? "down" : "up";
    const delta = 0.4 + ((h >>> 16) % 450) / 100; // 0.40–4.90
    out.push({ name: TICKER_POOL[idx], price: price.toFixed(1), dir, delta: delta.toFixed(1) });
  }
  return out;
}
