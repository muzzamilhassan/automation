// Pexels PHOTO fetcher (photos, not videos) for sidebar/split layouts.
// Resilient: returns null on any failure.
import fs from "node:fs";
import { fetchBuffer } from "../lib/fetch-safe.mjs";
import path from "node:path";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// P5 premium curation (owner directive 2026-11-05: "premium, attractive,
// related, different every time"): landscape, >=1080p, highest resolution
// wins, dark scenes get a small contrast bonus (the left gradient + white
// text), and the pick varies within the top-3 so every video differs.
export function pickPremium(photos, count = 8) {
  const pool = (photos || []).slice(0, count);
  const usable = pool.filter((p) => p.width > p.height && (p.width || 0) >= 1080);
  const list = (usable.length ? usable : pool).filter((p) => p.src?.large2x || p.src?.large || p.src?.original);
  if (!list.length) return null;
  const lum = (hex) => { const n = parseInt(String(hex || '#808080').replace('#', ''), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  const ranked = [...list].sort((a, b) => {
    const sa = (a.width || 0) * (a.height || 0) + (lum(a.avg_color) < 0.55 ? 2e6 : 0);
    const sb = (b.width || 0) * (b.height || 0) + (lum(b.avg_color) < 0.55 ? 2e6 : 0);
    return sb - sa;
  });
  const top = ranked.slice(0, 3);
  return top[Math.floor(Math.random() * top.length)];
}

export async function fetchPhoto({ key, query, outPath, orientation = "landscape" }) {
  try {
    if (!key) throw new Error("no PEXELS_API_KEY");
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12&orientation=${orientation}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(url, { headers: { Authorization: key, "User-Agent": UA }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const photos = d.photos || [];
    if (!photos.length) throw new Error("no results");
    const pick = pickPremium(photos);
    const src = pick.src?.large2x || pick.src?.large || pick.src?.original;
    if (!src) throw new Error("no src");

    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 30 * 1024) {
      return { file: path.resolve(outPath), width: pick.width, height: pick.height };
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const c2 = new AbortController();
    // #65: deadline covers the body transfer
    const { buf } = await fetchBuffer(src, { timeoutMs: 60000, headers: { "User-Agent": UA } });
    fs.writeFileSync(outPath, buf);
    return { file: path.resolve(outPath), width: pick.width, height: pick.height };
  } catch (e) {
    console.warn(`  [photo] SKIP (${query}): ${String(e.message).slice(0, 80)}`);
    return null;
  }
}

// Pixabay photo fallback (Pexels intermittently 401s from datacenter IPs)
export async function fetchPhotoPixabay({ key, query, outPath, orientation = "landscape" }) {
  try {
    if (!key) throw new Error("no PIXABAY_API_KEY");
    const url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&image_type=photo&orientation=${orientation}&per_page=10&safesearch=true`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const hits = d.hits || [];
    if (!hits.length) throw new Error("no results");
    const pick = hits[Math.floor(Math.random() * Math.min(hits.length, 6))];
    const src = pick.largeImageURL || pick.webformatURL;
    if (!src) throw new Error("no src");
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 30 * 1024) {
      return { file: path.resolve(outPath), width: pick.imageWidth, height: pick.imageHeight };
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const c2 = new AbortController();
    // #65: deadline covers the body transfer
    const { buf } = await fetchBuffer(src, { timeoutMs: 60000, headers: { "User-Agent": UA } });
    fs.writeFileSync(outPath, buf);
    return { file: path.resolve(outPath), width: pick.imageWidth, height: pick.imageHeight };
  } catch (e) {
    console.warn(`  [photo-pix] SKIP (${query}): ${String(e.message).slice(0, 80)}`);
    return null;
  }
}
