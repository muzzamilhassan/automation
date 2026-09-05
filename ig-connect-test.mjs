// Ensures automation Chrome is up with CDP, then reports IG page state.
import { execSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = 'C:\\Users\\Revnix\\chrome-automation';
const PORT = 9222;

function portUp() {
  try {
    const out = execSync(`curl -s --max-time 3 http://127.0.0.1:${PORT}/json/version`, { encoding: 'utf8' });
    return out.includes('Browser');
  } catch { return false; }
}

if (!portUp()) {
  console.log('[chrome] starting automation profile...');
  execSync(`start "" "${CHROME}" --user-data-dir=${PROFILE} --remote-debugging-port=${PORT} --no-first-run --no-default-browser-check "https://www.instagram.com/accounts/edit/"`, { shell: 'cmd.exe' });
  let up = false;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1500));
    if (portUp()) { up = true; break; }
  }
  if (!up) { console.error('[chrome] debug port never came up'); process.exit(1); }
}
console.log('[chrome] CDP port up');

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const ctx = browser.contexts()[0];
const pages = ctx.pages();
console.log('open tabs:', pages.map(p => p.url().slice(0, 70)));
const page = pages.find(p => p.url().includes('instagram')) || pages[0];
await page.bringToFront();
await page.waitForLoadState('domcontentloaded').catch(() => { });
console.log('url:', page.url().slice(0, 90));
console.log(await page.title());
console.log('--- page text (first 400) ---');
console.log(await page.evaluate(() => document.body.innerText.slice(0, 400)));
browser.close();
