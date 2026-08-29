import fs from 'node:fs';
import path from 'node:path';

// Read local .env if available, or fall back to system process.env (GitHub Actions secrets)
let envStr = '';
try {
  if (fs.existsSync('.env')) {
    envStr = fs.readFileSync('.env', 'utf8');
  } else if (fs.existsSync('C:/Users/Revnix/Documents/youtube-automation/.env')) {
    envStr = fs.readFileSync('C:/Users/Revnix/Documents/youtube-automation/.env', 'utf8');
  }
} catch (e) {}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || (envStr.match(/^OPENAI_API_KEY=(.+)$/m) || [])[1]?.trim() || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || (envStr.match(/^GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim() || '';
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || (envStr.match(/^FB_PAGE_TOKEN=(.+)$/m) || [])[1]?.trim() || '';

// Target Page: Reliq North (ID: 114550268199751)
const PAGES = [
  {
    id: '116157974886564',
    name: 'Silent Wealth',
    niche: 'Wealth Psychology, Financial Sovereignty, Capital Leverage, Asset Building',
    brandTag: '#SilentWealth #VentureGrowth #CapitalLeverage #AssetOwnership'
  },
  {
    id: '108044922375174',
    name: 'Strategic Silence',
    niche: 'Dark Psychology, High-Stakes Power Dynamics, Mental Self-Mastery, Human Nature',
    brandTag: '#StrategicSilence #DarkPsychology #PowerDynamics #MasterTheUnseen'
  },
  {
    id: '1077306835630491',
    name: 'Eon Ventures',
    niche: 'Grit, Relentless Execution, Silicon Valley Entrepreneurship, High-Growth Habits',
    brandTag: '#EonVentures #DisciplineOverMotivation #HighGrowth #Startups'
  },
  {
    id: '114550268199751',
    name: 'Reliq North',
    niche: 'Stoic Wisdom, Digital Minimalism, Executive Calm, Slow Living in a Noisy World',
    brandTag: '#ReliqNorth #StoicWisdom #DigitalMinimalism #Stillness'
  },
  {
    id: '106473735839651',
    name: 'The Boundaries Club',
    niche: 'Emotional Intelligence, Self-Worth, High-Value Standards, Relationship Boundaries',
    brandTag: '#TheBoundariesClub #EmotionalIntelligence #ProtectYourPeace #SelfRespect'
  }
];

let pageTokenCache = null;
async function getPageAccessToken(pageId) {
  if (pageTokenCache && pageTokenCache[pageId]) return pageTokenCache[pageId];
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/me/accounts?access_token=${encodeURIComponent(FB_PAGE_TOKEN)}`);
    const data = await res.json();
    if (data.data && Array.isArray(data.data)) {
      pageTokenCache = {};
      for (const p of data.data) pageTokenCache[p.id] = p.access_token;
      return pageTokenCache[pageId] || FB_PAGE_TOKEN;
    }
  } catch (e) { }
  return FB_PAGE_TOKEN;
}

async function callAI(promptText) {
  // 1. Try OpenAI if key is present
  if (OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: promptText }],
          temperature: 0.7,
          max_tokens: 150
        })
      });
      const data = await res.json();
      if (res.ok && data.choices?.[0]?.message?.content) {
        return data.choices[0].message.content.trim();
      }
      console.log(`[Notice] OpenAI returned status ${res.status}: ${data.error?.message || ''}. Switching to Gemini...`);
    } catch (e) {
      console.log(`[Notice] OpenAI error: ${e.message}. Switching to Gemini...`);
    }
  }

  // 2. Fallback to Gemini
  if (GEMINI_API_KEY) {
    const models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.7 }
          })
        });
        if (!res.ok) {
          console.log(`[Notice] Gemini model ${model} returned HTTP ${res.status}. Trying next...`);
          continue;
        }
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      } catch (e) {
        console.log(`[Notice] Gemini model ${model} error: ${e.message}. Trying next...`);
      }
    }
  }

  throw new Error('All AI providers failed.');
}

async function generateViralTextPost(page) {
  console.log(`[AI Brain] Generating Simple 2-3 Line Text Post for ${page.name}...`);

  const prompt = `You are a social media writer for "${page.name}" (Topic: ${page.niche}).
Write a super simple, inspiring, 2 to 3 line text post for Facebook.

CRITICAL RULES:
1. Length: EXACTLY 2 to 3 short lines total.
2. Language: SUPER EASY, SIMPLE ENGLISH. Use everyday words that a 10-year-old can understand.
3. NO big or fancy words. No hard vocabulary.
4. Make it punchy, relatable, and easy to read in 3 seconds.
5. Add 1 or 2 simple hashtags at the end.

Examples of the style wanted:
"Don't tell people your plans.
Show them your results.
Move in silence. #Success #Focus"

"Work hard.
Buy assets, not status.
Stay humble. #Wealth #Money"

Return ONLY the plain 2-3 lines of text (no intro, no quotation marks).`;

  const raw = (await callAI(prompt)).replace(/^["']|["']$/g, '').trim();

  // Extract any hashtags generated
  const tags = (raw.match(/(#[a-zA-Z0-9_]+)/g) || []);
  let textOnly = raw.replace(/(#[a-zA-Z0-9_]+)/g, '').trim();

  // If tags exist in raw output, place them at the bottom on their own line with a blank line before
  if (tags.length > 0) {
    return `${textOnly}\n\n${tags.join(' ')}`;
  }
  return `${textOnly}\n\n${page.brandTag.split(' ').slice(0, 2).join(' ')}`;
}

async function publishTextPost(pageId, textContent) {
  const token = await getPageAccessToken(pageId);
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: textContent,
        access_token: token
      })
    });
    const data = await res.json();
    return data.id;
  } catch (e) {
    console.error('Error posting text:', e.message);
    return null;
  }
}

async function runTextCampaign(pageIndex = 3) {
  const targetPages = pageIndex !== null && pageIndex !== undefined
    ? [PAGES[pageIndex % PAGES.length]]
    : PAGES;

  console.log('======================================================');
  console.log(`LAUNCHING HIGHLIGHT TEXT POST ENGINE (${targetPages.map(p => p.name).join(', ')})`);
  console.log('======================================================\n');

  for (const page of targetPages) {
    console.log(`>>> Generating Highlight Text Post for: ${page.name}...`);
    const textContent = await generateViralTextPost(page);
    console.log(`\n----------------------------------------\n${textContent}\n----------------------------------------`);
    
    const postId = await publishTextPost(page.id, textContent);
    if (postId) {
      const permalink = `https://www.facebook.com/${page.id}/posts/${String(postId).split('_').pop()}`;
      console.log(`✓ Text Post LIVE on ${page.name}!`);
      console.log(`  Live URL: ${permalink}\n`);
    } else {
      console.log(`✗ Failed to post to ${page.name}\n`);
    }
  }

  console.log('======================================================');
  console.log('✓ Highlight Text Post Finished!');
  console.log('======================================================');
}

const arg = process.argv[2];
const isAll = process.argv.includes('--all') || arg === 'all';
// Default specifically to Reliq North (index 3)
const pageIdx = isAll ? null : (arg !== undefined && !isNaN(parseInt(arg, 10)) ? parseInt(arg, 10) : 3);
runTextCampaign(pageIdx).catch(console.error);
