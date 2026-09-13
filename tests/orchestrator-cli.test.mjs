import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { main } from '../src/cli.mjs';
import { recoverySummary } from '../src/orchestrator.mjs';

const capture = () => {
  let stdout = '';
  let stderr = '';
  return { io: { stdout: { write: (text) => { stdout += text; } }, stderr: { write: (text) => { stderr += text; } } }, read: () => ({ stdout, stderr }) };
};

test('CLI quote emits a zero-remote-call rough estimate', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vedio-cli-'));
  const planPath = join(root, 'plan.json');
  writeFileSync(planPath, JSON.stringify({ id: 'P1', round: 1, mode: 'local_composition', editDecision: { id: 'E1', clips: [] }, assets: [{ id: 'A1' }], output: { width: 1280, height: 720, fps: 30 } }));
  const out = capture();
  assert.equal(await main(['quote', planPath, '--stage', 'rough'], out.io), 0);
  const quote = JSON.parse(out.read().stdout);
  assert.equal(quote.remoteInvocations, 0);
  assert.equal(quote.stage, 'rough');
});

test('CLI rejects unavailable native generation before execution', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vedio-cli-'));
  const path = join(root, 'plan.json');
  writeFileSync(path, JSON.stringify({ id: 'P1', round: 1, mode: 'codex_native_generation', editDecision: {}, assets: [{}], output: { width: 1280, height: 720, fps: 30 } }));
  const out = capture();
  assert.equal(await main(['validate-plan', path], out.io), 3);
  assert.match(out.read().stderr, /local_composition/);
});

test('recovery summary returns only pending segment ids and never retries failures', () => {
  const summary = recoverySummary({ state: 'Partial', segments: [
    { id: 'S01', state: 'Completed' }, { id: 'S02', state: 'Pending' }, { id: 'S03', state: 'Failed' },
  ] });
  assert.deepEqual(summary.pending, ['S02']);
  assert.deepEqual(summary.failed, ['S03']);
  assert.equal(summary.nextAction, 'resume_pending');
});
