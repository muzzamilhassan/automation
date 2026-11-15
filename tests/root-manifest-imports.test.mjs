// Audit 2026-11-13 improvement #3 (ci-cd-03 / tests-qa-01 / studio-arch-03).
// tests.yml installs ROOT dependencies only. studio/lib/thumb-templates.js
// imports 'opentype.js', which only studio/package.json declared — locally it
// resolved from studio/node_modules, in CI it did not, and main was red for
// 6+ pushes. This guard walks every static/dynamic import reachable from the
// test files (following relative imports) and asserts each bare package is
// declared in the root package.json. Spec + QA: docs/qa/ci-green-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

const ROOT = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const declared = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
const builtins = new Set(builtinModules);

const IMPORT_RE = /(?:^|[\s;])(?:import\s+(?:[^'"]*?\s+from\s+)?|export\s+[^'"]*?\s+from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;

const packageName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

function resolveRelative(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const c of [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js'), path.join(base, 'index.mjs')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

export function collectBareImports(entryFiles) {
  const seen = new Set();
  const found = new Map(); // package -> first importing file
  const queue = [...entryFiles];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !/\.(m?js)$/.test(file)) continue;
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        const r = resolveRelative(file, spec);
        if (r && !r.includes(`${path.sep}node_modules${path.sep}`)) queue.push(r);
      } else if (!spec.startsWith('node:') && !spec.startsWith('@/') && !builtins.has(spec.split('/')[0])) {
        const name = packageName(spec);
        if (!found.has(name)) found.set(name, path.relative(ROOT, file));
      }
    }
  }
  return { found, files: seen.size };
}

test('every package reachable from the test suite is declared in the root package.json', () => {
  const testsDir = path.join(ROOT, 'tests');
  const entries = fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join(testsDir, f));
  const { found, files } = collectBareImports(entries);
  assert.ok(files > entries.length, `the walk must follow relative imports (walked ${files} files)`);
  assert.ok(found.size >= 3, `the scan must find real packages (found ${found.size}) — regex rot must not silently pass`);
  const missing = [...found].filter(([name]) => !declared.has(name)).map(([name, from]) => `${name} (imported by ${from})`);
  assert.deepEqual(missing, [], `CI installs root deps only — add these to the root package.json: ${missing.join(', ')}`);
});

test('the walker sees a studio-only dependency through a relative import (self-check)', () => {
  const { found } = collectBareImports([path.join(ROOT, 'studio', 'lib', 'thumb-templates.js')]);
  assert.ok(found.has('opentype.js'), 'thumb-templates.js imports opentype.js');
});
