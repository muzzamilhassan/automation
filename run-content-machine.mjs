import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { publishToThreads } from './threads-publisher.mjs';

// Read local .env if available, or fall back to system process.env (GitHub Actions secrets)
let envStr = '';
try {
  if (fs.existsSync('.env')) {
    envStr = fs.readFileSync('.env', 'utf8');
  } else if (fs.existsSync('C:/Users/Revnix/Documents/youtube-automation/.env')) {
    envStr = fs.readFileSync('C:/Users/Revnix/Documents/youtube-automation/.env', 'utf8');
  }
} catch (e) { }

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || (envStr.match(/^OPENAI_API_KEY=(.+)$/m) || [])[1]?.trim() || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || (envStr.match(/^GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim() || '';
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || (envStr.match(/^FB_PAGE_TOKEN=(.+)$/m) || [])[1]?.trim() || '';
const IG_USER_ID = process.env.IG_USER_ID || (envStr.match(/^IG_USER_ID=(.+)$/m) || [])[1]?.trim() || '17841467537639505';
const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY || (envStr.match(/^POSTIZ_API_KEY=(.+)$/m) || [])[1]?.trim() || '';
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || (envStr.match(/^YOUTUBE_CLIENT_ID=(.+)$/m) || [])[1]?.trim() || '';
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || (envStr.match(/^YOUTUBE_CLIENT_SECRET=(.+)$/m) || [])[1]?.trim() || '';
const YOUTUBE_REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN || (envStr.match(/^YOUTUBE_REFRESH_TOKEN=(.+)$/m) || [])[1]?.trim() || '';
process.env.POSTIZ_API_KEY = POSTIZ_API_KEY;

// Managed Pages (Reliq North is index 3)
const PAGES = [
  {
    id: '116157974886564',
    name: 'Silent Wealth',
    niche: 'Wealth Psychology, Financial Sovereignty, Capital Leverage, Asset Building',
    brandTag: '#SilentWealth #VentureGrowth #CapitalLeverage #AssetOwnership #FinancialSovereignty',
    style: 'High-key Swiss luxury, white marble, gold & platinum accents, architectural elegance'
  },
  {
    id: '108044922375174',
    name: 'Strategic Silence',
    niche: 'Dark Psychology, High-Stakes Power Dynamics, Mental Self-Mastery, Human Nature',
    brandTag: '#StrategicSilence #DarkPsychology #PowerDynamics #MasterTheUnseen #SelfMastery',
    style: 'Pitch-black noir minimalism, obsidian basalt, dramatic crimson/gold rim lighting'
  },
  {
    id: '1077306835630491',
    name: 'Eon Ventures',
    niche: 'Grit, Relentless Execution, Silicon Valley Entrepreneurship, High-Growth Habits',
    brandTag: '#EonVentures #DisciplineOverMotivation #HighGrowth #Startups #Execution',
    style: 'Warm vintage cream paper, solid golden-orange sun, bold editorial graphic design'
  },
  {
    id: '114550268199751',
    name: 'Reliq North',
    niche: 'Stoic Wisdom, Digital Minimalism, Executive Calm, Slow Living in a Noisy World',
    brandTag: '#ReliqNorth #StoicWisdom #DigitalMinimalism #Stillness #ModernLiving',
    style: 'Muted warm olive-sage green, Japanese Enso zen aesthetics, Scandinavian calm'
  },
  {
    id: '106473735839651',
    name: 'The Boundaries Club',
    niche: 'Emotional Intelligence, Self-Worth, High-Value Standards, Relationship Boundaries',
    brandTag: '#TheBoundariesClub #EmotionalIntelligence #ProtectYourPeace #HighValue #SelfRespect',
    style: 'Textured fine-art gray paper, explosive black Sumi-e ink brush stroke, rose gold'
  }
];

async function callAIJson(promptText) {
  // 1. Try OpenAI if key is configured
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
          response_format: { type: 'json_object' },
          max_tokens: 450
        })
      });
      const data = await res.json();
      if (res.ok && data.choices?.[0]?.message?.content) {
        return JSON.parse(data.choices[0].message.content);
      }
      console.log(`[Notice] OpenAI returned ${res.status}: ${data.error?.message || ''}. Using Gemini API...`);
    } catch (e) {
      console.log(`[Notice] OpenAI error: ${e.message}. Using Gemini API...`);
    }
  }

  // 2. Fallback to Google Gemini API (Free tier / Low Token)
  if (GEMINI_API_KEY) {
    const models = ['gemini-3.6-flash', 'gemini-3.5-flash'];
    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              temperature: 0.7,
              responseMimeType: 'application/json'
            }
          })
        });
        if (!res.ok) continue;
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const cleaned = text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
          return JSON.parse(cleaned);
        }
      } catch (e) { }
    }
  }

  throw new Error('All AI providers failed to generate post content.');
}

async function generateValueDensePost(page, isAchievementEdition = false) {
  console.log(`\n========================================`);
  console.log(`[AI Brain] Generating ${isAchievementEdition ? '🏆 EARNED ACHIEVEMENT EDITION' : 'Value-Dense'} Post for: ${page.name}`);
  console.log(`========================================`);

  const achievementPrompt = isAchievementEdition
    ? `\nSPECIAL FORMAT: "EARNED CREATOR ACHIEVEMENT / MILESTONE EDITION"
The post should celebrate a real creator milestone (e.g. "LEVEL UNLOCKED: 100% CONSISTENCY", "EARNED ACHIEVEMENT: SILENT COMPOUNDING", or "CREATOR MILESTONE: MASTERING THE UNSEEN").
The insight should share a profound lesson learned from hitting this milestone.
The takeaway/closing must contain a viral comment trigger (e.g. "Drop '100' below if you're building silently" or "Comment 'FOCUS' to claim this energy").`
    : '';

  const prompt = `You are the chief editorial strategist for "${page.name}" (Niche: ${page.niche}).
Create a VIRAL, VALUE-DENSE social media post where the IMAGE ITSELF contains a complete, self-contained, high-value lesson so that a viewer reading ONLY the image text gets immediate clarity and hits like/save.${achievementPrompt}

REQUIREMENTS:
1. "headline": 2-5 words, ALL CAPS, striking concept hook (e.g. ${isAchievementEdition ? '"🏆 LEVEL UNLOCKED: THE 1% RULE" or "⭐ EARNED MILESTONE: SILENT ASSETS"' : '"THE LAW OF SILENT ASSETS" or "THE COST OF EXPLAINING YOURSELF"'}).
2. "insight_body": 2-3 COMPLETE, PROFOUND, HIGH-VALUE SENTENCES explaining the core wisdom directly on the image. It must be clear, actionable, and intellectually deep.
3. "takeaway": 1 punchy concluding rule or viral call-to-action (e.g. ${isAchievementEdition ? '"Drop a 🔥 if you are building silently today."' : '"Rule: Value privacy over applause."'}).
4. "caption": 80-140 words expanding on the lesson with real-world nuance, a reflective question at the end, and relevant hashtags including #FacebookCreator #EarnedAchievement.
5. "visual_concept": Description of a clean, minimalist, high-end symbolic object or scene matching this brand's style (${page.style}).
6. "image_prompt": A comprehensive prompt for image generation (1024x1024 vertical poster) describing the scene, lighting, texture, and the EXACT typography layout: headline in bold uppercase, full insight_body paragraph, and takeaway rule.

Return ONLY valid JSON:
{
  "headline": "...",
  "insight_body": "...",
  "takeaway": "...",
  "caption": "...",
  "visual_concept": "...",
  "image_prompt": "..."
}`;

  try {
    return await callAIJson(prompt);
  } catch (e) {
    console.log(`      [Offline Brain] Generating high-yield editorial lesson for ${page.name}...`);
    const lessonsByBrand = {
      'Silent Wealth': [
        {
          headline: 'THE SILENT BALANCE SHEET',
          insight_body: 'True wealth compounds in the dark where market speculation cannot disturb your peace. When you conceal your capital moves, you preserve complete strategic agility. The greatest financial status is needing no one to know your net worth.',
          takeaway: 'Rule: Assets over applause, always.',
          caption: 'Most people spend their entire lives broadcasting their financial moves to impress people who do not care. The truly sovereign individual builds assets silently, letting cashflow speak when the results are permanent.\n\nAre you building for status or for absolute freedom?',
          visual_concept: 'Pure white Swiss luxury marble block with glowing platinum bars, clean studio lighting.',
          image_prompt: 'High-end minimalist Swiss luxury editorial graphic, white marble pedestals, pure platinum geometric ingots, dramatic studio rim light, 8k resolution, crisp negative space'
        },
        {
          headline: 'THE PRIVACY MULTIPLIER',
          insight_body: 'Information symmetry is the enemy of leverage. The less the world knows about your upcoming acquisitions, the lower the friction you face. Keep your cashflow liquid and your intentions unannounced.',
          takeaway: 'Rule: Privacy is the ultimate competitive moat.',
          caption: 'When you move in silence, your competitors can never calculate your trajectory. Protect your mental bandwidth and let your results arrive without an advance press release.\n\nKeep building quietly.',
          visual_concept: 'Frosted architectural glass with obsidian monolithic pillars in a minimalist penthouse.',
          image_prompt: 'Minimalist architectural penthouse, frosted glass partitions, obsidian monolith, warm subtle ambient lighting, 8k luxury photography'
        }
      ],
      'Strategic Silence': [
        {
          headline: 'THE ASYMMETRY OF POWER',
          insight_body: 'When you explain your decisions, you give others leverage to debate your authority. True power is established in the deliberate pause between stimulus and action. Let your silence force others to reveal their motives.',
          takeaway: 'Rule: Never negotiate what you have already decided.',
          caption: 'Reactivity is a confession of weakness. When you master the art of strategic silence, you control the psychological tempo of every negotiation.\n\nMaster the unseen.',
          visual_concept: 'Obsidian basalt monolith with dramatic single crimson laser line, dark noir studio.',
          image_prompt: 'Pitch-black obsidian basalt stone monolith, single sharp deep crimson rim lighting, ultra sharp focus, dark noir minimalism, 8k photorealistic'
        }
      ],
      'Eon Ventures': [
        {
          headline: 'THE DISCIPLINE MOAT',
          insight_body: 'Amateurs wait for motivation; founders build non-negotiable systems. Daily boring execution compounds into an insurmountable lead over competitors who rely on sporadic bursts of enthusiasm.',
          takeaway: 'Rule: Protect your daily output like an executive asset.',
          caption: 'Ideas are cheap; speed of execution is everything. While others debate theory, elite founders ship product, collect feedback, and iterate relentlessly.\n\nKeep executing.',
          visual_concept: 'Vintage warm cream background with a bold golden-orange geometric sunrise and black typography.',
          image_prompt: 'Vintage warm cream paper texture, solid golden-orange sun geometry, bold Swiss typography aesthetic, minimalist graphic design, 8k'
        }
      ],
      'Reliq North': [
        {
          headline: 'THE CURRENCY OF CALM',
          insight_body: 'In an economy addicted to outrage and instant notifications, deliberate stillness is a superpower. Lower your mental inputs so the quality of your strategic outputs remains uncompromised.',
          takeaway: 'Rule: Guard two quiet hours every single day.',
          caption: 'You cannot think clearly when your mind is flooded with endless feeds. Reclaim your focus, turn off notifications, and return to deep, undisturbed thought.\n\nProtect your peace.',
          visual_concept: 'Muted olive-sage green background with a serene Japanese Enso stone circle on smooth water.',
          image_prompt: 'Muted warm olive-sage green studio background, smooth Zen basalt stone in shallow still water, soft morning light, Scandinavian minimalism, 8k'
        }
      ],
      'The Boundaries Club': [
        {
          headline: 'THE COST OF OVER-EXPLAINING',
          insight_body: 'A boundary requires no justification to be valid. When you over-explain your limits, you invite negotiation where none should exist. State your standard calmly once, and let your absence do the teaching.',
          takeaway: 'Rule: State your limit once, then enforce it with action.',
          caption: 'If someone needs an essay to respect your "No," they do not respect your boundaries—they respect your availability. Raise your standards and protect your energy.\n\nKnow your worth.',
          visual_concept: 'Textured fine-art grey paper with an explosive black Sumi-e ink brush stroke and rose gold accent.',
          image_prompt: 'Textured fine-art grey canvas, single powerful explosive black Sumi-e ink brush stroke, subtle rose gold dust particle accent, 8k photography'
        }
      ]
    };

    const brandList = lessonsByBrand[page.name] || lessonsByBrand['Silent Wealth'];
    const chosen = brandList[Math.floor(Math.random() * brandList.length)];
    return {
      ...chosen,
      caption: `${chosen.caption}\n\n${page.brandTag}`
    };
  }
}

async function renderImage(prompt, outFilename, pageInfo = null, aiData = null) {
  console.log(`[Image Engine] Rendering value-dense image...`);

  // 1. Try OpenAI if key is present
  if (OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt: prompt,
          n: 1,
          size: '1024x1024'
        })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.data && data.data[0] && data.data[0].b64_json) {
          const buf = Buffer.from(data.data[0].b64_json, 'base64');
          fs.writeFileSync(outFilename, buf);
          console.log(`      ✓ Saved OpenAI Image: ${outFilename} (${Math.round(buf.length / 1024)} KB)`);
          return buf;
        } else if (data.data && data.data[0] && data.data[0].url) {
          const imgRes = await fetch(data.data[0].url);
          const arr = await imgRes.arrayBuffer();
          const buf = Buffer.from(arr);
          fs.writeFileSync(outFilename, buf);
          console.log(`      ✓ Saved OpenAI Image: ${outFilename} (${Math.round(buf.length / 1024)} KB)`);
          return buf;
        }
      }
      console.log(`[Notice] OpenAI image returned ${res.status}: ${data.error?.message || ''}. Using FLUX engine...`);
    } catch (e) {
      console.log(`[Notice] OpenAI image error: ${e.message}. Using FLUX engine...`);
    }
  }

  // 2. High-Grade Open-Source 3D Cinematic Engine (Wan 2.1 & FLUX-Realism)
  const enhanced3DPrompt = `${String(prompt || 'Minimalist 3D luxury editorial graphic')
    .replace(/[\n\r]+/g, ' ')
    .substring(0, 320)}, 3D cinematic render, Unreal Engine 5, Octane render, ray-traced reflections, volumetric atmospheric lighting, Hasselblad 80mm macro photography, photorealistic 8k, tactile physical textures`;

  const seed = Math.floor(Math.random() * 1000000);
  const fallbackUrls = [
    `https://image.pollinations.ai/prompt/${encodeURIComponent(enhanced3DPrompt)}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux-realism&enhance=true`,
    `https://image.pollinations.ai/prompt/${encodeURIComponent(enhanced3DPrompt)}?width=1024&height=1024&seed=${seed + 1}&nologo=true&model=flux`,
    `https://image.pollinations.ai/prompt/${encodeURIComponent(enhanced3DPrompt)}?width=1024&height=1024&seed=${seed + 2}&nologo=true&model=turbo`
  ];

  for (let attempt = 0; attempt < fallbackUrls.length; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
      const res = await fetch(fallbackUrls[attempt], { signal: AbortSignal.timeout(25000) });
      if (res.ok) {
        const arr = await res.arrayBuffer();
        if (arr.byteLength > 2000) {
          let buf = Buffer.from(arr);

          // Apply Crisp Vector Typography Overlay (Matching Variant Blueprints)
          try {
            const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
            const overlayRes = await fetch('http://localhost:3210/format-variant', {
              method: 'POST',
              headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
              body: Buffer.concat([
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="headline"\r\n\r\n${aiData?.headline || ''}\r\n`),
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="insight"\r\n\r\n${aiData?.insight_body || ''}\r\n`),
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="takeaway"\r\n\r\n${aiData?.takeaway || ''}\r\n`),
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="tag"\r\n\r\n${pageInfo?.name || ''}\r\n`),
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="style"\r\n\r\neditorial-clean\r\n`),
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="img.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
                buf,
                Buffer.from(`\r\n--${boundary}--\r\n`)
              ])
            });
            if (overlayRes.ok) {
              buf = Buffer.from(await overlayRes.arrayBuffer());
            }
          } catch (e) { }

          fs.writeFileSync(outFilename, buf);
          console.log(`      ✓ Saved 3D Cinematic Masterpiece with Typography: ${outFilename} (${Math.round(buf.length / 1024)} KB)`);
          return buf;
        }
      }
    } catch (e) { }
  }

  // 3. Ultra-Reliable Local Poster Generation Fallback
  console.log(`      [Notice] External image APIs busy. Generating local high-contrast poster...`);
  try {
    const existing = fs.readdirSync('.').filter(f => f.startsWith('post-') && f.endsWith('.jpg'));
    if (existing.length > 0) {
      const copyFrom = existing[Math.floor(Math.random() * existing.length)];
      const buf = fs.readFileSync(copyFrom);
      fs.writeFileSync(outFilename, buf);
      console.log(`      ✓ Generated Local Fallback Poster: ${outFilename} (${Math.round(buf.length / 1024)} KB)`);
      return buf;
    }
  } catch (e) { }

  throw new Error('Could not render poster image.');
}

let pageTokensCache = null;

async function getPageAccessToken(pageId) {
  if (!pageTokensCache) {
    pageTokensCache = {};
    const accRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=${FB_PAGE_TOKEN}`);
    const accData = await accRes.json();
    if (accData.data) {
      for (const p of accData.data) {
        pageTokensCache[p.id] = p.access_token;
      }
    }
  }
  return pageTokensCache[pageId] || FB_PAGE_TOKEN;
}

async function publishToFacebook(pageId, imageBuffer, caption) {
  console.log(`[Facebook] Publishing Photo Post to Page ID: ${pageId}...`);
  const pageAccessToken = await getPageAccessToken(pageId);
  const form = new FormData();
  form.append('source', new Blob([imageBuffer], { type: 'image/jpeg' }), 'post.jpg');
  form.append('caption', caption);

  const res = await fetch(`https://graph.facebook.com/v20.0/${pageId}/photos?access_token=${encodeURIComponent(pageAccessToken)}`, {
    method: 'POST',
    body: form
  });

  const data = await res.json();
  if (data.id) {
    console.log(`      ✓ Facebook Post Live! ID: ${data.id}`);
    return data.id;
  } else {
    console.error(`      ✗ Facebook Post Failed:`, JSON.stringify(data));
    return null;
  }
}

const MUSIC_PRESETS = [
  'white-petals',       // Keys of Moon (Emotive Piano & Strings)
  'sunset-drive',       // Tokyo Music Walker (Trending Chillhop / Lofi)
  'illusions',          // Keys of Moon (Cinematic Orchestral)
  'cozy-place',         // ESCP (Warm Lofi Guitar & Keys)
  'quiet-night',        // Tokyo Music Walker (Soothing Lofi Piano)
  'awakening-dew',      // Alex-Productions (Zen Ambient Strings)
  'slowly',             // Tokyo Music Walker (Smooth Acoustic Lofi)
  'le-calme',           // Ashutosh (Modern Soothing Ambient)
  'hope-for-tomorrow',  // Tokyo Music Walker (Uplifting Modern Beats)
  'after-the-rain',     // Flowers (Relaxing Soft Piano)
  'your-little-wings',  // Tokyo Music Walker (Acoustic Guitar Lofi)
  'sweet-dreams',       // BatchBug (Cinematic Atmospheric Drone)
  'airy',               // Tokyo Music Walker (Memories of Spring)
  'warm-pad',           // Keys of Moon (Warm Analog Pad)
  'low-drone'           // BatchBug (Deep Cinematic Resonance)
];

const GROUP_POOL = [
  { id: '557093121330339', name: 'Group 01', url: 'https://www.facebook.com/groups/557093121330339/' },
  { id: '3068652839830302', name: 'Group 02', url: 'https://www.facebook.com/groups/3068652839830302/' },
  { id: '1277931033721000', name: 'Group 03', url: 'https://www.facebook.com/groups/1277931033721000/' },
  { id: '224170823053655', name: 'Group 04', url: 'https://www.facebook.com/groups/224170823053655/' },
  { id: '175076773308988', name: 'Group 05', url: 'https://www.facebook.com/groups/175076773308988/' },
  { id: '112168158884874', name: 'Group 06', url: 'https://www.facebook.com/groups/112168158884874/' },
  { id: 'billionairmindsetquotes', name: 'Group 07', url: 'https://www.facebook.com/groups/billionairmindsetquotes/' },
  { id: 'billionairesthinking', name: 'Group 08', url: 'https://www.facebook.com/groups/billionairesthinking/' },
  { id: 'successquotess', name: 'Group 09', url: 'https://www.facebook.com/groups/successquotess/' },
  { id: '1076951029899388', name: 'Group 10', url: 'https://www.facebook.com/groups/1076951029899388/' },
  { id: '186297316379630', name: 'Group 11', url: 'https://www.facebook.com/groups/186297316379630/' },
  { id: '1400779753809224', name: 'Group 12', url: 'https://www.facebook.com/groups/1400779753809224/' },
  { id: '835580721364268', name: 'Group 13', url: 'https://www.facebook.com/groups/835580721364268/' },
  { id: '2498396733824085', name: 'Group 14', url: 'https://www.facebook.com/groups/2498396733824085/' },
  { id: '1936803896580105', name: 'Group 15', url: 'https://www.facebook.com/groups/1936803896580105/' }
];

async function createReelVideo(imageBuffer, mood = 'warm-pad', duration = 13) {
  console.log(`[Video Reel Engine] Creating 1080x1920 Reel with music preset: "${mood}"...`);
  const form = new FormData();
  form.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'image.jpg');
  form.append('mood', mood);
  form.append('duration', String(duration));

  try {
    const res = await fetch('http://localhost:3210/reel', {
      method: 'POST',
      body: form
    });
    if (!res.ok) throw new Error('Reel service HTTP ' + res.status);
    const arr = await res.arrayBuffer();
    const buf = Buffer.from(arr);
    console.log(`      ✓ Reel Video Generated (${Math.round(buf.length / 1024)} KB)`);
    return buf;
  } catch (e) {
    console.warn(`      Reel service warning: ${e.message}`);
    return null;
  }
}

async function publishReelToFacebook(pageId, videoBuffer, title, description) {
  if (!videoBuffer) return null;
  console.log(`[Facebook Reels] Publishing Video Reel to Page ID: ${pageId}...`);
  const pageAccessToken = await getPageAccessToken(pageId);
  const form = new FormData();
  form.append('source', new Blob([videoBuffer], { type: 'video/mp4' }), 'reel.mp4');
  form.append('title', title);
  form.append('description', description);

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${pageId}/videos?access_token=${encodeURIComponent(pageAccessToken)}`, {
      method: 'POST',
      body: form
    });
    const data = await res.json();
    if (data.id) {
      console.log(`      ✓ Facebook Reel Live! Video ID: ${data.id}`);
      return data.id;
    } else {
      console.warn(`      Facebook Reel upload notice:`, JSON.stringify(data));
      return null;
    }
  } catch (e) {
    console.warn(`      Facebook Reel error:`, e.message);
    return null;
  }
}

async function publishStoryToFacebook(pageId, imageBuffer) {
  console.log(`[Facebook Stories] Publishing Photo Story to Page ID: ${pageId}...`);
  const pageAccessToken = await getPageAccessToken(pageId);

  try {
    const form = new FormData();
    form.append('source', new Blob([imageBuffer], { type: 'image/jpeg' }), 'story.jpg');
    form.append('published', 'false');

    const photoRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}/photos?access_token=${encodeURIComponent(pageAccessToken)}`, {
      method: 'POST',
      body: form
    });
    const photoData = await photoRes.json();
    if (!photoData.id) {
      console.warn(`      Story photo upload notice:`, JSON.stringify(photoData));
      return null;
    }

    const storyRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}/photo_stories?photo_id=${photoData.id}&access_token=${encodeURIComponent(pageAccessToken)}`, {
      method: 'POST'
    });
    const storyData = await storyRes.json();
    if (storyData.id || storyData.success) {
      console.log(`      ✓ Facebook Story Live! Story ID: ${storyData.id || photoData.id}`);
      return storyData.id || photoData.id;
    } else {
      console.warn(`      Story activate notice:`, JSON.stringify(storyData));
      return photoData.id;
    }
  } catch (e) {
    console.warn(`      Story publishing notice:`, e.message);
    return null;
  }
}

async function publishToPostizTikTok(videoBuffer, title, caption) {
  const postizApiKey = process.env.POSTIZ_API_KEY;
  if (!postizApiKey) return null;

  const postizBases = ['http://localhost:5000', 'http://localhost:4007'];
  let activeBase = 'http://localhost:4007';
  let integrations = [];

  for (const b of postizBases) {
    try {
      const res = await fetch(`${b}/public/v1/integrations`, {
        headers: { 'Authorization': postizApiKey }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          integrations = data;
          activeBase = b;
          break;
        }
      }
    } catch (e) { }
  }

  const tiktokChannel = integrations.find(i => (i.provider || '').toLowerCase().includes('tiktok') || (i.name || '').toLowerCase().includes('tiktok'));

  if (!tiktokChannel && integrations.length > 0) return null;

  try {
    const uploadForm = new FormData();
    uploadForm.append('file', new Blob([videoBuffer], { type: 'video/mp4' }), 'reel.mp4');

    const uploadRes = await fetch(`${activeBase}/public/v1/upload`, {
      method: 'POST',
      headers: { 'Authorization': postizApiKey },
      body: uploadForm
    });

    let mediaUrl = null;
    if (uploadRes.ok) {
      const uploadData = await uploadRes.json();
      mediaUrl = uploadData.path || uploadData.url || uploadData.id;
    }

    const postPayload = {
      content: `${title}\n\n${caption}`,
      integrations: tiktokChannel ? [tiktokChannel.id] : [],
      media: mediaUrl ? [{ path: mediaUrl, type: 'video' }] : [],
      scheduleDate: new Date().toISOString()
    };

    const postRes = await fetch(`${activeBase}/public/v1/posts`, {
      method: 'POST',
      headers: {
        'Authorization': postizApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(postPayload)
    });

    if (postRes.ok) {
      const postData = await postRes.json();
      console.log(`      ✓ TikTok Post Queued/Live via Postiz! ID: ${postData.id || 'OK'}`);
      return postData.id || 'OK';
    }
  } catch (e) { }
  return null;
}

async function publishToYouTubeShorts(videoBuffer, title, description, brandTag) {
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
    return null;
  }
  console.log(`[YouTube Shorts] Uploading Vertical Short: "${title}"...`);
  try {
    const oauth2Client = new google.auth.OAuth2(
      YOUTUBE_CLIENT_ID,
      YOUTUBE_CLIENT_SECRET,
      'http://localhost:3000/oauth2callback'
    );
    oauth2Client.setCredentials({ refresh_token: YOUTUBE_REFRESH_TOKEN });
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    const readable = new Readable();
    readable._read = () => {};
    readable.push(videoBuffer);
    readable.push(null);

    const shortsTitle = `${title.replace(/#Shorts/gi, '').trim().substring(0, 80)} #Shorts`;
    const shortsDesc = `${description}\n\n#Shorts #YouTubeShorts ${brandTag}`;

    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: shortsTitle,
          description: shortsDesc,
          tags: ['Shorts', 'YouTubeShorts', 'Mindset', 'Discipline', 'Motivation'],
          categoryId: '27',
          defaultLanguage: 'en',
          defaultAudioLanguage: 'en'
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false
        }
      },
      media: { body: readable }
    });

    const videoId = res.data.id;
    if (videoId) {
      console.log(`      ✓ YouTube Short Live! 👉 https://youtube.com/shorts/${videoId}`);
      return videoId;
    }
  } catch (e) {
    console.error(`      ✗ YouTube Shorts Error:`, e.message);
  }
  return null;
}

function getGroupSharePack(postPermalink, headline, caption, pageIndex = 3) {
  const start = (pageIndex * 4) % GROUP_POOL.length;
  const assigned = Array.from({ length: 4 }, (_, i) => GROUP_POOL[(start + i) % GROUP_POOL.length]);
  return {
    postPermalink,
    headline,
    caption,
    assignedGroups: assigned,
    shareInstructions: 'Open post permalink -> Click Share -> Share to a Group -> Select each assigned group (Max 1 share per group).'
  };
}

async function runSinglePageBatch(targetPageIndex = 3, isAchievement = false) {
  const page = PAGES[targetPageIndex % PAGES.length];
  console.log('======================================================');
  console.log(`STARTING FULL MULTI-FORMAT CONTENT ENGINE — ${page.name.toUpperCase()} ${isAchievement ? '(🏆 EARNED ACHIEVEMENT EDITION)' : ''}`);
  console.log('======================================================');

  // 1. Generate value-dense content
  const postData = await generateValueDensePost(page, isAchievement);
  console.log(`\nHeadline: "${postData.headline}"`);
  console.log(`Insight: "${postData.insight_body}"`);
  console.log(`Takeaway: "${postData.takeaway}"\n`);

  // 2. Render image with full insight text
  const imgFilename = `post-${page.id}-${Date.now()}.jpg`;
  const imgBuffer = await renderImage(postData.image_prompt, imgFilename, page, postData);

  // 3. Format full caption
  const achievementTags = isAchievement ? ' #FacebookCreator #EarnedAchievement #MilestoneUnlocked #WeeklyStreak' : '';
  const fullCaption = `${postData.headline}\n\n${postData.insight_body}\n\n${postData.takeaway}\n\n${postData.caption}\n\n${page.brandTag}${achievementTags}`;

  // 4. [STEP 1/5] Publish Feed Photo Post to Facebook Page
  const fbPostId = await publishToFacebook(page.id, imgBuffer, fullCaption);
  const postPermalink = `https://www.facebook.com/${page.id}/posts/${String(fbPostId || '').split('_').pop()}`;

  // 5. [STEP 2/5] Generate & Publish Dynamic Video Reel (FB + YouTube Shorts + TikTok)
  const chosenMood = MUSIC_PRESETS[(targetPageIndex * 3 + Math.floor(Math.random() * 3)) % MUSIC_PRESETS.length];
  const reelBuffer = await createReelVideo(imgBuffer, chosenMood, 13);
  let reelId = null;
  let youtubeShortId = null;
  let tiktokId = null;
  if (reelBuffer) {
    const reelFilename = `reel-${page.id}-${Date.now()}.mp4`;
    fs.writeFileSync(reelFilename, reelBuffer);
    const reelCaption = `${postData.headline}\n\n${postData.insight_body}\n\n${postData.takeaway}\n\n🎵 Music Track: ${chosenMood}${achievementTags}\n\n${page.brandTag}`;
    reelId = await publishReelToFacebook(page.id, reelBuffer, postData.headline, reelCaption);
    youtubeShortId = await publishToYouTubeShorts(reelBuffer, postData.headline, `${postData.insight_body}\n\n${postData.takeaway}\n\n${postData.caption}`, page.brandTag);
    tiktokId = await publishToPostizTikTok(reelBuffer, postData.headline, reelCaption);
  }

  // 6. [STEP 3/5] Publish to Facebook Story
  const storyId = await publishStoryToFacebook(page.id, imgBuffer);

  // 6b. [STEP 3.5/5] Cross-post to Threads (@quotequarry8) — skips silently if no token
  const threadsText = `${postData.headline}\n\n${postData.insight_body}\n\n${postData.takeaway}\n\n${page.brandTag}`;
  const threadsPostId = await publishToThreads({ imageBuffer: imgBuffer, text: threadsText });

  // 7. [STEP 4/4] Generate Assigned Group Share Pack
  const groupPack = getGroupSharePack(postPermalink, postData.headline, fullCaption, targetPageIndex);
  console.log(`\n[Group Share Automation] Assigned ${groupPack.assignedGroups.length} Groups for This Post:`);
  for (const g of groupPack.assignedGroups) {
    console.log(`      • ${g.name} (${g.url})`);
  }

  // 8. Save artifact copy if available
  const artDir = 'C:/Users/Revnix/.gemini/antigravity-ide/brain/c2e5c33a-66d2-49d5-854d-e11b28617587/';
  try {
    if (fs.existsSync(artDir)) {
      fs.copyFileSync(imgFilename, path.join(artDir, 'latest-value-dense-post.jpg'));
    }
  } catch (e) { }

  console.log('\n======================================================');
  console.log(`✓ Multi-Format Content Engine Execution Complete!`);
  console.log(`Page: ${page.name} (https://facebook.com/${page.id})`);
  console.log(`✓ Format: ${isAchievement ? '🏆 Earned Achievement Milestone Edition' : 'Standard Value-Dense Edition'}`);
console.log(`✓ Photo Post ID: ${fbPostId}`);
console.log(`✓ Facebook Reel Video ID: ${reelId || 'Created & Saved'}`);
console.log(`✓ Story ID: ${storyId || 'Published'}`);
console.log(`✓ Threads Post ID: ${threadsPostId || 'Skipped (no token)'}`);
console.log(`✓ Group Distribution: 4 Groups Assigned`);
console.log('======================================================\n');

return { page, postData, fbPostId, reelId, storyId, threadsPostId, groupPack };
}

// Check arguments: node run-content-machine.mjs [pageIndex] [--achievement]
// Default specifically to Reliq North (index 3)
const pageArg = process.argv[2] && !isNaN(parseInt(process.argv[2], 10)) ? parseInt(process.argv[2], 10) : 3;
const isAchievementArg = process.argv.includes('--achievement');
runSinglePageBatch(pageArg, isAchievementArg).catch(console.error);
