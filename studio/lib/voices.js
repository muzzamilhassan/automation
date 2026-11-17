// #111 — the Kokoro voices the Add Channel wizard offers, with human labels
// and playable demos. Every id here is a voice production actually uses
// (lib/brands.json voiceProfile.voice). Demos are static MP3s in
// studio/public/voices/, pre-generated once by
// scripts/generate-voice-demos.py with the SAME production lane as real
// narrations (same sentence for every voice, so they compare honestly).
// Pin-tests in tests/wizard-voice-demos.test.mjs keep this file, brands.json
// and the MP3 files in sync — a demo listed here but missing on disk fails
// CI, which is how the wizard guarantees it never renders a broken player.
export const VOICES = [
  { id: 'am_michael', label: 'American male · warm narrator', demo: '/voices/am_michael.mp3' },
  { id: 'bm_george', label: 'British male · mature storyteller', demo: '/voices/bm_george.mp3' },
  { id: 'bm_daniel', label: 'British male · documentary style', demo: '/voices/bm_daniel.mp3' },
  { id: 'am_fenrir', label: 'American male · bold, high energy', demo: '/voices/am_fenrir.mp3' },
  { id: 'am_adam', label: 'American male · deep and steady', demo: '/voices/am_adam.mp3' },
  { id: 'af_heart', label: 'American female · bright and warm', demo: '/voices/af_heart.mp3' },
  { id: 'am_onyx', label: 'American male · deep, dramatic', demo: '/voices/am_onyx.mp3' },
];
