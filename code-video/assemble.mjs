// One-off assembly of the demo from already-rendered frames.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildAssCaptions } from '../youtube-engine.mjs';
const FF = 'ffmpeg-bin/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe';
const meta = JSON.parse(fs.readFileSync('code-video/narr.mp3.meta.json', 'utf8'));
const lastW = meta.words[meta.words.length - 1];
const dur = Math.round((lastW.s + lastW.d + 4) * 10) / 10;
fs.writeFileSync('code-video/caps.ass', buildAssCaptions(meta.words, { w: 1920, h: 1080, x: 960, y: 970, size: 52 }), 'utf8');
execFileSync(FF, ['-y', '-framerate', '24', '-i', 'code-video/frames/f_%05d.jpg',
  '-i', meta.audio, '-stream_loop', '-1', '-i', 'image-tools/audio/awakening-dew.mp3',
  '-filter_complex',
  '[0:v]format=yuv420p[v];[v]ass=code-video/caps.ass:fontsdir=image-tools/fonts[vout];' +
  `[1:a]apad=pad_dur=2,atrim=0:${dur}[nar];[2:a]volume=0.12,atrim=0:${dur},afade=t=out:st=${(dur - 1.5).toFixed(1)}:d=1.5[mus];` +
  '[nar][mus]amix=inputs=2:duration=first:normalize=0[aout]',
  '-map', '[vout]', '-map', '[aout]', '-t', String(dur), '-r', '24',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'code-video/code-demo.mp4'],
  { stdio: ['ignore', 'ignore', 'inherit'], timeout: 20 * 60 * 1000 });
fs.rmSync('code-video/caps.ass', { force: true });
console.log('DONE code-video/code-demo.mp4 ' + Math.round(fs.statSync('code-video/code-demo.mp4').size / 1048576) + 'MB ' + dur + 's');
