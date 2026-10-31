#!/usr/bin/env node
// #106 PHASE 4.5 TIER 3 (T3) — ONE registry-driven MCP server for ALL channels.
// Replaces the 16 static per-channel yutu entries in the local (gitignored)
// .mcp.json, each of which pinned ONE channel's token file at config-write
// time. Here the channel is a PARAMETER on every tool call:
//
//   initialize -> tools/list -> tools/call { name, arguments: { channel, ... } }
//
// Channel resolution per call (the whole point):
//   1. the slug must exist in yt-mcp/studio-channels.json (the registry is
//      RE-READ on a short TTL, so a channel the wizard adds at runtime is
//      callable WITHOUT restarting this server)
//   2. the token resolves env-first (YT_TOKEN_<SLUG>, dashes -> underscores —
//      the tokenForChannel convention) then yt-mcp/channels/<slug>/token.json
//   3. a stored access_token that is still fresh is reused as-is; otherwise
//      the token refreshes via studio/lib/yt-token.mjs createAccessToken (the
//      shared seam — YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET env)
//   4. unknown / token-less channel -> a CLEAN tool error listing every
//      available channel (self-documenting; the conversation can self-correct)
//
// SAFETY CONTRACT (pinned by tests/dynamic-mcp-server.test.mjs):
//   - ZERO npm dependencies — the stdio MCP handshake is implemented by hand
//     over newline-delimited JSON-RPC 2.0 (process.stdin/stdout)
//   - malformed lines NEVER kill the server; every protocol-level error is a
//     JSON-RPC error response (-32700/-32600/-32601/-32602/-32603) and every
//     tool-level failure is a result with isError: true
//   - token material is NEVER written to any output — every outgoing string
//     passes a redactor fed with every secret the process has touched (the
//     import-parked pattern), and JSON.parse errors on token files (which
//     QUOTE file content) are replaced with fixed messages
//   - the server is READ-ONLY over the registry and token files
//   - stdout carries protocol messages ONLY; diagnostics go to stderr
//   - NO video.insert in v1: uploads stay in the CI pipeline through the
//     intent flow, by design
//
// Usage: node yt-mcp/dynamic-server.mjs   (registered in .mcp.json — see
// yt-mcp/DYNAMIC-SERVER.md; migrate the old entries with
// scripts/mcp-migrate.mjs)

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_REGISTRY_PATH = path.join(ROOT, 'yt-mcp', 'studio-channels.json');
const DEFAULT_CHANNELS_ROOT = path.join(ROOT, 'yt-mcp', 'channels');

// Registry re-read cadence — the spec caps this at 60s so "new channels appear
// without a restart" stays honest (worst case a wizard-added channel is
// callable 60s later, no process restart involved).
const REGISTRY_TTL_MS = 60_000;
// Refuse a stored access_token this close to expiry and refresh instead.
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
// In-memory TTL for a freshly refreshed access token (Google default is 3600s;
// cache 50 minutes so we always re-refresh comfortably early).
const REFRESHED_TOKEN_TTL_MS = 50 * 60_000;
const API_TIMEOUT_MS = 15_000; // a hung Google call must not wedge the conversation
const YT_API = 'https://www.googleapis.com/youtube/v3';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2025-06-18'];
const SERVER_INFO = { name: 'youtube-registry', title: 'Registry-driven YouTube MCP', version: '1.0.0' };
// Slugs become filesystem paths AND env-var suffixes — hold the line here.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Tool-execution failure -> tools/call result with isError: true. */
class ToolFailure extends Error {}

/** Protocol-level failure inside tools/call dispatch -> JSON-RPC error. */
class JsonRpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// The v1 tool catalog. Quota costs are Google Data API list prices (unit per
// the published quota table); video-list defaults to the 1-unit uploads-
// playlist path and only pays search.list's 100 units when a query is given.
// ---------------------------------------------------------------------------

const intSchema = (min, max, def, desc) => ({ type: 'integer', minimum: min, maximum: max, default: def, description: desc });

export const TOOLS = [
  {
    name: 'channel-info',
    description: 'Title, handle, description and statistics (subs/views/videos) for a channel. 1 quota unit.',
    quota: 1,
    inputSchema: { type: 'object', properties: { channel: { type: 'string', description: 'Channel slug from yt-mcp/studio-channels.json' } }, required: ['channel'] },
  },
  {
    name: 'video-list',
    description: 'List the channel\'s videos. Without `query`: the uploads playlist (1 unit, +1 once per server lifetime to find the uploads playlist). With `query`: search.list forMine (100 units — use sparingly).',
    quota: '1 (no query) / 100 (with query)',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel slug' },
        maxResults: intSchema(1, 50, 10, 'Page size (clamped to the API max of 50)'),
        query: { type: 'string', description: 'Optional search text — switches to search.list (100 quota units)' },
      },
      required: ['channel'],
    },
  },
  {
    name: 'video-details',
    description: 'Title, duration, view/like/comment counts for one video. 1 quota unit.',
    quota: 1,
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string', description: 'Channel slug' }, videoId: { type: 'string', description: 'YouTube video id' } },
      required: ['channel', 'videoId'],
    },
  },
  {
    name: 'comment-list',
    description: 'Top-level comments on a video (author, text, likes, reply count). 1 quota unit.',
    quota: 1,
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string', description: 'Channel slug' }, videoId: { type: 'string', description: 'YouTube video id' }, maxResults: intSchema(1, 100, 20, 'Page size (clamped to the API max of 100)') },
      required: ['channel', 'videoId'],
    },
  },
  {
    name: 'comment-reply',
    description: 'Post a reply to an existing comment (the owner speaks AS the channel). The SOLE WRITE in v1 and NOT idempotent: on a timeout/error the reply may still have succeeded — verify (comment-list) before retrying or you will double-post publicly. 50 quota units. `videoId` is context only — the API derives the video from `parentId`.',
    quota: 50,
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel slug' },
        videoId: { type: 'string', description: 'Video the comment thread is on' },
        parentId: { type: 'string', description: 'Id of the comment being replied to' },
        text: { type: 'string', description: 'Reply text' },
      },
      required: ['channel', 'videoId', 'parentId', 'text'],
    },
  },
  {
    name: 'playlist-list',
    description: 'The channel\'s playlists (id, title, item count). 1 quota unit.',
    quota: 1,
    inputSchema: { type: 'object', properties: { channel: { type: 'string', description: 'Channel slug' } }, required: ['channel'] },
  },
  {
    name: 'caption-list',
    description: 'Caption tracks available on a video (language, name, kind). 50 quota units (captions.list is expensive — check before downloading).',
    quota: 50,
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string', description: 'Channel slug' }, videoId: { type: 'string', description: 'YouTube video id' } },
      required: ['channel', 'videoId'],
    },
  },
  {
    name: 'thumbnail-info',
    description: 'The thumbnail URLs/sizes YouTube generated for a video (part of videos.list snippet — 1 unit, no download).',
    quota: 1,
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string', description: 'Channel slug' }, videoId: { type: 'string', description: 'YouTube video id' } },
      required: ['channel', 'videoId'],
    },
  },
  {
    name: 'activity-list',
    description: 'The channel\'s recent activities (uploads, likes, playlist additions) newest-first. 1 quota unit.',
    quota: 1,
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string', description: 'Channel slug' }, maxResults: intSchema(1, 50, 10, 'Page size') },
      required: ['channel'],
    },
  },
];

/** 'ai-observer' -> 'YT_TOKEN_AI_OBSERVER' (the data.mjs / workflows convention). */
export function secretNameFor(slug) {
  return `YT_TOKEN_${String(slug).toUpperCase().replace(/-/g, '_')}`;
}

// ---------------------------------------------------------------------------
// Redaction — every secret the process touches joins the set; every outgoing
// string is scrubbed. Belt and braces on top of "shapes never contain tokens".
// ---------------------------------------------------------------------------

function redact(text, secrets) {
  let out = String(text ?? '');
  for (const s of secrets) {
    if (s && String(s).length >= 12) out = out.split(s).join('[REDACTED]');
  }
  return out;
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Stored access-token expiry in epoch ms, across both token-file shapes. */
function expiryMsOf(token) {
  if (typeof token?.expiry_date === 'number') return token.expiry_date; // yutu shape
  if (typeof token?.expiry === 'string') { // refreshed-file shape (ISO)
    const t = Date.parse(token.expiry);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

const clampInt = (v, min, max, def) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};

// ---------------------------------------------------------------------------
// Google Data API v3 helpers (fetch only — no googleapis dependency here)
// ---------------------------------------------------------------------------

function googleError(messagePrefix, status, detail) {
  return new ToolFailure(`${messagePrefix} failed (HTTP ${status})${detail ? `: ${detail}` : ''}`);
}

async function ytCall(fetchImpl, at, methodPath, params = {}, { httpMethod = 'GET', body } = {}) {
  const query = httpMethod === 'GET' || params.part ? new URLSearchParams(httpMethod === 'GET' ? params : { part: params.part }) : null;
  const url = `${YT_API}/${methodPath}${query ? `?${query}` : ''}`;
  let res;
  try {
    res = await fetchImpl(url, {
      method: httpMethod,
      headers: { Authorization: `Bearer ${at}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (e) {
    // An abort/timeout on a POST is AMBIGUOUS (comment-reply is the one v1
    // write): the reply may still have landed. Never invite a blind retry —
    // a retry would double-post a public comment AS the channel.
    const writeWarning = httpMethod === 'POST' ? ' — if this was a write it may still have succeeded; verify before retrying' : '';
    throw new ToolFailure(`${methodPath} request failed: ${String(e?.message || e)}${writeWarning}`);
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message || '';
    } catch { /* non-JSON error body — the status code alone still reports */ }
    throw googleError(`google api ${methodPath}`, res.status, detail);
  }
  return res.json();
}

const ytGet = (fetchImpl, at, methodPath, params) => ytCall(fetchImpl, at, methodPath, params);
const ytPost = (fetchImpl, at, methodPath, params, body) => ytCall(fetchImpl, at, methodPath, params, { httpMethod: 'POST', body });

// ---------------------------------------------------------------------------
// Tool runners — each returns a plain JSON shape (NEVER raw token material)
// ---------------------------------------------------------------------------

function requireItems(items, what) {
  if (!Array.isArray(items) || items.length === 0) throw new ToolFailure(`${what} not found (no items returned)`);
  return items;
}

const RUNNERS = {
  'channel-info': async ({ fetchImpl }, at) => {
    const [ch] = requireItems((await ytGet(fetchImpl, at, 'channels', { part: 'snippet,statistics', mine: 'true' })).items, 'channel for this token');
    return {
      id: ch.id,
      title: ch.snippet?.title,
      handle: ch.snippet?.customUrl,
      description: ch.snippet?.description,
      subs: ch.statistics?.subscriberCount,
      views: ch.statistics?.viewCount,
      videos: ch.statistics?.videoCount,
    };
  },

  'video-list': async (ctx, at, args) => {
    const { fetchImpl, uploadsFor } = ctx;
    const maxResults = clampInt(args.maxResults, 1, 50, 10);
    if (args.query) {
      const data = await ytGet(fetchImpl, at, 'search', { part: 'snippet', forMine: 'true', type: 'video', q: String(args.query), maxResults: String(maxResults) });
      return { items: (data.items || []).map((i) => ({ id: i.id?.videoId, title: i.snippet?.title, publishedAt: i.snippet?.publishedAt })) };
    }
    const uploads = await uploadsFor(at); // cached per channel: 1 unit once, then playlistItems only
    const data = await ytGet(fetchImpl, at, 'playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: String(maxResults) });
    const out = {
      items: (data.items || []).map((i) => ({ id: i.contentDetails?.videoId, title: i.snippet?.title, publishedAt: i.snippet?.publishedAt })),
    };
    if (data.nextPageToken) out.nextPageToken = data.nextPageToken;
    return out;
  },

  'video-details': async ({ fetchImpl }, at, args) => {
    const [v] = requireItems((await ytGet(fetchImpl, at, 'videos', { part: 'snippet,contentDetails,statistics', id: String(args.videoId) })).items, `video ${args.videoId}`);
    return {
      id: v.id,
      title: v.snippet?.title,
      publishedAt: v.snippet?.publishedAt,
      duration: v.contentDetails?.duration,
      views: v.statistics?.viewCount,
      likes: v.statistics?.likeCount,
      comments: v.statistics?.commentCount,
    };
  },

  'comment-list': async ({ fetchImpl }, at, args) => {
    const maxResults = clampInt(args.maxResults, 1, 100, 20);
    const data = await ytGet(fetchImpl, at, 'commentThreads', { part: 'snippet', videoId: String(args.videoId), maxResults: String(maxResults) });
    return {
      items: (data.items || []).map((i) => ({
        id: i.id,
        author: i.snippet?.topLevelComment?.snippet?.authorDisplayName,
        text: i.snippet?.topLevelComment?.snippet?.textOriginal,
        likes: i.snippet?.topLevelComment?.snippet?.likeCount,
        publishedAt: i.snippet?.topLevelComment?.snippet?.publishedAt,
        replies: i.snippet?.totalReplyCount,
      })),
      ...(data.nextPageToken ? { nextPageToken: data.nextPageToken } : {}),
    };
  },

  'comment-reply': async ({ fetchImpl }, at, args) => {
    const data = await ytPost(fetchImpl, at, 'comments', { part: 'snippet' }, { snippet: { parentId: String(args.parentId), textOriginal: String(args.text) } });
    return { id: data.id, parentId: data.snippet?.parentId, text: data.snippet?.textOriginal, author: data.snippet?.authorDisplayName };
  },

  'playlist-list': async ({ fetchImpl }, at) => {
    const data = await ytGet(fetchImpl, at, 'playlists', { part: 'snippet,contentDetails', mine: 'true', maxResults: '50' });
    return {
      items: (data.items || []).map((p) => ({ id: p.id, title: p.snippet?.title, itemCount: p.contentDetails?.itemCount, publishedAt: p.snippet?.publishedAt })),
      ...(data.nextPageToken ? { nextPageToken: data.nextPageToken } : {}),
    };
  },

  'caption-list': async ({ fetchImpl }, at, args) => {
    const data = await ytGet(fetchImpl, at, 'captions', { part: 'snippet', videoId: String(args.videoId) });
    return {
      items: (data.items || []).map((c) => ({ id: c.id, language: c.snippet?.language, name: c.snippet?.name, kind: c.snippet?.trackKind })),
    };
  },

  'thumbnail-info': async ({ fetchImpl }, at, args) => {
    const [v] = requireItems((await ytGet(fetchImpl, at, 'videos', { part: 'snippet', id: String(args.videoId) })).items, `video ${args.videoId}`);
    return { id: v.id, title: v.snippet?.title, thumbnails: v.snippet?.thumbnails };
  },

  'activity-list': async ({ fetchImpl }, at, args) => {
    const maxResults = clampInt(args.maxResults, 1, 50, 10);
    const data = await ytGet(fetchImpl, at, 'activities', { part: 'snippet,contentDetails', mine: 'true', maxResults: String(maxResults) });
    return {
      items: (data.items || []).map((i) => ({ id: i.id, type: i.snippet?.type, title: i.snippet?.title, publishedAt: i.snippet?.publishedAt })),
      ...(data.nextPageToken ? { nextPageToken: data.nextPageToken } : {}),
    };
  },
};

// ---------------------------------------------------------------------------
// The dispatcher — handleLine(line) -> response object | null (null = the
// line was a notification or blank and must not be answered)
// ---------------------------------------------------------------------------

export function createDispatcher(deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const fsImpl = deps.fsImpl || fs;
  const now = deps.now || Date.now;
  const ttlMs = deps.ttlMs ?? REGISTRY_TTL_MS;
  const registryPath = deps.registryPath || DEFAULT_REGISTRY_PATH;
  const channelsRoot = deps.channelsRoot || DEFAULT_CHANNELS_ROOT;
  const log = deps.log || (() => {});

  const secrets = new Set(); // every raw secret string seen — feeds the redactor
  let registryCache = null; // { at, channels }
  const tokenCache = new Map(); // slug -> { at, expMs } for REFRESHED tokens
  const uploadsCache = new Map(); // slug -> uploads playlist id (saves 1 unit/call)

  // -- registry (read-only, TTL-cached, re-read once on a miss so the
  //    self-documenting error is never stale) -------------------------------

  function readRegistryFresh() {
    try {
      const parsed = JSON.parse(fsImpl.readFileSync(registryPath, 'utf8'));
      if (!Array.isArray(parsed?.channels)) throw new Error('no channels array');
      return parsed.channels.filter((c) => c && typeof c.slug === 'string');
    } catch {
      // fail CLOSED: without the registry no channel is callable — say so
      throw new ToolFailure(`registry unreadable at yt-mcp/studio-channels.json (expected { channels: [{ slug, ... }] }) — no channels are callable until it is readable`);
    }
  }

  function readRegistry() {
    if (registryCache && now() - registryCache.at < ttlMs) return registryCache.channels;
    registryCache = { at: now(), channels: readRegistryFresh() };
    return registryCache.channels;
  }

  function registrySlugs(channels) {
    return channels.map((c) => c.slug);
  }

  function unknownChannelMessage(slug, channels) {
    return (
      `Unknown channel '${slug}'. Available channels: ${registrySlugs(channels).join(', ') || '(none)'}. ` +
      `Add a channel by adding it to yt-mcp/studio-channels.json and providing its token ` +
      `(env ${secretNameFor(slug)} or yt-mcp/channels/<slug>/token.json) — no restart needed.`
    );
  }

  // -- token resolution (env first, then file; refresh via the shared seam) -

  function parseTokenOrThrow(raw, sourceLabel) {
    try {
      const t = JSON.parse(raw);
      if (isPlainObject(t)) return t;
      throw new Error('not an object');
    } catch {
      // JSON.parse SyntaxErrors QUOTE the input — never let one escape here
      throw new ToolFailure(`token ${sourceLabel} is unreadable or invalid JSON — fix or re-grant the token`);
    }
  }

  async function resolveAccessToken(slug) {
    const channels = readRegistry();
    let entry = channels.find((c) => c.slug === slug);
    if (!entry) {
      registryCache = { at: now(), channels: readRegistryFresh() }; // forced re-read on a miss
      entry = registryCache.channels.find((c) => c.slug === slug);
      if (!entry) throw new ToolFailure(unknownChannelMessage(slug, registryCache.channels));
    }

    const cached = tokenCache.get(slug);
    if (cached && cached.expMs - now() > TOKEN_EXPIRY_MARGIN_MS) return cached.at;

    // Trust model: the token is assumed to belong to `slug` by convention
    // (env name / folder name). An identity cross-check against the registry
    // entry is deliberately deferred — see DYNAMIC-SERVER.md "How channels
    // resolve" item 0.
    const envName = secretNameFor(slug);
    let token = null;
    const envRaw = env[envName];
    if (envRaw) {
      token = parseTokenOrThrow(envRaw, `env ${envName}`);
    } else {
      const tokenFile = path.join(channelsRoot, slug, 'token.json');
      let raw = null;
      try {
        if (fsImpl.existsSync(tokenFile)) raw = fsImpl.readFileSync(tokenFile, 'utf8');
      } catch { raw = null; }
      if (raw) token = parseTokenOrThrow(raw, `file yt-mcp/channels/${slug}/token.json`);
    }
    if (!token) {
      const available = registrySlugs(readRegistry())
        .map((s) => `${s}${env[secretNameFor(s)] || fsImpl.existsSync(path.join(channelsRoot, s, 'token.json')) ? '' : ' (no token)'}`)
        .join(', ');
      throw new ToolFailure(
        `Channel '${slug}' has no usable token. Set env ${envName} or create yt-mcp/channels/${slug}/token.json. ` +
        `Registry channels: ${available || '(none)'}.`,
      );
    }
    if (token.refresh_token) secrets.add(String(token.refresh_token));
    if (token.access_token) secrets.add(String(token.access_token));

    if (token.access_token && expiryMsOf(token) - now() > TOKEN_EXPIRY_MARGIN_MS) {
      return token.access_token; // stored token still fresh — reuse as-is
    }

    const clientId = env.YOUTUBE_CLIENT_ID;
    const clientSecret = env.YOUTUBE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new ToolFailure(
        `Cannot refresh the token for '${slug}': the stored access_token is missing/expired and ` +
        `YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET are not set (add them to the environment or .env).`,
      );
    }
    // The shared refresh seam (studio/lib/yt-token.mjs) — the SAME OAuth client
    // that issued these tokens; tokenRaw returns the already-resolved token so
    // resolution stays under this server's injected deps.
    const { createAccessToken } = await import('../studio/lib/yt-token.mjs');
    let access;
    try {
      access = await createAccessToken({
        fetchImpl,
        env: { YOUTUBE_CLIENT_ID: clientId, YOUTUBE_CLIENT_SECRET: clientSecret },
        tokenRaw: async () => JSON.stringify(token),
      })(slug);
    } catch (e) {
      throw new ToolFailure(`token refresh failed for '${slug}': ${e?.message || e}`);
    }
    if (access) {
      secrets.add(String(access));
      tokenCache.set(slug, { at: access, expMs: now() + REFRESHED_TOKEN_TTL_MS });
    }
    return access;
  }

  async function uploadsPlaylistFor(slug, at) {
    const hit = uploadsCache.get(slug);
    if (hit) return hit;
    const [ch] = requireItems((await ytGet(fetchImpl, at, 'channels', { part: 'contentDetails', mine: 'true' })).items, 'channel for this token');
    const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) throw new ToolFailure('channel has no uploads playlist');
    uploadsCache.set(slug, uploads);
    return uploads;
  }

  // -- tools/call -----------------------------------------------------------

  function toolError(message) {
    return { content: [{ type: 'text', text: out(`ERROR: ${message}`) }], isError: true };
  }

  function toolResult(shape) {
    // the redactor here is belt and braces — shapes are built from Google's
    // data and never contain token material, but every outgoing string passes
    return { content: [{ type: 'text', text: out(JSON.stringify(shape, null, 2)) }] };
  }

  async function callTool(params) {
    const name = isPlainObject(params) ? params.name : undefined;
    if (typeof name !== 'string' || !name) {
      throw new JsonRpcError(-32602, 'tools/call requires params.name (string)');
    }
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      throw new JsonRpcError(-32602, `Unknown tool '${name}'. Available tools: ${TOOLS.map((t) => t.name).join(', ')}`);
    }
    const args = isPlainObject(params.arguments) ? params.arguments : {};
    const missing = (tool.inputSchema.required || []).filter((k) => args[k] === undefined || args[k] === null || args[k] === '');
    if (missing.length) {
      throw new JsonRpcError(-32602, `Missing required argument(s) for ${name}: ${missing.join(', ')}`);
    }
    const slug = String(args.channel);
    if (!SLUG_RE.test(slug)) {
      throw new ToolFailure(`Invalid channel slug '${slug}'. Use a registry slug (lowercase letters, digits, dashes) — see yt-mcp/studio-channels.json.`);
    }
    try {
      const at = await resolveAccessToken(slug);
      const ctx = { fetchImpl, uploadsFor: (token) => uploadsPlaylistFor(slug, token) };
      return toolResult(await RUNNERS[name](ctx, at, args));
    } catch (e) {
      if (e instanceof ToolFailure) throw e;
      throw new ToolFailure(`${name} failed: ${e?.message || e}`);
    }
  }

  // -- JSON-RPC over stdio --------------------------------------------------

  const out = (text) => redact(text, secrets);

  const respond = (id, result) => ({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message: out(message) } });

  function initializeResult(params) {
    const requested = isPlainObject(params) ? params.protocolVersion : undefined;
    return {
      protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[SUPPORTED_PROTOCOL_VERSIONS.length - 1],
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions:
        'Every tool takes a `channel` slug (from yt-mcp/studio-channels.json). New channels become callable ' +
        'without a server restart once they are in the registry with a token (env YT_TOKEN_<SLUG> or yt-mcp/channels/<slug>/token.json). ' +
        `Tools: ${TOOLS.map((t) => t.name).join(', ')}.`,
    };
  }

  async function handleLine(rawLine) {
    if (typeof rawLine !== 'string') return null;
    const line = rawLine.trim();
    if (!line) return null;

    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return fail(null, -32700, 'Parse error: line is not valid JSON');
    }
    if (!isPlainObject(msg)) {
      return fail(null, -32600, 'Invalid Request: expected a JSON-RPC 2.0 object');
    }
    const hasId = 'id' in msg;
    if (hasId && typeof msg.id !== 'string' && typeof msg.id !== 'number' && msg.id !== null) {
      // an object/bool/array id would otherwise fall through the notification
      // check below and HANG the caller — reject it explicitly instead
      return fail(null, -32600, 'Invalid Request: id must be a string, number, or null');
    }
    const id = hasId ? msg.id : null;
    if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return fail(id, -32600, 'Invalid Request: expected { jsonrpc: "2.0", id, method }');
    }
    if (!hasId) return null; // notification — never answered (notifications/initialized et al.)

    try {
      switch (msg.method) {
        case 'initialize':
          return respond(id, initializeResult(msg.params));
        case 'ping':
          return respond(id, {});
        case 'tools/list':
          return respond(id, { tools: TOOLS });
        case 'tools/call':
          return respond(id, await callTool(msg.params));
        default:
          return fail(id, -32601, `Method not found: ${msg.method}`);
      }
    } catch (e) {
      if (e instanceof ToolFailure) return respond(id, toolError(out(e.message)));
      if (e instanceof JsonRpcError) return fail(id, e.code, e.message);
      log(`internal error on ${msg.method}: ${redact(String(e?.message || e), secrets)}`);
      return fail(id, -32603, 'Internal error');
    }
  }

  // Exposed for startServer's out-of-dispatch log paths (uncaught exceptions,
  // stdin-loop teardown) — the belt-and-braces logging must not leak either.
  return { handleLine, redact: (text) => redact(text, secrets) };
}

// ---------------------------------------------------------------------------
// Process wiring — stdin lines in, JSON-RPC responses out, stdout stays PURE
// ---------------------------------------------------------------------------

export function startServer(deps = {}) {
  const log = deps.log || ((m) => { try { process.stderr.write(`[yt-dynamic] ${m}\n`); } catch { /* stderr gone */ } });
  const dispatcher = createDispatcher({ ...deps, log });

  // Belt and braces: handleLine is total, but a rogue throw anywhere else must
  // not kill a live conversation — log to stderr and keep serving. Every one
  // of these near-unreachable lines still passes the redactor.
  process.on('uncaughtException', (e) => log('uncaught: ' + dispatcher.redact(String(e?.message || e))));
  process.on('unhandledRejection', (e) => log('unhandled rejection: ' + dispatcher.redact(String(e?.message || e))));
  process.stdout.on('error', () => process.exit(0)); // EPIPE — the client is gone

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  (async () => {
    try {
      for await (const line of rl) {
        try {
          const resp = await dispatcher.handleLine(line);
          if (resp) process.stdout.write(JSON.stringify(resp) + '\n');
        } catch (e) {
          log('line handler error: ' + dispatcher.redact(String(e?.message || e)));
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } }) + '\n');
        }
      }
    } catch (e) {
      log('stdin loop ended: ' + dispatcher.redact(String(e?.message || e)));
    }
    process.exit(0);
  })();

  return dispatcher;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startServer();
}
