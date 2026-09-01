// Zernio TikTok Publisher — Automated TikTok posting via Zernio Unified API
import fs from 'node:fs';

const ZERNIO_API = 'https://api.zernio.com/v1';

let envStr = '';
try {
  if (fs.existsSync('.env')) {
    envStr = fs.readFileSync('.env', 'utf8');
  } else if (fs.existsSync('C:/Users/Revnix/Documents/youtube-automation/.env')) {
    envStr = fs.readFileSync('C:/Users/Revnix/Documents/youtube-automation/.env', 'utf8');
  }
} catch (e) { }

const envOf = (key) => process.env[key] || (envStr.match(new RegExp(`^${key}=(.+)$`, 'm')) || [])[1]?.trim() || '';

const API_KEY = envOf('ZERNIO_API_KEY');
const ACCOUNT_ID = envOf('ZERNIO_TIKTOK_ACCOUNT_ID');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Request presigned upload URL for media
 */
export async function getPresignedUrl(filename = 'reel.mp4', contentType = 'video/mp4') {
  const apiKey = envOf('ZERNIO_API_KEY') || API_KEY;
  if (!apiKey) throw new Error('ZERNIO_API_KEY is missing in .env');

  const res = await fetch(`${ZERNIO_API}/media/presign`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ filename, contentType })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Zernio presign failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data; // { uploadUrl, publicUrl, key, expiresIn }
}

/**
 * Upload video buffer to presigned Cloudflare R2 / S3 URL
 */
export async function uploadVideoBuffer(uploadUrl, videoBuffer, contentType = 'video/mp4') {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: videoBuffer
  });

  if (!res.ok) {
    throw new Error(`Upload to storage failed (${res.status}): ${res.statusText}`);
  }
}

/**
 * Check accounts linked to Zernio
 */
export async function listAccounts() {
  const apiKey = envOf('ZERNIO_API_KEY') || API_KEY;
  const res = await fetch(`${ZERNIO_API}/accounts`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  return await res.json();
}

/**
 * Main publisher function for TikTok via Zernio
 * Compatible with run-content-machine.mjs interface: publishToTikTok({ videoBuffer, title })
 */
export async function publishToTikTok({ videoBuffer, videoUrl, title } = {}) {
  const apiKey = envOf('ZERNIO_API_KEY') || API_KEY;
  const accountId = envOf('ZERNIO_TIKTOK_ACCOUNT_ID') || ACCOUNT_ID;

  if (!apiKey || !accountId) {
    console.warn('[Zernio TikTok] Skipped: ZERNIO_API_KEY or ZERNIO_TIKTOK_ACCOUNT_ID missing in .env');
    return null;
  }

  try {
    let finalMediaUrl = videoUrl;

    if (!finalMediaUrl && videoBuffer) {
      console.log('      [TikTok] Uploading video to Zernio storage...');
      const presign = await getPresignedUrl('reel.mp4', 'video/mp4');
      await uploadVideoBuffer(presign.uploadUrl, videoBuffer, 'video/mp4');
      finalMediaUrl = presign.publicUrl;
      console.log('      [TikTok] Video uploaded successfully.');
    }

    if (!finalMediaUrl) {
      console.warn('      [TikTok] Skipped: No video buffer or video URL provided.');
      return null;
    }

    console.log('      [TikTok] Submitting post to TikTok via Zernio API...');
    const payload = {
      publishNow: true,
      platforms: [
        {
          platform: 'tiktok',
          accountId: accountId,
          platformSpecificData: {
            tiktokSettings: {
              // TikTok caps third-party direct posts ("at capacity" errors);
              // draft:true delivers via Creator Inbox instead. Flip by setting
              // ZERNIO_TIKTOK_DRAFT=false (secret/env) once direct posting frees up.
              draft: (envOf('ZERNIO_TIKTOK_DRAFT') || 'true').toLowerCase() !== 'false',
              privacy_level: 'PUBLIC_TO_EVERYONE',
              allow_comment: true,
              allow_duet: true,
              allow_stitch: true
            }
          }
        }
      ],
      content: title || '',
      mediaItems: [
        {
          type: 'video',
          url: finalMediaUrl
        }
      ]
    };

    const res = await fetch(`${ZERNIO_API}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      console.warn('      [TikTok] Zernio post creation failed:', JSON.stringify(data));
      return null;
    }

    const postId = data?.post?._id || data?.id || data?._id;
    console.log(`      ✓ TikTok Post successfully published to Creator Inbox! ID: ${postId || 'OK'}`);
    return postId || 'OK';

  } catch (e) {
    console.warn('      [TikTok] Error publishing via Zernio:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLI Execution
// ---------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('zernio-tiktok-publisher.mjs')) {
  const cmd = process.argv[2] || 'test';
  
  if (cmd === 'accounts' || cmd === 'test') {
    console.log('Fetching connected accounts from Zernio...');
    listAccounts().then(data => {
      console.log('\n--- Connected Accounts ---');
      if (data.accounts && data.accounts.length) {
        data.accounts.forEach(acc => {
          console.log(`- Platform: ${acc.platform} | User: @${acc.username || acc.displayName} | ID: ${acc._id} | Status: ${acc.platformStatus}`);
        });
      } else {
        console.log('No accounts found:', data);
      }
    }).catch(err => console.error(err));
  } else if (cmd === 'post') {
    const videoFile = process.argv[3];
    const caption = process.argv[4] || 'Test video from automated workflow';
    if (!videoFile || !fs.existsSync(videoFile)) {
      console.error('Usage: node zernio-tiktok-publisher.mjs post <video-file.mp4> [caption]');
      process.exit(1);
    }
    const buf = fs.readFileSync(videoFile);
    publishToTikTok({ videoBuffer: buf, title: caption }).then(res => {
      console.log('Result:', res);
    });
  }
}
