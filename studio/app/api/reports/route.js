// Real daily Excel reports.
// J1 (2026-11-20): reporting-daily.yml keeps each day's workbook as a GitHub
// Actions artifact ("reports-<run_id>", 30 days) — it never committed them to
// /reports, so the card showed a two-month-old file. CLOUD: list the artifacts
// (plus any legacy repo files); ?download=<artifactId> redirects to GitHub's
// short-lived signed zip URL. LOCAL mode: the folder on disk.
import fs from 'node:fs';
import path from 'node:path';
import { ENV } from '../../../lib/data.mjs';
import { requireRole } from '@/lib/route-auth';
import { reportDay } from '@/lib/analytics-view.mjs';
import { artifactsToReports, mergeReports } from '@/lib/reports-list.mjs';

export const dynamic = 'force-dynamic';

const REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const GH_TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';
const gh = (url, init = {}) => fetch(`https://api.github.com/repos/${REPO}${url}`, {
  ...init,
  headers: {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'quarry-studio',
    'X-GitHub-Api-Version': '2022-11-28',
  },
});

export async function GET(req) {
  // operator business reports — owner/staff only (issue #60: the route had no
  // auth, so any signed-in role could list report files)
  if (!(await requireRole(req, ['owner', 'staff']))) return Response.json({ error: 'not signed in' }, { status: 401 });
  const cloud = process.env.FORCE_GITHUB === '1' || !fs.existsSync(path.resolve(process.cwd(), '..', 'yt-mcp'));
  try {
    if (!cloud) {
      const dir = path.resolve(process.cwd(), '..', 'reports');
      const rows = fs.existsSync(dir)
        ? fs.readdirSync(dir)
            .filter((f) => f.endsWith('.xlsx'))
            .map((f) => {
              const st = fs.statSync(path.join(dir, f));
              return { name: f, when: reportDay(f) || st.mtime.toISOString().slice(0, 10), size: st.size };
            })
        : [];
      rows.sort((a, b) => b.name.localeCompare(a.name));
      return Response.json({ reports: rows });
    }
    if (!GH_TOKEN) return Response.json({ reports: [] });

    // ?download=<artifactId> → GitHub answers 302 to a signed URL (~1 min)
    const dl = new URL(req.url).searchParams.get('download');
    if (dl) {
      if (!/^\d+$/.test(dl)) return Response.json({ error: 'bad report id' }, { status: 400 });
      const r = await gh(`/actions/artifacts/${dl}/zip`, { redirect: 'manual' });
      const loc = r.headers.get('location');
      if ((r.status === 302 || r.status === 301) && loc) return Response.redirect(loc, 302);
      return Response.json({ error: `report download answered ${r.status}` }, { status: 502 });
    }

    const [artRes, repoRes] = await Promise.all([
      gh('/actions/artifacts?per_page=100'),
      gh('/contents/reports'),
    ]);
    const art = artRes.ok ? await artRes.json() : null;
    const actionRows = artifactsToReports(art?.artifacts || []);
    const list = repoRes.ok ? await repoRes.json() : [];
    const repoRows = (Array.isArray(list) ? list : [])
      .filter((f) => f.name.endsWith('.xlsx'))
      // wave C2 (T2-22): the contents API has no file time — the report's day
      // is in its name ("daily-report-2026-09-19.xlsx"); unknown stays null
      .map((f) => ({ name: f.name, when: reportDay(f.name), size: f.size }));
    if (!artRes.ok && !repoRes.ok) return Response.json({ reports: [], error: `report storage answered ${artRes.status}` }, { status: 502 });
    return Response.json({ reports: mergeReports(actionRows, repoRows) });
  } catch {
    return Response.json({ reports: [], error: 'report storage unreachable' }, { status: 502 });
  }
}
