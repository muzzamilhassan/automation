# Google Sheet template

Create a new Google Sheet and lay out these columns in row 1 of a tab named
**`Videos`** (the tab name matters — the n8n trigger is scoped to it).

## Column layout (row 1 = headers, exact spelling)

| Col | Header               | Who fills it        | Example                                          |
|-----|----------------------|---------------------|--------------------------------------------------|
| A   | `status`             | You (then n8n)      | `pending`                                        |
| B   | `video_link`         | You                 | `https://drive.google.com/file/d/1AbC.../view`   |
| C   | `schedule_time`      | You                 | `2026-08-10 15:00` (your local time)             |
| D   | `purpose`            | You                 | `5-min tutorial: binding push-to-talk in MC`     |
| E   | `generated_title`    | n8n (auto)          | *(left blank — n8n writes here)*                 |
| F   | `generated_description` | n8n (auto)       |                                                  |
| G   | `generated_tags`     | n8n (auto)          |                                                  |
| H   | `generated_hashtags` | n8n (auto)          |                                                  |
| I   | `postiz_post_id`     | n8n (auto)          |                                                  |
| J   | `error`              | n8n (auto)          |                                                  |
| K   | `processed_at`       | n8n (auto)          |                                                  |

That's **11 columns**. n8n's trigger watches columns A–D for changes/inserts;
columns E–K are the audit trail it writes back.

## How to use it

1. **You add a row** with columns A–D filled:
   - `status` = `pending`  ← triggers the pipeline
   - `video_link` = a Google Drive shareable link to the video file
     (right-click the file in Drive → Share → "Copy link")
   - `schedule_time` = when you want it published. Use your local format;
     n8n/Postiz will treat it as the timezone set in `.env` (`GENERIC_TIMEZONE`)
   - `purpose` = a one-line description of what the video is about. This guides
     the AI — the better this note, the better the auto-generated metadata.

2. **Within ~1 minute**, n8n detects the row, processes it, and fills in
   columns E–I. `status` flips to `scheduled`.

3. **At `schedule_time`**, Postiz uploads to YouTube and publishes.

## Status values (column A)

| Value        | Meaning                                                       |
|--------------|---------------------------------------------------------------|
| `pending`    | Queued for n8n to process. **Set this to trigger a run.**     |
| `processing` | n8n is currently working on it.                               |
| `scheduled`  | Done — Postiz has it, will publish at `schedule_time`.        |
| `published`  | Postiz uploaded it to YouTube successfully.                   |
| `failed`     | Something went wrong; see column J (`error`) for details.     |

> Tip: to **re-run** a row, set `status` back to `pending`. n8n will
> re-process and overwrite the generated columns + create a fresh Postiz post.

## Example test row

| status | video_link | schedule_time | purpose |
|--------|------------|---------------|---------|
| `pending` | `https://drive.google.com/file/d/1AbCdEf.../view` | `2026-08-10 15:00` | `Short gameplay clip showing a speedrun tactic in Celeste chapter 3` |

## Drive sharing requirement ⚠️

The Google service account / OAuth user that n8n authenticates as **must have
"Viewer" access** to the video file in Drive. Either:
- Share the file with the Google account you used in n8n's OAuth, OR
- Set the Drive link to "Anyone with the link → Viewer".

If n8n can't open the file, the row will fail with a 403 in column J.

## Sheet ID

After creating the sheet, copy its **document ID** from the URL — it's the
long string between `/d/` and `/edit`:

```
https://docs.google.com/spreadsheets/d/1AbCdEfGhIjK.../edit#gid=0
                                    ^^^^^^^^^^^^^^^^^^^
                                    this part → GOOGLE_SHEET_ID in .env
```

Paste it into `.env` as `GOOGLE_SHEET_ID`.
