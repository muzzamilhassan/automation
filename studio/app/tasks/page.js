'use client';
import { useEffect, useState } from 'react';

const TASKS = [
  { group: 'TikTok app approval (Quarry Studio)', items: [
    { t: 'Paste new app client key/secret into .env (TIKTOK_APP_KEY / TIKTOK_APP_SECRET)', state: 'waiting-you' },
    { t: 'Add video.publish scope + enable Direct Post in the portal', state: 'waiting-you' },
    { t: 'Dashboard built (github.io/quarrystudio/dashboard.html) — needs keys to go live', state: 'built' },
    { t: 'Record demo screencast (storyboard: tiktok-audit-kit.md) and submit audit', state: 'next' },
  ]},
  { group: 'YouTube', items: [
    { t: 'Daily Shorts — 3 channels × 3/day (12 total with QuoteQuarry)', state: 'live' },
    { t: 'Daily deep-dive episodes ×4 — re-render with fresh AI quota', state: 'pending' },
    { t: 'Gemini free quota resets midnight PT (≈12:30pm PKT)', state: 'info' },
    { t: 'Weekly compilation — QuoteQuarry Sundays 7pm PKT', state: 'live' },
  ]},
  { group: 'Facebook', items: [
    { t: 'Reels cross-posted from YT Shorts (3 pages)', state: 'live' },
    { t: 'Niche poster image daily (3 pages)', state: 'live' },
    { t: 'CCM flow unchanged on all 5 pages (posters/reels/stories)', state: 'live' },
    { t: 'Strategic Silence: IG account still not linked (optional)', state: 'optional' },
  ]},
  { group: 'Instagram', items: [
    { t: 'Reels cross-poster ready — accounts renamed + branded', state: 'ready' },
  ]},
  { group: 'Infrastructure', items: [
    { t: 'Wire CI cron (GitHub Actions) so daily runs leave your PC', state: 'pending' },
    { t: 'Quota headroom: ~100 uploads/day free bucket, 16 used', state: 'info' },
    { t: 'Quota increase form only if >100 uploads/day (25+ channels)', state: 'info' },
  ]},
];

const CHIP = {
  live: 'chip chip-ok', ready: 'chip chip-ok', built: 'chip chip-ok',
  pending: 'chip chip-warn', 'waiting-you': 'chip chip-warn', next: 'chip chip-warn',
  info: 'chip', optional: 'chip chip-off'
};

export default function Tasks() {
  return (
    <div className="p-6 max-w-4xl space-y-5">
      <h1 className="text-white text-2xl font-bold">Tasks & roadmap</h1>
      {TASKS.map(g => (
        <div key={g.group} className="card">
          <h2 className="text-white font-semibold mb-2">{g.group}</h2>
          <ul className="space-y-1.5">
            {g.items.map(i => (
              <li key={i.t} className="flex items-start gap-2.5 text-sm">
                <span className={CHIP[i.state] + ' mt-0.5 shrink-0'}>{i.state}</span>
                <span className="text-zinc-300">{i.t}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
