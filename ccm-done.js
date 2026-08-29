// 12 Log & Done — final run report (no local storage; persistence happens via the memory store).
const fb = $json || {};
const feedPostId = (() => { try { return ($('Post to Facebook').first().json || {}).post_id || null; } catch (e) { return null; } })();
const postId = feedPostId || fb.post_id || fb.id || null;
const fbError = fb.error ? (fb.error.message || 'facebook error').substring(0, 120) : null;
const pack = $json.sharePack || null;
const reelId = (() => { try { return ($('15 Publish Reel').first().json || {}).id || null; } catch (e) { return null; } })();
const storyOk = (() => { try { return $('18 Publish Story').first().json.success === true; } catch (e) { return false; } })();
return [{ json: {
  loggedAt: new Date().toISOString(),
  facebook: postId ? { post_id: postId } : (fbError ? { error: fbError } : { skipped: $json.publishBlockReason || 'not published — saved as draft in the CCM Memory Store' }),
  reel: reelId ? { video_id: reelId } : null,
  story: storyOk ? { published: true } : null,
  share_pack: pack ? { post: pack.post_permalink, headline: pack.headline, share_into_groups: pack.share_into_groups } : null
} }];
