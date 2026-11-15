// CI Doctor — checks all channels are healthy and publishing.
// Usage: node ci-doctor.mjs
// Creates a health report and GitHub issue if problems found.
import fs from 'node:fs';
import { google } from 'googleapis';
import { asciiHeaderValue } from './lib/ntfy-alert.mjs';
import { loadEnv } from './lib/env.mjs';
// T4d (#106): the health check covers every channel the nightlies see —
// CHANNELS env if set, else every mapped YT_TOKEN_<SLUG> secret (CI), else
// yt-mcp/channels/*/token.json locally. Same discovery as analytics-nightly;
// a channel joins the doctor by adding its secret, never by editing code.
import { discoverChannels } from './scripts/analytics-nightly.mjs';
import { listChannels } from './lib/registry.mjs';

import { planDoctorAlerts, doctorExitCode } from './lib/doctor-alerts.mjs';

loadEnv();

// The previously committed report is the alert memory (audit #7b).
let prevReport = null;
try { prevReport = JSON.parse(fs.readFileSync('ci-doctor-report.json', 'utf8')); } catch { prevReport = null; }

// T4d round 1 (#106): passive discovery (token files / mapped secrets) is
// gated on the ACTIVE registry+brands set — the parked brands keep local
// token files and would otherwise guarantee doctor failures for channels
// that are parked on purpose. An explicit CHANNELS env list overrides the
// gate (the documented escape hatch).
const discovered = discoverChannels(process.env);
const knownActive = new Set(listChannels().map((c) => c.slug));
const SLUGS = process.env.CHANNELS ? discovered : discovered.filter((s) => knownActive.has(s));
const results = [];

import { validateWorkflows } from './lib/workflow-validator.mjs';

// ---- Workflow file validation (09-20) ----
// Sep 18 lesson: one orphaned YAML line silently dropped every scheduled run
// while this doctor reported green. Parse every workflow file, fail loudly.
const { valid: workflowsValid, problems: yamlProblems } = await validateWorkflows('.github/workflows');
if (!workflowsValid) {
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

    const { data } = await yt.channels.list({ part: 'snippet,statistics,contentDetails', mine: true });
    const c = data.items?.[0];
    if (!c) { results.push({ slug, status: 'NO_CHANNEL' }); continue; }

    // 48h stall check — videoCount > 0 alone can't see a channel stalled for
    // weeks (issue #69). Uploads playlist latest item = last upload/schedule.
    let lastUploadHours = null;
    try {
      const up = c.contentDetails?.relatedPlaylists?.uploads;
      if (up) {
        const pl = await yt.playlistItems.list({ part: 'snippet', playlistId: up, maxResults: 1 });
        const publishedAt = pl.data.items?.[0]?.snippet?.publishedAt;
        if (publishedAt) lastUploadHours = Math.round((Date.now() - new Date(publishedAt)) / 3600000);
      }
    } catch { } // analytics-adjacent call; stall check stays best-effort

    const stale = lastUploadHours !== null && lastUploadHours > 48;
    results.push({
      slug,
      channel: c.snippet.title,
      subs: c.statistics.subscriberCount,
      totalVideos: c.statistics.videoCount,
      lastUploadHours,
      status: stale ? 'STALE' : (+c.statistics.videoCount > 0 ? 'OK' : 'NO_VIDEOS')
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
  console.log(`${icon} ${r.slug} | ${r.channel || 'N/A'} | subs: ${r.subs || '?'} | last upload: ${r.lastUploadHours != null ? r.lastUploadHours + 'h ago' : '?'} | status: ${r.status}`);
  if (r.status !== 'OK') problems++;
}
console.log(`\n${problems} channel(s) with issues out of ${results.length}`);

// ---- Alert on CHANGE, remind daily (audit 2026-11-13 #7b) ----
// Before: every run (3/day) with any non-OK channel paged ntfy + commented on
// issue #90 + exited 1 — a 420h STALE channel produced ~50 identical pages and
// the red exit skipped the report commit. planDoctorAlerts compares against the
// previous committed report's `alerts` memory: new/changed problems page now,
// an unchanged problem re-pages once per 24h, a recovery is announced once.
const bad = results.filter((r) => r.status !== 'OK');
for (const r of bad) console.log(`::warning title=CI Doctor: ${r.slug} ${r.status}::${r.error || (r.lastUploadHours != null ? `last upload ${r.lastUploadHours}h ago` : r.status)}`);
const plan = planDoctorAlerts(prevReport, results, new Date());
const line = (r) => `${r.slug}: ${r.status}${r.error ? ' — ' + r.error : ''}${r.lastUploadHours != null ? ` (last upload ${r.lastUploadHours}h ago)` : ''}`;
const sections = [
  plan.alertNow.length ? `NEW:\n${plan.alertNow.map(line).join('\n')}` : '',
  plan.reminders.length ? `STILL BROKEN (daily reminder):\n${plan.reminders.map(line).join('\n')}` : '',
  plan.recovered.length ? `RECOVERED: ${plan.recovered.join(', ')}` : '',
].filter(Boolean);
const due = sections.length > 0;
let delivered = false;
if (due) {
  const summary = sections.join('\n\n');
  const title = plan.alertNow.length ? '🏥 CI Doctor: new problem' : (plan.reminders.length ? '🏥 CI Doctor: still broken' : '🏥 CI Doctor: recovered');
  // 1. ntfy phone push
  if (process.env.NTFY_TOPIC) {
    try {
      const res = await fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
        method: 'POST',
        // #91: the raw emoji made undici reject the header ("Cannot convert
        // argument to a ByteString", run 39055331728) — push never reached the
        // phone. The 🏥 icon still shows via the Tags shortcode on ntfy.
        headers: { Title: asciiHeaderValue(title), Priority: plan.alertNow.length ? 'high' : 'default', Tags: 'hospital' },
        body: summary.slice(0, 400),
      });
      console.log(`[alert] ntfy push: ${res.ok ? 'sent' : 'HTTP ' + res.status}`);
      delivered = delivered || res.ok;
    } catch (e) { console.log('[alert] ntfy failed:', String(e.message).slice(0, 80)); }
  }
  // 2. GitHub issue — comment on the open doctor issue if one exists, else create
  try {
    const { execFileSync } = await import('node:child_process');
    const listing = execFileSync('gh', ['issue', 'list', '--state', 'open', '--search', 'CI Doctor in:title', '--limit', '5'], { encoding: 'utf8', timeout: 30000 });
    const first = listing.split('\n').find((l) => l.trim());
    if (first) {
      const num = first.split('\t')[0];
      execFileSync('gh', ['issue', 'comment', num, '--body', `CI Doctor at ${new Date().toISOString()}:\n\n${summary}`]);
      console.log(`[alert] commented on existing issue #${num}`);
    } else if (bad.length) {
      execFileSync('gh', ['issue', 'create', '--title', '🏥 CI Doctor: channels reporting problems', '--body', `${summary}\n\n_Auto-filed by ci-doctor.mjs — see ci-doctor-report.json._`]);
      console.log('[alert] GitHub issue created');
    }
    delivered = true;
  } catch (e) { console.log('[alert] GitHub issue step failed:', String(e.message).slice(0, 80)); }
} else {
  console.log(bad.length ? `ongoing problem(s) already paged — next reminder within 24h (${bad.map((r) => r.slug).join(', ')})` : '✅ no problems — nothing to alert');
}

// Save the report — `alerts` is the memory the next run diffs against. An
// alert that could not be delivered is NOT remembered, so the next run retries.
const alertsMemory = due && !delivered ? (prevReport?.alerts || {}) : plan.alerts;
fs.writeFileSync('ci-doctor-report.json', JSON.stringify({ at: new Date().toISOString(), problems, results, alerts: alertsMemory }, null, 2));
console.log('Report saved: ci-doctor-report.json');

// Red only when an alert was due and nothing could deliver it (issue #69).
process.exitCode = doctorExitCode({ due, delivered });
