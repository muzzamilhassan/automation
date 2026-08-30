import fs from 'node:fs';

const envStr = fs.readFileSync('.env', 'utf8');
const FB_PAGE_TOKEN = envStr.match(/^FB_PAGE_TOKEN=(.+)$/m)[1].trim();
const IG_USER_ID = envStr.match(/^IG_USER_ID=(.+)$/m)[1].trim();

async function testThreads() {
  console.log('Testing Meta Graph API for Threads / Instagram Account...');
  
  // 1. Check Instagram account details
  try {
    const igRes = await fetch(`https://graph.facebook.com/v21.0/${IG_USER_ID}?fields=id,username,name,threads_user_id&access_token=${FB_PAGE_TOKEN}`);
    const igData = await igRes.json();
    console.log('IG Details:', igData);
  } catch (e) {
    console.error('IG Error:', e.message);
  }

  // 2. Check Facebook User Accounts / Permissions
  try {
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${FB_PAGE_TOKEN}`);
    const meData = await meRes.json();
    console.log('Token Permissions:', meData.data?.map(p => `${p.permission}: ${p.status}`));
  } catch (e) {
    console.error('Permissions Error:', e.message);
  }
}

testThreads();
