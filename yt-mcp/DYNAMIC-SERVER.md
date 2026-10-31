# Dynamic MCP server — one server for every channel

`yt-mcp/dynamic-server.mjs` is a **zero-dependency, registry-driven stdio MCP
server**. It replaces the 16 static `yt-<slug>` blocks that used to live in the
local `.mcp.json`, each of which launched the third-party `yutu` binary pinned
to ONE channel's token file at config-write time. Now there is ONE server and
the channel is a **parameter on every tool call**.

## What it replaces

| Before | After |
|---|---|
| 16 `yt-<slug>` entries in `.mcp.json`, one per channel, each `yutu.exe mcp` + `YUTU_CACHE_TOKEN=yt-mcp/channels/<slug>/token.json` | 1 entry, `node yt-mcp/dynamic-server.mjs` |
| Adding a channel = editing `.mcp.json` + restarting Claude | Adding a channel = registry row + token; the server picks it up with **no restart** |
| Tool set: whatever yutu ships | 9 purpose-built tools, quota-cost-aware |

## The one-line `.mcp.json` entry

```json
{
  "mcpServers": {
    "yt": { "command": "node", "args": ["yt-mcp/dynamic-server.mjs"] }
  }
}
```

The relative `args` path assumes Claude launches project-scope servers with
the repo root as the working directory (standard for a project `.mcp.json`);
if your setup differs, use an absolute path at migrate time.

Migrate the old file with the migrator (dry by default — **you** apply the
write, because a config change needs a Claude restart):

```bash
node scripts/mcp-migrate.mjs          # plan (touches nothing)
node scripts/mcp-migrate.mjs --write  # backup .mcp.json.backup-<date>, then replace
```

Only keys starting with `yt-` are removed; every other block (github, n8n-mcp,
colab-mcp, ...) is preserved **content-equal** (the new file is
re-serialized with 2-space indent) — the **backup** is the byte-exact
artifact, which is why `--write` refuses to overwrite an existing same-date
backup. Re-runs are no-ops.

## How channels resolve (per call)

Every tool takes `channel` — the slug from `yt-mcp/studio-channels.json`:

0. **Trust model** — the slug→token binding is by convention: the server
   trusts the env/file token belongs to that slug. An identity cross-check
   (returned channel id vs the registry entry) is deliberately deferred.
1. **Registry check** — the slug must be in the registry. The registry is
   re-read on a short TTL (60 s) and re-checked on a miss, so **a channel the
   wizard adds at runtime becomes callable without restarting this server**
   (only Claude itself needs a restart to load this server once). The same
   window applies in reverse: a channel **removed** from the registry stays
   callable for at most 60 s.
2. **Token resolution** — env `YT_TOKEN_<SLUG>` first (dashes become
   underscores), then `yt-mcp/channels/<slug>/token.json`.
3. **Access token** — a stored `access_token` that is still fresh is reused
   as-is; otherwise it refreshes through the shared seam
   `studio/lib/yt-token.mjs > createAccessToken` using `YOUTUBE_CLIENT_ID` /
   `YOUTUBE_CLIENT_SECRET` (env or `.env`).
4. **Unknown or token-less channel** — a clean error listing every available
   channel and how to add one. Token material is never logged, and the server
   is strictly **read-only** over the registry and token files.

## Tools (v1) and quota costs

| Tool | Args | Google API | Quota |
|---|---|---|---|
| `channel-info` | `channel` | channels.list (snippet+statistics) | 1 |
| `video-list` | `channel`, `maxResults?`, `query?` | playlistItems over the uploads playlist; **with `query`** → search.list forMine | 1 / **100** |
| `video-details` | `channel`, `videoId` | videos.list | 1 |
| `comment-list` | `channel`, `videoId`, `maxResults?` | commentThreads.list | 1 |
| `comment-reply` | `channel`, `videoId`, `parentId`, `text` | comments.insert | 50 |
| `playlist-list` | `channel` | playlists.list | 1 |
| `caption-list` | `channel`, `videoId` | captions.list | **50** |
| `thumbnail-info` | `channel`, `videoId` | videos.list (snippet.thumbnails) | 1 |
| `activity-list` | `channel`, `maxResults?` | activities.list | 1 |

Quota numbers are Google Data API v3 list prices. Defaults stay on the 1-unit
paths (`video-list` without a query is the default shape); the expensive
exceptions are marked in the tool descriptions so the model can see the cost
before calling. **No `video.insert` in v1** — uploads stay in the CI pipeline
through the intent flow, by design.

`comment-reply` is the **sole write** and is **not idempotent**: it posts a
public reply AS the channel and cannot be cancelled once sent. A timeout or
transport error on that call is ambiguous — the reply may still have landed —
so the server's error explicitly says *verify before retrying* (a blind retry
double-posts). `videoId` on comment-reply is context only; the API derives
the video from `parentId`.

## Protocol

Hand-written newline-delimited JSON-RPC 2.0 over stdio (no npm dependencies,
no yutu, no SDK): `initialize` → `tools/list` → `tools/call`. Malformed lines
get a JSON-RPC error (`-32700`/`-32600`) and never kill the server; unknown
methods are `-32601`; bad tool/args are `-32602`; channel/API/refresh failures
are tool results with `isError: true`. stdout carries protocol messages only —
diagnostics go to stderr.

Safety contract pinned by `tests/dynamic-mcp-server.test.mjs` (spawned-process
stdio session included) and `tests/mcp-migrate.test.mjs`.
