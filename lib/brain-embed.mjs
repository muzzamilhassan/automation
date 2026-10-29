// #105 Phase 3 Task 5 — write-time script embedding at publish.
//
// After a video is ACCEPTED by YouTube (real videoId in the channel state)
// the pipeline hands the script text to the Brain sidecar
// (services/ai/, localhost) so every published script lands in
// script_memory at write time:
//   AC-P3-2 — no ghost vectors: only uploaded scripts are embedded, ALL
//             chunks of one script go in ONE /embed call (the endpoint's
//             single upsert_chunks is transactional/all-or-nothing).
//   AC-P3-17 — the shorts script text gets its first durable home (it was
//             never persisted anywhere before this).
//
// Hard rules (spec D6 + task brief):
// - BRAIN_EMBED_ENABLED='1' gates EVERYTHING (default off — zero behavior
//   change until Task 9 flips it in CI). Read at CALL time, never cached at
//   module load.
// - The publish must NEVER fail because embedding failed: every failure mode
//   (flag off, sidecar down, timeout, 4xx/5xx, bad body) is logged and
//   swallowed — the video is already uploaded when this runs.
// - The SAME chunker must run on both sides (chunkScriptText here vs
//   services/ai/brain/chunker.py on the backfill side) or identical scripts
//   get different content fingerprints. Parity is pinned byte-for-byte by
//   tests/publish-embed.test.mjs fixtures GENERATED from the Python
//   chunker — if the Python chunker changes, update both sides together.
// - One POST per script (a run can upload several shorts; each is its own
//   transaction and carries its own video_id).

// Must stay in lockstep with services/ai/brain/chunker.py:
const DOC_WINDOW_WORDS = 150; // python DOC_WINDOW_WORDS
const OVERLAP_WORDS = 20;     // python OVERLAP_WORDS
const SHORTS_HOOK_WORDS = 60; // python SHORTS_HOOK_WORDS

const BRAIN_PORT_DEFAULT = 8000;      // sidecar default (brain.config BRAIN_PORT)
const HEALTH_TIMEOUT_MS = 5000;       // reachability probe — a dead sidecar costs milliseconds
const EMBED_TIMEOUT_MS_DEFAULT = 30000; // per-script deadline; BRAIN_EMBED_TIMEOUT_MS overrides

function wordsOf(text) {
  // Python `str.split()` equivalent for practical text (splits on runs of
  // whitespace, drops empties). Known theoretical divergence: Python also
  // splits on \x1c-\x1f and \x85 — control chars that never occur in scripts.
  return String(text || '').split(/\s+/).filter(Boolean);
}

// Python chunker._windows equivalent: sliding windows with overlap, no empty
// stubs (loop stops at end of text; every window carries > overlap fresh words).
function windowsOf(words, size, overlap) {
  const step = size - overlap;
  const out = [];
  for (let start = 0; start < Math.max(words.length - overlap, 1); start += step) {
    const window = words.slice(start, start + size);
    if (window.length) out.push(window.join(' '));
    if (start + size >= words.length) break;
  }
  return out;
}

// JS mirror of brain.chunker.chunk_text for the kinds the pipeline publishes.
// doc:    scene windows (> 150 words) + one pooled chunk (whole text)
// shorts: hook (first 60 words) + points (the rest) + pooled
// Empty/whitespace text yields [] — nothing to embed.
export function chunkScriptText(kind, text) {
  if (kind !== 'doc' && kind !== 'shorts') {
    throw new Error(`unknown chunk kind: ${kind}`);
  }
  const words = wordsOf(text);
  if (!words.length) return [];
  if (kind === 'doc') {
    const chunks = words.length > DOC_WINDOW_WORDS
      ? windowsOf(words, DOC_WINDOW_WORDS, OVERLAP_WORDS)
        .map((t) => ({ chunk_kind: 'scene', text: t }))
      : [];
    chunks.push({ chunk_kind: 'pooled', text: String(text) });
    return chunks;
  }
  const chunks = [];
  if (words.length > SHORTS_HOOK_WORDS) {
    chunks.push({ chunk_kind: 'hook', text: words.slice(0, SHORTS_HOOK_WORDS).join(' ') });
    chunks.push({ chunk_kind: 'points', text: words.slice(SHORTS_HOOK_WORDS).join(' ') });
  }
  chunks.push({ chunk_kind: 'pooled', text: String(text) });
  return chunks;
}

// Embed already-collected published scripts into the Brain.
// entries: [{ videoId, text }] — one per uploaded script. Entries without a
// real videoId (gate-rejected ghosts) or without text (pre-capture state)
// are dropped (AC-P3-2). Returns a summary; NEVER throws.
export async function embedPublishedScripts({
  slug, kind, entries, jobId, log = (m) => console.log(m), fetchImpl = fetch,
} = {}) {
  try {
    if (process.env.BRAIN_EMBED_ENABLED !== '1') {
      return { status: 'skipped', reason: 'disabled', embedded: 0, failed: 0, dropped: 0, inserted: 0, updated: 0 };
    }
    const all = entries || [];
    const eligible = all
      .filter((e) => e?.videoId && e?.text) // AC-P3-2: real videoId + captured text only
      .map((e) => ({ ...e, chunks: chunkScriptText(kind, e.text) }))
      .filter((e) => e.chunks.length);      // whitespace-only text chunks to [] — nothing to embed
    const dropped = all.length - eligible.length;
    if (!eligible.length) {
      return { status: 'skipped', reason: 'no-script-text', embedded: 0, failed: 0, dropped, inserted: 0, updated: 0 };
    }

    const base = `http://localhost:${process.env.BRAIN_PORT || BRAIN_PORT_DEFAULT}`;
    // Reachability probe (short): the task brief embeds only when the sidecar
    // is reachable; a refused connection must cost milliseconds, not the
    // embed deadline. The probe only checks the sidecar's transport — the
    // POST itself owns DB/model failures (non-fatal below).
    try {
      const h = await fetchImpl(`${base}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
      if (!h.ok) {
        log(`[brain] /embed skipped — sidecar /health HTTP ${h.status}`);
        return { status: 'skipped', reason: 'unreachable', embedded: 0, failed: 0, dropped, inserted: 0, updated: 0 };
      }
    } catch (e) {
      log(`[brain] /embed skipped — sidecar unreachable: ${String(e?.message || e).slice(0, 90)}`);
      return { status: 'skipped', reason: 'unreachable', embedded: 0, failed: 0, dropped, inserted: 0, updated: 0 };
    }

    const run = jobId || `${process.env.GITHUB_RUN_ID || 'local'}-${new Date().toISOString().slice(0, 10)}`;
    const timeoutMs = Number(process.env.BRAIN_EMBED_TIMEOUT_MS) || EMBED_TIMEOUT_MS_DEFAULT;
    let embedded = 0; let failed = 0; let inserted = 0; let updated = 0;
    for (const { videoId, chunks } of eligible) {
      try {
        const r = await fetchImpl(`${base}/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: slug, kind, job_id: run, video_id: videoId, chunks }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        // The same deadline covers the BODY (house rule #65): a stalled or
        // malformed 200 body rejects here and counts as failed — never
        // silently "succeeds" via a swallowed read.
        const out = await r.json();
        inserted += Number(out.inserted) || 0;
        updated += Number(out.updated) || 0;
        embedded++;
      } catch (e) {
        failed++;
        // The video is already uploaded — embedding is best-effort, always.
        log(`[brain] WARN /embed failed for ${videoId} (non-fatal, publish continues): ${String(e?.message || e).slice(0, 120)}`);
      }
    }
    log(`[brain] embedded ${embedded}/${eligible.length} ${kind} script(s) -> ${inserted} inserted, ${updated} updated`);
    return { status: failed ? 'partial' : 'ok', embedded, failed, dropped, inserted, updated };
  } catch (e) {
    // Belt and braces: nothing in here may ever break a live publish.
    log(`[brain] WARN publish embedding skipped (non-fatal): ${String(e?.message || e).slice(0, 120)}`);
    return { status: 'failed', embedded: 0, failed: 0, dropped: 0, inserted: 0, updated: 0 };
  }
}
