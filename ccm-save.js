// 10 Save Draft — attach the persistence record + compute the publish gate, pass everything through (binary preserved).
// Publish requires ALL of: AUTO_PUBLISH_ENABLED (config or webhook override), image generated, vision QA passed.
const CONFIG = $('01 Config & Memory').first().json.config;
for (const item of $input.all()) {
  const p = $('06 Parse & Validate').item.json;
  const qc = (() => { try { return $('08 QC Parse').item.json; } catch (e) { return {}; } })();
  const v = item.json || {};
  const hasImage = !!(item.binary && item.binary.data);
  const publishApproved = !!(CONFIG.AUTO_PUBLISH_ENABLED && v.visionOk && hasImage);
  const publishBlockReason = publishApproved ? '' :
    (!CONFIG.AUTO_PUBLISH_ENABLED ? 'auto_publish_off' :
     (!hasImage ? 'image_generation_failed' :
      'vision_qa_failed: ' + String(v.visionIssues || 'mismatch').substring(0, 120)));
  item.json = {
    ...item.json,
    publishApproved,
    publishBlockReason,
    storeRecord: {
      content_id: p.content_id,
      created_at: new Date().toISOString(),
      category: p.category, subcategory: p.subcategory, trend_context: p.trend_context,
      angle: p.angle, hook_style: p.hook_style, hook: p.hook,
      headline: (p.headline || []).join(' / '), core_message: p.core_message,
      layout: p.imageSpec.layout, image_headline: p.imageSpec.headline, image_subtext: p.imageSpec.subtext,
      visual_style: p.visual_style, visual_concept: p.visual_concept, format: 'premium-poster/' + p.imageSpec.layout,
      caption: p.caption_full, cta: p.cta, hashtags: (p.hashtags || []).join(' '),
      qc_score: qc.score || null,
      vision_ok: v.visionOk === true,
      group_targets: (p.group_targets && p.group_targets.groups || []).map(g => g.url),
      status: 'draft',
      platform: CONFIG.PLATFORM
    }
  };
}
return $input.all();
