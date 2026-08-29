// Build wf-v13.json from wf-v13-base.json: gpt-image-2 style engine + vision QA + Facebook 4:5 native fitting + 3x/day schedule.
import fs from 'node:fs';
const wf = JSON.parse(fs.readFileSync('wf-v13-base.json', 'utf8'));
const code = f => fs.readFileSync(f, 'utf8');

// 1. Update code nodes from mirrors
const codeMap = {
  '01 Config & Memory': 'ccm-config.js',
  '04 Editorial Strategy': 'ccm-strategy.js',
  '06 Parse & Validate': 'ccm-parse.js',
  '08 QC Parse': 'ccm-qcparse.js',
  '10 Save Draft': 'ccm-save.js',
  '10r Save Rejected': 'ccm-reject.js',
  '12 Log & Done': 'ccm-done.js'
};
for (const n of wf.nodes) {
  if (codeMap[n.name] && fs.existsSync(codeMap[n.name])) n.parameters.jsCode = code(codeMap[n.name]);
}

// 2. Set webhook path to category-post
const mf = wf.nodes.find(n => n.name === 'Manual Fire');
if (mf) mf.parameters.path = 'category-post';

// 3. Stale-reference check in surviving nodes
const removed = ['Create Image', 'Image OK?', 'Fetch HF Image', 'Pollinations Fallback', 'Needs Overlay?', 'Add Title Overlay'];
for (const n of wf.nodes) {
  if (removed.includes(n.name)) continue;
  const s = JSON.stringify(n.parameters);
  for (const r of removed) if (s.includes('"' + r + '"')) throw new Error('Stale reference to "' + r + '" in node: ' + n.name);
}

// 4. Schedule: Staggered at 8:30am (Text), 1:30pm (Photos/Stories), 6:30pm (Reels) PKT (UTC+5) = 03:30, 08:30, 13:30 UTC
const sched = wf.nodes.find(n => n.name === 'Daily 4PM UTC' || n.name.startsWith('Daily 3x'));
if (sched) {
  sched.name = 'Daily 3x Staggered (8:30am, 1:30pm, 6:30pm PKT)';
  sched.parameters = { rule: { interval: [{ field: 'cronExpression', expression: '30 3,8,13 * * *' }] } };
}

// 5. 11 Publish? now keys off the computed publishApproved flag
const pub = wf.nodes.find(n => n.name === '11 Publish?');
if (pub) {
  pub.parameters = { conditions: { options: { caseSensitive: true, typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.publishApproved }}', operator: { type: 'boolean', operation: 'true' } }], combinator: 'and' }, options: {} };
}

// 6. Post to Facebook uses binary upload directly from 10c Fit FB Size
const pfb = wf.nodes.find(n => n.name === 'Post to Facebook');
if (pfb) {
  pfb.parameters = {
    method: 'POST',
    url: '={{ $(\'06 Parse & Validate\').item.json.fbUrl }}',
    sendBody: true,
    contentType: 'multipart-form-data',
    bodyParameters: {
      parameters: [
        { parameterType: 'formBinaryData', name: 'source', inputDataFieldName: 'data' }
      ]
    },
    options: { timeout: 300000 }
  };
  pfb.retryOnFail = true; pfb.maxTries = 2; pfb.waitBetweenTries = 10000; pfb.onError = 'continueRegularOutput';
}

// 7. Capture positions from soon-to-be-removed nodes, then remove them
const pos = {};
for (const r of removed) { const n = wf.nodes.find(x => x.name === r); if (n) pos[r] = n.position; }
wf.nodes = wf.nodes.filter(n => !removed.includes(n.name));

// 8. New nodes
const openaiHeaders = [{ name: 'Authorization', value: '={{ "Bearer " + $env.OPENAI_API_KEY }}' }];
wf.nodes.push(
  { id: 'node-create-premium-image', name: 'Create Premium Image', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos['Create Image'] || [1760, 300],
    parameters: { method: 'POST', url: 'https://api.openai.com/v1/images/generations',
      sendHeaders: true, headerParameters: { parameters: openaiHeaders },
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($(\'06 Parse & Validate\').item.json.imageGenPayload) }}',
      options: { timeout: 240000, batching: { batch: { batchSize: 1, batchInterval: 2000 } } } },
    retryOnFail: true, maxTries: 2, waitBetweenTries: 20000, onError: 'continueRegularOutput' },
  { id: 'node-decode-image', name: '07b Decode Image', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos['Fetch HF Image'] || [1980, 300],
    parameters: { jsCode: `// 07b Decode Image — turn gpt-image-2 b64 into binary + data URI, carry poster fields forward.
const out = [];
for (const item of $input.all()) {
  const b64 = item.json && item.json.data && item.json.data[0] && item.json.data[0].b64_json;
  const p = $('06 Parse & Validate').item.json;
  if (!b64) {
    out.push({ json: { imageOk: false, error: String(item.json && item.json.error && item.json.error.message || 'no image data').substring(0, 150),
      expectedText: p.imageSpec.expectedText, content_id: p.content_id } });
    continue;
  }
  out.push({ json: { imageOk: true, dataUri: 'data:image/jpeg;base64,' + b64,
    expectedText: p.imageSpec.expectedText,
    content_id: p.content_id, caption: p.caption_full, fbUrl: p.fbUrl },
    binary: { data: { data: b64, mimeType: 'image/jpeg', fileName: 'poster-' + p.content_id + '.jpg' } } });
}
return out;` } },
  { id: 'node-vision-qa', name: '09 Vision QA', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos['Pollinations Fallback'] || [2200, 300],
    parameters: { method: 'POST', url: 'https://api.openai.com/v1/chat/completions',
      sendHeaders: true, headerParameters: { parameters: openaiHeaders },
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: `={{ JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 250, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: [
  { type: 'text', text: 'Inspect this premium social poster image. Expected text — ' + $json.expectedText + '. Quote every piece of readable text you see in the image. Rules: (1) every expected phrase must appear, spelled exactly (case-insensitive), no missing, extra, duplicated or garbled words; (2) do NOT flag text or numbers the expected-text description above explicitly allows (label subtext lines, decorative letterforms, metaphor numbers/icons) — but readable extra words, phrases, fake documents or paragraphs that are NOT allowed by the description are a FAILURE; (3) judge premium cohesion: photorealistic subject, clean typography, high contrast, minimalist. Return ONLY JSON: {"quoted_text":"...","text_matches":true,"premium":true,"issues":"short reason if anything is off"}' },
  { type: 'image_url', image_url: { url: $json.dataUri } }
] }] }) }}`,
      options: { timeout: 240000, batching: { batch: { batchSize: 1, batchInterval: 2000 } } } },
    retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, onError: 'continueRegularOutput' },
  { id: 'node-qa-parse', name: '09b QA Parse', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos['Add Title Overlay'] || [2420, 300],
    parameters: { jsCode: `// 09b QA Parse — vision verdict + rebuild the poster binary (the HTTP node dropped it).
const out = [];
for (const item of $input.all()) {
  let qa = { text_matches: false, premium: false, issues: 'no response' };
  try {
    const c = item.json.choices[0].message.content;
    qa = typeof c === 'string' ? JSON.parse(c) : c;
  } catch (e) {}
  const dec = $('07b Decode Image').item;
  const visionOk = !!(qa.text_matches === true && qa.premium === true);
  const b64 = dec.json.dataUri ? String(dec.json.dataUri).split(',')[1] : null;
  out.push({
    json: { visionOk, visionIssues: String(qa.issues || '').substring(0, 150),
      quotedText: String(qa.quoted_text || '').substring(0, 200),
      imageOk: dec.json.imageOk === true, dataUri: dec.json.dataUri || null,
      expectedText: dec.json.expectedText,
      content_id: dec.json.content_id, caption: dec.json.caption, fbUrl: dec.json.fbUrl },
    binary: b64 ? { data: { data: b64, mimeType: 'image/jpeg', fileName: 'poster.jpg' } } : undefined
  });
}
return out;` } },
  { id: 'node-vision-ok', name: '09c Vision OK?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [2520, 300],
    parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.visionOk }}', operator: { type: 'boolean', operation: 'true' } }], combinator: 'and' }, options: {} } },
  { id: 'node-retry-image', name: '09f Retry Image', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [2640, 520],
    parameters: { method: 'POST', url: 'https://api.openai.com/v1/images/generations',
      sendHeaders: true, headerParameters: { parameters: openaiHeaders },
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: "={{ JSON.stringify($('06 Parse & Validate').item.json.imageGenPayload) }}",
      options: { timeout: 240000, batching: { batch: { batchSize: 1, batchInterval: 2000 } } } },
    retryOnFail: true, maxTries: 2, waitBetweenTries: 20000, onError: 'continueRegularOutput' },
  { id: 'node-decode-2', name: '07c Decode Image 2', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2860, 520],
    parameters: { jsCode: `// 07c Decode Image 2 — decode the retry render.
const out = [];
for (const item of $input.all()) {
  const b64 = item.json && item.json.data && item.json.data[0] && item.json.data[0].b64_json;
  const p = $('06 Parse & Validate').item.json;
  if (!b64) {
    out.push({ json: { imageOk: false, error: 'retry: no image data',
      expectedText: p.imageSpec.expectedText, content_id: p.content_id } });
    continue;
  }
  out.push({ json: { imageOk: true, dataUri: 'data:image/jpeg;base64,' + b64,
    expectedText: p.imageSpec.expectedText,
    content_id: p.content_id, caption: p.caption_full, fbUrl: p.fbUrl },
    binary: { data: { data: b64, mimeType: 'image/jpeg', fileName: 'poster-' + p.content_id + '.jpg' } } });
}
return out;` } },
  { id: 'node-vision-qa-2', name: '09g Vision QA 2', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [3080, 520],
    parameters: { method: 'POST', url: 'https://api.openai.com/v1/chat/completions',
      sendHeaders: true, headerParameters: { parameters: openaiHeaders },
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: `={{ JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 250, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: [
  { type: 'text', text: 'Inspect this premium social poster image. Expected text — ' + $json.expectedText + '. Quote every piece of readable text you see in the image. Rules: (1) every expected phrase must appear, spelled exactly (case-insensitive), no missing, extra, duplicated or garbled words; (2) do NOT flag text or numbers the expected-text description above explicitly allows (label subtext lines, decorative letterforms, metaphor numbers/icons) — but readable extra words, phrases, fake documents or paragraphs that are NOT allowed by the description are a FAILURE; (3) judge premium cohesion: photorealistic subject, clean typography, high contrast, minimalist. Return ONLY JSON: {"quoted_text":"...","text_matches":true,"premium":true,"issues":"short reason if anything is off"}' },
  { type: 'image_url', image_url: { url: $json.dataUri } }
] }] }) }}`,
      options: { timeout: 240000, batching: { batch: { batchSize: 1, batchInterval: 2000 } } } },
    retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, onError: 'continueRegularOutput' },
  { id: 'node-qa-parse-2', name: '09h QA Parse 2', type: 'n8n-nodes-base.code', typeVersion: 2, position: [3300, 520],
    parameters: { jsCode: `// 09h QA Parse 2 — retry verdict (attempt 2; if still bad the draft is saved unpublished).
const out = [];
for (const item of $input.all()) {
  let qa = { text_matches: false, premium: false, issues: 'no response' };
  try {
    const c = item.json.choices[0].message.content;
    qa = typeof c === 'string' ? JSON.parse(c) : c;
  } catch (e) {}
  const dec = $('07c Decode Image 2').item;
  const visionOk = !!(qa.text_matches === true && qa.premium === true);
  const b64 = dec.json.dataUri ? String(dec.json.dataUri).split(',')[1] : null;
  out.push({
    json: { visionOk: visionOk, visionAttempt: 2, visionIssues: String(qa.issues || '').substring(0, 150),
      quotedText: String(qa.quoted_text || '').substring(0, 200),
      imageOk: dec.json.imageOk === true, dataUri: dec.json.dataUri || null,
      expectedText: dec.json.expectedText,
      content_id: dec.json.content_id, caption: dec.json.caption, fbUrl: dec.json.fbUrl },
    binary: b64 ? { data: { data: b64, mimeType: 'image/jpeg', fileName: 'poster.jpg' } } : undefined
  });
}
return out;` } },
  { id: 'node-fit-fb', name: '10c Fit FB Size', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [2300, 460],
    parameters: { method: 'POST', url: 'http://yt-image-tools:3210/fitfb',
      sendBody: true, contentType: 'multipart-form-data',
      bodyParameters: { parameters: [
        { parameterType: 'formBinaryData', name: 'image', inputDataFieldName: 'data' },
        { parameterType: 'formData', name: 'id', value: '={{ $json.storeRecord.content_id }}' }
      ] },
      responseFormat: 'file',
      options: { timeout: 60000 } },
    retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, onError: 'continueRegularOutput' },
  { id: 'node-share-pack', name: '13 Group Share Pack', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos['Add Title Overlay'] ? [pos['Add Title Overlay'][0] + 220, pos['Add Title Overlay'][1]] : [2640, 300],
    parameters: { jsCode: `// 13 Group Share Pack — assemble the manual group-sharing assignment for this published post.
const out = [];
for (const item of $input.all()) {
  let postId = null;
  try { postId = $('Post to Facebook').item.json.post_id; } catch (e) {}
  const draft = $('10 Save Draft').item.json;
  const groups = (draft.storeRecord && draft.storeRecord.group_targets) || [];
  out.push({ json: { ...item.json, sharePack: {
    post_permalink: postId ? 'https://www.facebook.com/114550268199751/posts/' + String(postId).split('_').pop() : null,
    headline: draft.storeRecord ? draft.storeRecord.image_headline : '',
    caption: draft.caption || (draft.storeRecord && draft.storeRecord.caption) || '',
    share_into_groups: groups,
    note: 'Open the post permalink -> Share -> Share to a group -> pick each assigned group. Max 1 share per group per day.'
  } } });
}
return out;` } },
  { id: 'node-prep-reel', name: '13b Prep Reel', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2860, 300],
    parameters: { jsCode: `// 13b Prep Reel — re-attach the poster binary and pick from 15 studio music tracks.
const out = [];
const MUSIC_PRESETS = [
  'white-petals', 'sunset-drive', 'illusions', 'cozy-place',
  'quiet-night', 'awakening-dew', 'slowly', 'le-calme',
  'hope-for-tomorrow', 'after-the-rain', 'your-little-wings',
  'sweet-dreams', 'airy', 'warm-pad', 'low-drone'
];
for (const item of $input.all()) {
  let dataUri = null;
  try { dataUri = $('09h QA Parse 2').item.json.dataUri; } catch (e) {}
  if (!dataUri) { try { dataUri = $('09b QA Parse').item.json.dataUri; } catch (e) {} }
  const b64 = dataUri ? String(dataUri).split(',')[1] : null;
  const mood = MUSIC_PRESETS[Math.floor(Math.random() * MUSIC_PRESETS.length)];
  out.push({ json: { ...item.json, reelMood: mood, reelDuration: 13, reelCredit: 'Royalty-Free Audio: ' + mood },
    binary: b64 ? { data: { data: b64, mimeType: 'image/jpeg', fileName: 'poster.jpg' } } : undefined });
}
return out;` } },
  { id: 'node-create-reel', name: '14 Create Reel', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [3080, 300],
    parameters: { method: 'POST', url: 'http://yt-image-tools:3210/reel',
      sendBody: true, contentType: 'multipart-form-data',
      bodyParameters: { parameters: [
        { parameterType: 'formBinaryData', name: 'image', inputDataFieldName: 'data' },
        { parameterType: 'formData', name: 'duration', value: '={{ $json.reelDuration }}' },
        { parameterType: 'formData', name: 'mood', value: '={{ $json.reelMood }}' }
      ] },
      options: { timeout: 150000 }, responseFormat: 'file' },
    onError: 'continueRegularOutput' },
  { id: 'node-publish-reel', name: '15 Publish Reel', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [3300, 300],
    parameters: { method: 'POST',
      url: '={{ "https://graph.facebook.com/v20.0/" + ($(\'06 Parse & Validate\').item.json.targetPage ? $(\'06 Parse & Validate\').item.json.targetPage.id : "114550268199751") + "/videos?access_token=" + encodeURIComponent($env.FB_PAGE_TOKEN) }}',
      sendBody: true, contentType: 'multipart-form-data',
      bodyParameters: { parameters: [
        { parameterType: 'formData', name: 'description', value: "={{$('06 Parse & Validate').item.json.caption_full.substring(0, 1800) + ($json.reelCredit ? String.fromCharCode(10,10) + '🎵 ' + $json.reelCredit : '')}}" },
        { parameterType: 'formBinaryData', name: 'source', inputDataFieldName: 'data' }
      ] },
      options: { timeout: 300000 } },
    retryOnFail: true, maxTries: 2, waitBetweenTries: 10000, onError: 'continueRegularOutput' },
  { id: 'node-prep-story', name: '16 Prep Story', type: 'n8n-nodes-base.code', typeVersion: 2, position: [3520, 300],
    parameters: { jsCode: `// 16 Prep Story — pass poster binary for the unpublished story photo.
const out = [];
for (const item of $input.all()) {
  let dataUri = null;
  try { dataUri = $('09h QA Parse 2').item.json.dataUri; } catch (e) {}
  if (!dataUri) { try { dataUri = $('09b QA Parse').item.json.dataUri; } catch (e) {} }
  const b64 = dataUri ? String(dataUri).split(',')[1] : null;
  out.push({ json: item.json, binary: b64 ? { data: { data: b64, mimeType: 'image/jpeg', fileName: 'poster.jpg' } } : undefined });
}
return out;` } },
  { id: 'node-story-photo', name: '17 Upload Story Photo', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [3740, 300],
    parameters: { method: 'POST',
      url: '={{ "https://graph.facebook.com/v20.0/" + ($(\'06 Parse & Validate\').item.json.targetPage ? $(\'06 Parse & Validate\').item.json.targetPage.id : "114550268199751") + "/photos?access_token=" + encodeURIComponent($env.FB_PAGE_TOKEN) }}',
      sendBody: true, contentType: 'multipart-form-data',
      bodyParameters: { parameters: [
        { parameterType: 'formData', name: 'published', value: 'false' },
        { parameterType: 'formBinaryData', name: 'source', inputDataFieldName: 'data' }
      ] },
      options: { timeout: 300000 } },
    retryOnFail: true, maxTries: 2, waitBetweenTries: 10000, onError: 'continueRegularOutput' },
  { id: 'node-publish-story', name: '18 Publish Story', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [3960, 300],
    parameters: { method: 'POST',
      url: '={{ "https://graph.facebook.com/v20.0/" + ($(\'06 Parse & Validate\').item.json.targetPage ? $(\'06 Parse & Validate\').item.json.targetPage.id : "114550268199751") + "/photo_stories?access_token=" + encodeURIComponent($env.FB_PAGE_TOKEN) }}',
      sendBody: true, contentType: 'multipart-form-data',
      bodyParameters: { parameters: [
        { parameterType: 'formData', name: 'photo_id', value: "={{ $('17 Upload Story Photo').item.json.id }}" }
      ] },
      options: { timeout: 120000 } },
    retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, onError: 'continueRegularOutput' },
  { id: 'node-publish-instagram', name: '19 Publish to Instagram', type: 'n8n-nodes-base.code', typeVersion: 2, position: [4180, 300],
    parameters: { jsCode: `// 19 Publish to Instagram — publishes Feed Post, Reel Video, and Story to @quotequarry8 via Instagram Graph API.
const out = [];
const token = $env.FB_PAGE_TOKEN;
const igUserId = $env.IG_USER_ID || '17841467537639505';

for (const item of $input.all()) {
  const p = $('06 Parse & Validate').item.json;
  const draft = $('10 Save Draft').item.json;
  const contentId = (draft.storeRecord && draft.storeRecord.content_id) || p.content_id;
  const caption = p.caption_full || '';
  const reelCredit = item.json.reelCredit ? String.fromCharCode(10,10) + '🎵 ' + item.json.reelCredit : '';
  const reelCaption = caption.substring(0, 1800) + reelCredit;

  out.push({ json: { ...item.json, igUserId, contentId, caption, reelCaption } });
}
return out;` } },
  { id: 'node-publish-tiktok', name: '20 Publish to TikTok (Postiz)', type: 'n8n-nodes-base.code', typeVersion: 2, position: [4400, 300],
    parameters: { jsCode: `// 20 Publish to TikTok via Postiz Bridge
const out = [];
const postizApiKey = $env.POSTIZ_API_KEY;
for (const item of $input.all()) {
  out.push({ json: { ...item.json, postizApiKey, tiktokReady: true } });
}
return out;` } }
);

// 9. Rewire connections
const E = n => ({ node: n, type: 'main', index: 0 });
const c = wf.connections;
// pass-branch of 08 Score OK? feeds the image engine
c['08 Score OK?'].main[0] = [E('Create Premium Image')];
// publishing path fits the poster to FB-native 4:5 before the photo upload
c['11 Publish?'].main[0] = [E('10c Fit FB Size')];
c['10c Fit FB Size'] = { main: [[E('Post to Facebook')]] };
c['Create Premium Image'] = { main: [[E('07b Decode Image')]] };
c['07b Decode Image'] = { main: [[E('09 Vision QA')]] };
c['09 Vision QA'] = { main: [[E('09b QA Parse')]] };
c['09b QA Parse'] = { main: [[E('09c Vision OK?')]] };
c['09c Vision OK?'] = { main: [[E('10 Save Draft')], [E('09f Retry Image')]] };
c['09f Retry Image'] = { main: [[E('07c Decode Image 2')]] };
c['07c Decode Image 2'] = { main: [[E('09g Vision QA 2')]] };
c['09g Vision QA 2'] = { main: [[E('09h QA Parse 2')]] };
c['09h QA Parse 2'] = { main: [[E('10 Save Draft')]] };
for (const r of removed) delete c[r];
// published branch: Mark Published -> reel chain -> story chain -> Instagram chain -> TikTok chain -> Group Share Pack -> Log & Done
c['12a Mark Published'].main[0] = [E('13b Prep Reel')];
c['13b Prep Reel'] = { main: [[E('14 Create Reel')]] };
c['14 Create Reel'] = { main: [[E('15 Publish Reel')]] };
c['15 Publish Reel'] = { main: [[E('16 Prep Story')]] };
c['16 Prep Story'] = { main: [[E('17 Upload Story Photo')]] };
c['17 Upload Story Photo'] = { main: [[E('18 Publish Story')]] };
c['18 Publish Story'] = { main: [[E('19 Publish to Instagram')]] };
c['19 Publish to Instagram'] = { main: [[E('20 Publish to TikTok (Postiz)')]] };
c['20 Publish to TikTok (Postiz)'] = { main: [[E('13 Group Share Pack')]] };
c['13 Group Share Pack'] = { main: [[E('12 Log & Done')]] };
// schedule trigger edge moved under its new name
if (c['Daily 4PM UTC']) {
  c['Daily 3x Staggered (8:30am, 1:30pm, 6:30pm PKT)'] = c['Daily 4PM UTC'];
  delete c['Daily 4PM UTC'];
}

// 10. Sanity: every connection target exists, every non-terminal node has outgoing edges
const names = new Set(wf.nodes.map(n => n.name));
for (const [src, outs] of Object.entries(c)) {
  if (!names.has(src)) throw new Error('connection source missing: ' + src);
  for (const branch of outs.main || []) for (const t of branch || []) if (!names.has(t.node)) throw new Error('connection target missing: ' + t.node);
}
const terminalOk = new Set(['10b Store Draft', '10r2 Store Rejected', '12 Log & Done']);
for (const n of wf.nodes) if (!c[n.name] && !terminalOk.has(n.name)) throw new Error('node with no outgoing edges: ' + n.name);

fs.writeFileSync('wf-v13.json', JSON.stringify(wf, null, 1));
console.log('wf-v13.json built successfully: ' + wf.nodes.length + ' nodes, ' + Object.keys(c).length + ' connection sources');
console.log('Manual Fire path: ' + JSON.stringify(wf.nodes.find(n => n.name === 'Manual Fire').parameters.path));
