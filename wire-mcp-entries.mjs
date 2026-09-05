// Adds yt-<slug> MCP server entries to .mcp.json for every channel that has
// a token. Safe to re-run (skips existing entries).
import fs from 'node:fs';
import { BRANDS } from './yt-brands/brands.mjs';

const EXE = 'C:\\Users\\Revnix\\AppData\\Roaming\\npm\\node_modules\\@eat-pray-ai\\yutu\\node_modules\\@eat-pray-ai\\yutu-win32-x64\\bin\\yutu.exe';
const CRED = 'C:\\Users\\Revnix\\Documents\\youtube-automation\\yt-mcp\\client_secret.json';
const cfgPath = '.mcp.json';

const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
cfg.mcpServers = cfg.mcpServers || {};

let added = 0;
for (const b of BRANDS) {
  const name = `yt-${b.slug}`;
  if (!fs.existsSync(`yt-mcp/channels/${b.slug}/token.json`)) continue;
  if (cfg.mcpServers[name]) continue;
  cfg.mcpServers[name] = {
    type: 'stdio',
    command: EXE,
    args: ['mcp'],
    env: {
      YUTU_CREDENTIAL: CRED,
      YUTU_CACHE_TOKEN: `C:\\Users\\Revnix\\Documents\\youtube-automation\\yt-mcp\\channels\\${b.slug}\\token.json`,
      YUTU_LOG_LEVEL: 'ERROR'
    },
    enabled: true,
    timeoutMs: 60000
  };
  added++;
  console.log(`+ ${name} (${b.label})`);
}
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
console.log(`\n✓ ${added} MCP server(s) added to .mcp.json — restart ZCode to load them.`);
