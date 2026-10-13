// Style DNA presets — hard design constraints the generative brain must design within.
// Each DNA: fonts (Google Fonts), palette (WCAG-checked against its own bg), motion feel, texture recipe.
// accentWords = how many emphasis words per beat the design may color.

export const DNAS = {
  luxury: {
    label: 'Old Money Luxury',
    fonts: "family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Inter:wght@400;500;600",
    fontStack: "'Cormorant Garamond', Georgia, serif",
    uiStack: "'Inter', sans-serif",
    palette: { bg: '#0d0c0a', bgGlow: 'rgba(217,193,137,0.08)', text: '#f2ead9', accent: '#d9c189', subtle: 'rgba(242,234,217,0.55)' },
    motion: { ease: 'power3.out', wordStagger: 0.07, riseY: 46, wordDur: 0.62 },
    texture: 'thin hairline frame inset 70px (1px, rgba(242,234,217,0.14)), radial gold glows, soft vignette, static film grain (feTurbulence, opacity 0.05)',
    kickerStyle: 'uppercase letterspaced 0.42em small Inter label + 1px gradient rule under it',
    accentWords: 1,
    beatCss: 'font-size 104px serif, line-height 1.2, accent word italic',
    rules: 'Slow, quiet, expensive. Vast empty space above and below the beat text (text block sits at ~45% height). Never rush a reveal.',
  },
  'neon-tech': {
    label: 'Neon Tech',
    fonts: "family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;700",
    fontStack: "'Space Grotesk', 'Inter', sans-serif",
    uiStack: "'Inter', sans-serif",
    palette: { bg: '#05070d', bgGlow: 'rgba(76,201,240,0.10)', text: '#e8f0ff', accent: '#4cc9f0', subtle: 'rgba(232,240,255,0.6)' },
    motion: { ease: 'back.out(1.6)', wordStagger: 0.05, riseY: 30, wordDur: 0.45 },
    texture: 'subtle 1px grid lines (rgba(76,201,240,0.07), 80px cells), one horizontal scanline glow drifting, corner bracket marks',
    kickerStyle: 'monospace-feel Inter 500 uppercase 0.3em letterspace with leading index number like [01]',
    accentWords: 2,
    beatCss: 'font-size 96px weight 700, tight line-height 1.15, accent words in accent color with soft cyan text-shadow (never solid glow blocks)',
    rules: 'Fast, precise, electric. Snappy entrances with slight overshoot. Diagram-like decorations allowed (thin lines, brackets, node dots). No blur-heavy blooms.',
  },
  'vox-paper': {
    label: 'Vox Paper Editorial',
    fonts: "family=Archivo:wght@600;800&family=Inter:wght@400;500;700",
    fontStack: "'Archivo', 'Inter', sans-serif",
    uiStack: "'Inter', sans-serif",
    palette: { bg: '#f4efe6', bgGlow: 'rgba(217,79,48,0.05)', text: '#1a1611', accent: '#c2401f', subtle: 'rgba(26,22,17,0.62)' },
    motion: { ease: 'power2.out', wordStagger: 0.06, riseY: 38, wordDur: 0.5 },
    texture: 'warm paper tone, thin editorial column rule on the left, small stepped index cards behind beat text (2px solid border, offset shadow), static paper grain (feTurbulence opacity 0.04)',
    kickerStyle: 'small caps section label with thick 4px accent underline bar',
    accentWords: 1,
    beatCss: 'font-size 92px weight 800, line-height 1.14, accent word boxed with 3px accent underline',
    rules: 'Confident editorial magazine energy. Flat inks, hard offsets, generous margins. Light background — all text dark ink. Accent used sparingly like a highlighter.',
  },
  cinematic: {
    label: 'Cinematic Trailer',
    fonts: "family=Anton&family=Inter:wght@400;500;600",
    fontStack: "'Anton', 'Arial Black', sans-serif",
    uiStack: "'Inter', sans-serif",
    palette: { bg: '#0b1013', bgGlow: 'rgba(255,178,122,0.09)', text: '#f5f2ec', accent: '#ffb27a', subtle: 'rgba(245,242,236,0.5)' },
    motion: { ease: 'expo.out', wordStagger: 0.08, riseY: 60, wordDur: 0.7 },
    texture: 'teal-orange grade: deep teal base with warm top-left glow, heavy soft vignette, letterbox bars top+bottom (6% height, pure black), slow zoom drift on the whole stage (scale 1.0 -> 1.04 over full duration), static grain opacity 0.07',
    kickerStyle: 'centered uppercase 0.5em letterspaced tiny label between two 1px rules',
    accentWords: 1,
    beatCss: 'font-size 120px Anton uppercase, line-height 1.05, tight letter-spacing, centered block',
    rules: 'Movie-trailer gravity. Everything centered, huge, slow. Words land like title cards. Accent color only on the single most important word per beat.',
  },
};

export function dnaPrompt(name) {
  const d = DNAS[name];
  if (!d) throw new Error(`unknown dna: ${name} (have: ${Object.keys(DNAS).join(', ')})`);
  return [
    `STYLE DNA — ${d.label} (hard constraints, do not deviate):`,
    `- Google Fonts link: https://fonts.googleapis.com/css2?${d.fonts}&display=swap`,
    `- Palette: bg ${d.palette.bg}, main text ${d.palette.text}, accent ${d.palette.accent} (use on ${d.accentWords} emphasis word(s) per beat), secondary text ${d.palette.subtle}`,
    `- Texture: ${d.texture}`,
    `- Kicker/label treatment: ${d.kickerStyle}`,
    `- Beat text treatment: ${d.beatCss}`,
    `- Motion: entrance ease ${d.motion.ease}, word stagger ${d.motion.wordStagger}s, rise distance ${d.motion.riseY}px, word duration ${d.motion.wordDur}s`,
    `- Feel rules: ${d.rules}`,
  ].join('\n');
}

// ---------- Genre packs: STRUCTURE rules (DNA owns the look, genre owns the shape) ----------
export const GENRES = {
  documentary: {
    name: 'Documentary',
    prompt: 'STRUCTURE — documentary narrative: hook → escalating reveals → payoff. Beats flow as one story; tension rises to the last beat.',
  },
  listicle: {
    name: 'Listicle',
    prompt: 'STRUCTURE — ranked list: the design MUST show a big index number card (1, 2, 3…) synced to each beat\'s start, with the item text beside or below it. Number styling is a first-class design element.',
  },
  tutorial: {
    name: 'Tutorial',
    prompt: 'STRUCTURE — step-by-step teaching: each beat = one visible STEP (label "STEP 1", "STEP 2"… plus progress dots showing position in the total). Final beat shows the result/payoff.',
  },
  news: {
    name: 'News Recap',
    prompt: 'STRUCTURE — newsroom recap: first beat gets a date/BREAKING stamp treatment; each following beat is one headline card. Factual tone, present tense, tight layout.',
  },
  fun: {
    name: 'Fun / Social',
    prompt: 'STRUCTURE — fast entertainment: short punchy beats, comedic rhythm, exaggerated motion personality (snappier eases, bounce on landings). Captions carry the joke.',
  },
};

export function genrePrompt(name) {
  const g = GENRES[name];
  return g ? g.prompt : GENRES.documentary.prompt;
}
