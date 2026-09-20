// PsychToon demo orchestrator.
// Reads public/psych-storyboard.json (scenes + narration), synthesizes each
// scene's narration with Edge TTS via the hardened edge_batch.py, probes real
// durations, computes the scene timeline, and writes public/psych-demo.json —
// the input props for the "PsychToon" Remotion composition.
//
//   node make-psych-demo.mjs           # build timeline only
//   node make-psych-demo.mjs --render  # then render out/psych-demo.mp4
import fs from "node:fs";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";

const DIR = import.meta.dirname;
const PUB = path.join(DIR, "public");
const OUT = path.join(PUB, "psych-demo.json");
const SB = path.join(PUB, "psych-storyboard.json");

const LEAD_MS = 300;   // breath before the first scene
const PAD_MS = 480;    // breath after each scene's narration
const TAIL_MS = 900;   // hold the last scene briefly

const sb = JSON.parse(fs.readFileSync(SB, "utf8"));
const scenes = sb.scenes;

// ---- 1. TTS -----------------------------------------------------------------
const beatsIn = path.join(PUB, "psych-tts-input.json");
fs.writeFileSync(beatsIn, JSON.stringify(scenes.map((s, i) => ({ i, text: s.narration }))));
console.log(`[psych] synthesizing ${scenes.length} scenes (voice: ${sb.voice || process.env.EXPLAINER_VOICE || "en-US-AndrewNeural"})`);
execFileSync("python", [path.join(DIR, "edge_batch.py"), beatsIn], { stdio: "inherit", env: { ...process.env, EXPLAINER_VOICE: sb.voice || "en-US-AndrewNeural" } });

const durs = JSON.parse(fs.readFileSync(path.join(PUB, "tts-durations.json"), "utf8"));
const durByI = new Map(durs.map((d) => [d.i, d.ms]));

const FFPROBE = process.env.FFPROBE_PATH
  || path.join(DIR, "..", "ffmpeg-bin/ffmpeg-master-latest-win64-gpl/bin/ffprobe.exe");
const probeMs = (file) => {
  try {
    const out = execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(PUB, file)]).toString().trim();
    return Math.round(parseFloat(out) * 1000);
  } catch {
    return 0;
  }
};

// ---- 2. timeline -------------------------------------------------------------
let cursor = LEAD_MS;
scenes.forEach((s, i) => {
  const audio = `audio/beat-${String(i).padStart(2, "0")}.mp3`;
  const spoken = Math.max(durByI.get(i) ?? 0, probeMs(audio));
  s.audio = audio;
  s.startMs = cursor;
  s.ms = spoken + PAD_MS;
  cursor += s.ms;
});
const totalMs = cursor + TAIL_MS - PAD_MS;

// ---- 3. music ----------------------------------------------------------------
let music = null;
if (sb.music?.src) {
  const cachePath = path.join(DIR, "..", ".music-cache", sb.music.src);
  const dest = path.join(PUB, "psych-music.mp3");
  fs.copyFileSync(cachePath, dest);
  music = { src: "psych-music.mp3", volume: sb.music.volume ?? 0.11 };
}

// ---- 4. props doc --------------------------------------------------------------
const doc = {
  title: sb.title,
  fps: 30,
  width: 1920,
  height: 1080,
  totalMs,
  music,
  scenes,
};
fs.writeFileSync(OUT, JSON.stringify(doc, null, 2));

console.log("\n[psych] timeline:");
scenes.forEach((s, i) => {
  const sec = (s.ms / 1000).toFixed(1).padStart(5);
  console.log(`  scene ${i + 1}  ${sec}s  ${(s.label?.text || s.cardText || s.signText || "").slice(0, 40)}`);
});
console.log(`  TOTAL    ${(totalMs / 1000).toFixed(1)}s  ->  public/psych-demo.json`);

if (process.argv.includes("--render")) {
  console.log("\n[psych] rendering out/psych-demo.mp4 ...");
  execSync("npx remotion render remotion/index.ts PsychToon out/psych-demo.mp4 --props=public/psych-demo.json", {
    cwd: DIR,
    stdio: "inherit",
  });
  console.log("[psych] done -> explainer/out/psych-demo.mp4");
}
