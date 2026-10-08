// 10-08 P1 — AUDIT TRAIL: who did what, newest first, stored in the repo
// (yt-mcp/audit.json, capped at 150 events) so it survives serverless and is
// visible on the Logs page.
import { readRepoJSON, writeRepoJSON } from './channels-registry.js';

export async function appendAudit(actor, action, detail = '') {
  try {
    const cur = (await readRepoJSON('yt-mcp/audit.json')) || { events: [] };
    const events = Array.isArray(cur.events) ? cur.events : [];
    events.unshift({ at: new Date().toISOString(), actor: actor || 'unknown', action, detail: String(detail).slice(0, 160) });
    await writeRepoJSON('yt-mcp/audit.json', { events: events.slice(0, 150) }, `audit: ${actor || 'unknown'} ${action}`);
  } catch {
    // audit is best-effort — never break the action it records
  }
}
