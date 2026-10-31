import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDispatcher, TOOLS, secretNameFor } from '../yt-mcp/dynamic-server.mjs';

// ---------------------------------------------------------------------------
// #106 Phase 4.5 Tier 3 (T3) — ONE registry-driven stdio MCP server that
// replaces the 16 static per-channel yutu entries in the local .mcp.json.
// Safety contract under test:
//   - the MCP handshake (initialize -> tools/list -> tools/call) works over
//     NEWLINE-DELIMITED JSON-RPC on real stdio, zero npm dependencies
//   - EVERY tool takes `channel`; the slug is validated against the registry
//     (re-read on a short TTL so new channels appear WITHOUT a restart) and
//     the token resolves env-first (YT_TOKEN_<SLUG>) then the local token
//     file — an unknown/unavailable channel is a CLEAN tool error that lists
//     the available channels (self-documenting)
//   - access tokens refresh via studio/lib/yt-token.mjs createAccessToken
//     (YOUTUBE_CLIENT_ID/SECRET env) when the stored access_token is stale
//   - token material NEVER appears in any output; malformed JSON-RPC lines
//     are answered with a JSON-RPC error and never kill the server
//   - the server only READS the registry and token files
// All Google/OAuth traffic is a stubbed fetch; the registry/token tree is a
// tmp fixture (the T2 pattern) — no real tokens, CI-portable.
// ---------------------------------------------------------------------------

const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST = '2020-01-01T00:00:00.000Z';
const REGISTRY_SLUGS = ['fixture-alpha', 'fixture-beta', 'fixture-gamma', 'fixture-bare'];

// ---- fixture tree -----------------------------------------------------------

function buildFixtureTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-dynamic-mcp-'));
  const channelsRoot = path.join(root, 'yt-mcp', 'channels');
  const registryPath = path.join(root, 'yt-mcp', 'studio-channels.json');
  fs.mkdirSync(channelsRoot, { recursive: true });
  const writeRegistry = (slugs) => {
    fs.writeFileSync(registryPath, JSON.stringify({ channels: slugs.map((slug) => ({ slug, label: 'Fixture ' + slug })) }));
  };
  writeRegistry(REGISTRY_SLUGS);
  const writeToken = (slug, token) => {
    fs.mkdirSync(path.join(channelsRoot, slug), { recursive: true });
    fs.writeFileSync(path.join(channelsRoot, slug, 'token.json'), JSON.stringify(token));
  };
  // alpha: fresh access_token in the file — must be used WITHOUT a refresh
  // (fixture secrets are >= 12 chars so they clear the redactor's min-length
  // guard, matching real token proportions)
  writeToken('fixture-alpha', { access_token: 'at-alpha-fresh-0123456789', refresh_token: 'rt-alpha-0123456789abcdef', token_type: 'Bearer', expiry: FUTURE });
  // gamma: refresh_token only — forces the OAuth refresh path
  writeToken('fixture-gamma', { refresh_token: 'rt-gamma-0123456789abcdef', token_type: 'Bearer' });
  // bare: in the registry, no token anywhere — the no-token error path
  return { root, registryPath, channelsRoot, writeRegistry, writeToken };
}

const ENV = {
  YOUTUBE_CLIENT_ID: 'cid-test-0123456789',
  YOUTUBE_CLIENT_SECRET: 'csec-test-0123456789',
  // beta resolves from ENV ONLY (no file on disk) with a STALE access token —
  // proves env-first resolution AND the refresh path through createAccessToken
  YT_TOKEN_FIXTURE_BETA: JSON.stringify({ access_token: 'at-beta-stale-0123456789', refresh_token: 'rt-beta-env-0123456789', expiry: PAST }),
};

// ---- google fetch stub ------------------------------------------------------

const J = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function fakeGoogle(overrides = {}) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, opts, body: opts.body });
    if (u === 'https://oauth2.googleapis.com/token') {
      if (overrides.oauthFail) return J({ error: 'invalid_grant' }, 400);
      return J({ access_token: 'at-refreshed', expires_in: 3500 });
    }
    if (u.startsWith('https://www.googleapis.com/youtube/v3/channels')) {
      return J({ items: [{
        id: 'UC-alpha',
        snippet: { title: 'Fixture Alpha', customUrl: '@fixturealpha', description: 'test channel' },
        statistics: { subscriberCount: '10', viewCount: '1000', videoCount: '3' },
        contentDetails: { relatedPlaylists: { uploads: 'UU-alpha-uploads' } },
      }] });
    }
    if (u.startsWith('https://www.googleapis.com/youtube/v3/search')) {
      return J({ items: [{ id: { videoId: 'vid-s1' }, snippet: { title: 'Musashi rules', publishedAt: '2026-01-02T00:00:00Z' } }] });
    }
    if (u.startsWith('https://www.googleapis.com/youtube/v3/playlistItems')) {
      return J({
        nextPageToken: 'PT-next',
        items: [{ id: 'pl1', snippet: { title: 'Video one', publishedAt: '2026-01-01T00:00:00Z' }, contentDetails: { videoId: 'vid-1' } }],
      });
    }
    if (u.startsWith('https://www.googleapis.com/youtube/v3/videos')) {
      return J({ items: [{
        id: 'vid-1',
        snippet: { title: 'Video one', publishedAt: '2026-01-01T00:00:00Z', channelTitle: 'Fixture Alpha', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/vid-1/mqdefault.jpg', width: 320, height: 180 } } },
        contentDetails: { duration: 'PT59S' },
        statistics: { viewCount: '55', likeCount: '6', commentCount: '2' },
      }] });
    }
    if (u.startsWith('https://www.googleapis.com/youtube/v3/commentThreads')) {
      return J({ items: [{ id: 'ct-1', snippet: { totalReplyCount: 1, topLevelComment: { snippet: { authorDisplayName: '@fan', textOriginal: 'great video', likeCount: 3, publishedAt: '2026-01-03T00:00:00Z' } } } }] });
    }
    if (u.startsWith('https://www.googleapis.com/youtube/v3/comments')) {
      return J({ id: 'c-new', snippet: { parentId: 'parent-1', textOriginal: 'well said', authorDisplayName: '@fixturealpha' } });
    }
    if (u.startsWith('https://www.googleapis.com/youtube/v3/playlists')) {
      return J({ items: [{ id: 'PL-1', snippet: { title: 'Best of', publishedAt: '2026-01-04T00:00:00Z' }, contentDetails: { itemCount: 7 } }] });
    }
    if (u.startsWith('https://www.googleapis.com/youtube/v3/captions')) {
      return J({ items: [{ id: 'cap-1', snippet: { language: 'en', name: 'English', trackKind: 'standard' } }] });
    }
    if (u.startsWith('https://www.googleapis.com/youtube/v3/activities')) {
      return J({ items: [{ id: 'act-1', snippet: { type: 'upload', title: 'Video one', publishedAt: '2026-01-01T00:00:00Z' } }] });
    }
    return J({ error: { message: 'no stub for ' + u } }, 404);
  };
  fn.calls = calls;
  return fn;
}

// ---- dispatcher helpers -----------------------------------------------------

// Read-only tests share ONE tree; mutating tests build their own and clean up.
let SHARED_TREE = null;
function sharedTree() {
  return SHARED_TREE || (SHARED_TREE = buildFixtureTree());
}

function rpc(msg) {
  return JSON.stringify({ jsonrpc: '2.0', ...msg });
}

async function ask(dispatcher, msg) {
  return dispatcher.handleLine(rpc({ id: 1, ...msg }));
}

function resultText(resp) {
  assert.equal(resp.error, undefined, 'expected a success response, got: ' + JSON.stringify(resp));
  return JSON.parse(resp.result.content[0].text);
}

function makeDispatcher(overrides = {}) {
  const tree = overrides.tree || sharedTree();
  const fetchImpl = overrides.fetchImpl || fakeGoogle();
  const now = overrides.now || (() => Date.now());
  const dispatcher = createDispatcher({
    env: overrides.env || ENV,
    registryPath: tree.registryPath,
    channelsRoot: tree.channelsRoot,
    fetchImpl,
    now,
    ...(overrides.ttlMs ? { ttlMs: overrides.ttlMs } : {}),
    ...(overrides.fsImpl ? { fsImpl: overrides.fsImpl } : {}),
  });
  return { tree, fetchImpl, dispatcher, now };
}

// ---------------------------------------------------------------------------
// A. tool catalog — the v1 set is exactly these nine, every one channel-first
// ---------------------------------------------------------------------------

describe('dynamic-mcp T3 — tool catalog', () => {
  test('tools/list exposes exactly the nine v1 tools', async () => {
    const { dispatcher } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'tools/list' });
    assert.deepEqual(
      resp.result.tools.map((t) => t.name),
      ['channel-info', 'video-list', 'video-details', 'comment-list', 'comment-reply', 'playlist-list', 'caption-list', 'thumbnail-info', 'activity-list'],
    );
  });

  test('every tool takes a required channel slug and declares its schema', () => {
    assert.equal(TOOLS.length, 9);
    for (const t of TOOLS) {
      assert.equal(typeof t.description, 'string', t.name + ' needs a description');
      assert.ok(t.description.length > 10, t.name + ' description should teach the model how to use it');
      assert.equal(t.inputSchema.type, 'object');
      assert.ok(t.inputSchema.properties.channel, t.name + ' must expose a channel property');
      assert.ok(t.inputSchema.required.includes('channel'), t.name + ' must REQUIRE channel');
      assert.ok(t.quota, t.name + ' must document its quota cost');
    }
  });

  test('uploads stay OUT of v1: no video.insert / upload tool exists', () => {
    assert.ok(!TOOLS.some((t) => /upload|insert-video|video-insert/i.test(t.name)), 'uploads stay in the CI intent flow by design');
  });

  test('comment-reply carries the double-fire warning; video-list states the one-time uploads lookup', () => {
    const reply = TOOLS.find((t) => t.name === 'comment-reply');
    assert.match(reply.description, /not idempotent|verify before retrying/i, 'the write warning must be in the description');
    assert.match(reply.description, /context only/i, 'videoId is context — the API derives the video from parentId');
    const list = TOOLS.find((t) => t.name === 'video-list');
    assert.match(list.description, /once per server lifetime/, 'the +1 uploads-playlist lookup is documented');
  });
});

// ---------------------------------------------------------------------------
// B. protocol — handshake, notifications, errors, robustness
// ---------------------------------------------------------------------------

describe('dynamic-mcp T3 — protocol', () => {
  test('initialize echoes a supported protocolVersion and announces the server', async () => {
    const { dispatcher } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'claude', version: '1' } } });
    assert.equal(resp.result.protocolVersion, '2024-11-05');
    assert.ok(resp.result.serverInfo.name);
    assert.ok(resp.result.capabilities.tools, 'server must declare the tools capability');
    assert.match(resp.result.instructions, /channel/, 'instructions must teach the per-call channel parameter');
  });

  test('initialize with an UNKNOWN protocolVersion falls back to the newest supported one (spec: downgrade reply)', async () => {
    const { dispatcher } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'initialize', params: { protocolVersion: '1999-01-01' } });
    assert.equal(resp.result.protocolVersion, '2025-06-18');
  });

  test('notifications (no id) are accepted and NEVER answered', async () => {
    const { dispatcher } = makeDispatcher();
    assert.equal(await dispatcher.handleLine(rpc({ method: 'notifications/initialized' })), null);
    assert.equal(await dispatcher.handleLine(rpc({ method: 'notifications/cancelled', params: { requestId: 1 } })), null);
  });

  test('ping answers an empty result', async () => {
    const { dispatcher } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'ping' });
    assert.deepEqual(resp.result, {});
  });

  test('unknown method is a JSON-RPC -32601', async () => {
    const { dispatcher } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'resources/list' });
    assert.equal(resp.error.code, -32601);
  });

  test('a malformed (non-JSON) line is a -32700 with id null — and the server SURVIVES it', async () => {
    const { dispatcher } = makeDispatcher();
    const bad = await dispatcher.handleLine('this is not json {{{');
    assert.equal(bad.error.code, -32700);
    assert.equal(bad.id, null);
    const after = await ask(dispatcher, { method: 'tools/list' });
    assert.equal(after.error, undefined, 'the very next valid request must still work');
  });

  test('a parseable but invalid JSON-RPC object (wrong jsonrpc / not an object) is -32600, never a crash', async () => {
    const { dispatcher } = makeDispatcher();
    assert.equal((await dispatcher.handleLine('42')).error.code, -32600);
    assert.equal((await ask(dispatcher, { jsonrpc: '1.0', method: 'ping' })).error.code, -32600);
    const withId = await dispatcher.handleLine(rpc({ id: 7, jsonrpc: '1.0', method: 'ping' }));
    assert.equal(withId.error.code, -32600);
    assert.equal(withId.id, 7, 'the error carries the caller id when one was detectable');
    assert.equal(await dispatcher.handleLine(''), null, 'blank lines are ignored silently');
  });

  test('an id of an UNSUPPORTED type is -32600, never a silent notification-hang', async () => {
    const { dispatcher } = makeDispatcher();
    for (const badId of [{}, true, [], false]) {
      const resp = await dispatcher.handleLine(JSON.stringify({ jsonrpc: '2.0', id: badId, method: 'ping' }));
      assert.equal(resp.error.code, -32600, 'id ' + JSON.stringify(badId) + ' must be rejected');
      assert.match(resp.error.message, /id must be a string, number, or null/);
    }
  });

  test('unknown tool is a JSON-RPC -32602 that lists the available tools', async () => {
    const { dispatcher } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'video-insert', arguments: {} } });
    assert.equal(resp.error.code, -32602);
    assert.match(resp.error.message, /channel-info/);
  });

  test('missing required arguments is a JSON-RPC -32602 naming the missing keys', async () => {
    const { dispatcher } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'video-details', arguments: { channel: 'fixture-alpha' } } });
    assert.equal(resp.error.code, -32602);
    assert.match(resp.error.message, /videoId/);
  });
});

// ---------------------------------------------------------------------------
// C. channel resolution — the whole point of the server
// ---------------------------------------------------------------------------

describe('dynamic-mcp T3 — channel resolution', () => {
  test('unknown channel -> clean TOOL error listing every registry channel', async () => {
    const { dispatcher } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'ghost-channel' } } });
    assert.equal(resp.error, undefined, 'unknown channel is a tool RESULT error, not a JSON-RPC error');
    assert.equal(resp.result.isError, true);
    for (const slug of REGISTRY_SLUGS) assert.match(resp.result.content[0].text, new RegExp(slug));
    assert.match(resp.result.content[0].text, /studio-channels\.json/, 'the error teaches how to add a channel');
  });

  test('channel in the registry but NO token anywhere -> clean tool error naming the env var and the file path', async () => {
    const { dispatcher } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-bare' } } });
    assert.equal(resp.result.isError, true);
    assert.match(resp.result.content[0].text, /YT_TOKEN_FIXTURE_BARE/);
    assert.match(resp.result.content[0].text, /token\.json/);
  });

  test('slug is validated before ANY filesystem access (path traversal cannot reach token files)', async () => {
    const { dispatcher } = makeDispatcher();
    for (const evil of ['../../etc', 'alpha/../../secrets', '.\\windows']) {
      const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: evil } } });
      assert.equal(resp.result.isError, true, evil + ' must be a clean error');
      assert.doesNotMatch(resp.result.content[0].text, /ENOENT|readFile/, 'no raw fs error may surface');
    }
  });

  test('unreadable registry is FAIL-CLOSED (clean tool error, no crash, server still alive)', async () => {
    const deadTree = buildFixtureTree();
    try {
      fs.rmSync(deadTree.registryPath);
      const { dispatcher, fetchImpl } = makeDispatcher({ tree: deadTree });
      const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-alpha' } } });
      assert.equal(resp.result.isError, true);
      assert.match(resp.result.content[0].text, /registry unreadable/);
      assert.equal(fetchImpl.calls.length, 0, 'fail-closed means NO google call is attempted');
      const alive = await ask(dispatcher, { method: 'tools/list' });
      assert.equal(alive.error, undefined, 'server survives the registry failure');
    } finally {
      fs.rmSync(deadTree.root, { recursive: true, force: true });
    }
  });

  test('registry is re-read on a SHORT TTL: a new channel appears WITHOUT a restart', async () => {
    const tree = buildFixtureTree();
    try {
      let clock = 1_000_000_000_000;
      let registryReads = 0;
      const fsImpl = {
        ...fs,
        readFileSync: (p, ...rest) => {
          if (String(p) === tree.registryPath) registryReads += 1;
          return fs.readFileSync(p, ...rest);
        },
      };
      const { dispatcher } = makeDispatcher({ tree, now: () => clock, ttlMs: 60_000, fsImpl });
      const call = (slug) => ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: slug } } });

      await call('fixture-alpha');
      await call('fixture-alpha');
      assert.equal(registryReads, 1, 'within the TTL the registry is served from cache');

      clock += 60_001; // TTL expired
      tree.writeRegistry([...REGISTRY_SLUGS, 'fixture-delta']);
      tree.writeToken('fixture-delta', { access_token: 'at-delta-fresh', refresh_token: 'rt-delta', expiry: FUTURE });
      const resp = await call('fixture-delta');
      assert.equal(resp.result.isError, undefined, 'a channel added to the registry + token file is callable WITHOUT a restart');
      assert.equal(registryReads, 2);
    } finally {
      fs.rmSync(tree.root, { recursive: true, force: true });
    }
  });

  test('an unknown-channel error re-reads the registry once, so the self-documenting list is never stale', async () => {
    const tree = buildFixtureTree();
    try {
      let registryReads = 0;
      const fsImpl = {
        ...fs,
        readFileSync: (p, ...rest) => {
          if (String(p) === tree.registryPath) registryReads += 1;
          return fs.readFileSync(p, ...rest);
        },
      };
      const { dispatcher } = makeDispatcher({ tree, ttlMs: 60_000, fsImpl });
      const args = { channel: 'fixture-delta' };
      const miss = await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: args } });
      assert.equal(miss.result.isError, true);
      tree.writeRegistry([...REGISTRY_SLUGS, 'fixture-delta']);
      tree.writeToken('fixture-delta', { access_token: 'at-delta-fresh-0123456789', refresh_token: 'rt-delta-0123456789abcdef', expiry: FUTURE });
      const hit = await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: args } });
      assert.equal(hit.result.isError, undefined, 'the forced re-read on the earlier miss already picked the channel up');
      assert.equal(registryReads, 3, 'fill + forced re-read on the miss + ONE more forced re-read when the still-cached pre-delta list misses — that mechanism is what makes the new channel callable');
    } finally {
      fs.rmSync(tree.root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// D. tools/call — correct Google API URLs/params and shaped results
// ---------------------------------------------------------------------------

describe('dynamic-mcp T3 — tools/call happy paths', () => {
  test('channel-info: channels.list mine=true with the Bearer token, shaped result, NO refresh for a fresh token', async () => {
    const { dispatcher, fetchImpl } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-alpha' } } });
    const shape = resultText(resp);
    assert.deepEqual(shape, { id: 'UC-alpha', title: 'Fixture Alpha', handle: '@fixturealpha', description: 'test channel', subs: '10', views: '1000', videos: '3' });
    assert.equal(fetchImpl.calls.length, 1, 'a fresh file access_token must skip the OAuth refresh');
    const u = new URL(fetchImpl.calls[0].url);
    assert.equal(u.origin + u.pathname, 'https://www.googleapis.com/youtube/v3/channels');
    assert.equal(u.searchParams.get('part'), 'snippet,statistics');
    assert.equal(u.searchParams.get('mine'), 'true');
    assert.equal(fetchImpl.calls[0].opts.headers.Authorization, 'Bearer at-alpha-fresh-0123456789');
  });

  test('video-list without query: uploads playlist via contentDetails then playlistItems (quota-cheap path)', async () => {
    const { dispatcher, fetchImpl } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'video-list', arguments: { channel: 'fixture-alpha' } } });
    const shape = resultText(resp);
    assert.deepEqual(shape.items, [{ id: 'vid-1', title: 'Video one', publishedAt: '2026-01-01T00:00:00Z' }]);
    assert.equal(shape.nextPageToken, 'PT-next');
    const urls = fetchImpl.calls.map((c) => new URL(c.url));
    const chans = urls.find((u) => u.pathname.endsWith('/channels'));
    assert.equal(chans.searchParams.get('part'), 'contentDetails');
    const items = urls.find((u) => u.pathname.endsWith('/playlistItems'));
    assert.equal(items.searchParams.get('playlistId'), 'UU-alpha-uploads');
    assert.equal(items.searchParams.get('maxResults'), '10', 'default maxResults is 10');
    assert.equal(items.searchParams.get('part'), 'snippet,contentDetails');
  });

  test('video-list with query: search.list forMine=true type=video (and maxResults clamped to the API max)', async () => {
    const { dispatcher, fetchImpl } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'video-list', arguments: { channel: 'fixture-alpha', query: 'musashi', maxResults: 500 } } });
    const shape = resultText(resp);
    assert.deepEqual(shape.items, [{ id: 'vid-s1', title: 'Musashi rules', publishedAt: '2026-01-02T00:00:00Z' }]);
    const u = new URL(fetchImpl.calls[0].url);
    assert.equal(u.pathname.endsWith('/search'), true);
    assert.equal(u.searchParams.get('forMine'), 'true');
    assert.equal(u.searchParams.get('type'), 'video');
    assert.equal(u.searchParams.get('q'), 'musashi');
    assert.equal(u.searchParams.get('maxResults'), '50', 'search.list caps at 50');
  });

  test('video-details: videos.list part=snippet,contentDetails,statistics shaped into a flat object', async () => {
    const { dispatcher, fetchImpl } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'video-details', arguments: { channel: 'fixture-alpha', videoId: 'vid-1' } } });
    const shape = resultText(resp);
    assert.deepEqual(shape, { id: 'vid-1', title: 'Video one', publishedAt: '2026-01-01T00:00:00Z', duration: 'PT59S', views: '55', likes: '6', comments: '2' });
    const u = new URL(fetchImpl.calls[0].url);
    assert.equal(u.pathname.endsWith('/videos'), true);
    assert.equal(u.searchParams.get('id'), 'vid-1');
    assert.equal(u.searchParams.get('part'), 'snippet,contentDetails,statistics');
  });

  test('comment-list: commentThreads.list shaped to author/text/likes/replies', async () => {
    const { dispatcher, fetchImpl } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'comment-list', arguments: { channel: 'fixture-alpha', videoId: 'vid-1', maxResults: 500 } } });
    const shape = resultText(resp);
    assert.deepEqual(shape.items, [{ id: 'ct-1', author: '@fan', text: 'great video', likes: 3, publishedAt: '2026-01-03T00:00:00Z', replies: 1 }]);
    const u = new URL(fetchImpl.calls[0].url);
    assert.equal(u.pathname.endsWith('/commentThreads'), true);
    assert.equal(u.searchParams.get('videoId'), 'vid-1');
    assert.equal(u.searchParams.get('maxResults'), '100', 'commentThreads caps at 100');
  });

  test('comment-reply: comments.insert POSTs the JSON body (parentId + text) and shapes the response', async () => {
    const { dispatcher, fetchImpl } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'comment-reply', arguments: { channel: 'fixture-alpha', videoId: 'vid-1', parentId: 'parent-1', text: 'well said' } } });
    const shape = resultText(resp);
    assert.deepEqual(shape, { id: 'c-new', parentId: 'parent-1', text: 'well said', author: '@fixturealpha' });
    const call = fetchImpl.calls[0];
    const u = new URL(call.url);
    assert.equal(u.pathname.endsWith('/comments'), true);
    assert.equal(call.opts.method, 'POST');
    assert.deepEqual(JSON.parse(call.body), { snippet: { parentId: 'parent-1', textOriginal: 'well said' } });
    assert.equal(call.opts.headers.Authorization, 'Bearer at-alpha-fresh-0123456789');
  });

  test('playlist-list / caption-list / thumbnail-info / activity-list hit their endpoints with the right parts', async () => {
    const { dispatcher, fetchImpl } = makeDispatcher();
    const playlists = resultText(await ask(dispatcher, { method: 'tools/call', params: { name: 'playlist-list', arguments: { channel: 'fixture-alpha' } } }));
    assert.deepEqual(playlists.items, [{ id: 'PL-1', title: 'Best of', itemCount: 7, publishedAt: '2026-01-04T00:00:00Z' }]);
    const captions = resultText(await ask(dispatcher, { method: 'tools/call', params: { name: 'caption-list', arguments: { channel: 'fixture-alpha', videoId: 'vid-1' } } }));
    assert.deepEqual(captions.items, [{ id: 'cap-1', language: 'en', name: 'English', kind: 'standard' }]);
    const thumbs = resultText(await ask(dispatcher, { method: 'tools/call', params: { name: 'thumbnail-info', arguments: { channel: 'fixture-alpha', videoId: 'vid-1' } } }));
    assert.equal(thumbs.thumbnails.medium.url, 'https://i.ytimg.com/vi/vid-1/mqdefault.jpg');
    const acts = resultText(await ask(dispatcher, { method: 'tools/call', params: { name: 'activity-list', arguments: { channel: 'fixture-alpha' } } }));
    assert.deepEqual(acts.items, [{ id: 'act-1', type: 'upload', title: 'Video one', publishedAt: '2026-01-01T00:00:00Z' }]);
    const paths = fetchImpl.calls.map((c) => new URL(c.url).pathname);
    assert.match(paths[0], /\/playlists$/);
    assert.match(paths[1], /\/captions$/);
    assert.match(paths[2], /\/videos$/);
    assert.match(paths[3], /\/activities$/);
    assert.equal(new URL(fetchImpl.calls[3].url).searchParams.get('mine'), 'true');
  });

  test('empty upstream result is a clean tool error, not an empty success', async () => {
    const tree = sharedTree();
    const d = createDispatcher({
      env: ENV, registryPath: tree.registryPath, channelsRoot: tree.channelsRoot,
      fetchImpl: async (url, opts) => {
        if (String(url).includes('/youtube/v3/videos')) return J({ items: [] });
        return fakeGoogle()(url, opts);
      },
    });
    const resp = await ask(d, { method: 'tools/call', params: { name: 'video-details', arguments: { channel: 'fixture-alpha', videoId: 'missing' } } });
    assert.equal(resp.result.isError, true);
    assert.match(resp.result.content[0].text, /not found|no items/i);
  });
});

// ---------------------------------------------------------------------------
// E. token refresh — reuses studio/lib/yt-token.mjs createAccessToken
// ---------------------------------------------------------------------------

describe('dynamic-mcp T3 — token resolution & refresh', () => {
  test('stale access_token -> OAuth refresh with the env client creds, then the API call uses the fresh token', async () => {
    const { dispatcher, fetchImpl } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-beta' } } });
    assert.equal(resp.error, undefined);
    assert.match(resultText(resp).title, /Fixture Alpha/); // stub serves one channel body
    const [oauth, api] = fetchImpl.calls;
    assert.equal(oauth.url, 'https://oauth2.googleapis.com/token');
    assert.equal(oauth.opts.method, 'POST');
    assert.equal(oauth.opts.body.get('client_id'), 'cid-test-0123456789');
    assert.equal(oauth.opts.body.get('client_secret'), 'csec-test-0123456789');
    assert.equal(oauth.opts.body.get('refresh_token'), 'rt-beta-env-0123456789');
    assert.equal(oauth.opts.body.get('grant_type'), 'refresh_token');
    assert.equal(api.opts.headers.Authorization, 'Bearer at-refreshed');
  });

  test('the refreshed access token is CACHED — a second call does not re-refresh', async () => {
    const { dispatcher, fetchImpl } = makeDispatcher();
    await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-beta' } } });
    await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-beta' } } });
    assert.equal(fetchImpl.calls.filter((c) => c.url === 'https://oauth2.googleapis.com/token').length, 1);
  });

  test('file token with only a refresh_token refreshes too (gamma), via the SAME createAccessToken seam', async () => {
    const { dispatcher, fetchImpl } = makeDispatcher();
    const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-gamma' } } });
    assert.equal(resp.error, undefined);
    const oauth = fetchImpl.calls.find((c) => c.url === 'https://oauth2.googleapis.com/token');
    assert.equal(oauth.opts.body.get('refresh_token'), 'rt-gamma-0123456789abcdef');
  });

  test('env token WINS over the token file when both exist for a slug', async () => {
    const tree = buildFixtureTree();
    try {
      tree.writeRegistry([...REGISTRY_SLUGS, 'fixture-both']);
      tree.writeToken('fixture-both', { access_token: 'at-both-file-fresh-0123', refresh_token: 'rt-both-file-0123456', expiry: FUTURE });
      const fetchImpl = fakeGoogle();
      const d = createDispatcher({
        env: { ...ENV, YT_TOKEN_FIXTURE_BOTH: JSON.stringify({ refresh_token: 'rt-both-env-0123456789', token_type: 'Bearer' }) },
        registryPath: tree.registryPath, channelsRoot: tree.channelsRoot, fetchImpl,
      });
      const resp = await ask(d, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-both' } } });
      assert.equal(resp.error, undefined);
      const oauth = fetchImpl.calls.find((c) => c.url === 'https://oauth2.googleapis.com/token');
      assert.equal(oauth.opts.body.get('refresh_token'), 'rt-both-env-0123456789', 'the ENV token was refreshed — the file token was never touched');
      assert.ok(!fetchImpl.calls.some((c) => (c.opts.headers?.Authorization || '').includes('at-both-file-fresh-0123')), 'the file access_token is never used when env wins');
    } finally {
      fs.rmSync(tree.root, { recursive: true, force: true });
    }
  });

  test('a REMOVED channel becomes uncallable once the registry TTL expires (and the error lists who is left)', async () => {
    const tree = buildFixtureTree();
    try {
      let clock = 2_000_000_000_000;
      const { dispatcher } = makeDispatcher({ tree, now: () => clock, ttlMs: 60_000 });
      const call = () => ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-alpha' } } });
      assert.equal((await call()).result.isError, undefined, 'callable while in the registry');
      tree.writeRegistry(REGISTRY_SLUGS.filter((s) => s !== 'fixture-alpha'));
      assert.equal((await call()).result.isError, undefined, 'still callable within the TTL (documented 60s removal window)');
      clock += 60_001;
      const gone = await call();
      assert.equal(gone.result.isError, true);
      assert.match(gone.result.content[0].text, /Unknown channel 'fixture-alpha'/);
      assert.doesNotMatch(gone.result.content[0].text, /fixture-alpha,/, 'the removed slug is not in the available list');
      assert.match(gone.result.content[0].text, /fixture-beta/);
    } finally {
      fs.rmSync(tree.root, { recursive: true, force: true });
    }
  });

  test('a refreshed access token EXPIRES after its 50-minute cache TTL and refreshes again', async () => {
    let clock = 3_000_000_000_000;
    const fetchImpl = fakeGoogle();
    const { dispatcher } = makeDispatcher({ now: () => clock, fetchImpl });
    const call = () => ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-beta' } } });
    await call();
    await call();
    assert.equal(fetchImpl.calls.filter((c) => c.url === 'https://oauth2.googleapis.com/token').length, 1, 'cached within the TTL');
    clock += 51 * 60_000; // past the 50-minute refreshed-token cache
    await call();
    assert.equal(fetchImpl.calls.filter((c) => c.url === 'https://oauth2.googleapis.com/token').length, 2, 'the expired cache forces a re-refresh');
    assert.equal(fetchImpl.calls.at(-1).opts.headers.Authorization, 'Bearer at-refreshed');
  });

  test('missing YOUTUBE_CLIENT_ID/SECRET when a refresh is needed -> clean tool error, no crash', async () => {
    const { dispatcher } = makeDispatcher({ env: {} });
    const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-gamma' } } });
    assert.equal(resp.result.isError, true);
    assert.match(resp.result.content[0].text, /YOUTUBE_CLIENT_ID/);
  });

  test('failed refresh surfaces Google\'s verdict as a clean tool error', async () => {
    const { dispatcher } = makeDispatcher({ fetchImpl: fakeGoogle({ oauthFail: true }) });
    const resp = await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-beta' } } });
    assert.equal(resp.result.isError, true);
    assert.match(resp.result.content[0].text, /refresh failed/);
  });

  test('a Google API error (e.g. 403) reaches the caller as a clean tool error WITH google\'s message', async () => {
    const tree = sharedTree();
    const d = createDispatcher({
      env: ENV, registryPath: tree.registryPath, channelsRoot: tree.channelsRoot,
      fetchImpl: async () => J({ error: { message: 'quota exceeded' } }, 403),
    });
    const resp = await ask(d, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-alpha' } } });
    assert.equal(resp.result.isError, true);
    assert.match(resp.result.content[0].text, /403/);
    assert.match(resp.result.content[0].text, /quota exceeded/);
  });

  test('a POST that dies mid-flight (abort/timeout) warns the write MAY have landed — never invite a blind retry', async () => {
    const tree = sharedTree();
    const d = createDispatcher({
      env: ENV, registryPath: tree.registryPath, channelsRoot: tree.channelsRoot,
      fetchImpl: async () => { throw new Error('The operation was aborted due to timeout'); },
    });
    const post = await ask(d, { method: 'tools/call', params: { name: 'comment-reply', arguments: { channel: 'fixture-alpha', videoId: 'vid-1', parentId: 'parent-1', text: 'hi' } } });
    assert.equal(post.result.isError, true);
    assert.match(post.result.content[0].text, /may still have succeeded/);
    assert.match(post.result.content[0].text, /verify before retrying/i);
    const get = await ask(d, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-alpha' } } });
    assert.equal(get.result.isError, true);
    assert.doesNotMatch(get.result.content[0].text, /may still have succeeded/, 'the warning is for writes only');
  });

  test('secretNameFor maps dashes to underscores, uppercase (the YT_TOKEN_<SLUG> convention)', () => {
    assert.equal(secretNameFor('fixture-alpha'), 'YT_TOKEN_FIXTURE_ALPHA');
    assert.equal(secretNameFor('deep-work-os'), 'YT_TOKEN_DEEP_WORK_OS');
  });
});

// ---------------------------------------------------------------------------
// F. secrecy — token material never reaches any output line
// ---------------------------------------------------------------------------

describe('dynamic-mcp T3 — no token material in any output', () => {
  test('no refresh/access token string appears in ANY response across a full scripted session', async () => {
    const { dispatcher } = makeDispatcher();
    const responses = [];
    responses.push(await ask(dispatcher, { method: 'initialize', params: { protocolVersion: '2024-11-05' } }));
    await dispatcher.handleLine(rpc({ method: 'notifications/initialized' }));
    responses.push(await ask(dispatcher, { method: 'tools/list' }));
    responses.push(await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-alpha' } } }));
    responses.push(await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-beta' } } }));
    responses.push(await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-gamma' } } }));
    responses.push(await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-bare' } } }));
    responses.push(await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'ghost' } } }));
    responses.push(await dispatcher.handleLine('garbage !!!'));
    const all = responses.filter(Boolean).map((r) => JSON.stringify(r)).join('\n');
    for (const secret of ['rt-alpha', 'rt-beta-env', 'rt-gamma', 'at-alpha-fresh', 'at-beta-stale', 'at-refreshed', 'csec-test-0123456789']) {
      assert.ok(!all.includes(secret), 'token material leaked into output: ' + secret);
    }
  });

  test('even a fetch-layer error passes the redactor (no raw token material in the error result)', async () => {
    const tree = sharedTree();
    const d = createDispatcher({
      env: ENV, registryPath: tree.registryPath, channelsRoot: tree.channelsRoot,
      fetchImpl: async () => { throw new Error('socket exploded while sending rt-gamma-0123456789abcdef'); },
    });
    const resp = await ask(d, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-gamma' } } });
    assert.equal(resp.result.isError, true);
    assert.ok(!resp.result.content[0].text.includes('rt-gamma-0123456789abcdef'), 'fetch-layer error text must pass the redactor');
    assert.match(resp.result.content[0].text, /\[REDACTED\]/, 'the redaction actually happened');
  });

  test('the dispatcher exposes its redactor for the out-of-dispatch log belt (uncaught/stdin paths)', async () => {
    const { dispatcher } = makeDispatcher();
    await ask(dispatcher, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-gamma' } } });
    const scrubbed = dispatcher.redact('socket exploded while sending rt-gamma-0123456789abcdef');
    assert.ok(!scrubbed.includes('rt-gamma-0123456789abcdef'));
    assert.match(scrubbed, /\[REDACTED\]/);
  });

  test('a corrupt token file is a clean error — the JSON.parse SyntaxError (which quotes file content) never escapes', async () => {
    const tree = buildFixtureTree();
    try {
      tree.writeToken('fixture-corrupt', {});
      fs.writeFileSync(path.join(tree.channelsRoot, 'fixture-corrupt', 'token.json'), '{"refresh_token": "rt-corrupt-leak",');
      tree.writeRegistry([...REGISTRY_SLUGS, 'fixture-corrupt']);
      const d = createDispatcher({ env: {}, registryPath: tree.registryPath, channelsRoot: tree.channelsRoot, fetchImpl: fakeGoogle() });
      const resp = await ask(d, { method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-corrupt' } } });
      assert.equal(resp.result.isError, true);
      const text = resp.result.content[0].text;
      assert.match(text, /unreadable|invalid JSON/i);
      assert.ok(!text.includes('rt-corrupt-leak'), 'SyntaxError snippet leaked token file content');
    } finally {
      fs.rmSync(tree.root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// G. process-level — spawn the real server over real stdio (T2 fixture-tree
// pattern: a child -e process that stubs fetch, then imports a COPY of the
// server from a tmp tree carrying its own registry/token/studio-lib fixtures,
// so the test never touches the real repo's gitignored tokens).
// ---------------------------------------------------------------------------

describe('dynamic-mcp T3 — spawned process over real stdio', () => {
  test('handshake, tools/call, malformed-line survival and clean exit on a REAL child process', async () => {
    const childProcess = await import('node:child_process');
    const readline = await import('node:readline');
    const repoRoot = fileURLToPath(new URL('..', import.meta.url));
    const tree = buildFixtureTree();
    // the child imports a COPY of the server; its import.meta-derived ROOT and
    // the lazy studio/lib import both resolve inside the tmp tree
    for (const rel of ['yt-mcp/dynamic-server.mjs', 'lib/env.mjs', 'studio/lib/yt-token.mjs', 'studio/lib/data.mjs']) {
      fs.mkdirSync(path.join(tree.root, path.dirname(rel)), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, rel), path.join(tree.root, rel));
    }
    tree.writeRegistry(['fixture-one']);
    tree.writeToken('fixture-one', { access_token: 'at-child-file-0123456789', refresh_token: 'rt-child-0123456789abcdef', token_type: 'Bearer', expiry: FUTURE });

    const child = [
      'import { pathToFileURL } from "node:url";',
      'const J = (body) => ({ ok: true, status: 200, json: async () => body });',
      'globalThis.fetch = async (url, opts = {}) => {',
      '  const u = String(url);',
      '  if (u === "https://oauth2.googleapis.com/token") return J({ access_token: "at-child-fresh", expires_in: 3500 });',
      '  if (u.includes("/youtube/v3/channels")) return J({ items: [{ id: "UC-child", snippet: { title: "Child Channel", customUrl: "@child" }, statistics: { subscriberCount: "7" }, contentDetails: { relatedPlaylists: { uploads: "UU-child" } } }] });',
      '  return { ok: false, status: 404, json: async () => ({ error: { message: "unexpected " + u } }) };',
      '};',
      'const { startServer } = await import(pathToFileURL(process.env.CHILD_SERVER).href);',
      'startServer({ env: { YOUTUBE_CLIENT_ID: "cid-child", YOUTUBE_CLIENT_SECRET: "csec-child" }, log: () => {} });',
    ].join('\n');

    const cp = childProcess.spawn(process.execPath, ['--input-type=module', '-e', child], {
      cwd: tree.root,
      env: { ...process.env, CHILD_SERVER: path.join(tree.root, 'yt-mcp', 'dynamic-server.mjs') },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    cp.stderr.on('data', (d) => { stderr += String(d); });

    const lines = [];
    const waiters = [];
    const rl = readline.createInterface({ input: cp.stdout });
    rl.on('line', (line) => {
      lines.push(line);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(JSON.parse(line))) { waiters[i].resolve(JSON.parse(line)); waiters.splice(i, 1); }
      }
    });
    const nextWhere = (predicate, label) => new Promise((resolve, reject) => {
      const already = lines.map((l) => JSON.parse(l)).find(predicate);
      if (already) return resolve(already);
      const t = setTimeout(() => reject(new Error(label + ' timed out; got: ' + lines.join(' | ') + ' stderr: ' + stderr)), 20000);
      waiters.push({ predicate: (m) => { if (predicate(m)) { clearTimeout(t); return true; } return false; }, resolve });
    });
    const send = (msg) => cp.stdin.write((typeof msg === 'string' ? msg : JSON.stringify(msg)) + '\n');

    try {
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
      const init = await nextWhere((m) => m.id === 1, 'initialize');
      assert.equal(init.result.protocolVersion, '2024-11-05');

      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      const tools = await nextWhere((m) => m.id === 2, 'tools/list');
      assert.equal(tools.result.tools.length, 9);

      send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'fixture-one' } } });
      const info = await nextWhere((m) => m.id === 3, 'tools/call channel-info');
      assert.equal(JSON.parse(info.result.content[0].text).title, 'Child Channel', 'the child used its stubbed fetch + fixture tree');

      send('NOT JSON AT ALL {{{');
      const parseErr = await nextWhere((m) => m.error && m.error.code === -32700, 'parse error');
      assert.equal(parseErr.id, null);

      send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'channel-info', arguments: { channel: 'ghost' } } });
      const ghost = await nextWhere((m) => m.id === 4, 'unknown channel');
      assert.equal(ghost.result.isError, true);
      assert.match(ghost.result.content[0].text, /fixture-one/, 'the error lists the available channels');

      cp.stdin.end();
      const exit = await new Promise((resolve) => cp.on('exit', (code) => resolve(code)));
      assert.equal(exit, 0, 'server exits 0 when the client closes stdin; stderr: ' + stderr);

      // protocol purity: EVERY stdout line was valid JSON (readline already proved it by parsing)
      assert.ok(lines.length >= 5);
      for (const secret of ['rt-child-0123456789abcdef', 'at-child-file-0123456789']) {
        assert.ok(!lines.join('\n').includes(secret) && !stderr.includes(secret), 'token material in process output: ' + secret);
      }
    } finally {
      cp.kill();
      fs.rmSync(tree.root, { recursive: true, force: true });
    }
  });
});
