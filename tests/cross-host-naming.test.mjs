import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BANNED = [
  'codex' + '-video-factory',
  'Codex' + ' Video Factory',
  'Codex' + '-Video-Factory',
  'Codex' + ' × Video Factory',
  'codex' + '-image-factory',
  'codex' + '-blender-plugin',
];
const EXCLUDED = new Set(['.git', '.mimosa', '.worktrees', '.superpowers', 'artifacts', 'openspec', 'superpowers', 'verification', '__pycache__']);
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.mjs', '.js', '.yaml', '.yml']);

function visit(directory, violations) {
  for (const name of readdirSync(directory)) {
    if (EXCLUDED.has(name)) continue;
    const path = join(directory, name);
    const rel = relative(ROOT, path).replaceAll('\\\\', '/');
    if (rel === 'tests/cross-host-naming.test.mjs') continue;
    for (const obsolete of BANNED) {
      if (rel.toLowerCase().includes(obsolete.toLowerCase())) violations.push(`path:${rel}:${obsolete}`);
    }
    if (statSync(path).isDirectory()) { visit(path, violations); continue; }
    if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase())) continue;
    const content = readFileSync(path, 'utf8');
    for (const obsolete of BANNED) {
      if (content.includes(obsolete)) violations.push(`content:${rel}:${obsolete}`);
    }
  }
}

test('public files and content use host-neutral names', () => {
  const violations = [];
  visit(ROOT, violations);
  assert.deepEqual(violations, []);
});
