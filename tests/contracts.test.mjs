import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertSupportedSchema, validateSchemaInstance } from '../src/schema-lite.mjs';
import { validateEditDecision } from '../src/edit-decision.mjs';

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
    assert.equal(document.additionalProperties, false);
    assert.doesNotThrow(() => assertSupportedSchema(document));
  }
});

test('edit decision schema accepts the minimal literal and rejects an unknown field', () => {
  assert.deepEqual(validateSchemaInstance(schema('edit_decision'), decision), []);
  const issues = validateSchemaInstance(schema('edit_decision'), { ...decision, unexpected: true });
  assert.match(issues[0].message, /additional property/);
});

test('edit decision behavior rejects duplicate ids, overlaps and invalid source ranges', () => {
  assert.deepEqual(validateEditDecision(decision, { A01: 60, A02: 120 }), decision);
  assert.throws(() => validateEditDecision({ ...decision, clips: [decision.clips[0], { ...decision.clips[1], id: 'C01' }] }, { A01: 60, A02: 120 }), /duplicate clip id/);
  assert.throws(() => validateEditDecision({ ...decision, clips: [decision.clips[0], { ...decision.clips[1], timelineInTicks: 30 }] }, { A01: 60, A02: 120 }), /timeline overlap/);
  assert.throws(() => validateEditDecision({ ...decision, clips: [{ ...decision.clips[0], sourceOutTicks: 61 }] }, { A01: 60 }), /source range/);
});
