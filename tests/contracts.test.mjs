import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertSupportedSchema, validateSchemaInstance } from '../src/schema-lite.mjs';
import { reviseEditDecision, validateEditDecision } from '../src/edit-decision.mjs';
import { evaluateMedia } from '../src/media-evaluator.mjs';
import { newJob, recordHumanDecision } from '../src/job-ledger.mjs';

const schema = (name) => JSON.parse(readFileSync(`schemas/${name}.schema.json`, 'utf8'));

const decision = {
  schemaVersion: '1.0.0',
  id: 'edit-001',
  revision: 1,
  timebase: { numerator: 1, denominator: 30 },
  clips: [
    { id: 'C01', assetId: 'A01', sourceInTicks: 0, sourceOutTicks: 60, timelineInTicks: 0, track: 0, transition: 'cut', gainDb: 0 },
    { id: 'C02', assetId: 'A02', sourceInTicks: 0, sourceOutTicks: 90, timelineInTicks: 60, track: 0, transition: 'dissolve', gainDb: -3 },
  ],
};

test('public schemas are closed Draft 2020-12 documents using enforced keywords', () => {
  for (const name of ['asset_manifest', 'reelbench_evidence', 'edit_decision', 'video_plan', 'video_approval', 'video_job', 'media_artifact_receipt', 'media_scores']) {
    const document = schema(name);
    assert.equal(document.$schema, 'https://json-schema.org/draft/2020-12/schema');
    for (const variant of document.$defs ? Object.values(document.$defs) : [document]) {
      assert.equal(variant.additionalProperties, false);
    }
    assert.doesNotThrow(() => assertSupportedSchema(document));
  }
});

test('edit revision changes only selected clips and preserves the previous decision', () => {
  const original = structuredClone(decision);
  const result = reviseEditDecision(decision, [
    { op: 'update', id: 'C02', patch: { gainDb: -6 } },
    { op: 'move', id: 'C02', timelineInTicks: 90 },
  ]);
  assert.equal(result.decision.revision, 2);
  assert.equal(result.decision.clips[1].gainDb, -6);
  assert.deepEqual(result.diff.changed, ['C02']);
  assert.deepEqual(decision, original);
});

test('edit decision schema accepts the minimal literal and rejects an unknown field', () => {
  assert.deepEqual(validateSchemaInstance(schema('edit_decision'), decision), []);
  const issues = validateSchemaInstance(schema('edit_decision'), { ...decision, unexpected: true });
  assert.match(issues[0].message, /additional property/);
});

test('video plan schema closes asset handoff and output mastering fields', () => {
  const plan = {
    schemaVersion: '1.0.0', id: 'P01', mode: 'local_composition', round: 1,
    editDecision: decision,
    assets: [{ id: 'A01', path: 'frame.png', sha256: 'a'.repeat(64), kind: 'image', durationTicks: 60, source: 'image-factory', authorizedAt: '2026-09-14T00:00:00Z' }],
    output: { aspect: '16:9', width: 1920, height: 1080, fps: 30, requireAudio: false },
  };
  assert.deepEqual(validateSchemaInstance(schema('video_plan'), plan), []);
  const issues = validateSchemaInstance(schema('video_plan'), { ...plan, output: { ...plan.output, arbitraryFilter: 'movie=http://example.com/x' } });
  assert.match(issues[0].message, /additional property/);
});

test('asset manifest accepts public Image Factory and Blender receipt fields', () => {
  const manifest = { schemaVersion: '1.0.0', assets: [{ id: 'B01', path: 'scene.mp4', sha256: 'a'.repeat(64), kind: 'video', durationTicks: 90, source: 'blender-design-plugin', license: 'user-authorized', authorizedAt: '2026-09-14T00:00:00Z', receiptPath: 'scene.receipt.json' }] };
  assert.deepEqual(validateSchemaInstance(schema('asset_manifest'), manifest), []);
});

test('edit decision behavior rejects duplicate ids, overlaps and invalid source ranges', () => {
  assert.deepEqual(validateEditDecision(decision, { A01: 60, A02: 120 }), decision);
  assert.throws(() => validateEditDecision({ ...decision, clips: [decision.clips[0], { ...decision.clips[1], id: 'C01' }] }, { A01: 60, A02: 120 }), /duplicate clip id/);
  assert.throws(() => validateEditDecision({ ...decision, clips: [decision.clips[0], { ...decision.clips[1], timelineInTicks: 30 }] }, { A01: 60, A02: 120 }), /timeline gap or overlap/);
  assert.throws(() => validateEditDecision({ ...decision, clips: [{ ...decision.clips[0], sourceOutTicks: 61 }] }, { A01: 60 }), /source range/);
  assert.throws(() => validateEditDecision({ ...decision, clips: [{ ...decision.clips[0], timelineInTicks: 10 }] }, { A01: 60 }), /start at tick 0/);
  assert.throws(() => validateEditDecision({ ...decision, clips: [{ ...decision.clips[0], track: 1 }] }, { A01: 60 }), /track 0/);
  assert.throws(() => validateEditDecision({ ...decision, clips: [{ ...decision.clips[1], timelineInTicks: 0 }, { ...decision.clips[0], timelineInTicks: 80 }] }, { A01: 60, A02: 120 }), /timeline gap or overlap/);
});

test('runtime job and score producers conform to their public schemas', () => {
  const job = newJob({ id: 'J01', planHash: 'a'.repeat(64), stage: 'rough', shotIds: ['C01'] });
  assert.deepEqual(validateSchemaInstance(schema('video_job'), job), []);
  const receipt = {
    schemaVersion: '1.0.0', path: '/output/final.mp4', sha256: 'b'.repeat(64), bytes: 1024,
    exists: true, hashVerified: true, decodeOk: true, width: 320, height: 180, fps: 30, durationSeconds: 1,
    hasAudio: true, provenanceOk: true, timelineOk: true, container: 'mov,mp4', streamCount: 2,
    videoCodec: 'h264', pixelFormat: 'yuv420p', videoStartSeconds: 0,
    audioCodec: 'aac', audioSampleRate: 48000, audioChannels: 2, audioStartSeconds: 0,
  };
  const scores = evaluateMedia({ output: { width: 320, height: 180, fps: 30, durationSeconds: 1, requireAudio: false } }, receipt);
  assert.deepEqual(validateSchemaInstance(schema('media_scores'), scores), []);
  const completed = recordHumanDecision({ ...job, state: 'ReviewReady', artifact: receipt, scores }, 'approved', 'played');
  assert.deepEqual(validateSchemaInstance(schema('video_job'), completed), []);
});
