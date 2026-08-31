import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function dl(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return dl(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('Status ' + res.statusCode));
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function main() {
  const css = await get('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,900&family=Anton&family=Archivo+Black&family=Inter:wght@400;600;800', {
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko'
  });

  const regex = /font-family:\s*'([^']+)';[\s\S]*?font-style:\s*([^;]+);[\s\S]*?font-weight:\s*([^;]+);[\s\S]*?src:\s*url\(([^)]+)\)\s*format\('([^']+)'\);/g;
  let m;
  while ((m = regex.exec(css)) !== null) {
    const [_, family, style, weight, url, format] = m;
    const cleanFam = family.replace(/\s+/g, '');
    const filename = `${cleanFam}-${style.trim()}-${weight.trim()}.${format.trim()}`;
    const p = path.join('image-tools/fonts', filename);
    await dl(url, p);
    console.log(`✓ Downloaded ${filename} (${fs.statSync(p).size} bytes)`);
  }
}

main().catch(console.error);
