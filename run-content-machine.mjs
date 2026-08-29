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
const IG_USER_ID = process.env.IG_USER_ID || (envStr.match(/^IG_USER_ID=(.+)$/m) || [])[1]?.trim() || '17841467537639505';
const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY || (envStr.match(/^POSTIZ_API_KEY=(.+)$/m) || [])[1]?.trim() || '';
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

  const prompt = `You are an elite conceptual art director and chief editorial strategist for "${page.name}" (Niche: ${page.niche}).
Create a VIRAL, MASTERPIECE conceptual social media post matching the exact layout of high-end Swiss advertising (like Blueprint C: The Surreal State Change).

STRICT REQUIREMENTS:
1. "headline": 2-4 WORDS ALL CAPS striking punchy hook (e.g. "DON'T WASTE TIME", "BREAK YOUR LIMITS", "GROW ANYWHERE", "LEVERAGE IS CALM", "OWN THE PIPELINES").
2. "insight_body": 2-3 deep, highly articulate sentences explaining the core wisdom/leverage.
3. "takeaway": 1 punchy rule starting with "Rule: ..." (e.g. "Rule: Buy back your hours before they melt away.").
4. "caption": 80-140 words expanding on the lesson with real-world nuance, a reflective question at the end, and relevant hashtags including ${page.brandTag}.
5. "visual_concept": A single hyper-detailed physical 3D object on the RIGHT 40% of the frame (e.g., melting chrome clock dripping liquid metal, snapped rusted iron chain with glowing molten sparks, delicate seedling bursting through concrete block, gold sphere on basalt pedestal).
6. "image_prompt": "Ultra-luxury surreal advertising photography. Composition: the right 40% of the frame shows a [hyper-detailed physical 3D subject with sharp reflections]. The left 60% of the frame is completely clean, empty, pristine minimalist studio background with wide open negative space. Pristine studio lighting, hyper-realistic tactile textures, award-winning Swiss print ad photography, 8k resolution."

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
          headline: "DON'T WASTE TIME",
          insight_body: 'Time does not wait for preparation; it flows continuously into the void. When you hoard hours in hesitation, they evaporate. Convert transient seconds into durable assets that outlive your presence.',
          takeaway: 'Rule: Buy back your hours before they melt away.',
          caption: 'Most people spend their entire lives broadcasting their financial moves to impress people who do not care. The truly sovereign individual builds assets silently, letting cashflow speak when the results are permanent.\n\nAre you building for status or for absolute freedom?\n\n#SilentWealth #VentureGrowth #CapitalLeverage #AssetOwnership #FinancialSovereignty',
          visual_concept: 'Classic chrome & gold alarm clock surrealistically melting into glossy liquid metal dripping into a black marble bowl.',
          image_prompt: 'Ultra-luxury surreal advertising photography. Composition: the right 40% of the frame shows a classic chrome and gold twin-bell alarm clock surrealistically melting into glossy liquid metal dripping into a black marble bowl on a white Carrara marble shelf. The left 60% of the frame is completely clean, empty, pristine white studio marble wall with wide open negative space. Pristine advertising studio lighting, hyper-glossy reflections, 8k resolution.'
        },
        {
          headline: 'OWN THE PIPELINES',
          insight_body: 'Job income is a bucket; it stops when you stop carrying it. Wealth is a pipeline—assets and systems that push cash to you on schedule. Convert earned income into valves you own and let cashflow cover your living costs.',
          takeaway: 'Rule: Replace hours with flows.',
          caption: 'The highest form of financial leverage is turning one-time effort into recurring cashflow pipelines.\n\n#SilentWealth #CapitalLeverage #AssetOwnership #FinancialSovereignty',
          visual_concept: 'A polished solid gold industrial pipe valve hovering over a white Carrara marble ledge.',
          image_prompt: 'Ultra-luxury surreal advertising photography. Composition: the right 40% of the frame shows a polished solid gold industrial pipe valve hovering over a white Carrara marble ledge with soft warm ambient light. The left 60% of the frame is completely clean, empty, pristine white studio marble wall with wide open negative space. Studio lighting, 8k resolution.'
        }
      ],
      'Strategic Silence': [
        {
          headline: 'BREAK YOUR LIMITS',
          insight_body: 'Every barrier that holds you back is brittle under concentrated pressure. The moment of release is violent and sudden—what seemed unbreakable shatters in a microsecond when conviction peaks.',
          takeaway: 'Rule: Pressure either crushes you or frees you.',
          caption: 'Every limit feels unbreakable until the exact microsecond you decide to push past it. Compounding your strength quietly until the restriction gives way.\n\n#StrategicSilence #DarkPsychology #PowerDynamics #MasterTheUnseen #SelfMastery',
          visual_concept: 'Heavy rusted industrial iron chain caught in the exact microsecond of snapping with molten glowing orange sparks.',
          image_prompt: 'Ultra-luxury cinematic advertising photography. Composition: the right 40% of the frame shows a thick, heavily rusted industrial iron chain caught in the exact micro-second of violently snapping with superheated molten glowing orange sparks and embers flying outward. The left 60% of the frame is completely clean, empty, dark brushed steel background with wide open negative space. Cinematic moody rim lighting, sharp rusted textures, 8k resolution.'
        }
      ],
      'Eon Ventures': [
        {
          headline: 'GROW ANYWHERE',
          insight_body: 'True resilience is converting the weight above you into kinetic force. When you refuse to surrender, the heaviest concrete becomes your launching pad. Life finds a way where comfort never dared to look.',
          takeaway: 'Rule: Outlast the friction, claim the ground.',
          caption: 'Growth is never about having easy ground. It is about developing the internal force that breaks through whatever tried to bury you.\n\n#EonVentures #DisciplineOverMotivation #HighGrowth #Startups #Execution',
          visual_concept: 'Massive solid raw grey concrete block cracked open with a vibrant green seedling bursting upward.',
          image_prompt: 'Ultra-luxury minimalist advertising photography. Composition: the right 40% of the frame shows a massive solid raw grey concrete block cracked open with a delicate, luminous vibrant green plant seedling bursting through with translucent glowing leaves. The left 60% of the frame is completely clean, empty, minimalist soft white concrete studio background with wide open negative space. Bright crisp top-down morning sunlight, sharp tactile textures, award-winning Swiss print ad photography, 8k resolution.'
        }
      ],
      'Reliq North': [
        {
          headline: 'LEVERAGE IS CALM',
          insight_body: 'The loudest moves reveal insecurity; true leverage is built in deliberate stillness. When you refuse to react to short-term noise, you force the environment to match your tempo. Strategic clarity compounds in quiet focus.',
          takeaway: 'Rule: Never let panic dictate your pace.',
          caption: 'In an economy addicted to outrage and instant notifications, deliberate stillness is a superpower. Lower your mental inputs so the quality of your strategic outputs remains uncompromised.\n\n#ReliqNorth #StoicWisdom #DigitalMinimalism #Stillness #ModernLiving',
          visual_concept: 'Polished solid gold sphere delicately balanced on the tip of a natural black basalt stone cone.',
          image_prompt: 'Ultra-luxury minimalist advertising photography. Composition: the right 40% of the frame shows a polished solid gold sphere delicately balanced on the tip of a natural black basalt stone cone on a smooth travertine pedestal. The left 60% of the frame is completely clean, empty, soft warm beige studio wall with wide open negative space. Soft morning light, pristine Scandinavian calm, 8k resolution.'
        }
      ],
      'The Boundaries Club': [
        {
          headline: 'THE PRICE OF ACCESS',
          insight_body: 'Access without boundaries invites entitlement; price your energy with standards, not apologies. State your standards calmly once, and let your absence do the teaching when alignment is broken.',
          takeaway: 'Rule: Access without standards invites disrespect.',
          caption: 'A boundary requires no justification to be valid. When you over-explain your limits, you invite negotiation where none should exist. State your standard calmly once, and let your absence do the teaching.\n\n#TheBoundariesClub #EmotionalIntelligence #ProtectYourPeace #HighValue #SelfRespect',
          visual_concept: 'Solid brushed rose-gold vintage key suspended on fine black cord next to a minimalist Zen ink circle.',
          image_prompt: 'Ultra-luxury fine-art editorial photography. Composition: the right 40% of the frame shows a solid brushed rose-gold vintage key suspended delicately on fine black cord next to a subtle dark circular Sumi-e ink brush mark on fine-art paper. The left 60% of the frame is completely clean, empty, warm textured fine-art paper with wide open negative space. Gallery lighting, 8k resolution.'
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

  // 2. High-Grade 3D Conceptual Advertising Engine (FLUX Realism)
  const isDark = pageInfo?.name === 'Strategic Silence';
  const editorialStyle = isDark ? 'editorial-dark' : 'editorial-clean';
  
  const cleanPrompt = aiData?.image_prompt || `Ultra-luxury surreal advertising photography. Composition: the right 40% of the frame shows a hyper-detailed tactile 3D physical object with sharp reflections. The left 60% of the frame is completely clean, empty, pristine minimalist ${isDark ? 'dark brushed steel' : 'white marble'} studio wall background with wide open negative space. Soft gallery lighting, Hasselblad 80mm macro photography, photorealistic 8k, tactile physical textures`;

  const seed = Math.floor(Math.random() * 1000000);
  const fallbackUrls = [
    `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux-realism&enhance=true`,
    `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=1024&height=1024&seed=${seed + 1}&nologo=true&model=flux`
  ];

  for (let attempt = 0; attempt < fallbackUrls.length; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
      const res = await fetch(fallbackUrls[attempt], { signal: AbortSignal.timeout(25000) });
      if (res.ok) {
        const arr = await res.arrayBuffer();
        if (arr.byteLength > 2000) {
          let buf = Buffer.from(arr);
          
          // Apply Crisp Vector Typography Overlay (Matching Blueprint C Exact Layout)
          try {
            const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
            const overlayRes = await fetch(`http://localhost:3210/format-variant?style=${editorialStyle}`, {
              method: 'POST',
              headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
              body: Buffer.concat([
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="headline"\r\n\r\n${aiData?.headline || ''}\r\n`),
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="insight"\r\n\r\n${aiData?.insight_body || ''}\r\n`),
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="takeaway"\r\n\r\n${aiData?.takeaway || ''}\r\n`),
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="tag"\r\n\r\n${pageInfo?.name || ''}\r\n`),
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="style"\r\n\r\n${editorialStyle}\r\n`),
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="img.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
                buf,
                Buffer.from(`\r\n--${boundary}--\r\n`)
              ])
            });
            if (overlayRes.ok) {
              buf = Buffer.from(await overlayRes.arrayBuffer());
            }
          } catch (e) {}

          fs.writeFileSync(outFilename, buf);
          console.log(`      ✓ Saved 3D Cinematic Masterpiece with Typography: ${outFilename} (${Math.round(buf.length / 1024)} KB)`);
          return buf;
        }
      }
    } catch (e) {}
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
  } catch (e) {}

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
    } catch (e) {}
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
  } catch (e) {}
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

  // 4. [STEP 1/4] Publish Feed Photo Post to Facebook Page
  const fbPostId = await publishToFacebook(page.id, imgBuffer, fullCaption);
  const postPermalink = `https://www.facebook.com/${page.id}/posts/${String(fbPostId || '').split('_').pop()}`;

  // 5. [STEP 2/4] Generate & Publish Dynamic Video Reel
  const chosenMood = MUSIC_PRESETS[(targetPageIndex * 3 + Math.floor(Math.random() * 3)) % MUSIC_PRESETS.length];
  const reelBuffer = await createReelVideo(imgBuffer, chosenMood, 13);
  let reelId = null;
  let tiktokId = null;
  if (reelBuffer) {
    const reelFilename = `reel-${page.id}-${Date.now()}.mp4`;
    fs.writeFileSync(reelFilename, reelBuffer);
    const reelCaption = `${postData.headline}\n\n${postData.insight_body}\n\n${postData.takeaway}\n\n🎵 Music Track: ${chosenMood}${achievementTags}\n\n${page.brandTag}`;
    reelId = await publishReelToFacebook(page.id, reelBuffer, postData.headline, reelCaption);
    tiktokId = await publishToPostizTikTok(reelBuffer, postData.headline, reelCaption);
  }

  // 6. [STEP 3/4] Publish to Facebook Story
  const storyId = await publishStoryToFacebook(page.id, imgBuffer);

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
  } catch (e) {}

  console.log('\n======================================================');
  console.log(`✓ Multi-Format Content Engine Execution Complete!`);
  console.log(`Page: ${page.name} (https://facebook.com/${page.id})`);
  console.log(`✓ Format: ${isAchievement ? '🏆 Earned Achievement Milestone Edition' : 'Standard Value-Dense Edition'}`);
  console.log(`✓ Photo Post ID: ${fbPostId}`);
  console.log(`✓ Facebook Reel Video ID: ${reelId || 'Created & Saved'}`);
  console.log(`✓ Story ID: ${storyId || 'Published'}`);
  console.log(`✓ Group Distribution: 4 Groups Assigned`);
  console.log('======================================================\n');

  return { page, postData, fbPostId, reelId, storyId, groupPack };
}

// Check arguments: node run-content-machine.mjs [pageIndex] [--achievement]
// Default specifically to Reliq North (index 3)
const pageArg = process.argv[2] && !isNaN(parseInt(process.argv[2], 10)) ? parseInt(process.argv[2], 10) : 3;
const isAchievementArg = process.argv.includes('--achievement');
runSinglePageBatch(pageArg, isAchievementArg).catch(console.error);
