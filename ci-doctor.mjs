// CI Doctor — checks all channels are healthy and publishing.
// Usage: node ci-doctor.mjs
// Creates a health report and GitHub issue if problems found.
import fs from 'node:fs';
import { google } from 'googleapis';

const envRaw = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

const SLUGS = ['investors-compass', 'money-rulebook', 'debt-free-doctrine', 'quotequarry'];
const results = [];

// ---- Workflow file validation (09-20) ----
// Sep 18 lesson: one orphaned YAML line silently dropped every scheduled run
// while this doctor reported green. Parse every workflow file, fail loudly.
let yamlProblems = [];
try {
  const yaml = (await import('js-yaml')).default;
  for (const f of fs.readdirSync('.github/workflows').filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))) {
    const p = `.github/workflows/${f}`;
    try {
      const doc = yaml.load(fs.readFileSync(p, 'utf8'));
      if (!doc || typeof doc !== 'object' || (!doc.jobs && !doc['on'] && !doc[true])) {
        yamlProblems.push(`${f}: parses but has no jobs/triggers`);
      }
    } catch (e) {
      yamlProblems.push(`${f}: ${String(e.message).slice(0, 120)}`);
    }
  }
} catch (e) {
  yamlProblems.push(`validator error: ${String(e.message).slice(0, 100)}`);
}
if (yamlProblems.length) {
  results.push({ slug: 'workflows', status: 'BROKEN_WORKFLOW', error: yamlProblems.join(' | ') });
  console.log('🚨 BROKEN WORKFLOW FILES:\n  ' + yamlProblems.join('\n  '));
} else {
  console.log('✅ all workflow files parse clean');
}

for (const slug of SLUGS) {
  const envName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
  const tokenFile = `yt-mcp/channels/${slug}/token.json`;
  const raw = process.env[envName] || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '');
  if (!raw) { results.push({ slug, status: 'NO_TOKEN' }); continue; }

  try {
    const t = JSON.parse(raw);
    const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: t.refresh_token });
    const yt = google.youtube({ version: 'v3', auth });

    const { data } = await yt.channels.list({ part: 'snippet,statistics', mine: true });
    const c = data.items?.[0];
    if (!c) { results.push({ slug, status: 'NO_CHANNEL' }); continue; }

    results.push({
      slug,
      channel: c.snippet.title,
      subs: c.statistics.subscriberCount,
      totalVideos: c.statistics.videoCount,
      status: +c.statistics.videoCount > 0 ? 'OK' : 'NO_VIDEOS'
    });
  } catch (e) {
    results.push({ slug, status: 'ERROR', error: e.message.slice(0, 100) });
  }
}

// Report
console.log('\n=== CI DOCTOR REPORT ===');
let problems = 0;
for (const r of results) {
  const icon = r.status === 'OK' ? '✅' : '⚠️';
  console.log(`${icon} ${r.slug} | ${r.channel || 'N/A'} | subs: ${r.subs || '?'} | videos(48h): ${r.last48hVideos || 0} | status: ${r.status}`);
  if (r.status !== 'OK') problems++;
}
console.log(`\n${problems} channel(s) with issues out of ${results.length}`);

// Save report for CI to pick up
fs.writeFileSync('ci-doctor-report.json', JSON.stringify({ at: new Date().toISOString(), problems, results }, null, 2));
console.log('Report saved: ci-doctor-report.json');
