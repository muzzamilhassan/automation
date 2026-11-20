// Live fix wave A2 (2026-11-20 live test) — editing an EXISTING channel in
// the Add Channel wizard. Pure (relative imports only) so node --test pins it:
// tests/edit-prefill.test.mjs. Spec + QA: docs/qa/live-fix-wave-a2-qa.md.
//
//   engineFormValues   — T4-02: pre-fill the form with what the ENGINE runs
//                        on, in lib/brand-resolve.mjs order (registry entry →
//                        registry kit → legacy brand kit → wizard default).
//                        The engine merge can't be imported here (Studio
//                        deploys without the repo root), so the test
//                        cross-checks every field against the real merge.
//   editPayload        — T4-02: an edit sends only the fields that changed;
//                        a field emptied on purpose goes out with `clear`.
//   protectFilledFields— T4-02 (server): an empty value never wipes a filled
//                        one unless the client listed it in `clear`.
//   channelKeyStatus   — T4-18: legacy keys live as YT_TOKEN_<SLUG> GitHub
//                        secrets, so a saved key with no recorded name is
//                        healthy; a degraded registry read is "unknown".
import { EMPTY_FORM, keyStatus } from './wizard-steps.mjs';

const has = (v) => (Array.isArray(v) ? v.some((x) => String(x ?? '').trim() !== '') : String(v ?? '').trim() !== '');
const list = (v) => (Array.isArray(v) && v.length ? v : null);

// lib/brand-resolve.mjs relabelEyebrow: the hand-written phrase + the
// CURRENT channel name (a legacy kit can predate a rename).
function relabelEyebrow(eyebrow, label) {
  if (!eyebrow || !label) return eyebrow || '';
  return `${String(eyebrow).split(' // ')[0]} // ${String(label).toUpperCase()}`;
}

// entry = the registry row (/api/channels/profile), legacy = the static
// brand kit for the slug (studio/lib/brands.json) or null.
export function engineFormValues(entry = {}, legacy = null) {
  const e = entry || {};
  const kit = e.kit || {};
  const lg = legacy || null;
  const label = e.label || lg?.label || '';
  const niche = e.niche || kit.theme || lg?.niche || '';
  // registryToKit + mergeBrand: kit pillars win unless they are just the
  // niche itself, then the legacy kit's; none = research uses the niche.
  const kitNiches = list(kit.niches);
  const niches = kitNiches ? (lg && kitNiches[0] === niche ? list(lg.niches) || kitNiches : kitNiches) : list(lg?.niches) || [];
  const slots = list(e.slots) || list(kit.slots) || list(lg?.slots);
  const tags = list(kit.tags) || lg?.tags;
  return {
    label,
    niche,
    subNiches: niches.join(', '),
    style: e.style || lg?.style || EMPTY_FORM.style,
    voice: e.voice || kit.voice || lg?.voice || EMPTY_FORM.voice,
    accent: e.accent || lg?.accent || EMPTY_FORM.accent,
    slots: slots ? slots.join(', ') : EMPTY_FORM.slots,
    docDay: e.docDay || kit.docDay || lg?.docDay || EMPTY_FORM.docDay,
    eyebrow: kit.eyebrow || relabelEyebrow(lg?.eyebrow, label || lg?.label),
    tagline: kit.tagline || lg?.tagline || '',
    // YouTube's own keywords are shown as stored; the engine splits them
    tags: list(tags) ? tags.join(', ') : (e.ytKeywords || ''),
    description: kit.description || e.ytDescription || lg?.description || '',
  };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const CLEAR_NAME = { subNiches: 'niches' };

// full / base = the same profile body built from the current form and from
// the form as it was loaded. Returns the body to POST.
export function editPayload(full = {}, base = {}) {
  const out = { slug: full.slug };
  const clear = new Set();
  const note = (k, now, was) => { if (!has(now) && has(was)) clear.add(CLEAR_NAME[k] || k); };
  for (const [k, v] of Object.entries(full)) {
    if (k === 'slug' || k === 'kit' || k === 'destinations') continue;
    if (same(v, base?.[k])) continue;
    out[k] = v;
    note(k, v, base?.[k]);
  }
  const kit = {};
  for (const [k, v] of Object.entries(full.kit || {})) {
    if (same(v, base?.kit?.[k])) continue;
    kit[k] = v;
    note(k, v, base?.kit?.[k]);
  }
  if (Object.keys(kit).length) out.kit = kit;
  if (full.destinations && !same(full.destinations, base?.destinations)) out.destinations = full.destinations;
  if (clear.size) out.clear = [...clear];
  return out;
}

// Server side of the same rule. entry = the channel as stored now.
export function protectFilledFields(body = {}, entry = {}) {
  const clear = new Set(Array.isArray(body?.clear) ? body.clear.map(String) : []);
  const kit = entry?.kit || {};
  const out = { ...body };
  const kept = new Set();
  // true = the sent value is empty, the stored one isn't, and no clear was asked
  const blocks = (value, stored, name) => !has(value) && has(stored) && !clear.has(name);
  const slotList = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (out.slots != null && blocks(slotList(out.slots), [...(entry?.slots || []), ...(kit.slots || [])], 'slots')) {
    delete out.slots;
    kept.add('slots');
  }
  if (out.niche != null && blocks(out.niche, entry?.niche, 'niche')) {
    delete out.niche;
    kept.add('niche');
  }
  if (out.subNiches != null) {
    const subs = Array.isArray(out.subNiches) ? out.subNiches : String(out.subNiches).split(',');
    if (blocks(subs, kit.niches, 'niches')) {
      delete out.subNiches;
      kept.add('niches');
    }
  }
  if (out.kit && typeof out.kit === 'object' && !Array.isArray(out.kit)) {
    const k = { ...out.kit };
    for (const name of ['tags', 'description', 'eyebrow', 'tagline', 'niches']) {
      if (!(name in k) || k[name] == null) continue;
      if (blocks(k[name], kit[name], name)) {
        delete k[name];
        kept.add(name);
      }
    }
    out.kit = k;
  }
  return { body: out, kept: [...kept] };
}

/* -------------------------------- key status ------------------------------- */

// The oauth callback's naming rule (YT_TOKEN_<SLUG>, dashes → underscores).
export function secretNameFor(slug) {
  return slug ? `YT_TOKEN_${String(slug).toUpperCase().replace(/-/g, '_')}` : '';
}

export function channelKeyStatus(entry) {
  if (entry?.tokenSecretSaved === true) {
    return keyStatus({ ...entry, tokenSecret: String(entry.tokenSecret || '').trim() || secretNameFor(entry.slug) });
  }
  if (entry?.overlayDegraded) {
    return { tone: 'info', label: 'status unknown', secret: '', detail: "Couldn't check the key just now. Nothing was changed. Try again in a minute." };
  }
  return keyStatus(entry);
}

// reviewSummary (wizard-steps.mjs) builds its "Key" row from the raw entry;
// this swaps in the honest status above.
export function withReviewKeyRow(sections, entry) {
  if (!entry || !Array.isArray(sections)) return sections;
  const k = channelKeyStatus(entry);
  const value = k.secret ? `${k.label} · ${k.secret}` : k.label;
  return sections.map((s) => (s.step === 'connect' ? { ...s, rows: s.rows.map(([l, v]) => (l === 'Key' ? ['Key', value] : [l, v])) } : s));
}
