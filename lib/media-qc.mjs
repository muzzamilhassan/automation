// Pre-upload media QC (audit 2026-11-13 #13, tests-qa-03). A black video
// already reached YouTube once (5fae2bf pulled 4 videos) and the existing
// pre-upload check (6228c56) only inspects bytes/magic numbers. This probes
// the actual render:
//   ffprobe  -> streams, codecs, resolution, duration
//   ffmpeg   -> blackdetect + silencedetect totals
// evaluateQc is pure (unit-tested). runMediaQc FAILS OPEN on a tool error
// (missing binary, timeout, unreadable output): QC must never darken
// production — it only refuses media it actually measured as bad.
import { execFile } from 'node:child_process';
import { resolveBinary } from './ffmpeg.mjs';

const VIDEO_CODECS = new Set(['h264', 'hevc', 'vp9', 'av1']);
const AUDIO_CODECS = new Set(['aac', 'opus', 'mp3']);

// Per-kind expectations. Shorts: vertical, 5s..3min (YouTube Shorts cap).
// Docs: landscape, >= 60s, >= 1280x720.
export const QC_RULES = Object.freeze({
  short: { minSec: 5, maxSec: 180, orientation: 'vertical', minShortSide: 720 },
  doc: { minSec: 60, maxSec: 6 * 3600, orientation: 'landscape', minShortSide: 720 },
  maxBlackRatio: 0.5,
  maxSilenceRatio: 0.8,
});

export function parseDetectDurations(stderr = '') {
  let blackSec = 0;
  let silenceSec = 0;
  for (const m of String(stderr).matchAll(/black_duration:\s*([\d.]+)/g)) blackSec += Number(m[1]);
  for (const m of String(stderr).matchAll(/silence_duration:\s*([\d.]+)/g)) silenceSec += Number(m[1]);
  return { blackSec: Math.round(blackSec * 1000) / 1000, silenceSec: Math.round(silenceSec * 1000) / 1000 };
}

// Pure decision. input = { probe: ffprobe JSON, blackSec, silenceSec }.
export function evaluateQc({ probe, blackSec = 0, silenceSec = 0 }, { kind = 'short' } = {}) {
  const rules = QC_RULES[kind === 'doc' ? 'doc' : 'short'];
  const problems = [];
  const streams = probe?.streams || [];
  const v = streams.find((s) => s.codec_type === 'video');
  const a = streams.find((s) => s.codec_type === 'audio');
  const dur = Number(probe?.format?.duration || v?.duration || 0);

  if (!v) problems.push('no video stream');
  if (!a) problems.push('no audio stream');
  if (v && !VIDEO_CODECS.has(String(v.codec_name))) problems.push(`unexpected video codec ${v.codec_name}`);
  if (a && !AUDIO_CODECS.has(String(a.codec_name))) problems.push(`unexpected audio codec ${a.codec_name}`);
  if (!(dur >= rules.minSec && dur <= rules.maxSec)) problems.push(`duration ${dur.toFixed(1)}s outside ${rules.minSec}-${rules.maxSec}s for a ${kind}`);
  if (v) {
    const w = Number(v.width) || 0;
    const h = Number(v.height) || 0;
    if (rules.orientation === 'vertical' && !(h > w)) problems.push(`not vertical (${w}x${h}) for a short`);
    if (rules.orientation === 'landscape' && !(w > h)) problems.push(`not landscape (${w}x${h}) for a doc`);
    if (Math.min(w, h) < rules.minShortSide) problems.push(`resolution ${w}x${h} below ${rules.minShortSide}p`);
  }
  if (dur > 0 && blackSec / dur >= QC_RULES.maxBlackRatio) problems.push(`mostly black (${blackSec.toFixed(1)}s of ${dur.toFixed(1)}s)`);
  if (dur > 0 && a && silenceSec / dur >= QC_RULES.maxSilenceRatio) problems.push(`mostly silent (${silenceSec.toFixed(1)}s of ${dur.toFixed(1)}s)`);
  return { ok: problems.length === 0, problems };
}

function run(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err && (err.code === 'ENOENT' || err.killed || err.signal)) return reject(err);
      if (err && !stderr && !stdout) return reject(err);
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || ''), code: err ? err.code : 0 });
    });
  });
}

export async function runMediaQc(file, { kind = 'short', ffprobe = resolveBinary('ffprobe'), ffmpeg = resolveBinary('ffmpeg'), timeoutMs = 5 * 60000 } = {}) {
  let probe;
  try {
    const p = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], 60000);
    probe = JSON.parse(p.stdout || '{}');
    if (!probe.format) throw new Error(`ffprobe returned no format (${p.stderr.slice(0, 120)})`);
  } catch (e) {
    return { ok: true, skipped: true, toolError: `ffprobe: ${String(e.message || e).slice(0, 160)}`, problems: [] };
  }
  const dur = Number(probe.format.duration || 0);
  let blackSec = 0;
  let silenceSec = 0;
  try {
    // Long renders: decode keyframes only — enough to see "mostly black", ~10x faster.
    const skip = dur > 120 ? ['-skip_frame', 'nokey'] : [];
    const r = await run(ffmpeg, ['-hide_banner', '-nostats', ...skip, '-i', file,
      '-vf', 'blackdetect=d=0.5:pix_th=0.10', '-af', 'silencedetect=n=-50dB:d=1', '-f', 'null', '-'], timeoutMs);
    ({ blackSec, silenceSec } = parseDetectDurations(r.stderr));
  } catch (e) {
    // probe-level checks still apply; black/silence unmeasured
    const res = evaluateQc({ probe, blackSec: 0, silenceSec: 0 }, { kind });
    return { ...res, partial: true, toolError: `ffmpeg: ${String(e.message || e).slice(0, 160)}`, stats: { durationSec: dur } };
  }
  const res = evaluateQc({ probe, blackSec, silenceSec }, { kind });
  return { ...res, stats: { durationSec: dur, blackSec, silenceSec } };
}
