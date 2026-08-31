import fs from 'node:fs';
import path from 'node:path';
import { exportPoster, validateSvg } from './typography-poster-engine.mjs';

const envStr = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const GEMINI_API_KEY = envStr.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();

export const MASTER_PROMPT_TEMPLATE = `You are a senior graphic designer who outputs finished poster designs as raw SVG code.

## OUTPUT CONTRACT — violating any of these is a failure
1. Output ONLY raw SVG. No markdown code fences, no \`\`\` , no explanation, no preamble.
2. First characters must be exactly: <svg xmlns="http://www.w3.org/2000/svg"
3. Canvas is fixed: width="1080" height="1350" viewBox="0 0 1080 1350"
4. First child element must be a full-bleed background rect:
   <rect width="1080" height="1350" fill="{BG_COLOR}"/>
5. NEVER use <foreignObject>. It does not render in SVG->PNG converters.
6. SVG <text> does NOT wrap. Every line of copy must be its own <text> element
   with its own explicit x and y. Never rely on automatic wrapping.
7. All text must be live <text> elements. Never convert type to <path>.
8. No gradients, no filters, no blur, no drop-shadow, no <image> tags.
9. Use only flat fills and solid strokes.
10. Close every tag. Output must be valid parseable XML ending with </svg>.

## CANVAS GEOMETRY (1080 x 1350, 4:5 social ratio)
- Left margin:   x = 100  (all left-aligned text starts here)
- Right margin:  content must not exceed x = 980
- Top safe zone: y = 120
- Bottom safe:   y = 1230
- Optical centre for a text block: first baseline around y = 420-480,
  never vertically dead-centre — sit the block slightly high.

## TYPE SCALE (use these exact sizes, do not invent others)
- EYEBROW / kicker ....... font-size 30, letter-spacing 6, uppercase
- HEADLINE (display) ..... font-size 120  (drop to 104 if line exceeds 14 chars)
- SUBHEAD / body ......... font-size 60   (drop to 52 if line exceeds 26 chars)
- ACCENT / pull line ..... font-size 56
- FOOTER / handle ........ font-size 26, letter-spacing 3

## LINE HEIGHT
- Display headline: baseline step = font-size x 0.98  (tight, lines nearly touch)
- Body copy:        baseline step = font-size x 1.42
Compute each y explicitly. Example: body at 60px starting y=600 ->
next lines at y=685, 770, 855.

## CHARACTER WIDTH BUDGET (prevents overflow — check before writing each line)
Approximate rendered width = characters x font-size x factor:
- Anton / Oswald 700 (condensed)  factor 0.46
- Archivo Black / Inter 900        factor 0.62
- Playfair Display 900             factor 0.58
- Playfair Display 400             factor 0.48
Rule: (chars x font-size x factor) must be < 880. If not, break the line earlier
or step the font-size down one level.

## FONT PAIRINGS — pick ONE, use its exact family strings
A. EDITORIAL SERIF
   Headline: font-family="'Playfair Display', 'Bodoni MT', Georgia, serif" font-weight="900"
   Body:     font-family="'Playfair Display', Georgia, serif" font-weight="400"
   Emphasis: same family, font-style="italic"

B. BOLD IMPACT
   Headline: font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="120"
   Body:     font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="500"
   Emphasis: colour swap only

C. CONDENSED MINIMAL
   Headline: font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="700" letter-spacing="2"
   Body:     font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="200"
   Emphasis: weight contrast (200 vs 700)

D. MODERN GROTESQUE
   Headline: font-family="'Archivo Black', 'Arial Black', sans-serif" font-weight="400"
   Body:     font-family="'Inter', 'Segoe UI', Arial, sans-serif" font-weight="400"
   Emphasis: colour swap

## COLOUR PALETTES — pick ONE, use these exact hex values
P1 CREAM EDITORIAL   bg #F5F1E8  ink #141414  accent #C8202D  highlight #F2E24B
P2 MIDNIGHT          bg #0A0A0A  ink #FFFFFF  accent #FF8A1E  muted #7A7A7A
P3 PAPER ELECTRIC    bg #F7F3EC  ink #111111  accent #1A56E8  muted #6B6B6B
P4 SIGNAL ORANGE     bg #E8541F  ink #FFFFFF  accent #141414  muted #FFD9C7
P5 CARBON YELLOW     bg #0D0D0D  ink #FFFFFF  accent #F5E31C  muted #6E6E6E
P6 SAGE CALM         bg #6B7F63  ink #F2EFE6  accent #E8C547  muted #A8B5A0

Rules: exactly ONE accent colour per poster. Accent appears on 1-2 words maximum.
Body copy is always ink colour, never accent.

## EMPHASIS MECHANICS — choose exactly ONE per poster
E1 COLOUR SWAP    One key word in accent colour, rest in ink.
E2 HIGHLIGHTER    <rect> in highlight colour placed BEFORE the <text> in source
                  order. Rect: x = textX - 14, y = baselineY - fontSize*0.78,
                  height = fontSize*1.16, width = estimated text width + 28.
E3 UNDERLINE      <line> under one word. y = baseline + 14,
                  stroke-width 4, stroke = accent.
E4 ITALIC LIFT    Emphasis word in font-style="italic" (serif pairings only).
E5 WEIGHT DROP    Emphasis word at heavier weight, surrounding words lighter.
Never combine more than two of these in one poster.

## GRAPHIC ACCENT — optional, maximum ONE
Only pure geometry built from <path>, <line>, <circle>, <rect>, <polygon>.
Approved accents:
- Jagged vertical crack line down the right third
- Single thick rule (stroke-width 6) under the headline block
- A cluster of 3-7 small circles r="6" in accent colour
- One large outlined circle r="180" fill="none" stroke-width="3" behind the type
- A short diagonal chevron pair in the lower right
Never draw people, objects, hands, lightbulbs, animals or scenery.

## LAYOUT ARCHETYPES — pick ONE
L1 STACKED LEFT     Everything left-aligned at x=100. Headline top, body below, accent line last.
L2 CENTRED BLOCK    text-anchor="middle" x="540" for all lines. Formal, calm.
L3 SPLIT WEIGHT     Headline occupies top 45%, large empty gap, body sits low starting y=980.
L4 EYEBROW LEAD     Small uppercase eyebrow at y=200, headline from y=380, body from y=760.

## INPUT
Copy:           {COPY}
Palette:        {PALETTE}
Pairing:        {PAIRING}
Layout:         {LAYOUT}
Emphasis:       {EMPHASIS}
Emphasis word:  {EMPHASIS_WORD}
Graphic accent: {ACCENT}
Footer:         {FOOTER}

Output the raw SVG now.`;

export async function callGemini(messages) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not defined in .env');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
  
  const contents = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }]
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API Error (${res.status}): ${errText}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const textPart = parts.find(p => p.text && !p.thought) || parts[parts.length - 1];
  return textPart?.text || '';
}

function cleanSvgOutput(raw) {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:svg|xml)?/i, '').replace(/```$/i, '').trim();
  const startIdx = cleaned.indexOf('<svg');
  const endIdx = cleaned.lastIndexOf('</svg>');
  if (startIdx !== -1 && endIdx !== -1) {
    cleaned = cleaned.substring(startIdx, endIdx + 6);
  }
  return cleaned;
}

export async function generateAIPoster(options, outName = 'ai-poster', maxRetries = 2) {
  let prompt = MASTER_PROMPT_TEMPLATE
    .replace('{COPY}', options.copy || 'Small habits make big changes.')
    .replace('{PALETTE}', options.palette || 'P3 PAPER ELECTRIC')
    .replace('{PAIRING}', options.pairing || 'B. BOLD IMPACT')
    .replace('{LAYOUT}', options.layout || 'L1 STACKED LEFT')
    .replace('{EMPHASIS}', options.emphasis || 'E1 COLOUR SWAP')
    .replace('{EMPHASIS_WORD}', options.emphasisWord || 'BIG')
    .replace('{ACCENT}', options.accent || 'jagged vertical crack line down the right third')
    .replace('{FOOTER}', options.footer || 'quotequarry.io');

  const messages = [{ role: 'user', text: prompt }];

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    console.log(`[AI Poster] Generation Attempt ${attempt}...`);
    try {
      const rawOutput = await callGemini(messages);
      const cleanedSvg = cleanSvgOutput(rawOutput);
      validateSvg(cleanedSvg);

      console.log(`[AI Poster] ✓ Output validated (${cleanedSvg.length} bytes). Exporting to PNG/JPG...`);
      const result = await exportPoster(cleanedSvg, outName);
      console.log(`[AI Poster] ✓ Saved ${result.pngPath}`);
      return result;
    } catch (err) {
      console.warn(`[AI Poster] Attempt ${attempt} failed validation: ${err.message}`);
      if (attempt <= maxRetries) {
        messages.push({ role: 'model', text: 'Error in output' });
        messages.push({
          role: 'user',
          text: `Your previous output was invalid: ${err.message}. Output ONLY the fully closed, valid raw <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"> without markdown fences.`
        });
      } else {
        throw err;
      }
    }
  }
}

async function run() {
  await generateAIPoster({
    copy: 'Work hard in silence. Let your success make all the noise.',
    palette: 'P2 MIDNIGHT',
    pairing: 'B. BOLD IMPACT',
    layout: 'L1 STACKED LEFT',
    emphasis: 'E1 COLOUR SWAP',
    emphasisWord: 'silence',
    accent: 'a cluster of 4 small circles in accent colour',
    footer: 'quotequarry.io'
  }, 'demo-ai-generated-poster');
}

run().catch(console.error);
