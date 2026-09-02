// Local test: render cinematic poster + reel for all 5 brands with dynamic text.
// Generation ONLY — does not publish anything anywhere.
import fs from 'node:fs';
import { renderCinematicPoster, renderCinematicReel } from './cinematic-engine.mjs';

const PAGE_IDS = {
  SW: '116157974886564', SS: '108044922375174', BC: '106473735839651',
  EV: '1077306835630491', RN: '114550268199751'
};

// dynamic-style sample content (long variants to exercise wrap + shrink)
const SAMPLES = {
  SW: { headline: 'TIME IS MORE VALUABLE THAN MONEY.', insight_body: 'You can always make more money. You can never get back lost time.', takeaway: 'Rule: Spend time like the asset it is.' },
  SS: { headline: 'SMALL HABITS MAKE BIG CHANGES.', insight_body: 'What you do every single day matters far more than what you do once in a while.', takeaway: 'Rule: Consistency beats intensity.' },
  BC: { headline: 'STOP COMPLAINING. START WORKING.', insight_body: 'Complaining changes nothing. Working hard changes everything.', takeaway: 'Rule: Build in silence.' },
  EV: { headline: "DON'T WAIT FOR THE RIGHT TIME.", insight_body: 'The perfect moment will never arrive. Start today with whatever you have.', takeaway: 'Rule: Start before you are ready.' },
  RN: { headline: 'DO NOT TELL PEOPLE YOUR PLANS.', insight_body: 'Show them your results instead. Let your success speak for you.', takeaway: 'Rule: Move in silence.' }
};

const only = process.argv[2] || null;
for (const [b, id] of Object.entries(PAGE_IDS)) {
  if (only && b !== only) continue;
  const page = { id, name: b };
  console.log(`\n===== ${b} =====`);
  try {
    const postBuf = await renderCinematicPoster(page, SAMPLES[b], `flow-test-poster-${b}.jpg`);
    console.log('  poster OK', Math.round(postBuf.length / 1024) + 'KB');
  } catch (e) { console.error('  POSTER FAILED:', e.message); }
  try {
    const reelBuf = await renderCinematicReel(page, SAMPLES[b], 'awakening-dew');
    fs.writeFileSync(`flow-test-reel-${b}.mp4`, reelBuf);
    console.log('  reel OK', Math.round(reelBuf.length / 1024) + 'KB');
  } catch (e) { console.error('  REEL FAILED:', e.message); }
}
console.log('\nTest complete (nothing was published).');
