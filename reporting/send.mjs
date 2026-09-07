// Reporting: PDF builder (pdfkit) + WhatsApp/hosting senders.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const envStr = (() => { try { return fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : ''; } catch (e) { return ''; } })();
const envOf = (k) => process.env[k] || (envStr.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim() || '';

const ACCENT = '#C8202D', DARK = '#141414', GRAY = '#666666';

// ---------------------------------------------------------------------------
// PDF — clean report layout
// ---------------------------------------------------------------------------
export async function buildPdf(report, outPath) {
  const { default: PDFDocument } = await import('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
  doc.pipe(fs.createWriteStream(outPath));

  const fmt = (n) => Number(n || 0).toLocaleString('en-US');

  // header
  doc.rect(0, 0, doc.page.width, 110).fill(DARK);
  doc.fillColor('#F5E31C').font('Helvetica-Bold').fontSize(22).text('QUOTE QUARRY', 50, 30);
  doc.fillColor('#FFFFFF').font('Helvetica').fontSize(13).text(report.title, 50, 60);
  doc.fillColor('#BBBBBB').fontSize(10).text(`Period: ${report.period}  •  Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, 50, 82);
  doc.y = 140;

  // summary cards
  const cards = [
    ['Subscribers', report.now.subscribers, report.delta ? report.delta.subscribers : null],
    ['Total Views', report.now.totalViews, report.delta ? report.delta.totalViews : null],
    ['Likes gained', report.gained.likes, null],
    ['Comments gained', report.gained.comments, null]
  ];
  const cw = (doc.page.width - 100 - 30) / 4;
  let x = 50;
  for (const [label, value, delta] of cards) {
    const y = doc.y;
    doc.roundedRect(x, y, cw, 78, 8).fill('#F5F5F3');
    doc.fillColor(GRAY).font('Helvetica').fontSize(9).text(label.toUpperCase(), x + 12, y + 12, { width: cw - 24 });
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(20).text(fmt(value), x + 12, y + 28, { width: cw - 24 });
    if (delta !== null && delta !== undefined) {
      doc.fillColor(delta >= 0 ? '#1a7f37' : '#c62828').font('Helvetica-Bold').fontSize(11)
        .text(`${delta >= 0 ? '+' : ''}${fmt(delta)}`, x + 12, y + 55, { width: cw - 24 });
    }
    x += cw + 10;
  }
  doc.y += 100;

  const section = (title) => {
    doc.moveDown(1);
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13).text(title.toUpperCase());
    doc.moveTo(50, doc.y + 4).lineTo(doc.page.width - 50, doc.y + 4).lineWidth(1).strokeColor('#E0E0E0').stroke();
    doc.moveDown(0.6);
  };

  // posts + misses
  section('Publishing activity');
  doc.fillColor(DARK).font('Helvetica').fontSize(10.5);
  const p = report.posts;
  doc.text(`Published: ${p.published}   |   Missed (expected but not posted): ${p.missed}`, { continued: false });
  if (Object.keys(p.byPlatform).length) {
    doc.moveDown(0.3);
    for (const [plat, n] of Object.entries(p.byPlatform)) doc.text(`• ${plat}: ${n}`, { indent: 10 });
  }
  if (report.failures?.length) {
    doc.moveDown(0.5).fillColor('#c62828').font('Helvetica-Bold').fontSize(10.5).text('FAILED CI RUNS:');
    doc.fillColor(DARK).font('Helvetica').fontSize(9.5);
    for (const f of report.failures) doc.text(`• ${f.name} — ${f.at.slice(0, 16).replace('T', ' ')} UTC`);
  } else {
    doc.moveDown(0.3).fillColor('#1a7f37').text('No failed runs in this period.');
  }

  // top videos
  section('Top performing videos');
  if (report.topVideos.length) {
    const table = report.topVideos.slice(0, 10);
    const colW = [330, 70, 60, 70];
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(GRAY);
    doc.text('VIDEO', 50, doc.y, { width: colW[0] });
    doc.text('VIEWS', 50 + colW[0], doc.y - 12, { width: colW[1], align: 'right' });
    doc.text('GAINED', 50 + colW[0] + colW[1], doc.y - 12, { width: colW[2], align: 'right' });
    doc.text('COMM.', 50 + colW[0] + colW[1] + colW[2], doc.y - 12, { width: colW[3], align: 'right' });
    doc.moveDown(0.4);
    for (const v of table) {
      const y = doc.y;
      doc.fillColor(DARK).font('Helvetica').fontSize(9.5);
      doc.text(v.title.slice(0, 58), 50, y, { width: colW[0], ellipsis: true });
      doc.text(fmt(v.views), 50 + colW[0], y, { width: colW[1], align: 'right' });
      doc.fillColor('#1a7f37');
      doc.text('+' + fmt(v.viewsGained), 50 + colW[0] + colW[1], y, { width: colW[2], align: 'right' });
      doc.fillColor(DARK);
      doc.text(fmt(v.commentsGained ?? v.comments ?? 0), 50 + colW[0] + colW[1] + colW[2], y, { width: colW[3], align: 'right' });
      doc.moveDown(0.55);
    }
  } else {
    doc.fillColor(DARK).text('No view data for this period yet.');
  }

  // posts detail (daily reports only)
  if (report.postList?.length) {
    doc.addPage();
    section('Every post this period');
    for (const e of report.postList.slice(-40)) {
      const when = e.ts.slice(0, 16).replace('T', ' ');
      doc.fillColor(e.status === 'failed' ? '#c62828' : DARK).font('Helvetica').fontSize(9.5)
        .text(`${when}  [${e.platform}] ${e.brand || ''} — ${e.title || e.kind || ''} ${e.status === 'failed' ? '(FAILED)' : ''}`, { width: doc.page.width - 100 });
      doc.moveDown(0.25);
    }
  }

  // footer
  doc.fontSize(8).fillColor(GRAY).text(
    'Quote Quarry automated report • generated by the content pipeline', 50, doc.page.height - 60,
    { width: doc.page.width - 100, align: 'center' });

  doc.end();
  await new Promise((r) => setTimeout(r, 300));
  return outPath;
}

// ---------------------------------------------------------------------------
// Host a file publicly (uguu.se — same service the posting engine uses)
// ---------------------------------------------------------------------------
export async function hostFile(path, filename = 'report.pdf') {
  try {
    const res = await fetch('https://uguu.se/upload', {
      method: 'POST',
      body: (() => { const fd = new FormData(); fd.append('files[]', new Blob([fs.readFileSync(path)]), filename); return fd; })()
    });
    const j = await res.json();
    if (j.success && j.files?.[0]?.url) return j.files[0].url;
  } catch (e) { /* try tmpfiles */ }
  try {
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(path)]), filename);
    const res = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: fd });
    const j = await res.json();
    if (j.data?.url) return j.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  } catch (e) { }
  return null;
}


// ntfy — open-source push notifications, zero accounts (topic = the secret)
export async function sendNtfy(text, title = 'Quote Quarry Report', pdfPath = null) {
  const topic = envOf('NTFY_TOPIC');
  if (!topic) { console.log('[send] ntfy not configured — skipped.'); return false; }
  try {
    const res = await fetch('https://ntfy.sh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, title, message: text.slice(0, 3500), priority: 3, tags: ['bar_chart'] })
    });
    console.log(`[send] ntfy text: ${res.ok ? 'sent' : 'HTTP ' + res.status}`);
    if (pdfPath && fs.existsSync(pdfPath)) {
      const fname = pdfPath.split('/').pop();
      const r2 = await fetch(`https://ntfy.sh/${topic}?file=${encodeURIComponent(fname)}`, {
        method: 'PUT',
        headers: { 'Filename': fname, 'Title': 'Quote Quarry report PDF' },
        body: fs.readFileSync(pdfPath)
      });
      console.log(`[send] ntfy PDF: ${r2.ok ? 'sent' : 'HTTP ' + r2.status}`);
    }
    return res.ok;
  } catch (e) { console.log('[send] ntfy failed:', e.message); return false; }
}

// ---------------------------------------------------------------------------
// Senders — CallMeBot (free WhatsApp text), Telegram (free PDF), Meta Cloud API (optional)
// ---------------------------------------------------------------------------
export async function sendWhatsAppText(text) {
  const phone = envOf('CALLMEBOT_PHONE'), key = envOf('CALLMEBOT_KEY');
  if (!phone || !key) { console.log('[send] CallMeBot not configured — text skipped.'); return false; }
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text).slice(0, 1800)}&apikey=${key}`;
    const res = await fetch(url);
    console.log(`[send] CallMeBot: ${res.ok ? 'sent' : 'HTTP ' + res.status}`);
    return res.ok;
  } catch (e) { console.log('[send] CallMeBot failed:', e.message); return false; }
}

export async function sendTelegramDocument(path, caption) {
  const token = envOf('TELEGRAM_BOT_TOKEN'), chat = envOf('TELEGRAM_CHAT_ID');
  if (!token || !chat) return false;
  try {
    const fd = new FormData();
    fd.append('chat_id', chat);
    fd.append('caption', caption.slice(0, 900));
    fd.append('document', new Blob([fs.readFileSync(path)]), path.split('/').pop());
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });
    console.log(`[send] Telegram PDF: ${res.ok ? 'sent' : 'HTTP ' + res.status}`);
    return res.ok;
  } catch (e) { console.log('[send] Telegram failed:', e.message); return false; }
}

export async function sendWhatsAppDocument(url, filename) {
  // Meta Cloud API document message (optional; needs WA_TOKEN + WA_PHONE_ID + WA_TO)
  const token = envOf('WA_TOKEN'), phoneId = envOf('WA_PHONE_ID'), to = envOf('WA_TO');
  if (!token || !phoneId || !to) return false;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'document', document: { link: url, filename } })
    });
    console.log(`[send] WhatsApp Cloud API PDF: ${res.ok ? 'sent' : 'HTTP ' + res.status}`);
    return res.ok;
  } catch (e) { console.log('[send] Cloud API failed:', e.message); return false; }
}
