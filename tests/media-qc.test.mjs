// Audit 2026-11-13 #13 (tests-qa-03): no render-output QC existed — a black
// video already reached YouTube (5fae2bf pulled 4 videos); the pre-upload
// check (6228c56) only looks at bytes/magic. lib/media-qc.mjs probes the file
// (ffprobe) and measures black/silence (ffmpeg blackdetect/silencedetect);
// uploadWithIntent refuses bad media and FAILS OPEN on a QC tool error.
// Spec + QA: docs/qa/media-qc-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateQc, runMediaQc, parseDetectDurations } from '../lib/media-qc.mjs';
import { resolveBinary } from '../lib/ffmpeg.mjs';

const good = (over = {}) => ({
  probe: {
    format: { duration: '30.0' },
    streams: [
      { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920 },
      { codec_type: 'audio', codec_name: 'aac' },
    ],
  },
  blackSec: 0,
  silenceSec: 2,
  ...over,
});

test('evaluateQc: a normal vertical Short passes', () => {
  assert.deepEqual(evaluateQc(good(), { kind: 'short' }), { ok: true, problems: [] });
});

test('evaluateQc: mostly-black video fails (the 5fae2bf incident)', () => {
  const r = evaluateQc(good({ blackSec: 20 }), { kind: 'short' });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /black/);
});

test('evaluateQc: mostly-silent video fails', () => {
  const r = evaluateQc(good({ silenceSec: 28 }), { kind: 'short' });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /silent/);
});

test('evaluateQc: missing audio / missing video / unknown codec fail', () => {
  const noAudio = good(); noAudio.probe.streams = noAudio.probe.streams.filter((s) => s.codec_type !== 'audio');
  assert.match(evaluateQc(noAudio, { kind: 'short' }).problems.join(' '), /no audio/);
  const noVideo = good(); noVideo.probe.streams = noVideo.probe.streams.filter((s) => s.codec_type !== 'video');
  assert.match(evaluateQc(noVideo, { kind: 'short' }).problems.join(' '), /no video/);
  const odd = good(); odd.probe.streams[0].codec_name = 'mjpeg';
  assert.match(evaluateQc(odd, { kind: 'short' }).problems.join(' '), /codec/);
});

test('evaluateQc: shape and duration per kind', () => {
  const landscape = good(); landscape.probe.streams[0].width = 1920; landscape.probe.streams[0].height = 1080;
  assert.match(evaluateQc(landscape, { kind: 'short' }).problems.join(' '), /vertical/);
  assert.equal(evaluateQc({ ...landscape, probe: { ...landscape.probe, format: { duration: '360' } } }, { kind: 'doc' }).ok, true, 'a landscape 6-min doc passes');
  assert.match(evaluateQc(good({ probe: { ...good().probe, format: { duration: '2' } } }), { kind: 'short' }).problems.join(' '), /duration/);
  assert.match(evaluateQc(good({ probe: { ...good().probe, format: { duration: '400' } } }), { kind: 'short' }).problems.join(' '), /duration/);
  assert.match(evaluateQc({ ...landscape, probe: { ...landscape.probe, format: { duration: '20' } } }, { kind: 'doc' }).problems.join(' '), /duration/);
});

test('parseDetectDurations sums black_duration / silence_duration from ffmpeg stderr', () => {
  const err = [
    '[blackdetect @ 0x1] black_start:0 black_end:2.5 black_duration:2.5',
    '[blackdetect @ 0x1] black_start:10 black_end:11 black_duration:1',
    '[silencedetect @ 0x2] silence_start: 3',
    '[silencedetect @ 0x2] silence_end: 7.25 | silence_duration: 4.25',
  ].join('\n');
  assert.deepEqual(parseDetectDurations(err), { blackSec: 3.5, silenceSec: 4.25 });
});

// ---- real media (generated with lavfi) — skipped only when ffmpeg is absent ----
const FF = resolveBinary('ffmpeg');
const haveFfmpeg = spawnSync(FF, ['-version'], { encoding: 'utf8' }).status === 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mqc-'));
function make(name, videoSrc, audioSrc, size) {
  const out = path.join(tmp, name);
  const sep = videoSrc.includes('=') ? ':' : '='; // 'testsrc2=s=..' vs 'color=c=black:s=..'
  const r = spawnSync(FF, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `${videoSrc}${sep}s=${size}:d=6:r=30`, '-f', 'lavfi', '-i', `${audioSrc}`, '-t', '6',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return out;
}

test('real media: a test-pattern Short with a tone passes QC', { skip: !haveFfmpeg && 'ffmpeg not available' }, async () => {
  const f = make('ok.mp4', 'testsrc2', 'sine=frequency=440:duration=6', '1080x1920');
  const r = await runMediaQc(f, { kind: 'short' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.skipped, undefined);
});

test('real media: a black, silent Short is refused', { skip: !haveFfmpeg && 'ffmpeg not available' }, async () => {
  const f = make('black.mp4', 'color=c=black', 'anullsrc=r=44100:cl=stereo', '1080x1920');
  const r = await runMediaQc(f, { kind: 'short' });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /black/);
  assert.match(r.problems.join(' '), /silent/);
});

test('fail-open: a QC tool error never blocks the upload', async () => {
  const r = await runMediaQc(path.join(tmp, 'does-not-exist.mp4'), { kind: 'short', ffprobe: 'definitely-not-a-binary-xyz' });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, true);
  assert.match(r.toolError, /./);
});

test('wiring: uploadWithIntent runs QC (when given mediaPath) before creating the intent; every lane passes its file', () => {
  const src = fs.readFileSync('lib/upload-intents.mjs', 'utf8');
  const fn = src.slice(src.indexOf('export async function uploadWithIntent'));
  const qc = fn.indexOf('runMediaQc(mediaPath');
  assert.ok(qc > 0, 'uploadWithIntent calls runMediaQc');
  assert.ok(qc < fn.indexOf('store.createIntent('), 'QC before the intent / upload session');
  for (const f of ['yt-deepdive.mjs', 'yt-daily.mjs', 'longvideo/shorts-clips.mjs']) {
    const s = fs.readFileSync(f, 'utf8');
    const calls = s.split('uploadWithIntent({').slice(1);
    assert.ok(calls.length > 0, f);
    for (const c of calls) assert.match(c.slice(0, 900), /mediaPath:/, `${f}: every uploadWithIntent call passes mediaPath`);
  }
});
