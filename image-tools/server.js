const http = require("http");
const sharp = require("sharp");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const PORT = 3210;
const IMG_DIR = process.env.IMG_DIR || (fs.existsSync("/app/img") ? "/app/img" : path.join(__dirname, "img"));
try { fs.mkdirSync(IMG_DIR, { recursive: true }); } catch (_) {}
// keep the served fitted images bounded (last 60)
function pruneImages() {
  try {
    const files = fs.readdirSync(IMG_DIR).map(f => ({ f, t: fs.statSync(path.join(IMG_DIR, f)).mtime.getTime() })).sort((a, b) => b.t - a.t);
    for (const x of files.slice(60)) fs.unlinkSync(path.join(IMG_DIR, x.f));
  } catch (_) {}
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Parse a multipart body into {fields: {...}, files: [{name, buf}]}
function parseMultipart(body, ctype) {
  const out = { fields: {}, files: [] };
  if (!ctype.includes("multipart/form-data")) return out;
  const boundary = Buffer.from("--" + ctype.split("boundary=")[1].split(";")[0]);
  const parts = [];
  let idx = body.indexOf(boundary);
  while (idx !== -1) {
    const next = body.indexOf(boundary, idx + boundary.length);
    if (next === -1) break;
    parts.push(body.subarray(idx + boundary.length, next));
    idx = next;
  }
  for (const p of parts) {
    const headerEnd = p.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const header = p.subarray(0, headerEnd).toString();
    const data = p.subarray(headerEnd + 4, p.length - 2);
    const nameM = header.match(/name="([^"]+)"/);
    const fileM = header.match(/filename="([^"]*)"/);
    if (!nameM) continue;
    if (fileM) out.files.push({ name: nameM[1], buf: data });
    else out.fields[nameM[1]] = data.toString().trim();
  }
  return out;
}

// Wrap title into lines of ~14 chars at 2-3 words per line
function wrapTitle(title) {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= 14) cur = (cur + " " + w).trim();
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function buildOverlaySvg(width, height, title) {
  const lines = wrapTitle(title);
  const fontSize = Math.round(width / (lines.length > 2 ? 9 : 8));
  const lineHeight = Math.round(fontSize * 1.15);
  const blockH = lines.length * lineHeight;
  const startY = Math.round(height * 0.06);
  const texts = lines.map((l, i) =>
    `    <text x="50%" y="${startY + fontSize + i * lineHeight}" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, sans-serif" font-weight="900" font-size="${fontSize}" fill="#ffffff" stroke="#0a1220" stroke-width="${Math.round(fontSize / 18)}" paint-order="stroke" letter-spacing="1">${esc(l.toUpperCase())}</text>`
  ).join("\n");
  const barY = startY + blockH + Math.round(fontSize * 0.35);
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#060b16" stop-opacity="0.82"/>
      <stop offset="60%" stop-color="#060b16" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#060b16" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00e5ff"/>
      <stop offset="100%" stop-color="#ff9d2e"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${Math.round(height * 0.45)}" fill="url(#scrim)"/>
${texts}
  <rect x="50%" width="0" y="${barY}" height="6" fill="none"/>
  <rect x="${Math.round(width * 0.5 - 90)}" y="${barY}" width="180" height="7" rx="3.5" fill="url(#bar)"/>
</svg>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  // GET /tiktok<token>.txt — TikTok URL-prefix verification signature (token derived from filename; any path depth)
  if (req.method === "GET") {
    const m = url.pathname.match(/(^|\/)tiktok([a-zA-Z0-9]+)\.txt$/);
    if (m) {
      const sig = "tiktok-developers-site-verification=" + m[2];
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": Buffer.byteLength(sig) });
      res.end(sig);
      return;
    }
  }

  // GET /tos and /privacy — public policy pages for the TikTok app URL verification
  if (req.method === "GET" && (url.pathname === "/tos" || url.pathname === "/privacy")) {
    const tos = url.pathname === "/tos";
    const title = tos ? "Terms of Service" : "Privacy Policy";
    const body = tos
      ? "<h1>Terms of Service</h1><p>This application is a self-hosted social media scheduler (Postiz) that cross-posts original motivational quote videos, created by our own content pipeline, to the connected TikTok account as drafts. By connecting an account you confirm you control it. Content is scheduled at most a few times per day, consists solely of original media produced by us, and no third-party data is collected. The service is provided as-is, without warranty. Contact: muzzamilhassan302@gmail.com</p>"
      : "<h1>Privacy Policy</h1><p>This application stores only the OAuth tokens of the connected TikTok account, locally on the operator's own server, to publish drafts on their behalf. We do not collect, share, or sell any personal data. Videos posted are original creations of the operator. Account data can be disconnected and erased at any time by removing the channel in the scheduler settings. Contact: muzzamilhassan302@gmail.com</p>";
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title} — QuoteReels Automation</title><meta property="og:title" content="${title} — QuoteReels Automation"><meta property="og:description" content="Policy page for the QuoteReels self-hosted TikTok scheduler."><meta name="description" content="${title} for the QuoteReels self-hosted social media scheduler."></head><body>${body}<hr><small>QuoteReels — self-hosted content automation.</small></body></html>`;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": Buffer.byteLength(html) });
    res.end(html);
    return;
  }

  // Pure typography poster: /poster?lines=FOLLOW YOUR|PLAN|NOT YOUR|MOOD&bg=%23E8564D&color=%23000000&grunge=1
  if (req.method === "GET" && url.pathname === "/poster") {
    try {
      const W = 1080, H = 1620;
      const linesRaw = (url.searchParams.get("lines") || "FOLLOW YOUR|PLAN|NOT YOUR|MOOD").split("|").map(s => s.trim()).filter(Boolean).slice(0, 5);
      const bg = url.searchParams.get("bg") || "#E8564D";
      const color = url.searchParams.get("color") || "#0A0A0A";
      const grunge = url.searchParams.get("grunge") !== "0";
      const seedStr = url.searchParams.get("seed") || String(Date.now());
      let s = 0;
      for (const c of seedStr) s = (s * 31 + c.charCodeAt(0)) % 2147483647;
      const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };

      // hand-tuned baselines + font sizes per line-count (fractions of H)
      const layouts = {
        1: [[0.50, 0.42]],
        2: [[0.18, 0.18], [0.62, 0.18]],
        3: [[0.16, 0.13], [0.50, 0.26], [0.82, 0.13]],
        4: [[0.135, 0.088], [0.46, 0.295], [0.635, 0.088], [0.965, 0.285]],
        5: [[0.12, 0.075], [0.33, 0.21], [0.56, 0.075], [0.75, 0.21], [0.95, 0.075]]
      };
      const layout = layouts[linesRaw.length] || layouts[4];

      // width-constrained font size (condensed bold ≈ 0.50 × fs per char, safety 0.53)
      const texts = linesRaw.map((line, i) => {
        let fs = Math.round(layout[i][1] * H);
        const maxW = W * 0.93;
        const estW = line.length * fs * 0.53;
        if (estW > maxW) fs = Math.round(fs * (maxW / estW));
        const baseline = Math.round(layout[i][0] * H);
        return { line: line.toUpperCase(), fs, baseline };
      });

      // grunge pattern: black base + bg-colored scratches/chips/speckles (shows only inside glyphs)
      let patternInner = "";
      if (grunge) {
        const P = 420;
        const parts = [`    <rect width="${P}" height="${P}" fill="${color}"/>`];
        // long scratches (thin rotated bars)
        for (let i = 0; i < 26; i++) {
          const x = Math.round(rnd() * P), y = Math.round(rnd() * P);
          const w = 10 + Math.round(rnd() * 70), h = 1 + Math.round(rnd() * 3);
          const rot = Math.round(rnd() * 360);
          parts.push(`    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg}" transform="rotate(${rot} ${x} ${y})"/>`);
        }
        // chips / worn patches
        for (let i = 0; i < 22; i++) {
          const x = Math.round(rnd() * P), y = Math.round(rnd() * P);
          const w = 2 + Math.round(rnd() * 9), h = 2 + Math.round(rnd() * 7);
          const rot = Math.round(rnd() * 360);
          parts.push(`    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg}" transform="rotate(${rot} ${x} ${y})"/>`);
        }
        // speckles
        for (let i = 0; i < 60; i++) {
          const x = Math.round(rnd() * P), y = Math.round(rnd() * P);
          const r = 0.6 + rnd() * 1.6;
          parts.push(`    <circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="${bg}"/>`);
        }
        // faint mid-tone cracks (semi-transparent, adds depth)
        for (let i = 0; i < 12; i++) {
          const x = Math.round(rnd() * P), y = Math.round(rnd() * P);
          const w = 14 + Math.round(rnd() * 60), h = 1;
          const rot = Math.round(rnd() * 360);
          parts.push(`    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg}" opacity="0.5" transform="rotate(${rot} ${x} ${y})"/>`);
        }
        patternInner = parts.join("\n");
      }

      const fillRef = grunge ? "url(#grunge)" : color;
      const patternDef = grunge ? `
  <defs>
    <pattern id="grunge" patternUnits="userSpaceOnUse" width="420" height="420">
${patternInner}
    </pattern>
  </defs>` : "";

      const textEls = texts.map(t =>
        `    <text x="50%" y="${t.baseline}" text-anchor="middle" font-family="Liberation Sans Narrow, Noto Sans, sans-serif" font-weight="700" font-size="${t.fs}" fill="${fillRef}" letter-spacing="${Math.round(-t.fs * 0.012)}">${esc(t.line)}</text>`
      ).join("\n");

      const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${patternDef}
  <rect width="${W}" height="${H}" fill="${bg}"/>
${textEls}
</svg>`;
      const out = await sharp(Buffer.from(svg)).jpeg({ quality: 94 }).toBuffer();
      res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": out.length });
      res.end(out);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("poster error: " + e.message);
    }
    return;
  }

  // POST /fitfb — fit a poster to Facebook's native 4:5 feed size (1080x1350), smart-cropped
  // (15% of excess off the top where headlines live, 85% off the bottom), served back as JPEG binary or JSON
  if (req.method === "POST" && url.pathname === "/fitfb") {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const parsed = parseMultipart(Buffer.concat(chunks), req.headers["content-type"] || "");
      const imageBuf = (parsed.files.find(f => f.name === "image") || parsed.files[0] || {}).buf;
      if (!imageBuf) throw new Error("no image part");
      const id = String(parsed.fields.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "").substring(0, 40) || String(Date.now());
      const meta = await sharp(imageBuf).metadata();
      let w = meta.width, h = meta.height;
      let pipeline = sharp(imageBuf);
      const target = 1080 / 1350; // 4:5 = 0.8
      if (w && h && (w / h) < target - 0.01) {
        // Image is taller than 4:5 (e.g. 2:3 or 9:16). Crop height.
        const cropH = Math.round(w / target);
        const excessH = h - cropH;
        const top = Math.max(0, Math.round(excessH * 0.15));
        pipeline = pipeline.extract({ left: 0, top, width: w, height: Math.min(cropH, h - top) });
      } else if (w && h && (w / h) > target + 0.01) {
        // Image is wider than 4:5 (e.g. 1:1 or 16:9). Crop width.
        const cropW = Math.round(h * target);
        pipeline = pipeline.extract({ left: Math.max(0, Math.round((w - cropW) / 2)), top: 0, width: Math.min(cropW, w), height: h });
      }
      const out = await pipeline.resize(1080, 1350, { fit: "cover" }).jpeg({ quality: 95 }).toBuffer();
      fs.writeFileSync(path.join(IMG_DIR, id + ".jpg"), out);
      pruneImages();
      if ((req.headers["accept"] && req.headers["accept"].includes("application/json")) || url.searchParams.get("format") === "json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ url: "http://yt-image-tools:3210/img/" + id + ".jpg", width: 1080, height: 1350, sourceWidth: w, sourceHeight: h }));
      } else {
        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Content-Length": out.length,
          "X-Image-Id": id,
          "X-Width": "1080",
          "X-Height": "1350",
          "X-Image-Url": "http://yt-image-tools:3210/img/" + id + ".jpg"
        });
        res.end(out);
      }
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("fitfb error: " + e.message);
    }
    return;
  }

  // GET /img/:file — serve a fitted image or reel video
  if (req.method === "GET" && url.pathname.startsWith("/img/")) {
    const f = path.basename(url.pathname.substring(5));
    const p = path.join(IMG_DIR, f);
    if (!fs.existsSync(p)) { res.writeHead(404); res.end("not found"); return; }
    const buf = fs.readFileSync(p);
    const mime = f.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
    res.writeHead(200, { "Content-Type": mime, "Content-Length": buf.length, "Cache-Control": "public, max-age=86400" });
    res.end(buf);
    return;
  }

  // POST /reel — dynamic 1080x1920 mp4 from a poster image + 18+ music variations with cinematic Ken Burns motion
  if (req.method === "POST" && url.pathname === "/reel") {
    const tmpIn = path.join(os.tmpdir(), "reel-in-" + Date.now() + ".jpg");
    const tmpOut = path.join(os.tmpdir(), "reel-out-" + Date.now() + ".mp4");
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const parsed = parseMultipart(body, req.headers["content-type"] || "");
      const imageBuf = (parsed.files.find(f => f.name === "image") || parsed.files[0] || {}).buf;
      if (!imageBuf) throw new Error("no image part");
      const id = String(parsed.fields.id || url.searchParams.get("id") || "").replace(/[^a-zA-Z0-9_-]/g, "").substring(0, 40);
      const duration = Math.min(30, Math.max(6, parseFloat(parsed.fields.duration || url.searchParams.get("duration")) || 13));
      let mood = parsed.fields.mood || url.searchParams.get("mood") || "warm-pad";

      const audioDir = fs.existsSync("/app/audio") ? "/app/audio" : path.join(__dirname, "audio");
      let audioFile = path.join(audioDir, mood + ".mp3");
      if (!fs.existsSync(audioFile)) {
        const available = fs.existsSync(audioDir) ? fs.readdirSync(audioDir).filter(f => f.endsWith(".mp3")) : [];
        if (available.length > 0) {
          audioFile = path.join(audioDir, available[Math.floor(Math.random() * available.length)]);
        } else {
          audioFile = path.join(audioDir, "warm-pad.mp3");
        }
      }

      fs.writeFileSync(tmpIn, imageBuf);

      const fadeOutSt = Math.max(0, duration - 0.6);
      const fc =
        "[0:v]scale=1080:1350:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black," +
        "fade=t=in:st=0:d=0.5,fade=t=out:st=" + fadeOutSt + ":d=0.6,format=yuv420p[v];" +
        "[1:a]atrim=0:" + duration + ",asetpts=PTS-STARTPTS," +
        "afade=t=in:st=0:d=1.0,afade=t=out:st=" + Math.max(0, duration - 1.5) + ":d=1.5,volume=0.85[a]";

      await new Promise((res, rej) => {
        execFile("ffmpeg", ["-y", "-loop", "1", "-i", tmpIn, "-i", audioFile,
          "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
          "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-r", "30",
          "-c:a", "aac", "-b:a", "128k", "-t", String(duration),
          "-movflags", "+faststart", "-f", "mp4", tmpOut],
          { timeout: 180000 }, (e) => e ? rej(new Error(String(e.stderr || e.message).substring(0, 400))) : res());
      });
      const out = fs.readFileSync(tmpOut);
      if (id) {
        fs.writeFileSync(path.join(IMG_DIR, id + ".mp4"), out);
      }
      res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": out.length, "Content-Disposition": 'attachment; filename="reel.mp4"' });
      res.end(out);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("reel error: " + e.message);
    } finally {
      try { fs.unlinkSync(tmpIn); } catch (_) {}
      try { fs.unlinkSync(tmpOut); } catch (_) {}
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/overlay") {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const metaRaw = req.headers["x-title"] ? decodeURIComponent(req.headers["x-title"]) : "";
      let title = url.searchParams.get("title") || metaRaw, imageBuf = body;
      const ctype = req.headers["content-type"] || "";
      if (ctype.includes("multipart/form-data")) {
        const boundary = Buffer.from("--" + ctype.split("boundary=")[1].split(";")[0]);
        const parts = [];
        let idx = body.indexOf(boundary);
        while (idx !== -1) {
          const next = body.indexOf(boundary, idx + boundary.length);
          if (next === -1) break;
          parts.push(body.subarray(idx + boundary.length, next));
          idx = next;
        }
        for (const p of parts) {
          const headerEnd = p.indexOf("\r\n\r\n");
          if (headerEnd === -1) continue;
          const header = p.subarray(0, headerEnd).toString();
          const data = p.subarray(headerEnd + 4, p.length - 2);
          const nameM = header.match(/name="([^"]+)"/);
          if (nameM && nameM[1] === "title") title = data.toString().trim();
          else if (nameM && nameM[1] === "image") imageBuf = data;
          else if (!imageBuf || imageBuf === body) imageBuf = data;
        }
      }
      const meta = await sharp(imageBuf).metadata();
      const style = url.searchParams.get("tstyle") || "bold";
      let overlay;
      if (style === "serif") {
        // small elegant white serif title, upper center, no scrim/bar
        const fs = Math.round(meta.width / 13);
        const y = Math.round(meta.height * 0.075);
        overlay = Buffer.from(`<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg">
  <text x="50%" y="${y + fs}" text-anchor="middle" font-family="Liberation Serif, Noto Serif, Georgia, serif" font-weight="400" font-size="${fs}" fill="#f5f2ea" letter-spacing="${Math.round(fs * 0.22)}" stroke="#00000055" stroke-width="2" paint-order="stroke">${esc((title || "").toUpperCase())}</text>
</svg>`);
      } else {
        overlay = Buffer.from(buildOverlaySvg(meta.width, meta.height, title));
      }
      const out = await sharp(imageBuf).composite([{ input: overlay, top: 0, left: 0 }]).jpeg({ quality: 92 }).toBuffer();
      res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": out.length });
      res.end(out);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("overlay error: " + e.message);
    }
    return;
  }

  // POST /format-variant — Render exact blueprint & value-dense typography onto 3D cinematic images
  if (req.method === "POST" && url.pathname === "/format-variant") {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const ctype = req.headers["content-type"] || "";
      const parsed = parseMultipart(body, ctype);
      const imageBuf = (parsed.files.find(f => f.name === "image") || parsed.files[0] || {}).buf || body;
      
      const headline = String(parsed.fields.headline || url.searchParams.get("headline") || "").trim();
      const insight = String(parsed.fields.insight || url.searchParams.get("insight") || "").trim();
      const takeaway = String(parsed.fields.takeaway || url.searchParams.get("takeaway") || "").trim();
      const tag = String(parsed.fields.tag || url.searchParams.get("tag") || "").trim();
      const style = String(parsed.fields.style || url.searchParams.get("style") || "bracket").trim();

      const meta = await sharp(imageBuf).metadata();
      const W = meta.width || 1024, H = meta.height || 1024;

      let overlaySvg = "";
      if (style === "editorial-clean" || style === "swiss" || style === "editorial-dark") {
        const isDark = style === "editorial-dark";
        const words = insight.split(/\s+/).filter(Boolean);
        const lines = [];
        let cur = "";
        for (const w of words) {
          if ((cur + " " + w).trim().length <= 34) cur = (cur + " " + w).trim();
          else { if (cur) lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);

        const startX = 64;
        const startY = 85;
        const headWords = headline.trim().split(/\s+/);
        let h1 = headline, h2 = "";
        if (headWords.length > 2) {
          const mid = Math.ceil(headWords.length / 2);
          h1 = headWords.slice(0, mid).join(" ");
          h2 = headWords.slice(mid).join(" ");
        } else if (headWords.length === 2 && headline.length > 11) {
          h1 = headWords[0];
          h2 = headWords[1];
        }

        const headColor = isDark ? "#ffffff" : "#0f172a";
        const textColor = isDark ? "#e2e8f0" : "#1e293b";
        const lineColor = isDark ? "#fbbf24" : "#334155";
        const ruleColor = isDark ? "#ffffff" : "#0f172a";

        const headSvg = h2
          ? `<text x="${startX}" y="${startY + 64}" font-family="Arial Black, Impact, Arial, sans-serif" font-size="72" font-weight="900" fill="${headColor}" letter-spacing="1.5">${esc(h1.toUpperCase())}</text>
             <text x="${startX}" y="${startY + 142}" font-family="Arial Black, Impact, Arial, sans-serif" font-size="72" font-weight="900" fill="${headColor}" letter-spacing="1.5">${esc(h2.toUpperCase())}</text>`
          : `<text x="${startX}" y="${startY + 72}" font-family="Arial Black, Impact, Arial, sans-serif" font-size="76" font-weight="900" fill="${headColor}" letter-spacing="1.5">${esc(h1.toUpperCase())}</text>`;

        const pStartY = h2 ? startY + 220 : startY + 160;
        const pTexts = lines.map((l, i) =>
          `<text x="${startX}" y="${pStartY + i * 33}" font-family="Arial, Helvetica, sans-serif" font-size="21.5" font-weight="500" fill="${textColor}" letter-spacing="0.1">${esc(l)}</text>`
        ).join("\n");

        const ruleY = H - 95;
        overlaySvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  ${headSvg}
  ${pTexts}
  <line x1="${startX}" y1="${ruleY - 24}" x2="${startX + 280}" y2="${ruleY - 24}" stroke="${lineColor}" stroke-width="2" stroke-opacity="0.85"/>
  <text x="${startX}" y="${ruleY + 12}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="900" fill="${ruleColor}">${esc(takeaway)}</text>
</svg>`;
      } else if (style === "bracket") {
        // Blueprint A/B style: Clean uppercase headline with editorial brackets
        const fs = Math.round(W / 14);
        const y = Math.round(H * 0.12);
        overlaySvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.8"/>
    </filter>
  </defs>
  <text x="50%" y="${y + fs}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="${fs}" fill="#ffffff" letter-spacing="${Math.round(fs * 0.1)}" filter="url(#shadow)" stroke="#000000" stroke-width="2" paint-order="stroke">[ ${esc(headline.toUpperCase())} ]</text>
</svg>`;
      } else {
        // Value-Dense Style: Top Headline + Lower Insight Card + Takeaway Pill
        const words = insight.split(/\s+/).filter(Boolean);
        const lines = [];
        let cur = "";
        for (const w of words) {
          if ((cur + " " + w).trim().length <= 38) cur = (cur + " " + w).trim();
          else { if (cur) lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);

        const cardH = 140 + lines.length * 30;
        const cardY = H - cardH - 50;

        const insightTexts = lines.map((l, i) =>
          `<text x="50%" y="${cardY + 55 + i * 28}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="600" fill="#e2e8f0">${esc(l)}</text>`
        ).join("\n");

        overlaySvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.85"/>
      <stop offset="70%" stop-color="#000000" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${Math.round(H * 0.35)}" fill="url(#scrim)"/>
  ${tag ? `<text x="50%" y="${Math.round(H * 0.07)}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="#94a3b8" letter-spacing="4">[ ${esc(tag.toUpperCase())} ]</text>` : ''}
  <text x="50%" y="${Math.round(H * 0.14)}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(W / 18)}" font-weight="900" fill="#ffffff" letter-spacing="2" stroke="#000000" stroke-width="2" paint-order="stroke">${esc(headline.toUpperCase())}</text>
  
  <!-- Glassmorphism Insight Card -->
  <rect x="${Math.round(W * 0.06)}" y="${cardY}" width="${Math.round(W * 0.88)}" height="${cardH}" rx="18" fill="rgba(8, 12, 20, 0.85)" stroke="rgba(255, 255, 255, 0.18)" stroke-width="1.5"/>
  ${insightTexts}
  ${takeaway ? `
  <rect x="${Math.round(W * 0.5 - 220)}" y="${cardY + cardH - 46}" width="440" height="36" rx="18" fill="rgba(255, 180, 0, 0.2)" stroke="#fbbf24" stroke-width="1.2"/>
  <text x="50%" y="${cardY + cardH - 22}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="800" fill="#fef08a" letter-spacing="1">${esc(takeaway.toUpperCase())}</text>` : ''}
</svg>`;
      }

      const out = await sharp(imageBuf).composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }]).jpeg({ quality: 94 }).toBuffer();
      res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": out.length });
      res.end(out);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("format-variant error: " + e.message);
    }
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("image-tools ready");
});

server.listen(PORT, () => console.log("image-tools listening on " + PORT));
