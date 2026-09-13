import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { sha256File } from '../src/hash.mjs';
import { resolveGrantedFile, registerAssets } from '../src/paths.mjs';
import { canonicalHash, validateVideoPlan } from '../src/plan.mjs';
import { quotePlan, verifyApproval } from '../src/approval.mjs';
import { markSegment, newJob, pendingSegments, readLedger, transition, writeLedger } from '../src/job-ledger.mjs';

test('asset registration binds regular local files and rejects URL or symlink escape', async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-assets-'));
  writeFileSync(join(root, 'clip.bin'), 'clip-one');
  const outside = join(root, '..', `outside-${Date.now()}`);
  writeFileSync(outside, 'outside');
  symlinkSync(outside, join(root, 'escape.bin'));
  const hash = await sha256File(join(root, 'clip.bin'));
  const result = await registerAssets([{ id: 'A01', path: 'clip.bin', sha256: hash, kind: 'video' }], root);
  assert.equal(result.A01.path, realpathSync(join(root, 'clip.bin')));
  assert.throws(() => resolveGrantedFile(root, 'https://example.com/a.mp4'), /local file/);
  assert.throws(() => resolveGrantedFile(root, 'escape.bin'), /symlink/);
});

test('plan identity is stable and approval binds stage, round and both hashes', () => {
  const plan = { id: 'P1', round: 1, mode: 'local_composition', editDecision: { id: 'E1' }, assets: [{ id: 'A1' }], output: { width: 1280, height: 720, fps: 30 } };
  assert.equal(canonicalHash(plan), canonicalHash(structuredClone(plan)));
  assert.notEqual(canonicalHash(plan), canonicalHash({ ...plan, round: 2 }));
  assert.equal(validateVideoPlan(plan), plan);
  assert.throws(() => validateVideoPlan({ ...plan, assets: [{ id: 'A1', kind: 'image' }], output: { ...plan.output, audioAssetId: 'A1' } }), /audio asset/);
  const quote = quotePlan(plan, 'rough', 1);
  const approval = { schemaVersion: '1.0.0', stage: 'rough', planHash: quote.planHash, editHash: quote.editHash, round: 1, quoteRevision: 1, acceptedAt: '2026-09-14T00:00:00Z' };
  assert.doesNotThrow(() => verifyApproval(approval, quote));
  assert.throws(() => verifyApproval({ ...approval, stage: 'final' }, quote), /approval mismatch/);
});

test('atomic ledger recovery never returns completed segments as pending', () => {
  const root = mkdtempSync(join(tmpdir(), 'video-ledger-'));
  const file = join(root, 'job.json');
  let job = newJob({ id: 'J1', planHash: 'a'.repeat(64), stage: 'rough', shotIds: ['S01', 'S02'] });
  job = transition(job, 'Running', 'approved');
  job = markSegment(job, 'S01', { path: 'S01.mp4', sha256: 'b'.repeat(64) });
  writeLedger(file, job);
  const restored = readLedger(file);
  assert.deepEqual(pendingSegments(restored), ['S02']);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).revision, restored.revision);
  assert.throws(() => transition(restored, 'Completed'), /illegal transition/);
});
