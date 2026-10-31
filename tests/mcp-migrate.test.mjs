import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, planMigration, buildNewConfig, migrate, main, NEW_ENTRY, TARGET_KEY } from '../scripts/mcp-migrate.mjs';

// ---------------------------------------------------------------------------
// #106 Phase 4.5 Tier 3 (T3) — replace the 16 static per-channel yutu blocks
// in the LOCAL (gitignored) .mcp.json with ONE registry-driven entry. Safety
// contract under test:
//   - DRY IS THE DEFAULT: the plan is printed, NOTHING is written
//   - --write backs the file up FIRST (.mcp.json.backup-<date>) and only then
//     replaces it
//   - every non-yt-* block is preserved VERBATIM (deep-equal content)
//   - the new entry is exactly { command: 'node', args: ['yt-mcp/dynamic-
//     server.mjs'] } under the single key 'yt'
//   - re-run is a no-op (already migrated); an existing non-yt-'yt-' key
//     named 'yt' is a hard REFUSAL (never overwritten)
//   - a missing/unparseable .mcp.json is a clean exit 1, never a crash
// All IO is injected — no real .mcp.json is touched by CI.
// ---------------------------------------------------------------------------

const DATE = '2026-11-01';

function yutuBlock(slug) {
  return {
    type: 'stdio',
    command: 'C:\\fake\\yutu.exe',
    args: ['mcp'],
    env: { YUTU_CACHE_TOKEN: 'C:\\fake\\yt-mcp\\channels\\' + slug + '\\token.json' },
    enabled: true,
  };
}

function fixtureConfig() {
  return {
    mcpServers: {
      github: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], enabled: true },
      'yt-alpha': yutuBlock('alpha'),
      'yt-beta': yutuBlock('beta'),
      'colab-mcp': { type: 'stdio', command: 'uvx', args: ['git+https://example/colab-mcp'] },
    },
  };
}

function io({ content = JSON.stringify(fixtureConfig()), failRead = false } = {}) {
  const calls = { read: 0, writes: [], copies: [] };
  return {
    calls,
    readFile: (p) => {
      calls.read += 1;
      if (failRead) throw new Error('ENOENT: no such file');
      return content;
    },
    writeFile: (p, body) => calls.writes.push({ path: p, body }),
    copyFile: (src, dest) => calls.copies.push({ src, dest }),
  };
}

const baseOpts = (overrides = {}) => ({
  readFile: () => JSON.stringify(fixtureConfig()),
  writeFile: () => {},
  copyFile: () => {},
  fileExists: () => false,
  log: () => {},
  nowDate: () => DATE,
  filePath: 'X:\\repo\\.mcp.json',
  ...overrides,
});

// ---------------------------------------------------------------------------
// A. parseArgs — dry is the default
// ---------------------------------------------------------------------------

describe('mcp-migrate T3 — parseArgs', () => {
  test('no flags -> DRY (the default must protect the live config)', () => {
    assert.equal(parseArgs([]).write, false);
    assert.equal(parseArgs(['--dry']).write, false);
  });

  test('--write is the explicit unlock; unknown args rejected', () => {
    assert.equal(parseArgs(['--write']).write, true);
    assert.equal(parseArgs(['--file=C:\\x\\.mcp.json']).filePath, 'C:\\x\\.mcp.json');
    assert.throws(() => parseArgs(['--live']), /unknown argument/);
  });
});

// ---------------------------------------------------------------------------
// B. plan + config building (pure)
// ---------------------------------------------------------------------------

describe('mcp-migrate T3 — plan & new config', () => {
  test('planMigration splits yt-* from preserved keys without mutating the input', () => {
    const config = fixtureConfig();
    const plan = planMigration(config);
    assert.deepEqual(plan.ytKeys, ['yt-alpha', 'yt-beta']);
    assert.deepEqual(plan.preservedKeys, ['github', 'colab-mcp']);
    assert.deepEqual(Object.keys(config.mcpServers), ['github', 'yt-alpha', 'yt-beta', 'colab-mcp'], 'input untouched');
  });

  test('buildNewConfig: yt-* blocks gone, ONE new entry with the exact shape, preserved blocks deep-equal', () => {
    const config = fixtureConfig();
    const { config: next } = buildNewConfig(config);
    assert.deepEqual(Object.keys(next.mcpServers), ['github', 'colab-mcp', TARGET_KEY]);
    assert.deepEqual(next.mcpServers[TARGET_KEY], { command: 'node', args: ['yt-mcp/dynamic-server.mjs'] });
    assert.deepEqual(next.mcpServers[TARGET_KEY], NEW_ENTRY);
    assert.deepEqual(next.mcpServers.github, config.mcpServers.github, 'github preserved verbatim');
    assert.deepEqual(next.mcpServers['colab-mcp'], config.mcpServers['colab-mcp'], 'colab preserved verbatim');
    assert.equal(next.mcpServers['yt-alpha'], undefined);
    assert.equal(next.mcpServers['yt-beta'], undefined);
  });

  test('buildNewConfig REFUSES when a preserved block is already named "yt" (never overwrite a foreign entry)', () => {
    const config = fixtureConfig();
    config.mcpServers.yt = { command: 'something-else' };
    assert.throws(() => buildNewConfig(config), /refusing/);
  });

  test('a config without mcpServers is rejected cleanly', () => {
    assert.throws(() => planMigration({}), /mcpServers/);
  });
});

// ---------------------------------------------------------------------------
// C. migrate — the dry/write safety contract
// ---------------------------------------------------------------------------

describe('mcp-migrate T3 — migrate (dry default, backup-first write)', () => {
  test('dry: NOTHING is read-written or copied; the plan names the backup, removed keys and the new entry', async () => {
    const fake = io();
    const lines = [];
    const res = await migrate(baseOpts({ ...fake, readFile: fake.readFile, writeFile: fake.writeFile, copyFile: fake.copyFile, log: (l) => lines.push(l) }));
    assert.equal(res.exitCode, 0);
    assert.equal(fake.calls.writes.length, 0, 'dry must not write the config');
    assert.equal(fake.calls.copies.length, 0, 'dry must not write the backup');
    const all = lines.join('\n');
    assert.match(all, /DRY/);
    assert.match(all, /\.mcp\.json\.backup-2026-11-01/);
    for (const key of ['yt-alpha', 'yt-beta', 'github', 'colab-mcp']) assert.match(all, new RegExp(key));
    assert.match(all, /dynamic-server\.mjs/);
  });

  test('--write: backup copies the ORIGINAL content first, then the config is replaced', async () => {
    const fake = io();
    const res = await migrate(baseOpts({
      readFile: fake.readFile, writeFile: fake.writeFile, copyFile: fake.copyFile,
      write: true, log: () => {},
    }));
    assert.equal(res.exitCode, 0);
    assert.equal(fake.calls.copies.length, 1, 'exactly one backup copy');
    assert.equal(fake.calls.copies[0].dest, 'X:\\repo\\.mcp.json.backup-2026-11-01');
    assert.equal(fake.calls.writes.length, 1);
    const next = JSON.parse(fake.calls.writes[0].body);
    assert.deepEqual(Object.keys(next.mcpServers), ['github', 'colab-mcp', 'yt']);
    // the backup is a copy of the ORIGINAL file (copyFile from the source), not a re-serialization
    assert.equal(fake.calls.copies[0].src, 'X:\\repo\\.mcp.json');
  });

  test('--write preserves the non-yt blocks byte-content-equal (round-trip deep equal)', async () => {
    const fake = io();
    await migrate(baseOpts({ readFile: fake.readFile, writeFile: fake.writeFile, copyFile: fake.copyFile, write: true, log: () => {} }));
    const next = JSON.parse(fake.calls.writes[0].body);
    const before = fixtureConfig();
    assert.deepEqual(next.mcpServers.github, before.mcpServers.github);
    assert.deepEqual(next.mcpServers['colab-mcp'], before.mcpServers['colab-mcp']);
    assert.equal(fake.calls.writes[0].body.endsWith('\n'), true, 'file ends with a newline');
  });

  test('re-run after migration (no yt-* left, "yt" present) is a NO-OP even with --write', async () => {
    const migrated = JSON.stringify(buildNewConfig(fixtureConfig()).config);
    const fake = io({ content: migrated });
    const lines = [];
    const res = await migrate(baseOpts({ readFile: fake.readFile, writeFile: fake.writeFile, copyFile: fake.copyFile, write: true, log: (l) => lines.push(l) }));
    assert.equal(res.exitCode, 0);
    assert.match(lines.join('\n'), /already migrated|nothing to migrate/i);
    assert.equal(fake.calls.writes.length + fake.calls.copies.length, 0, 'no backup, no write on a no-op');
  });

  test('a preserved "yt" block is a hard refusal in write mode: nothing is written', async () => {
    const config = fixtureConfig();
    config.mcpServers.yt = { command: 'foreign' };
    const fake = io({ content: JSON.stringify(config) });
    const lines = [];
    const res = await migrate(baseOpts({ readFile: fake.readFile, writeFile: fake.writeFile, copyFile: fake.copyFile, write: true, log: (l) => lines.push(l) }));
    assert.equal(res.exitCode, 1);
    assert.match(lines.join('\n'), /refus/i);
    assert.equal(fake.calls.writes.length + fake.calls.copies.length, 0);
  });

  test('--write REFUSES to clobber an existing same-date backup (exit 1, nothing written)', async () => {
    const fake = io();
    const lines = [];
    const res = await migrate(baseOpts({
      readFile: fake.readFile, writeFile: fake.writeFile, copyFile: fake.copyFile,
      fileExists: (p) => p.endsWith('.backup-' + DATE),
      write: true, log: (l) => lines.push(l),
    }));
    assert.equal(res.exitCode, 1);
    assert.match(lines.join('\n'), /backup.*already exists|refus/i);
    assert.equal(fake.calls.writes.length + fake.calls.copies.length, 0, 'the old backup and the config are untouched');
  });

  test('dry only NOTES an existing backup (still exit 0, still no writes)', async () => {
    const fake = io();
    const lines = [];
    const res = await migrate(baseOpts({
      readFile: fake.readFile, writeFile: fake.writeFile, copyFile: fake.copyFile,
      fileExists: (p) => p.endsWith('.backup-' + DATE),
      log: (l) => lines.push(l),
    }));
    assert.equal(res.exitCode, 0);
    assert.match(lines.join('\n'), /already exists/);
    assert.equal(fake.calls.writes.length + fake.calls.copies.length, 0);
  });

  test('missing file -> clean exit 1 with a message, no writes', async () => {
    const fake = io({ failRead: true });
    const lines = [];
    const res = await migrate(baseOpts({ readFile: fake.readFile, writeFile: fake.writeFile, copyFile: fake.copyFile, log: (l) => lines.push(l) }));
    assert.equal(res.exitCode, 1);
    assert.match(lines.join('\n'), /not read|ENOENT|missing/i);
    assert.equal(fake.calls.writes.length + fake.calls.copies.length, 0);
  });

  test('unparseable JSON -> clean exit 1, no writes', async () => {
    const fake = io({ content: '{ not json' });
    const lines = [];
    const res = await migrate(baseOpts({ readFile: fake.readFile, writeFile: fake.writeFile, copyFile: fake.copyFile, log: (l) => lines.push(l) }));
    assert.equal(res.exitCode, 1);
    assert.match(lines.join('\n'), /parse|json/i);
    assert.equal(fake.calls.writes.length + fake.calls.copies.length, 0);
  });
});

// ---------------------------------------------------------------------------
// D. main() on a REAL tmp file (fs wiring; --file keeps the test off the
// owner's live .mcp.json)
// ---------------------------------------------------------------------------

describe('mcp-migrate T3 — main() on a real tmp file', () => {
  test('dry then write produce the backup + migrated config on disk', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-migrate-'));
    const file = path.join(tmp, '.mcp.json');
    try {
      fs.writeFileSync(file, JSON.stringify(fixtureConfig(), null, 2));
      const dry = await main(['--dry', `--file=${file}`]);
      assert.equal(dry.exitCode, 0);
      assert.equal(fs.readdirSync(tmp).length, 1, 'dry creates no files');
      assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers['yt-alpha'] !== undefined, true, 'dry leaves the config untouched');

      const live = await main(['--write', `--file=${file}`]);
      assert.equal(live.exitCode, 0);
      const today = new Date().toISOString().slice(0, 10); // main() uses the real clock
      const backup = path.join(tmp, `.mcp.json.backup-${today}`);
      assert.deepEqual(JSON.parse(fs.readFileSync(backup, 'utf8')), fixtureConfig(), 'backup holds the ORIGINAL config');
      const next = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.deepEqual(Object.keys(next.mcpServers), ['github', 'colab-mcp', 'yt']);
      assert.deepEqual(next.mcpServers.yt, NEW_ENTRY);

      const rerun = await main(['--write', `--file=${file}`]);
      assert.equal(rerun.exitCode, 0, 're-run is a clean no-op');
      assert.equal(fs.readdirSync(tmp).length, 2, 'no second backup, config not rewritten');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
