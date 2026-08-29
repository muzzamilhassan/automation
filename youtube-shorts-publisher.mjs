import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { exec } from 'node:child_process';
import { google } from 'googleapis';

const envStr = fs.readFileSync('.env', 'utf8');
const CLIENT_ID = envStr.match(/^YOUTUBE_CLIENT_ID=(.+)$/m)?.[1]?.trim();
const CLIENT_SECRET = envStr.match(/^YOUTUBE_CLIENT_SECRET=(.+)$/m)?.[1]?.trim();
const TOKEN_PATH = 'youtube-oauth-tokens.json';
const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('[ERROR] YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET missing in .env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly'
];

const SHORTS_QUEUE = [
  {
    videoFile: 'reel-silent-wealth-dont-waste-time.mp4',
    title: "DON'T WASTE TIME — Turn Seconds into Assets #Shorts",
    description: `Time does not wait for preparation; it flows continuously into the void. When you hoard hours in hesitation, they evaporate.

Convert transient seconds into durable assets that outlive your presence. Every month, buy back one more hour of your freedom through sovereign equity.

Rule: Buy back your hours before they melt away.

#Shorts #SilentWealth #FinancialFreedom #Productivity #Discipline #AssetBuilding`,
    tags: ['Shorts', 'YouTubeShorts', 'SilentWealth', 'Productivity', 'Mindset', 'FinancialFreedom', 'Discipline']
  },
  {
    videoFile: 'reel-strategic-silence-break-limits.mp4',
    title: "BREAK YOUR LIMITS — The Power of Strategic Silence #Shorts",
    description: `Every barrier that holds you back is brittle under concentrated pressure. The moment of release is violent and sudden—what seemed unbreakable shatters when conviction peaks.

Apply quiet, unwavering pressure to the single critical variable until the restriction gives way.

Rule: Pressure either crushes you or frees you.

#Shorts #StrategicSilence #DarkPsychology #PowerDynamics #Focus #SelfMastery`,
    tags: ['Shorts', 'YouTubeShorts', 'StrategicSilence', 'DarkPsychology', 'SelfMastery', 'Discipline']
  },
  {
    videoFile: 'reel-eon-ventures-grow-anywhere.mp4',
    title: "GROW ANYWHERE — Convert Resistance into Kinetic Force #Shorts",
    description: `True resilience is converting the weight above you into kinetic force. When you refuse to surrender, the heaviest stone becomes your launching pad.

Life finds a way where comfort never dared to look. Amateurs wait for favorable conditions; elite founders grow roots directly into solid concrete.

Rule: Outlast the friction, claim the ground.

#Shorts #EonVentures #StartupGrit #Resilience #Discipline #FounderMindset`,
    tags: ['Shorts', 'YouTubeShorts', 'EonVentures', 'Startup', 'Resilience', 'Motivation', 'Grit']
  },
  {
    videoFile: 'reel-reliq-north-leverage-is-calm.mp4',
    title: "LEVERAGE IS CALM — Insecurity Is Loud #Shorts",
    description: `The loudest moves reveal insecurity; true leverage is built in deliberate stillness. When you refuse to react to short-term noise, you force the environment to match your tempo.

In an economy addicted to instant outrage and endless tabs, deliberate composure is the ultimate competitive advantage.

Rule: Never let panic dictate your pace.

#Shorts #ReliqNorth #StoicWisdom #ExecutiveCalm #DigitalMinimalism #Stillness`,
    tags: ['Shorts', 'YouTubeShorts', 'ReliqNorth', 'Stoicism', 'ExecutiveCalm', 'Mindset', 'Stillness']
  },
  {
    videoFile: 'reel-boundaries-club-price-of-access.mp4',
    title: "THE PRICE OF ACCESS — Standards Not Apologies #Shorts",
    description: `Access is your highest leverage; price it with standards, not apologies. Define criteria—honesty, consistency, reciprocity—and attach immediate consequences.

When you over-explain your boundaries, you invite debate where none belongs. State your standard calmly once, and let your absence do the teaching.

Rule: Access without standards invites disrespect.

#Shorts #TheBoundariesClub #EmotionalIntelligence #ProtectYourPeace #SelfRespect #HighStandards`,
    tags: ['Shorts', 'YouTubeShorts', 'TheBoundariesClub', 'EmotionalIntelligence', 'SelfRespect', 'Boundaries']
  }
];

function openBrowser(url) {
  const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${start} "${url}"`);
}

async function getAuthenticatedClient() {
  if (fs.existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth2Client.setCredentials(tokens);
    console.log('✓ Loaded existing YouTube credentials from youtube-oauth-tokens.json');
    return oauth2Client;
  }

  return new Promise((resolve, reject) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });

    console.log('\n======================================================');
    console.log('🔑 ONE-TIME YOUTUBE GOOGLE AUTHENTICATION');
    console.log('======================================================');
    console.log('Opening browser for Google Authorization...');
    console.log(`If it does not open automatically, visit:\n${authUrl}\n`);

    const server = http.createServer(async (req, res) => {
      try {
        if (req.url.startsWith('/oauth2callback')) {
          const urlObj = new URL(req.url, `http://localhost:${PORT}`);
          const code = urlObj.searchParams.get('code');

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: #fff;">
                  <h1 style="color: #4ade80;">✓ YouTube Authentication Successful!</h1>
                  <p style="color: #94a3b8; font-size: 18px;">You can close this tab now. The publisher script is uploading your Shorts.</p>
                </body>
              </html>
            `);

            server.close();
            console.log('✓ Authorization code received from Google!');

            const { tokens } = await oauth2Client.getToken(code);
            oauth2Client.setCredentials(tokens);
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
            console.log(`✓ Saved permanent credentials to ${TOKEN_PATH}`);
            resolve(oauth2Client);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Authorization failed: No code returned.');
            reject(new Error('No code returned from Google'));
          }
        }
      } catch (e) {
        reject(e);
      }
    }).listen(PORT, () => {
      openBrowser(authUrl);
    });
  });
}

async function uploadShorts() {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });

  console.log('\n======================================================');
  console.log('🚀 Publishing 5 High-Impact Masterpiece YouTube Shorts');
  console.log('======================================================\n');

  for (let i = 0; i < SHORTS_QUEUE.length; i++) {
    const item = SHORTS_QUEUE[i];
    console.log(`\n------------------------------------------------------`);
    console.log(`[${i + 1}/${SHORTS_QUEUE.length}] Uploading: "${item.title}"`);
    console.log(`Video File: ${item.videoFile}`);

    if (!fs.existsSync(item.videoFile)) {
      console.error(`[ERROR] File missing: ${item.videoFile}`);
      continue;
    }

    const fileSize = fs.statSync(item.videoFile).size;
    console.log(`File Size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`);

    try {
      const res = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: item.title.substring(0, 100),
            description: item.description,
            tags: item.tags,
            categoryId: '27', // Education / Thought Leadership
            defaultLanguage: 'en',
            defaultAudioLanguage: 'en'
          },
          status: {
            privacyStatus: 'public', // Set to public for instant distribution
            selfDeclaredMadeForKids: false
          }
        },
        media: {
          body: fs.createReadStream(item.videoFile)
        }
      });

      const videoId = res.data.id;
      const shortsUrl = `https://youtube.com/shorts/${videoId}`;
      console.log(`✓ SUCCESS! YouTube Short Live:`);
      console.log(`  👉 ${shortsUrl}`);
    } catch (e) {
      console.error(`✗ Upload failed for "${item.title}":`, e.message);
      if (e.response?.data?.error) {
        console.error('  API Details:', JSON.stringify(e.response.data.error));
      }
    }

    // Wait 3 seconds between uploads
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n======================================================');
  console.log('✓ All YouTube Shorts Upload Cycle Complete!');
  console.log('======================================================\n');
}

uploadShorts().catch(console.error);
