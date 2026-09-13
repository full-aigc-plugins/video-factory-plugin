import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const lock = JSON.parse(readFileSync('upstream/reelbench.lock.json', 'utf8'));

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBlob = (bytes) => createHash('sha1')
  .update(`blob ${bytes.length}\0`)
  .update(bytes)
  .digest('hex');

test('all 27 active ReelBench files match their pinned blob and SHA-256', () => {
  assert.equal(lock.revision, '75520c7b32ab5af8b22c5e4f79705efbbc0d8e07');
  assert.equal(Object.keys(lock.files).length, 27);
  for (const [path, expected] of Object.entries(lock.files)) {
    const bytes = readFileSync(path);
    assert.equal(gitBlob(bytes), expected.gitBlob, `${path}: git blob`);
    assert.equal(sha256(bytes), expected.sha256, `${path}: sha256`);
  }
});

test('original upstream offline self-tests pass unchanged', () => {
  const shots = execFileSync('node', ['skills/video-shots/scripts/selftest.mjs'], { encoding: 'utf8' });
  const sync = execFileSync('node', ['skills/video-sync/scripts/selftest.mjs'], { encoding: 'utf8' });
  assert.match(shots, /449/);
  assert.match(sync, /122/);
});
