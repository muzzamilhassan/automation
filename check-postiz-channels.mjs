import fs from 'node:fs';

const envStr = fs.readFileSync('.env', 'utf8');
const POSTIZ_API_KEY = envStr.match(/^POSTIZ_API_KEY=(.+)$/m)[1].trim();

async function checkPostiz() {
  const urls = ['http://localhost:5000', 'http://localhost:4007'];
  for (const u of urls) {
    try {
      const res = await fetch(`${u}/public/v1/integrations`, {
        headers: { Authorization: POSTIZ_API_KEY }
      });
      console.log(`Checking ${u}... status: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log('Connected Postiz Channels:');
        for (const ch of data) {
          console.log(`- ID: ${ch.id} | Name: ${ch.name} | Provider: ${ch.provider} | Disabled: ${ch.disabled}`);
        }
        return;
      }
    } catch (e) {
      console.log(`Error on ${u}:`, e.message);
    }
  }
}

checkPostiz();
