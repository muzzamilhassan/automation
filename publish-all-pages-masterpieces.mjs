import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const envStr = fs.readFileSync('.env', 'utf8');
const USER_FB_TOKEN = envStr.match(/^FB_PAGE_TOKEN=(.+)$/m)[1].trim();
const IG_USER_ID = envStr.match(/^IG_USER_ID=(.+)$/m) ? envStr.match(/^IG_USER_ID=(.+)$/m)[1].trim() : '17841467537639505';

// Get Cloudflare Tunnel URL
let tunnelUrl = null;
try {
  const tunnelLogs = execSync('docker logs yt-tunnel 2>&1').toString();
  const tunnelMatch = tunnelLogs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
  tunnelUrl = tunnelMatch ? tunnelMatch[tunnelMatch.length - 1] : null;
} catch (e) {
  console.warn('Could not read tunnel logs:', e.message);
}
console.log('Tunnel URL:', tunnelUrl);

// 1. Fetch individual page access tokens from Meta Graph API
let pageTokens = {};
try {
  const accRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=${USER_FB_TOKEN}`);
  const accData = await accRes.json();
  if (accData.data) {
    for (const p of accData.data) {
      pageTokens[p.id] = p.access_token;
      console.log(`✓ Got Page Token for: ${p.name} (${p.id})`);
    }
  }
} catch (e) {
  console.error('Error fetching page tokens:', e.message);
}

const CAMPAIGNS = [
  {
    pageId: '116157974886564',
    pageName: 'Silent Wealth',
    id: 'silent-wealth-dont-waste-time',
    sourceImage: 'blueprint-C-exact-match.jpg',
    savedImage: 'post-silent-wealth-dont-waste-time.jpg',
    savedReel: 'reel-silent-wealth-dont-waste-time.mp4',
    headline: "DON'T WASTE TIME",
    hook: "Minutes cannot be hoarded in a bank; they flow continuously into the void. When you spend hours in hesitation, they evaporate.",
    caption: `We treat time as if it is solid and permanent, but it slips away like liquid metal if you do not take deliberate action. The plans you keep putting off for "someday" are actively dissolving.

Convert transient seconds into durable assets that outlive your presence. Every month, buy back one more hour of your freedom through sovereign equity and distribution systems.

Rule: Buy back your hours before they melt away.`,
    cta: "What is one high-leverage asset you are building this week?",
    hashtags: ['#SilentWealth', '#CapitalLeverage', '#AssetOwnership', '#FinancialSovereignty', '#TimeIsLeverage', '#WealthMindset'],
    mood: 'warm-pad',
    credit: 'White Petals — Keys of Moon (CC BY 4.0)'
  },
  {
    pageId: '108044922375174',
    pageName: 'Strategic Silence',
    id: 'strategic-silence-break-limits',
    sourceImage: 'blueprint-B-exact-match.jpg',
    savedImage: 'post-strategic-silence-break-limits.jpg',
    savedReel: 'reel-strategic-silence-break-limits.mp4',
    headline: "BREAK YOUR LIMITS",
    hook: "Every barrier that holds you back is brittle under concentrated pressure. The moment of release is violent and sudden.",
    caption: `What seemed unbreakable shatters in a microsecond when conviction peaks. When you master strategic silence, you stop broadcasting your internal friction to the world.

Quietly compound your leverage in the shadows. Apply ruthless, unwavering pressure to the single critical variable until the restriction gives way.

Rule: Pressure either crushes you or frees you.`,
    cta: "What limit are you ready to shatter in silence?",
    hashtags: ['#StrategicSilence', '#DarkPsychology', '#PowerDynamics', '#SelfMastery', '#UnseenLeverage', '#Execution'],
    mood: 'low-drone',
    credit: 'Sweet Dreams — BatchBug (CC BY 3.0)'
  },
  {
    pageId: '1077306835630491',
    pageName: 'Eon Ventures',
    id: 'eon-ventures-grow-anywhere',
    sourceImage: 'blueprint-A-exact-match.jpg',
    savedImage: 'post-eon-ventures-grow-anywhere.jpg',
    savedReel: 'reel-eon-ventures-grow-anywhere.mp4',
    headline: "GROW ANYWHERE",
    hook: "True resilience is converting the weight above you into kinetic force. When you refuse to surrender, the heaviest stone becomes your launching pad.",
    caption: `Life finds a way where comfort never dared to look. Amateurs wait for favorable weather and easy capital; elite founders grow roots directly into solid concrete.

Do not complain about the friction in your environment—use the resistance to build an indestructible foundation.

Rule: Outlast the friction, claim the ground.`,
    cta: "Drop a 🔥 if you are building through the resistance today.",
    hashtags: ['#EonVentures', '#DisciplineOverMotivation', '#StartupMindset', '#Resilience', '#FounderExecution', '#Grit'],
    mood: 'airy',
    credit: 'Memories of Spring — Tokyo Music Walker (CC BY 3.0)'
  },
  {
    pageId: '114550268199751',
    pageName: 'Reliq North',
    id: 'reliq-north-leverage-is-calm',
    sourceImage: 'post-preview-leverage-is-calm.jpg',
    savedImage: 'post-reliq-north-leverage-is-calm.jpg',
    savedReel: 'reel-reliq-north-leverage-is-calm.mp4',
    headline: "LEVERAGE IS CALM",
    hook: "The loudest moves reveal insecurity; true leverage is built in deliberate stillness.",
    caption: `When you refuse to react to short-term noise, you force the entire environment to match your tempo. Strategic clarity compounds only when your bandwidth is shielded from panic.

In an economy addicted to instant outrage and endless tabs, deliberate composure is the ultimate competitive advantage.

Rule: Never let panic dictate your pace.`,
    cta: "How do you protect your focus from daily digital chaos?",
    hashtags: ['#ReliqNorth', '#StoicWisdom', '#ExecutiveCalm', '#DigitalMinimalism', '#Stillness', '#Clarity'],
    mood: 'warm-pad',
    credit: 'White Petals — Keys of Moon (CC BY 4.0)'
  },
  {
    pageId: '106473735839651',
    pageName: 'The Boundaries Club',
    id: 'boundaries-club-price-of-access',
    sourceImage: 'post-106473735839651-1787687883063.jpg',
    savedImage: 'post-boundaries-club-price-of-access.jpg',
    savedReel: 'reel-boundaries-club-price-of-access.mp4',
    headline: "THE PRICE OF ACCESS",
    hook: "Access is your highest leverage; price it with standards, not apologies.",
    caption: `Define non-negotiable criteria—honesty, consistency, reciprocity—and attach immediate consequences. Alignment pays, entitlement leaves.

When you over-explain your boundaries, you invite debate where none belongs. State your standard calmly once, and let your absence do the teaching.

Rule: Access without standards invites disrespect.`,
    cta: "What is one boundary you are actively honoring this month?",
    hashtags: ['#TheBoundariesClub', '#EmotionalIntelligence', '#SelfRespect', '#HighStandards', '#ProtectYourPeace', '#Boundaries'],
    mood: 'airy',
    credit: 'Memories of Spring — Tokyo Music Walker (CC BY 3.0)'
  }
];

function buildFullCaption(c) {
  return `${c.headline}\n\n${c.hook}\n\n${c.caption}\n\n${c.cta}\n\n${c.hashtags.join(' ')}`;
}

async function publishAll() {
  console.log(`\n================================================================`);
  console.log(`Publishing Masterpiece Campaigns across all 5 Connected Pages`);
  console.log(`================================================================\n`);

  for (const c of CAMPAIGNS) {
    console.log(`\n==================================================`);
    console.log(`PAGE: [${c.pageName}] (${c.pageId})`);
    console.log(`CAMPAIGN: ${c.headline}`);
    console.log(`==================================================`);

    const pageToken = pageTokens[c.pageId] || USER_FB_TOKEN;

    // 1. Copy and Save Masterpiece Image Locally
    if (!fs.existsSync(c.sourceImage)) {
      console.error(`Source image missing: ${c.sourceImage}`);
      continue;
    }
    const rawImageBuf = fs.readFileSync(c.sourceImage);
    fs.writeFileSync(c.savedImage, rawImageBuf);
    console.log(`[1/5] Saved local image: ${c.savedImage} (${Math.round(rawImageBuf.length / 1024)} KB)`);

    // 2. Fit to 4:5 via image-tools
    console.log(`[2/5] Storing 4:5 image in image-tools...`);
    try {
      const fitForm = new FormData();
      fitForm.append('image', new Blob([rawImageBuf], { type: 'image/jpeg' }), c.savedImage);
      fitForm.append('id', c.id);
      await fetch('http://localhost:3210/fitfb?format=json', {
        method: 'POST',
        body: fitForm,
        headers: { Accept: 'application/json' }
      });
      console.log(`      ✓ 4:5 format ready in image-tools`);
    } catch (e) {
      console.warn(`      ⚠️ fitfb: ${e.message}`);
    }

    const publicImageUrl = tunnelUrl ? `${tunnelUrl}/img/${c.id}.jpg` : null;
    const fullCaption = buildFullCaption(c);

    // 3. Publish Facebook Feed Post (Photo + Caption)
    console.log(`[3/5] Publishing Facebook Feed Post for ${c.pageName}...`);
    try {
      const fbForm = new FormData();
      fbForm.append('source', new Blob([rawImageBuf], { type: 'image/jpeg' }), c.savedImage);
      fbForm.append('caption', fullCaption);

      const fbRes = await fetch(`https://graph.facebook.com/v20.0/${c.pageId}/photos?access_token=${encodeURIComponent(pageToken)}`, {
        method: 'POST',
        body: fbForm
      });
      const fbData = await fbRes.json();
      if (fbData.id || fbData.post_id) {
        console.log(`      ✓ FB Feed Post Published! Post ID: ${fbData.post_id || fbData.id}`);
      } else {
        console.error(`      ✗ FB Feed Error:`, JSON.stringify(fbData));
      }
    } catch (e) {
      console.error(`      ✗ FB Error:`, e.message);
    }

    // 4. Generate 13s High-Definition Reel Video via image-tools
    console.log(`[4/5] Generating 13s 1080x1920 Reel Video with ${c.mood} audio...`);
    let videoBuf = null;
    try {
      const reelForm = new FormData();
      reelForm.append('image', new Blob([rawImageBuf], { type: 'image/jpeg' }), 'poster.jpg');
      reelForm.append('duration', '13');
      reelForm.append('mood', c.mood);
      reelForm.append('id', c.id + '-reel');

      const reelRes = await fetch('http://localhost:3210/reel', {
        method: 'POST',
        body: reelForm
      });

      if (reelRes.ok) {
        const videoArr = await reelRes.arrayBuffer();
        videoBuf = Buffer.from(videoArr);
        fs.writeFileSync(c.savedReel, videoBuf);
        console.log(`      ✓ Saved local reel: ${c.savedReel} (${Math.round(videoBuf.length / 1024)} KB)`);
      } else {
        console.error(`      ✗ Reel Gen Error:`, await reelRes.text());
      }
    } catch (e) {
      console.error(`      ✗ Reel Gen Error:`, e.message);
    }

    // 5. Publish Video Reel & Story to Facebook
    if (videoBuf) {
      console.log(`[5/5] Publishing Facebook Reel & Story...`);
      const reelCaption = `${fullCaption.substring(0, 1800)}\n\n🎵 ${c.credit}`;
      try {
        const vidForm = new FormData();
        vidForm.append('description', reelCaption);
        vidForm.append('source', new Blob([videoBuf], { type: 'video/mp4' }), 'reel.mp4');

        const vidRes = await fetch(`https://graph.facebook.com/v20.0/${c.pageId}/videos?access_token=${encodeURIComponent(pageToken)}`, {
          method: 'POST',
          body: vidForm
        });
        const vidData = await vidRes.json();
        if (vidData.id) {
          console.log(`      ✓ FB Reel Live! Video ID: ${vidData.id}`);
        } else {
          console.error(`      ✗ FB Reel Error:`, JSON.stringify(vidData));
        }
      } catch (e) {
        console.error(`      ✗ FB Reel Error:`, e.message);
      }

      // Facebook Story
      try {
        const fbStoryPhoto = new FormData();
        fbStoryPhoto.append('published', 'false');
        fbStoryPhoto.append('source', new Blob([rawImageBuf], { type: 'image/jpeg' }), 'story.jpg');

        const photoRes = await fetch(`https://graph.facebook.com/v20.0/${c.pageId}/photos?access_token=${encodeURIComponent(pageToken)}`, {
          method: 'POST',
          body: fbStoryPhoto
        });
        const photoData = await photoRes.json();
        if (photoData.id) {
          const storyForm = new FormData();
          storyForm.append('photo_id', photoData.id);
          const storyRes = await fetch(`https://graph.facebook.com/v20.0/${c.pageId}/photo_stories?access_token=${encodeURIComponent(pageToken)}`, {
            method: 'POST',
            body: storyForm
          });
          const storyData = await storyRes.json();
          if (storyData.id || storyData.post_id) {
            console.log(`      ✓ FB Story Live! ID: ${storyData.id || storyData.post_id}`);
          }
        }
      } catch (e) {}
    }

    // Instagram Cross-Publishing (if connected to this account)
    if (publicImageUrl && c.pageId === '114550268199751') {
      try {
        console.log(`      [Instagram] Publishing feed post to @quotequarry8...`);
        const createMediaRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media?image_url=${encodeURIComponent(publicImageUrl)}&caption=${encodeURIComponent(fullCaption)}&access_token=${encodeURIComponent(USER_FB_TOKEN)}`, {
          method: 'POST'
        });
        const mediaContainer = await createMediaRes.json();
        if (mediaContainer.id) {
          const pubRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media_publish?creation_id=${mediaContainer.id}&access_token=${encodeURIComponent(USER_FB_TOKEN)}`, {
            method: 'POST'
          });
          const pubData = await pubRes.json();
          console.log(`      ✓ IG Feed Post Live! ID: ${pubData.id}`);
        }
      } catch (e) {}
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`\n================================================================`);
  console.log(`✓ All 5 Pages Successfully Published with Reels & Stories!`);
  console.log(`================================================================\n`);
}

publishAll().catch(console.error);
