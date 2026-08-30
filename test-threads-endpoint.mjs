import fs from 'node:fs';

const envStr = fs.readFileSync('.env', 'utf8');
const FB_PAGE_TOKEN = envStr.match(/^FB_PAGE_TOKEN=(.+)$/m)[1].trim();

async function testThreadsNet() {
  console.log('Testing graph.threads.net endpoint...');
  try {
    const res = await fetch(`https://graph.threads.net/v1.0/me?access_token=${FB_PAGE_TOKEN}`);
    const data = await res.json();
    console.log('Threads /me response:', res.status, data);
  } catch (e) {
    console.error('Threads error:', e.message);
  }
}

testThreadsNet();
