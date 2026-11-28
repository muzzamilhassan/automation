// 2026-11-28 owner: "Behind The AI Bill speaks slow … I want to set that in the admin panel"
// The Voice drawer's Speed (and Mood) now reach EVERY voice, not only Human pacing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { voiceSettingsFor, edgeRate } from '../lib/voice-profile.mjs';
import { diagramVoiceArgs } from '../lib/diagram-episode.mjs';

const reg = (kit) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vs-')), 'reg.json');
  fs.writeFileSync(f, JSON.stringify({ channels: [{ slug: 'ch', kit }] }));
  return f;
};

test('the drawer speed is read whether Human pacing is on or off; nothing saved = today', () => {
  assert.deepEqual(voiceSettingsFor('ch', reg({ voiceProfile: { human: false, mood: 'warm', speed: 1.1 } })), { speed: 1.1, mood: 'warm' });
  assert.deepEqual(voiceSettingsFor('ch', reg({})), { speed: 1, mood: 'warm' });
});

test('an Edge voice gets the speed as its rate', () => {
  assert.equal(edgeRate(1.1, -2), '+8%');
  assert.equal(edgeRate(1, -2), '-2%', 'speed 1 = the old storybook rate');
  assert.equal(edgeRate(0.9), '-10%');
  assert.deepEqual(diagramVoiceArgs({ voiceSpeed: 1.1 }, {}), ['--engine', 'edge', '--voice', 'en-US-AndrewMultilingualNeural', '--speed', '1.1']);
  assert.deepEqual(diagramVoiceArgs({ voiceSpeed: 1 }, {}), ['--engine', 'edge', '--voice', 'en-US-AndrewMultilingualNeural'], 'unchanged at 1');
});

test('both long-video lanes pass the speed on', () => {
  const dd = fs.readFileSync(new URL('../yt-deepdive.mjs', import.meta.url), 'utf8');
  assert.match(dd, /EXPLAINER_RATE: rate/);
  assert.match(dd, /voiceSpeed: voiceSettingsFor\(slug\)\.speed/);
  const py = fs.readFileSync(new URL('../explainer/voice_lines.py', import.meta.url), 'utf8');
  assert.match(py, /synth_edge\(script, mood, args\.voice, raw_mp3, args\.speed\)/);
});
