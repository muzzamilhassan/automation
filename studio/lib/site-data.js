// Curated platform data for pages that don't have a live API yet.
// Real numbers come from the repo's audits + state files (Sep 2026).
// #125: the hardcoded 16-brand mark map was DELETED — brand short/accent
// now comes live from /api/brands (legacy brands + registry) via the
// useBrands() hook. Never reintroduce a slug map in code.

// P0-5: the static Sep-2026 retention baseline was deleted — Analytics draws
// only live avgWatched from the API (channels without data say so).
export const RETENTION_GOAL = 70;

export const PIPELINES = [
  {
    id: 'yt-daily',
    name: 'Daily Shorts',
    desc: 'AI script → voice → render → upload — 1 quality short per channel, best ET-prime slot only',
    icon: 'clapperboard',
    engine: 'GitHub Actions · yt-daily.yml',
    schedule: 'QQ 22:35 · IC 23:35 · MR 00:05 · OMC 00:35 (UTC) · Sunday break',
    actions: [
      { action: 'yt-daily', slug: 'quotequarry', label: 'QQ Shorts' },
      { action: 'yt-daily', slug: 'investors-compass', label: 'IC Shorts' },
      { action: 'yt-daily', slug: 'money-rulebook', label: 'MR Shorts' },
      { action: 'yt-daily', slug: 'debt-free-doctrine', label: 'DFD Shorts' },
    ],
    stages: ['Script brain', 'Voice', 'Render', 'Poster', 'Upload'],
  },
  {
    id: 'deepdive',
    name: 'Weekly episode',
    desc: '10+ min documentary per channel — ONE fixed day a week, appointment viewing',
    icon: 'film',
    engine: 'yt-deepdive in the daily channel run',
    schedule: 'QQ Tue · IC Wed · MR Thu · OMC Fri (each at its ET-prime slot)',
    note: 'Docs are weekly since Oct 05 (cadence research). The manual uploader workflow is disabled during the Oct-1 recovery — the daily run produces the episode on each channel\'s doc day.',
    actions: [
      { action: 'deepdive', slug: 'quotequarry', label: 'QQ episode' },
      { action: 'deepdive', slug: 'investors-compass', label: 'IC episode' },
      { action: 'deepdive', slug: 'money-rulebook', label: 'MR episode' },
      { action: 'deepdive', slug: 'debt-free-doctrine', label: 'DFD episode' },
    ],
    stages: ['Research', 'Script', 'Voice', 'Scenes', 'Render', 'Upload'],
  },
  {
    id: 'tiktok',
    name: 'TikTok clips',
    name2: 'Zernio',
    desc: 'Long-forms auto-cut into 1-min sentence-aligned parts, 1 part/day + 4 shorts slots',
    icon: 'music2',
    // T4d (#106): the auto-post workflow was retired (T1a) — its button could
    // only ever get the route's clean 400 'workflow retired'. Posting
    // continues inside the Zernio app; the entry stays as placeholder copy
    // with no dead workflow advertised and no dead button.
    engine: 'Zernio app — the auto-post workflow was retired Oct 30 (#106)',
    schedule: '4×/day + 1 clip part/day',
    actions: [],
    stages: ['Source video', 'Cut parts', 'Caption align', 'Post via Zernio'],
  },
];

// 14-day views sample series per channel (labels: D-13..today). Sample data —
// the Analytics page labels it as such until the metrics API is wired.
const seed = (n) => {
  let s = n * 2654435761 % 4294967296;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};
const SERIES_BASE = { quotequarry: 5200, 'money-rulebook': 1900, 'investors-compass': 2400, 'debt-free-doctrine': 1100 };
export const VIEWS_SERIES = Object.fromEntries(
  Object.entries(SERIES_BASE).map(([slug, base], ci) => {
    const rnd = seed(ci + 7);
    let v = base;
    return [slug, Array.from({ length: 14 }, (_, i) => {
      v = Math.max(200, v * (0.82 + rnd() * 0.5));
      return Math.round(v);
    })];
  })
);

export const TRACKED_KEYWORDS = [
  { kw: 'how does compound interest work', pos: 6, delta: +4, channel: 'investors-compass' },
  { kw: 'debt snowball vs avalanche', pos: 9, delta: +7, channel: 'debt-free-doctrine' },
  { kw: 'stoic morning routine', pos: 12, delta: -1, channel: 'quotequarry' },
  { kw: '50/30/20 budget rule', pos: 14, delta: +3, channel: 'money-rulebook' },
  { kw: 'emergency fund first', pos: 21, delta: +11, channel: 'debt-free-doctrine' },
  { kw: 'dividend investing explained', pos: 26, delta: +2, channel: 'investors-compass' },
];

// Music — locked 13-track pool (approved Sep 16) + per-brand moods.
export const MUSIC_POOL = [
  { name: 'Skye Cuillin', mood: 'EPIC', brand: 'shared' },
  { name: 'Heroic Age', mood: 'EPIC', brand: 'quotequarry' },
  { name: 'Strength of the Titans', mood: 'EPIC', brand: 'quotequarry' },
  { name: 'Fanfare for Space', mood: 'EPIC', brand: 'shared' },
  { name: 'That Zen Moment', mood: 'CALM', brand: 'investors-compass' },
  { name: 'Frozen Star', mood: 'CALM', brand: 'shared' },
  { name: 'Deep Relaxation', mood: 'CALM', brand: 'investors-compass' },
  { name: 'Gymnopedie No. 1', mood: 'CALM', brand: 'shared' },
  { name: 'Deliberate Thought', mood: 'TECH', brand: 'tech' },
  { name: 'Cut Trance', mood: 'TECH', brand: 'tech' },
  { name: 'Voltaic', mood: 'TECH', brand: 'tech' },
  { name: 'Bass Walker', mood: 'DRIVE', brand: 'shared' },
  { name: 'Hustle', mood: 'DRIVE', brand: 'money-rulebook' },
];

export const MUSIC_MOODS = {
  quotequarry: ['Epic', 'Inspiring', 'Heroic'],
  'investors-compass': ['Calming', 'Inspiring', 'Mystical'],
  'money-rulebook': ['Bright', 'Uplifting', 'Grooving'],
  'debt-free-doctrine': ['Driving', 'Hopeful'],
};

export const INTEGRATIONS = [
  { name: 'YouTube Data API', status: 'ok', note: '5 channels linked (4 legacy + FAJR OF QUR\'AN) · uploads own bucket', icon: 'youtube' },
  { name: 'Channel Autopilot', status: 'ok', note: 'nightly 02:33 UTC · wizard channels run automatically', icon: 'cloud' },
  { name: 'Weekly docs', status: 'ok', note: 'docDay per channel: QQ Tue · IC Wed · MR Thu · OMC Fri', icon: 'film' },
  { name: 'Facebook Pages', status: 'ok', note: '4 legacy pages wired · reels + posters', icon: 'facebook' },
  { name: 'Instagram Graph', status: 'ok', note: '4 legacy accounts · reels daily', icon: 'instagram' },
  { name: 'TikTok (Zernio)', status: 'ok', note: '@arzo22345 · 4 slots/day + clips (QQ)', icon: 'music2' },
  { name: 'Threads', status: 'warn', note: 'Token valid until ~Oct 29', icon: 'at-sign' },
  { name: 'Roles (Google sign-in)', status: 'ok', note: 'owner: muzzamilhassan302 · staff/client via access.json', icon: 'zap' },
  { name: 'Script brain', status: 'bad', note: 'Groq 429 bursts — fallback fix pending', icon: 'sparkles' },
  { name: 'ntfy alerts', status: 'ok', note: 'private topic (masked — rotate before the public flip)', icon: 'bell' },
];

export const DAILY_REPORTS = [
  { name: 'daily-report-2026-09-19.xlsx', when: 'Sep 19, 2026' },
  { name: 'daily-report-2026-09-12.xlsx', when: 'Sep 12, 2026' },
];
