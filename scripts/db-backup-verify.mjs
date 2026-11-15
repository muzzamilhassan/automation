// CLI for the nightly backup workflow (.github/workflows/db-backup.yml).
//   node scripts/db-backup-verify.mjs counts <source.json> <restored.json>
//     → exit 1 with the problems if the restore does not match the live DB
//   node scripts/db-backup-verify.mjs prune <today-iso> --keep-days N < names.txt
//     → prints the release asset names to delete (older than N days)
import fs from 'node:fs';
import { compareCounts, assetsToPrune } from '../lib/backup-verify.mjs';

const [mode, a, b] = process.argv.slice(2);
if (mode === 'counts') {
  const source = JSON.parse(fs.readFileSync(a, 'utf8') || '{}');
  const restored = JSON.parse(fs.readFileSync(b, 'utf8') || '{}');
  const problems = compareCounts(source, restored);
  const total = Object.values(source).reduce((x, y) => x + Number(y), 0);
  if (problems.length) {
    console.error(`restore check FAILED:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`restore check OK: ${Object.keys(source).length} tables, ${total} live rows matched`);
} else if (mode === 'prune') {
  const keep = Number(process.argv[process.argv.indexOf('--keep-days') + 1] || 30);
  const names = fs.readFileSync(0, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const n of assetsToPrune(names, a, keep)) console.log(n);
} else {
  console.error('usage: db-backup-verify.mjs counts <src.json> <restored.json> | prune <today> --keep-days N < names');
  process.exit(2);
}
