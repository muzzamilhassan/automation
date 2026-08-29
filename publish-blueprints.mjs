import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const envStr = fs.readFileSync('C:/Users/Revnix/Documents/youtube-automation/.env', 'utf8');
const TOKEN = envStr.match(/^FB_PAGE_TOKEN=(.+)$/m)[1].trim();
const PAGE_ID = '114550268199751';
const IG_USER_ID = envStr.match(/^IG_USER_ID=(.+)$/m) ? envStr.match(/^IG_USER_ID=(.+)$/m)[1].trim() : '17841467537639505';
const DIR = 'C:/Users/Revnix/Documents/youtube-automation/';

// Get current live tunnel URL dynamically from docker logs
let tunnelUrl = null;
try {
  const tunnelLogs = execSync('docker logs yt-tunnel 2>&1').toString();
  const tunnelMatch = tunnelLogs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
  tunnelUrl = tunnelMatch ? tunnelMatch[tunnelMatch.length - 1] : null;
} catch (e) {
  console.warn('Could not read tunnel logs:', e.message);
}

console.log('Public Cloudflare Tunnel URL:', tunnelUrl);

const POSTS = [
  {
    id: 'blueprint-A-impossible-breakthrough',
    name: 'Blueprint A: The Impossible Breakthrough (GROW ANYWHERE)',
    imageFile: 'blueprint-A-impossible-breakthrough.jpg',
    hook: 'Most people wait for the ideal conditions. The strongest create them wherever they are planted.',
    caption: 'Growth is never about having easy ground. It is about developing the internal force that breaks through whatever tried to bury you. When you focus on daily consistency rather than immediate comfort, even the most rigid obstacles give way.\n\nStart small. Stay rooted. Let your quiet persistence do the talking.',
    cta: 'Where are you choosing to grow despite difficult conditions?',
    hashtags: ['#resilience', '#mindset', '#growth', '#discipline', '#selfimprovement', '#quietambition'],
    mood: 'airy',
    credit: 'Memories of Spring — Tokyo Music Walker (CC BY 3.0)'
  },
  {
    id: 'blueprint-B-tension-snap',
    name: 'Blueprint B: The Tension Snap (BREAK YOUR LIMITS)',
    imageFile: 'blueprint-B-tension-snap.jpg',
    hook: 'The barrier holding you back is rarely permanent. It only lasts until the pressure you generate exceeds the weight of the restriction.',
    caption: 'Every limit feels unbreakable until the exact microsecond you decide to push past it. It is not about sudden luck—it is about compounding your strength quietly until the restriction violently gives way.\n\nStop tolerating what restricts your potential. Apply the pressure. Break the pattern.',
    cta: 'What is one limit you are ready to break this week?',
    hashtags: ['#breaklimits', '#strength', '#focus', '#mindsetshift', '#courage', '#personaldevelopment'],
    mood: 'low-drone',
    credit: 'Sweet Dreams — BatchBug (CC BY 3.0)'
  },
  {
    id: 'blueprint-C-surreal-state-change',
    name: 'Blueprint C: The Surreal State Change (DON\'T WASTE TIME)',
    imageFile: 'blueprint-C-surreal-state-change.jpg',
    hook: 'Time does not wait for you to feel ready. Every second delayed is potential dissolved.',
    caption: 'We treat time as if it is solid and permanent, but it slips away like liquid metal if you do not take deliberate action. The plans you keep putting off for "someday" are actively evaporating.\n\nTake control of your hours today. Focus on what moves the needle.',
    cta: 'What is one important task you will accomplish today?',
    hashtags: ['#timemanagement', '#productivity', '#focus', '#discipline', '#slowliving', '#deepwork'],
    mood: 'warm-pad',
    credit: 'White Petals — Keys of Moon (CC BY 4.0)'
  }
];

function buildFullCaption(p) {
  return `${p.hook}\n\n${p.caption}\n\n${p.cta}\n\n${p.hashtags.join(' ')}`;
}

async function publishAllPlatforms() {
  console.log(`\n======================================================`);
  console.log(`Dual-Publishing: Facebook (Reliq North) + Instagram (@quotequarry8)`);
  console.log(`======================================================\n`);

  for (const p of POSTS) {
    console.log(`\n========================================`);
    console.log(`Processing: ${p.name}`);
    console.log(`========================================`);

    const imagePath = path.join(DIR, p.imageFile);
    if (!fs.existsSync(imagePath)) {
      console.error(`[ERROR] Image not found: ${imagePath}`);
      continue;
    }
    const rawImageBuf = fs.readFileSync(imagePath);
    const fullCaption = buildFullCaption(p);

    // 1. Fit Image to 4:5 for Feed & Save in image-tools
    console.log(`[1/6] Fitting 4:5 image in image-tools...`);
    const formFit = new FormData();
    formFit.append('image', new Blob([rawImageBuf], { type: 'image/jpeg' }), p.imageFile);
    formFit.append('id', p.id);

    try {
      await fetch('http://localhost:3210/fitfb?format=json', {
        method: 'POST',
        body: formFit,
        headers: { Accept: 'application/json' }
      });
      console.log(`      ✓ 4:5 Image ready in image-tools`);
    } catch (e) {
      console.warn(`      ⚠️ fitfb error: ${e.message}`);
    }

    const publicImageUrl = tunnelUrl ? `${tunnelUrl}/img/${p.id}.jpg` : null;

    // 2. Publish Facebook Feed Post
    console.log(`[2/6] Publishing Facebook Feed Post...`);
    try {
      const fbForm = new FormData();
      fbForm.append('source', new Blob([rawImageBuf], { type: 'image/jpeg' }), p.imageFile);
      fbForm.append('caption', fullCaption);

      const fbRes = await fetch(`https://graph.facebook.com/v20.0/${PAGE_ID}/photos?access_token=${encodeURIComponent(TOKEN)}`, {
        method: 'POST',
        body: fbForm
      });
      const fbData = await fbRes.json();
      if (fbData.id || fbData.post_id) {
        console.log(`      ✓ FB Feed Post Live! Post ID: ${fbData.post_id || fbData.id}`);
      } else {
        console.error(`      ✗ FB Feed Post Failed:`, JSON.stringify(fbData));
      }
    } catch (e) {
      console.error(`      ✗ FB Feed Error:`, e.message);
    }

    // 3. Publish Instagram Feed Post
    if (publicImageUrl) {
      console.log(`[3/6] Publishing Instagram Feed Post (@quotequarry8)...`);
      try {
        const createMediaRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media?image_url=${encodeURIComponent(publicImageUrl)}&caption=${encodeURIComponent(fullCaption)}&access_token=${encodeURIComponent(TOKEN)}`, {
          method: 'POST'
        });
        const mediaContainer = await createMediaRes.json();
        if (mediaContainer.id) {
          const pubRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media_publish?creation_id=${mediaContainer.id}&access_token=${encodeURIComponent(TOKEN)}`, {
            method: 'POST'
          });
          const pubData = await pubRes.json();
          console.log(`      ✓ IG Feed Post Live! ID: ${pubData.id}`);
        } else {
          console.error(`      ✗ IG Feed Container Failed:`, JSON.stringify(mediaContainer));
        }
      } catch (e) {
        console.error(`      ✗ IG Feed Error:`, e.message);
      }
    }

    // 4. Generate 13s Reel (1080x1920 with black background + ambient track)
    console.log(`[4/6] Generating 13s Reel Video (Black Background + ${p.mood} audio)...`);
    let videoBuf = null;
    try {
      const reelForm = new FormData();
      reelForm.append('image', new Blob([rawImageBuf], { type: 'image/jpeg' }), 'poster.jpg');
      reelForm.append('duration', '13');
      reelForm.append('mood', p.mood);
      reelForm.append('id', p.id + '-reel');

      const reelRes = await fetch('http://localhost:3210/reel', {
        method: 'POST',
        body: reelForm
      });

      if (reelRes.ok) {
        const videoArr = await reelRes.arrayBuffer();
        videoBuf = Buffer.from(videoArr);
        console.log(`      ✓ Reel Video Generated (${Math.round(videoBuf.length / 1024)} KB)`);
      } else {
        console.error(`      ✗ Reel Generation Failed:`, await reelRes.text());
      }
    } catch (e) {
      console.error(`      ✗ Reel Gen Error:`, e.message);
    }

    const publicVideoUrl = (tunnelUrl && videoBuf) ? `${tunnelUrl}/img/${p.id}-reel.mp4` : null;
    const reelCaption = `${fullCaption.substring(0, 1800)}\n\n🎵 ${p.credit}`;

    // 5. Publish Reels (Facebook + Instagram)
    console.log(`[5/6] Publishing Reels to Facebook & Instagram...`);
    if (videoBuf) {
      // FB Reel
      try {
        const vidForm = new FormData();
        vidForm.append('description', reelCaption);
        vidForm.append('source', new Blob([videoBuf], { type: 'video/mp4' }), 'reel.mp4');

        const vidRes = await fetch(`https://graph.facebook.com/v20.0/${PAGE_ID}/videos?access_token=${encodeURIComponent(TOKEN)}`, {
          method: 'POST',
          body: vidForm
        });
        const vidData = await vidRes.json();
        if (vidData.id) console.log(`      ✓ FB Reel Live! Video ID: ${vidData.id}`);
      } catch (e) {
        console.error(`      ✗ FB Reel Error:`, e.message);
      }

      // IG Reel
      if (publicVideoUrl) {
        try {
          const createReelRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media?media_type=REELS&video_url=${encodeURIComponent(publicVideoUrl)}&caption=${encodeURIComponent(reelCaption)}&share_to_feed=true&access_token=${encodeURIComponent(TOKEN)}`, {
            method: 'POST'
          });
          const reelContainer = await createReelRes.json();
          if (reelContainer.id) {
            let status = 'IN_PROGRESS';
            for (let i = 0; i < 15; i++) {
              await new Promise(r => setTimeout(r, 3000));
              const statusRes = await fetch(`https://graph.facebook.com/v20.0/${reelContainer.id}?fields=status_code&access_token=${encodeURIComponent(TOKEN)}`);
              const statusData = await statusRes.json();
              if (statusData.status_code === 'FINISHED') {
                status = 'FINISHED';
                break;
              }
            }
            if (status === 'FINISHED') {
              const pubReelRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media_publish?creation_id=${reelContainer.id}&access_token=${encodeURIComponent(TOKEN)}`, {
                method: 'POST'
              });
              const pubReelData = await pubReelRes.json();
              console.log(`      ✓ IG Reel Live! ID: ${pubReelData.id}`);
            }
          }
        } catch (e) {
          console.error(`      ✗ IG Reel Error:`, e.message);
        }
      }
    }

    // 6. Publish Stories (Facebook + Instagram)
    console.log(`[6/6] Publishing Stories to Facebook & Instagram...`);
    // FB Story
    try {
      const fbStoryPhoto = new FormData();
      fbStoryPhoto.append('published', 'false');
      fbStoryPhoto.append('source', new Blob([rawImageBuf], { type: 'image/jpeg' }), 'story.jpg');

      const photoRes = await fetch(`https://graph.facebook.com/v20.0/${PAGE_ID}/photos?access_token=${encodeURIComponent(TOKEN)}`, {
        method: 'POST',
        body: fbStoryPhoto
      });
      const photoData = await photoRes.json();
      if (photoData.id) {
        const storyForm = new FormData();
        storyForm.append('photo_id', photoData.id);
        const storyRes = await fetch(`https://graph.facebook.com/v20.0/${PAGE_ID}/photo_stories?access_token=${encodeURIComponent(TOKEN)}`, {
          method: 'POST',
          body: storyForm
        });
        const storyData = await storyRes.json();
        if (storyData.id || storyData.post_id) console.log(`      ✓ FB Story Live! ID: ${storyData.id || storyData.post_id}`);
      }
    } catch (e) {
      console.error(`      ✗ FB Story Error:`, e.message);
    }

    // IG Story
    if (publicImageUrl) {
      try {
        const createStoryRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media?media_type=STORIES&image_url=${encodeURIComponent(publicImageUrl)}&access_token=${encodeURIComponent(TOKEN)}`, {
          method: 'POST'
        });
        const storyContainer = await createStoryRes.json();
        if (storyContainer.id) {
          await new Promise(r => setTimeout(r, 2000));
          const pubStoryRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media_publish?creation_id=${storyContainer.id}&access_token=${encodeURIComponent(TOKEN)}`, {
            method: 'POST'
          });
          const pubStoryData = await pubStoryRes.json();
          console.log(`      ✓ IG Story Live! ID: ${pubStoryData.id}`);
        }
      } catch (e) {
        console.error(`      ✗ IG Story Error:`, e.message);
      }
    }

    await new Promise(r => setTimeout(r, 4000));
  }

  console.log(`\n======================================================`);
  console.log(`Dual-Publishing Completed Successfully!`);
  console.log(`======================================================\n`);
}

publishAllPlatforms();
