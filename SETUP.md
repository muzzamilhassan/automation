# SETUP — YouTube Content Automation (Plan C)

End-to-end setup guide. Do the phases **in order**. Each phase has a
"✅ done when" check so you know when to move on.

**Time budget:** ~2 hours total (most of it is one-time Google Cloud setup and
the Ollama model download running in the background).

**System:** Your Windows PC (16 GB RAM confirmed). Everything runs locally in
Docker Desktop + Ollama on the host. **$0/month.**

---

## What you're building

```
Google Sheet row → n8n downloads video → Whisper transcript → Ollama writes
title/description/tags/hashtags → n8n pushes to Postiz → Postiz uploads to
YouTube at your scheduled time. You never write a title again.
```

Files in this folder:

| File | Purpose |
|---|---|
| `docker-compose.yml` | Brings up the whole stack |
| `n8n.Dockerfile` | Adds ffmpeg to n8n (for audio extraction) |
| `.env.example` | All config — copy to `.env`, fill blanks |
| `n8n-workflow.json` | The 12-node pipeline — import into n8n |
| `ollama-prompt.md` | The prompt + JSON schema (already baked into the workflow) |
| `google-sheet-template.md` | The exact sheet layout |
| `SETUP.md` | This file |

---

## Phase 0 — One-time prep (5 min)

Open **PowerShell** or **Git Bash** in this folder:

```bash
cd C:\Users\Revnix\.zcode\workspace\default\youtube-automation
cp .env.example .env      # your private copy; you'll fill it in as you go
```

Make a note of the secrets already generated in `.env`:
- `JWT_SECRET` (Postiz) — **do not change after first run** (invalidates API keys)
- `N8N_ENCRYPTION_KEY` — **do not change after first run** (invalidates n8n credentials)

---

## Phase 1 — Install & start prerequisites (20 min)

### 1.1 Docker Desktop
You already have Docker installed (v29.6.1 ✅). **Start Docker Desktop** from
the Start menu and wait until the whale icon in the system tray stops
animating. Verify in your terminal:

```bash
docker info
```
If it prints server info, you're good. If it errors, Docker Desktop isn't
running yet — start it and retry.

### 1.2 Ollama + the model
You already have Ollama (v0.32.5 ✅). Pull the model (one-time, ~4.7 GB):

```bash
ollama pull llama3.1:8b
```

While that downloads, continue to Phase 2. **Come back and verify** with:

```bash
ollama list          # should show llama3.1:8b
```

### 1.3 Make Ollama reachable from Docker
By default Ollama binds to `127.0.0.1`, which Docker containers can't reach.
Bind it to all interfaces so the n8n container can call it via
`host.docker.internal`:

**Windows (PowerShell as Admin, run once per login session — or set as a
system env var for permanence):**

```powershell
[System.Environment]::SetEnvironmentVariable('OLLAMA_HOST', '0.0.0.0:11434', 'User')
```
Then **quit Ollama from the system tray and restart it** (so it picks up the
new binding). Verify:

```bash
curl http://localhost:11434/api/tags
```
Should return JSON listing your models.

> ✅ **Phase 1 done when:** `docker info` works, `ollama list` shows
> `llama3.1:8b`, and `curl http://localhost:11434/api/tags` returns JSON.

---

## Phase 2 — Launch the stack (10 min)

From the project folder:

```bash
docker compose up -d
```

This pulls all images (Postiz + Postgres + Redis + Temporal + Elasticsearch +
n8n build + faster-whisper) and starts them. First run takes a few minutes
due to image downloads + n8n image build.

Watch progress:

```bash
docker compose logs -f n8n          # Ctrl+C to exit logs (containers keep running)
```

When n8n prints `Editor is now accessible via: http://localhost:5678/`, it's
ready. Also verify the other UIs load:

- **n8n** → http://localhost:5678
- **Postiz** → http://localhost:4007
- **Temporal UI** (Postiz's scheduler dashboard) → http://localhost:8080

**First-run n8n:** visit http://localhost:5678, create your local n8n owner
account (just a local login, nothing leaves your PC).

**First-run Postiz:** visit http://localhost:4007, create the admin account.
This is what you'll use to log into Postiz from now on.

> ✅ **Phase 2 done when:** n8n, Postiz, and Temporal UI all load in your
> browser, and `docker compose ps` shows all containers as `Up` (or
> `healthy`).

---

## Phase 3 — Google Cloud project (20 min, browser)

This is the only manual config that can't be scripted. You create **ONE**
Google Cloud project that powers YouTube (via Postiz), Drive, and Sheets
(via n8n). One set of OAuth credentials, used in two places.

### 3.1 Create the project
1. Go to https://console.cloud.google.com/ → top bar → **Select a project →
   NEW PROJECT** → name it e.g. `yt-automation` → **CREATE**.
2. Make sure that project is now selected in the top bar.

### 3.2 Enable 3 APIs
Left menu → **APIs & Services → Library**. Search & **ENABLE** each:
- **YouTube Data API v3**
- **Google Drive API**
- **Google Sheets API**

### 3.3 OAuth consent screen
Left menu → **APIs & Services → OAuth consent screen**.
- User type: **External** → **CREATE**
- App name: `yt-automation`, your email in all required fields → **SAVE**
- **Test users** section → **+ ADD USERS** → add your own Google email → SAVE
- Leave it in **"Testing"** mode (Publishing status = Testing). **Do not
  click "Publish"** — that would trigger Google's verification process which
  you do NOT need for personal use. Apps in Testing mode work for up to 100
  whitelisted test users, which includes you. ✅

### 3.4 Create OAuth credentials
Left menu → **APIs & Services → Credentials → + CREATE CREDENTIALS →
OAuth client ID**.
- Application type: **Web application**
- Name: `yt-automation client`
- **Authorized redirect URIs** — add BOTH of these exact URLs:
  - `http://localhost:4007/integrations/social/youtube` ← for Postiz
  - `http://localhost:5678/rest/oauth2-credential/callback` ← for n8n
- **CREATE** → copy the **Client ID** and **Client Secret** that appear.

Paste them into `.env`:

```
YOUTUBE_CLIENT_ID=<paste here>
YOUTUBE_CLIENT_SECRET=<paste here>
```

Then restart Postiz so it picks them up:

```bash
docker compose up -d postiz
```

> ✅ **Phase 3 done when:** `.env` has real `YOUTUBE_CLIENT_ID` and
> `YOUTUBE_CLIENT_SECRET`, and Postiz restarted.

---

## Phase 4 — Connect YouTube inside Postiz (5 min, browser)

1. Go to **Postiz** → http://localhost:4007 → log in.
2. **Settings → Channels / Integrations → Connect YouTube**.
3. Complete the Google OAuth flow in the popup. (You may see an "app not
   verified" warning — click **Advanced → Go to yt-automation (unsafe)**.
   This is expected because your app is in Testing mode. It's your own app.)
4. Back in Postiz, the YouTube channel now appears as connected. Copy its
   **integration ID** (a long alphanumeric string) — you'll paste it into
   the n8n workflow in Phase 6.
5. **Settings → Developers → Public API → Rotate** → copy the generated cmsp5e6cp0001n87eune35uzo
   **API key**. Paste into `.env` as `POSTIZ_API_KEY`.

Then restart n8n so it sees the new env value:

```bash
docker compose up -d n8n
```

> ✅ **Phase 4 done when:** YouTube shows as connected in Postiz, you have
> the integration ID noted, and `POSTIZ_API_KEY` is in `.env`.

---

## Phase 5 — Create the Google Sheet (5 min)

1. Go to https://sheets.google.com → **Blank spreadsheet**.
2. Set the tab name (bottom-left) to **`Videos`** (exact spelling matters).
3. Build the columns from [`google-sheet-template.md`](./google-sheet-template.md)
   — copy the 11 headers into row 1.
4. Copy the **document ID** from the URL (the long string between `/d/` and
   `/edit`) and paste into `.env` as `GOOGLE_SHEET_ID`.
5. Add a test row (columns A–D only):
   - `status` = `pending`
   - `video_link` = a real Google Drive link to a short test video (share it
     with "Anyone with the link" for the first test)
   - `schedule_time` = a time ~30 min in the future, your local format
   - `purpose` = e.g. `short test clip, casual tone`

> ✅ **Phase 5 done when:** sheet has 11 headers in row 1, tab is named
> `Videos`, `.env` has `GOOGLE_SHEET_ID`, and one `pending` test row exists.

---

## Phase 6 — Import & wire up the n8n workflow (15 min)

### 6.1 Import
1. In n8n (http://localhost:5678), click **Workflows → Import from File**.
2. Pick `n8n-workflow.json` from this folder.
3. Open the imported workflow. You'll see all 12 nodes connected in a line.

### 6.2 Create the 3 credentials n8n needs

Click each node marked with a warning and add its credential:

**(a) Google Sheets OAuth** — needed by "Trigger: Sheet Row", "Update Sheet",
and "Download Video" nodes:
- In n8n: **Settings → Credentials → Add credential → "Google Sheets OAuth2 API"**
- Fill in the **Client ID** and **Client Secret** from Phase 3.4
- Click **"Sign in with Google"** → authorize with the same Google account
  → done
- Back in the workflow, select this credential on each of those 3 nodes

> ⚠️ For the **"Download Video"** node specifically: the node type is Google
> Drive, so create a **"Google Drive OAuth2 API"** credential the same way
> (same Client ID/Secret, same OAuth flow). Same Google account.

**(b) Postiz API key (Header Auth)** — needed by "Upload to Postiz" and
"Create Scheduled Post" nodes:
- **Add credential → "Header Auth"**
- Name: `Postiz API`
- Header name: `Authorization`
- Value: paste your `POSTIZ_API_KEY` (no "Bearer " prefix)
- Assign on both nodes

### 6.3 Configure the trigger
On the **"Trigger: Sheet Row"** node:
- **Document**: search & pick your `Videos` sheet
- **Trigger On**: **Row added or updated**
- **Poll Times**: Every 1 minute

### 6.4 Set the YouTube integration ID
On the **"Assemble Postiz Body"** code node, find this line:

```js
const integrationId = 'REPLACE_WITH_YOUTUBE_INTEGRATION_ID';
```

Replace that string with the integration ID you copied in Phase 4. Save.

### 6.5 Wire the Ollama user-message expression
On the **"Generate Metadata (Ollama)"** node, the `messages[1].content`
field needs to combine the purpose note + transcript. Open the node, and in
the JSON body's second message set `content` to this expression (n8n
expression editor — wrap in `={{ ... }}`):

```
={{ 'PURPOSE:\n' + $('Trigger: Sheet Row').item.json.purpose + '\n\nTRANSCRIPT:\n' + ($json.text || $json.transcript || JSON.stringify($json)) }}
```

This pulls the purpose from the original sheet row and the transcript text
from the Whisper response (Whisper returns text under either `.text` or
`.transcript` depending on the image version — this handles both).

### 6.6 (Optional) Sanity-check the integration ID
You can list all your Postiz integrations to confirm the ID:

```bash
curl -H "Authorization: $POSTIZ_API_KEY" http://localhost:4007/public/v1/integrations
```

Look for the entry where `type` is `youtube` and copy its `id`.

### 6.7 Activate
Top-right toggle: **Inactive → Active**. The workflow now watches your sheet.

> ✅ **Phase 6 done when:** All 12 nodes have green checkmarks (no warnings),
> and the workflow toggle is **Active**.

---

## Phase 7 — Test end-to-end (10 min)

1. In your Google Sheet, change the test row's `status` back to `pending`
   (or add a new `pending` row).
2. Within ~1 minute, n8n picks it up. Watch it run: n8n → **Executions** on
   the left → you'll see the run go green node-by-node.
3. After it finishes (~30–90 sec depending on video length):
   - The sheet row's columns E–I fill in with generated metadata
   - `status` flips to `scheduled`
4. In **Postiz** → **Calendar**, you'll see the post queued for your
   `schedule_time`.
5. At the scheduled time (Postiz's Temporal scheduler fires it), the video
   appears on your YouTube channel.

**If something fails:** the row's `status` stays `processing` or the `error`
column has a message. In n8n → **Executions**, open the failed run to see
which node errored. Common fixes in the [Troubleshooting](#troubleshooting)
section below.

> ✅ **Phase 7 done when:** a test row flows through to a scheduled Postiz
> post, and (once the scheduled time passes) appears on YouTube.

---

## Daily usage

From now on, you only touch the Google Sheet:

| Column A | Column B | Column C | Column D |
|---|---|---|---|
| `pending` | Drive link | `2026-08-11 18:00` | one-line purpose note |

That's it. Everything else is automatic.

---

## Keeping your PC awake at publish time ⚠️

Postiz's scheduler runs inside Docker **on your PC**. If your PC is asleep or
off at `schedule_time`, the post fires late (or when you next wake the PC).
Three options:

1. **Easiest:** schedule posts during hours your PC is normally on.
2. **Power & sleep settings:** Settings → System → Power & battery →
   "Screen and sleep" → set "Make the device sleep after" to `Never` when
   plugged in.
3. **Wake timer for a specific time:** `powercfg /requestsoverride` or
   schedule a Task Scheduler task to wake the PC 5 min before publish.

---

## Troubleshooting

**n8n can't reach Ollama** (`ECONNREFUSED host.docker.internal:11434`)
→ Ollama isn't bound to 0.0.0.0. Redo Phase 1.3 and restart Ollama from the
system tray.

**faster-whisper returns HTTP 422**
→ The multipart field name changed between image versions. Open the
"Transcribe (Whisper)" node and try `audio_file` vs `file` vs `data`.

**Postiz returns 401 "Invalid API key"**
→ You changed `JWT_SECRET` after generating the key. In Postiz UI →
Settings → Developers → Public API → **Rotate** to get a fresh key, update
`.env` `POSTIZ_API_KEY`, and restart n8n.

**Postiz returns HTML login page instead of JSON**
→ Your `POSTIZ_BASE_URL` is wrong. It must be
`http://localhost:4007/public/v1` (with `/public/v1`, no `/api`).

**"Could not extract Google Drive file ID"**
→ The `video_link` isn't a Drive URL. Use the shareable link format
`https://drive.google.com/file/d/<ID>/view`.

**Download Video node returns 403**
→ The Google account n8n authenticated as doesn't have access to the file.
In Drive, share the file with that account (or set "Anyone with the link").

**Ollama returns malformed JSON**
→ Shouldn't happen because of `format: json_schema`, but if it does,
upgrade Ollama (`ollama serve` version ≥ 0.1.30 supports structured
outputs reliably) and confirm the model is `llama3.1:8b` (small 3B models
sometimes still fail).

**YouTube upload fails in Postiz**
→ Check the YouTube Data API quota: Google Cloud Console → APIs & Services →
YouTube Data API v3 → Quotas. Free tier allows ~6 uploads/day. Also check
Postiz's Temporal didn't crash: http://localhost:8080.

**Workflow doesn't fire on sheet changes**
→ Confirm trigger event is "Row added or updated" (not just "Row added"),
poll time is "Every Minute", and the workflow toggle is **Active**. Note:
CSV-bulk-pasted rows sometimes don't trigger — type or paste one row at a
time.

---

## Updating the stack later

- **Change the AI model:** edit `OLLAMA_MODEL` in `.env`, run
  `ollama pull <new-model>`, then `docker compose up -d n8n`.
- **Tune the prompt:** edit `SYSTEM_PROMPT` in the "Generate Metadata (Ollama)"
  node (or rebuild `n8n-workflow.json` from `ollama-prompt.md`). The prompt
  lives in the node, not the file, so editing the .md won't auto-update the
  workflow.
- **Update Postiz:** `docker compose pull && docker compose up -d postiz`.
- **Back everything up:** the data lives in Docker volumes `n8n-data`,
  `postgres-volume`, `postiz-config`, `postiz-uploads`. Use
  `docker run --rm -v <volume>:/data -v $(pwd):/backup alpine tar czf /backup/<name>.tgz /data`
  to snapshot them.

---

**You're done.** Add rows to the sheet; titles, descriptions, tags, and
hashtags write themselves; videos publish on schedule.
