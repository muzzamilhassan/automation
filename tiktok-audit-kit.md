# TikTok App Approval Kit — Quarry Studio
# The fix for the rejection: last time the app read as a personal tool.
# Now it is a real product (Quarry Studio) with a live public site, privacy
# policy, terms, and a clear multi-brand use case. Create a NEW app — do not
# resubmit the rejected one (fresh review, no rejection history attached).

## 1. Create the new app (developers.tiktok.com → Manage apps → Create app)
- Name: Quarry Studio
- Category: Marketing / Agency (or Media & Entertainment)
- Description: see use-case text below
- Products to add: **Login Kit** + **Content Posting API** (nothing else)
- Redirect URL: https://muzzamilhassan.github.io/quarrystudio/ (any https URL works as redirect target)
- Terms of Service URL: https://muzzamilhassan.github.io/quarrystudio/terms.html
- Privacy Policy URL: https://muzzamilhassan.github.io/quarrystudio/privacy.html

## 2. Scopes — request ONLY these two (extra scopes = rejection)
- video.upload — "Upload videos to a user's TikTok account as drafts or direct posts"
- video.publish — "Publish videos directly to a user's TikTok account"
No user.info, no comment/list scopes. The demo must show exactly these.

## 3. Audit form answers (copy-paste)

**Use case description:**
"Quarry Studio is a content publishing platform for media businesses and
creators that operate one or more TikTok brand channels. Users authenticate
their own TikTok account through Login Kit, upload a short-form video, add a
caption, set TikTok's content-disclosure option, and publish directly to
their profile (or save as a draft). The platform serves an external media
business and its client brand channels; every user publishes only to the
account they personally authorized, with the post's privacy state shown
before publishing. Access is revocable at any time from TikTok settings."

**Implementation summary:**
"The app integrates Login Kit for user authentication and the Content
Posting API (direct post) for publishing. After Login Kit consent, the user
uploads a video file in the Quarry Studio web dashboard, enters a caption,
confirms the AI-generated-content disclosure setting, and submits. The app
uploads via the Content Posting API and shows the resulting post status.
Only video.upload and video.publish scopes are used — no other TikTok data
is read or stored beyond the authorization tokens required for publishing."

**Content disclosure / sharing guideline compliance (if asked):**
"The posting UI includes TikTok's content-disclosure control so users can
label AI-generated content per TikTok policy, shows the post privacy state
before publishing, and never pre-selects engagement-bait behavior. Content
attribution remains with the authorized user."

## 4. Demo video (60-90s screencast, film with Win+G or OBS)
1. (0-10s) Show the Quarry Studio landing page (the live URL above).
2. (10-25s) Click through to the dashboard → "Connect TikTok" → show the
   real TikTok Login Kit consent screen listing ONLY video.upload +
   video.publish → approve.
3. (25-45s) Upload a short video in the dashboard, type a caption, show the
   content-disclosure toggle being set.
4. (45-70s) Submit → show the post appearing on the connected TikTok
   profile (private in sandbox mode is FINE — say so in the narration).
5. (70-90s) Show the TikTok settings screen where the user can revoke
   Quarry Studio's access at any time.

## 5. What to build first (the demo needs a working dashboard)
A minimal dashboard is enough: a page with "Connect with TikTok" (Login Kit,
redirect to the URL above), an upload form (file + caption + disclosure
toggle), and the Content Posting API call. ~1 day of work; I can build it
into this repo (tiktok-app-site/dashboard) on request.

## 6. Timeline & fallback
- Build dashboard: 1 day · Record demo: 30 min · Submit: same day
- Review time: typically 1-3 weeks. While waiting, videos post PRIVATE
  (sandbox rule for unaudited clients) — perfect for testing.
- Fallbacks in the meantime: Zernio drafts (already working) or TikTok's
  native web scheduler (manual, schedules up to 10 days ahead, free).
