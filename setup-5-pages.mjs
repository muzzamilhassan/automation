import fs from 'node:fs';
import path from 'node:path';

const envStr = fs.readFileSync('C:/Users/Revnix/Documents/youtube-automation/.env', 'utf8');
const appId = envStr.match(/^FACEBOOK_APP_ID=(.+)$/m)[1].trim();
const appSecret = envStr.match(/^FACEBOOK_APP_SECRET=(.+)$/m)[1].trim();

// 5 Brand Configurations mapped to page targets
const BRAND_CONFIGS = [
  {
    key: '116157974886564',
    name: 'Silent Wealth',
    about: 'Strategic assets, capital leverage, and financial sovereignty. Building autonomy through modern business systems.',
    logoFile: 'silent-wealth-logo.jpg',
    coverFile: 'silent-wealth-cover.jpg'
  },
  {
    key: '108044922375174',
    name: 'Strategic Silence (Riley4228)',
    about: 'Creative direction, brand strategy, and high-impact digital media systems. Mastering the art of influence.',
    logoFile: 'strategic-power-logo.jpg',
    coverFile: 'strategic-power-cover.jpg'
  },
  {
    key: '106473735839651',
    name: 'The Boundaries Club',
    about: 'Where influence meets integrity. High-value leadership, emotional intelligence, and modern boundaries.',
    logoFile: 'boundaries-club-logo.jpg',
    coverFile: 'boundaries-club-cover.jpg'
  },
  {
    key: '1077306835630491',
    name: 'Eon Clips (Eon Ventures)',
    about: 'Scaling ideas into assets. Modern entrepreneurship, technology, and relentless daily execution.',
    logoFile: 'grit-fitness-logo.jpg',
    coverFile: 'grit-fitness-cover.jpg'
  },
  {
    key: '114550268199751',
    name: 'Reliq North',
    about: 'Thought leadership, executive clarity, and modern Stoic living. Building a meaningful life in a noisy world.',
    logoFile: 'reliq-north-logo.jpg',
    coverFile: 'reliq-north-cover.jpg'
  }
];

export async function setupAllPages(inputToken) {
  console.log('1. Exchanging for Long-Lived Token...');
  let token = inputToken;
  try {
    const exRes = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${inputToken}`);
    const exData = await exRes.json();
    if (exData.access_token) {
      token = exData.access_token;
      console.log('✓ Obtained 60-Day Long-Lived Access Token!');
    }
  } catch (e) {
    console.warn('Exchange failed, using provided token:', e.message);
  }

  console.log('\n2. Fetching all managed pages from /me/accounts...');
  const accRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,username,link,access_token,instagram_business_account&access_token=${token}`);
  const accData = await accRes.json();

  if (!accData.data || accData.data.length === 0) {
    console.error('No pages found or token error:', JSON.stringify(accData));
    return;
  }

  console.log(`Found ${accData.data.length} Managed Pages in your account!`);

  for (const page of accData.data) {
    console.log(`\n========================================`);
    console.log(`Configuring Page: ${page.name} (ID: ${page.id})`);
    console.log(`========================================`);

    const pToken = page.access_token || token;

    // Match with one of our brand configs
    const match = BRAND_CONFIGS.find(b => 
      b.key === page.id || 
      (page.username && page.username.toLowerCase().includes(b.key.toLowerCase())) ||
      (page.link && page.link.toLowerCase().includes(b.key.toLowerCase())) ||
      (page.name && page.name.toLowerCase().includes(b.name.toLowerCase()))
    ) || BRAND_CONFIGS[0];

    console.log(`Selected Brand Preset: ${match.name}`);

    // A. Update Page Description & About
    try {
      console.log(`[1/3] Updating About & Description...`);
      const updateRes = await fetch(`https://graph.facebook.com/v20.0/${page.id}?about=${encodeURIComponent(match.about)}&description=${encodeURIComponent(match.about)}&access_token=${encodeURIComponent(pToken)}`, {
        method: 'POST'
      });
      const updateData = await updateRes.json();
      console.log('      About Update:', updateData.success ? '✓ Updated' : JSON.stringify(updateData));
    } catch (e) {
      console.warn('      About Error:', e.message);
    }

    // B. Upload & Set Profile Picture
    const logoPath = path.join('C:/Users/Revnix/Documents/youtube-automation/', match.logoFile);
    if (fs.existsSync(logoPath)) {
      try {
        console.log(`[2/3] Uploading Profile Logo (${match.logoFile})...`);
        const formLogo = new FormData();
        const logoBuf = fs.readFileSync(logoPath);
        formLogo.append('source', new Blob([logoBuf], { type: 'image/jpeg' }), match.logoFile);

        const picRes = await fetch(`https://graph.facebook.com/v20.0/${page.id}/picture?access_token=${encodeURIComponent(pToken)}`, {
          method: 'POST',
          body: formLogo
        });
        const picData = await picRes.json();
        console.log('      Profile Picture Update:', picData.success ? '✓ Updated' : JSON.stringify(picData));
      } catch (e) {
        console.warn('      Profile Picture Error:', e.message);
      }
    }

    // C. Upload & Set Cover Photo
    const coverPath = path.join('C:/Users/Revnix/Documents/youtube-automation/', match.coverFile);
    if (fs.existsSync(coverPath)) {
      try {
        console.log(`[3/3] Uploading & Setting Cover Banner (${match.coverFile})...`);
        const formCover = new FormData();
        const coverBuf = fs.readFileSync(coverPath);
        formCover.append('source', new Blob([coverBuf], { type: 'image/jpeg' }), match.coverFile);
        formCover.append('published', 'false');

        // 1. Upload photo
        const photoRes = await fetch(`https://graph.facebook.com/v20.0/${page.id}/photos?access_token=${encodeURIComponent(pToken)}`, {
          method: 'POST',
          body: formCover
        });
        const photoData = await photoRes.json();

        // 2. Set as cover
        if (photoData.id) {
          const setCoverRes = await fetch(`https://graph.facebook.com/v20.0/${page.id}?cover=${photoData.id}&access_token=${encodeURIComponent(pToken)}`, {
            method: 'POST'
          });
          const setCoverData = await setCoverRes.json();
          console.log('      Cover Banner Update:', setCoverData.success ? '✓ Set as Cover' : JSON.stringify(setCoverData));
        } else {
          console.warn('      Cover Photo Upload Failed:', JSON.stringify(photoData));
        }
      } catch (e) {
        console.warn('      Cover Error:', e.message);
      }
    }
  }

  console.log(`\n======================================================`);
  console.log(`All Pages Configured Automatically!`);
  console.log(`======================================================\n`);
}

// Check if running directly with arg
if (process.argv[2]) {
  setupAllPages(process.argv[2]);
}
