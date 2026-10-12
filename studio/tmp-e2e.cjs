// Production E2E for the Thumbnail Studio — uses @next/env's OWN parser so the
// password string matches the server's view byte-for-byte. One login attempt.
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd(), false, { info: () => { }, error: () => { } });
const fs = require('fs');
const expected = process.env.STUDIO_PASSWORD || '';
console.log('env pw length:', expected.length);

(async () => {
  const base = 'https://quarry-studio.vercel.app';
  // 1. login
  const lr = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: expected }),
  });
  console.log('login:', lr.status);
  if (lr.status !== 200) { console.log(await lr.text()); return; }
  const cookies = lr.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

  // 2. preview render (Linux sharp — the real font test)
  const pr = await fetch(base + '/api/thumbs/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies },
    body: JSON.stringify({
      template: 'poster',
      title: 'The Silent Wealth Trap Nobody Sees',
      accent: '#C1272D', chip: 'MONEY RULES', brand: 'THE MONEY RULEBOOK',
      photoUrl: 'https://images.pexels.com/photos/210607/pexels-photo-210607.jpeg?auto=compress&cs=tinysrgb&w=1280',
    }),
  });
  const pd = await pr.json();
  if (!pd.image) { console.log('preview failed:', pd.error); return; }
  fs.writeFileSync('prev-prod.jpg', Buffer.from(pd.image.split(',')[1], 'base64'));
  console.log('preview OK:', pd.bytes, 'bytes | lines:', JSON.stringify(pd.lines), '| checklist:', JSON.stringify(pd.checklist));

  // 3. paper template sanity
  const pp = await fetch(base + '/api/thumbs/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies },
    body: JSON.stringify({
      template: 'paper', title: 'The Marcus Aurelius Rule Nobody Talks About',
      accent: '#B8860B', chip: 'STOICISM', brand: 'Quote Quarry',
      photoUrl: 'https://images.pexels.com/photos/210607/pexels-photo-210607.jpeg?auto=compress&cs=tinysrgb&w=1280',
    }),
  });
  const ppd = await pp.json();
  console.log('paper:', ppd.image ? 'OK ' + ppd.bytes + ' bytes' : 'FAIL ' + ppd.error);

  // 4. REAL attach — newest Money Rulebook video (live proof)
  const img = fs.readFileSync('prev-prod.jpg').toString('base64');
  const ar = await fetch(base + '/api/thumbs/attach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies },
    body: JSON.stringify({ slug: 'money-rulebook', videoId: 'mumpWZQE_yE', imageDataUrl: 'data:image/jpeg;base64,' + img }),
  });
  console.log('attach:', ar.status, await ar.text());
})().catch((e) => console.log('E2E error:', e.message));
