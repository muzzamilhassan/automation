// music-engine.mjs — picks a DIFFERENT track for every reel from Kevin
// MacLeod's full incompetech catalog (1,442 tracks; ~715 pass the
// motivational feel-whitelist). Downloads only what it uses into
// .music-cache/ (gitignored), returns the attribution line automatically
// (CC BY 4.0 requires credit).
//
// Fallback: callers keep their local MUSIC_PRESETS if this returns null.
import fs from 'node:fs';
import https from 'node:https';

const CACHE_DIR = '.music-cache';
const CATALOG_URL = 'https://incompetech.com/music/royalty-free/pieces.json';
const MP3_BASE = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/';

const GOOD_FEELS = ['epic', 'uplifting', 'driving', 'action', 'bright', 'grooving', 'calming', 'heroic', 'inspir', 'mystical'];
const BAD_FEELS = ['dark', 'somber', 'sad', 'horror', 'tense', 'eerie', 'scary', 'ominous', 'creepy'];

function httpsGet(url, maxBytes = 60 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) {
          req.destroy();
          return reject(new Error('response too large'));
        }
        chunks.push(c);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.setTimeout(45000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

const CATALOG_CACHE = `${CACHE_DIR}/pieces.json`;

function loadCatalog() {
  try {
    const age = Date.now() - fs.statSync(CATALOG_CACHE).mtimeMs;
    if (age < 7 * 24 * 3600 * 1000) return JSON.parse(fs.readFileSync(CATALOG_CACHE, 'utf8'));
  } catch { }
  return null;
}

async function getCatalog() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  let catalog = loadCatalog();
  if (!catalog) {
    const buf = await httpsGet(CATALOG_URL);
    catalog = JSON.parse(buf.toString('utf8'));
    fs.writeFileSync(CATALOG_CACHE, buf);
  }
  return catalog.filter((t) => {
    const feel = (t.feel || '').toLowerCase();
    if (!t.filename || !t.filename.endsWith('.mp3')) return false;
    return GOOD_FEELS.some((g) => feel.includes(g)) && !BAD_FEELS.some((b) => feel.includes(b));
  });
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/**
 * Picks a random whitelisted track (never the same as the last one used)
 * and downloads it into the cache if needed.
 * @returns {null|{file:string, title:string, credit:string, feel:string}}
 */
export async function pickMusicTrack(pageIndex = 0) {
  try {
    const pool = await getCatalog();
    if (!pool.length) return null;

    // seeded by time so every reel gets a different track
    let idx = Math.floor(Math.random() * pool.length);
    let track = pool[idx];
    const lastFile = `${CACHE_DIR}/last-used.json`;
    try {
      const last = JSON.parse(fs.readFileSync(lastFile, 'utf8'));
      if (last.title === track.title && pool.length > 1) {
        idx = (idx + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
        track = pool[idx];
      }
    } catch { }

    const slug = slugify(track.title) || `track-${track.uuid}`;
    const file = `${CACHE_DIR}/inc-${slug}.mp3`;
    if (!fs.existsSync(file) || fs.statSync(file).size < 300000) {
      const url = MP3_BASE + encodeURIComponent(track.filename);
      let buf = null;
      for (let attempt = 1; attempt <= 3 && !buf; attempt++) {
        try {
          buf = await httpsGet(url);
        } catch (e) {
          console.warn(`      [music] download attempt ${attempt} failed: ${e.message}`);
          await new Promise((r) => setTimeout(r, 2500 * attempt));
        }
      }
      if (!buf) return null;
      fs.writeFileSync(file, buf);
    }

    const info = {
      file,
      title: String(track.title || slug).trim(),
      feel: track.feel || '',
      credit: `"${String(track.title).trim()}" by Kevin MacLeod (incompetech.com), Licensed under CC BY 4.0`,
    };
    fs.writeFileSync(lastFile, JSON.stringify({ title: info.title, at: Date.now(), pageIndex }));
    return info;
  } catch (e) {
    console.warn('      [music] engine failed: ' + e.message);
    return null;
  }
}
