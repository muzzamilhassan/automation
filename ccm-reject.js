// 10r Save Rejected — build the rejection record (storage happens in "10r2 Store Rejected" HTTP node).
const CONFIG = $('01 Config & Memory').first().json.config;
const out = [];
for (const item of $input.all()) {
  const src = $('06 Parse & Validate').item.json;
  const qc = item.json || {};
  out.push({ json: { storeRecord: {
    content_id: src.content_id,
    created_at: new Date().toISOString(),
    category: src.category, subcategory: src.subcategory,
    angle: src.angle, hook: src.hook, headline: (src.headline || []).join(' / '),
    caption: src.caption_full, visual_style: src.visual_style,
    qc_score: qc.score || null, critique: qc.critique || '',
    similarity: src.validation ? src.validation.maxSimilarity : null,
    status: 'rejected', reason: src.validation && src.validation.duplicate ? 'duplicate' : 'quality',
    platform: CONFIG.PLATFORM
  } } });
}
return out;
