// A number on screen must be in the narration (docs/qa/facts-first-qa.md F7). The
// visual planner is an LLM: the 2026-11-25 test video showed "$1", "2,000,000 kWh"
// and "$10mo" that nobody said. Pure.

const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { hundred: 1e2, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
const SHORT = { k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9, t: 1e12, tn: 1e12 };
const round = (n) => Number(n.toPrecision(12));

/** Every number value in a text, written ("$1.5 million", "415", "100,000", "2M") or spelled out. */
export function numbersIn(text) {
  const out = new Set();
  const t = String(text ?? '').toLowerCase().replace(/[’‘]/g, "'");
  for (const m of t.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(hundred|thousand|million|billion|trillion|[kmbt]n?\b)?/g)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    out.add(round(n));
    const scale = m[2] ? SCALES[m[2]] || SHORT[m[2]] : null;
    if (scale) out.add(round(n * scale));
  }
  // spelled out: runs of number words
  const toks = t.replace(/-/g, ' ').split(/[^a-z']+/).filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    if (!(toks[i] in UNITS) && !(toks[i] in TENS) && !(toks[i] === 'a' && toks[i + 1] in SCALES)) continue;
    let total = 0;
    let cur = 0;
    const parts = []; // "twenty thirty" = 2030, "nineteen eighty four" = 1984
    let j = i;
    let point = null;
    for (; j < toks.length; j++) {
      const w = toks[j];
      if (w === 'point' && toks[j + 1] in UNITS && point === null) { point = ''; continue; }
      if (point !== null) { if (w in UNITS && UNITS[w] < 10) { point += UNITS[w]; continue; } break; }
      if (w in UNITS || w in TENS) {
        const v = w in UNITS ? UNITS[w] : TENS[w];
        if (cur && !(cur % 100 === 0 && v < 100) && !(cur % 10 === 0 && cur % 100 >= 20 && v < 10)) { parts.push(cur); cur = v; } else cur += v;
      } else if (w === 'a' && toks[j + 1] in SCALES) cur = 1;
      else if (w in SCALES) { if (w === 'hundred') cur = (cur || 1) * 100; else { total += (cur || 1) * SCALES[w]; cur = 0; } }
      else if (w === 'and' && j > i && (toks[j + 1] in UNITS || toks[j + 1] in TENS)) continue;
      else if (w === 'and' && toks[j + 1] === 'a' && toks[j + 2] === 'half') { cur += 0.5; j += 2; }
      else break;
    }
    const whole = total + cur;
    out.add(round(point ? Number(`${whole}.${point}`) : whole));
    if (parts.length === 1 && parts[0] >= 10 && parts[0] <= 99 && cur <= 99) out.add(parts[0] * 100 + cur);
    parts.forEach((p) => out.add(p));
    i = Math.max(i, j - 1);
  }
  return out;
}

/** What the narration says: every number, and which of them are money / percentages. */
export function saidNumbers(text) {
  const t = String(text ?? '').toLowerCase();
  const collect = (re) => new Set([...t.matchAll(re)].flatMap((m) => [...numbersIn(m[0])]));
  const numberWords = [...Object.keys(UNITS), ...Object.keys(TENS), ...Object.keys(SCALES), 'and', 'a', 'half', 'point'].join('|');
  const spelled = `(?:(?:${numberWords})[ -]){1,10}`;
  return {
    all: numbersIn(t),
    money: new Set([
      ...collect(/[$€£]\s?\d[\d,.]*(?:\s*(?:hundred|thousand|million|billion|trillion|[kmbt]n?\b))?/g),
      ...collect(/\d[\d,.]*(?:\s*(?:hundred|thousand|million|billion|trillion))?[ -](?:dollars?|bucks|cents|euros?|pounds?)/g),
      ...collect(new RegExp(`${spelled}(?:dollars?|bucks|cents|euros?|pounds?)`, 'g')),
    ]),
    percent: new Set([
      ...collect(/\d[\d,.]*\s?(?:%|percent|per cent)/g),
      ...collect(new RegExp(`${spelled}(?:percent|per cent)`, 'g')),
    ]),
  };
}

/** Is every number in `shown` said in the narration, as the same kind of thing? (0 alone is a neutral start.) */
export function numbersSaid(shown, said) {
  const text = String(shown ?? '').toLowerCase();
  const kinds = said instanceof Set ? { all: said, money: said, percent: said } : said;
  const pool = /[$€£]/.test(text) ? kinds.money : /%|percent/.test(text) ? kinds.percent : kinds.all;
  // "2M" reads as 2 and as 2,000,000: the value that is shown is the scaled one
  const strict = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(hundred|thousand|million|billion|trillion|[kmbt]n?\b)?/g)]
    .map((m) => Number(m[1].replace(/,/g, '')) * (m[2] ? SCALES[m[2]] || SHORT[m[2]] : 1)).filter(Number.isFinite).map(round);
  const need = strict.length ? strict : [...numbersIn(text)];
  return need.every((n) => n === 0 || pool.has(n));
}

const TEXT_FIELDS = ['text', 'label', 'title'];
const FREE_SUFFIX = new Set(['', 'k', 'm', 'b', 't', 'bn', 'mn', 'tn', 'x', 's']);

/** A counter's unit must be a word of the narration too ("2,000,000 kWh" about homes is wrong). */
function unitSaid(unit, text) {
  const u = String(unit ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (FREE_SUFFIX.has(u)) return true;
  const t = String(text).toLowerCase();
  return t.includes(u) || t.includes(u.replace(/s$/, ''));
}

/**
 * Drop everything on screen that shows a number nobody said. Never invents.
 * @param {object} scene assembled scene (nodes / lines[].cues)
 * @param {string} narration the whole script's words
 */
export function groundScene(scene, narration) {
  const said = saidNumbers(narration);
  const s = structuredClone(scene);
  const fixes = [];
  const sceneText = (s.lines || []).map((l) => l.say).join(' ');
  for (const n of s.nodes || []) {
    if (n.value !== undefined && !numbersSaid(n.value, said)) { fixes.push(`removed unsaid value "${n.value}" on ${n.id}`); delete n.value; }
    if (/\d/.test(n.label || '') && !numbersSaid(n.label, said)) {
      const plain = String(n.label).replace(/[~$€£]?\d[\d,.]*(?:%|[a-z]{1,4}\b)?/gi, '').replace(/\s+/g, ' ').trim();
      fixes.push(`removed unsaid number from label "${n.label}"`);
      n.label = plain || n.kind || 'Item';
    }
  }
  for (const ln of s.lines || []) {
    ln.cues = (ln.cues || []).filter((c) => {
      const bad = c.do === 'counter'
        ? !numbersSaid(`${c.prefix || ''}${c.to}${/%/.test(c.suffix || '') ? '%' : ''}`, said) || !numbersSaid(String(c.from ?? 0), said) || !unitSaid(c.suffix, sceneText)
        : TEXT_FIELDS.some((k) => typeof c[k] === 'string' && /\d/.test(c[k]) && !numbersSaid(c[k], said))
          || (Array.isArray(c.lines) && c.lines.some((x) => /\d/.test(String(x)) && !numbersSaid(x, said)));
      if (bad) fixes.push(`removed unsaid number in ${c.do} (${c.to ?? c.text ?? c.label ?? c.title ?? ''}${c.suffix || ''})`);
      return !bad;
    });
  }
  return { scene: s, fixes };
}
