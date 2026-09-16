import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertSupportedSchema, validateSchemaInstance } from '../src/schema-lite.mjs';
import { resolveEditDecision, reviseEditDecision, validateEditDecision } from '../src/edit-decision.mjs';
import { quotePlan } from '../src/approval.mjs';

const schema = (name) => JSON.parse(readFileSync(`schemas/${name}.schema.json`, 'utf8'));

const speech = {
  language: 'zh',
  words: [
    { id: 'W1', text: '我', startTicks: 0, endTicks: 30 },
    { id: 'W2', text: '们', startTicks: 30, endTicks: 60 },
    { id: 'W3', text: '上线', startTicks: 60, endTicks: 120 },
    { id: 'W4', text: '了', startTicks: 120, endTicks: 150 },
    { id: 'W5', text: '看', startTicks: 210, endTicks: 240 },
    { id: 'W6', text: '效果', startTicks: 240, endTicks: 300 },
  ],
};

// Clips are deliberately out of timeline order: resolution must sort by anchored position.
const semanticDecision = {
  schemaVersion: '1.1.0',
  id: 'edit-sem-001',
  revision: 1,
  timebase: { numerator: 1, denominator: 30 },
  speech,
  moments: [{ id: 'answer', wordId: 'W4', affinity: 'end' }],
  selections: [{ id: 'demo', startWordId: 'W5', startAffinity: 'start', endWordId: 'W6', endAffinity: 'end' }],
  clips: [
    { id: 'C03', assetId: 'A03', sourceInTicks: 0, sourceOutTicks: 90, anchor: { at: 'selection:demo:start' }, track: 0, transition: 'cut', gainDb: 0 },
    { id: 'C01', assetId: 'A01', sourceInTicks: 0, sourceOutTicks: 150, anchor: { at: 'speech:start' }, track: 0, transition: 'cut', gainDb: 0 },
    { id: 'C02', assetId: 'A02', sourceInTicks: 0, sourceOutTicks: 60, anchor: { at: 'moment:answer' }, track: 0, transition: 'dissolve', gainDb: -3 },
  ],
};

test('edit decision 1.1.0 schema accepts both the literal 1.0.0 form and the semantic 1.1.0 form', () => {
  const literal = { ...semanticDecision, schemaVersion: '1.0.0' };
  delete literal.speech;
  delete literal.moments;
  delete literal.selections;
  literal.clips = literal.clips.map(({ anchor: _anchor, ...clip }) => ({ ...clip, timelineInTicks: 0 }));
  literal.clips[0].timelineInTicks = 0;
  literal.clips[1].timelineInTicks = 150;
  literal.clips[2].timelineInTicks = 210;
  assert.deepEqual(validateSchemaInstance(schema('edit_decision'), literal), []);
  assert.deepEqual(validateSchemaInstance(schema('edit_decision'), semanticDecision), []);
});

test('anchored clip and literal clip are mutually exclusive per clip', () => {
  const both = structuredClone(semanticDecision);
  both.clips[1] = { ...both.clips[1], timelineInTicks: 150 };
  assert.notEqual(validateSchemaInstance(schema('edit_decision'), both).length, 0);
  const neither = structuredClone(semanticDecision);
  delete neither.clips[1].anchor;
  assert.notEqual(validateSchemaInstance(schema('edit_decision'), neither).length, 0);
});

test('resolution moves anchored clips with the words and sorts the timeline', () => {
  const { decision, resolved, anchors } = resolveEditDecision(semanticDecision);
  assert.equal(resolved, true);
  assert.equal(decision.schemaVersion, '1.0.0');
  assert.deepEqual(decision.clips.map((clip) => clip.id), ['C01', 'C02', 'C03']);
  assert.deepEqual(decision.clips.map((clip) => clip.timelineInTicks), [0, 150, 210]);
  assert.deepEqual(anchors.map((anchor) => [anchor.clipId, anchor.timelineInTicks]), [['C03', 210], ['C01', 0], ['C02', 150]]);
  const durations = { A01: 300, A02: 300, A03: 300 };
  assert.deepEqual(validateEditDecision(decision, durations), decision);
  assert.deepEqual(validateSchemaInstance(schema('edit_decision'), decision), []);
  for (const clip of decision.clips) assert.equal(clip.anchor, undefined);
  assert.equal(decision.speech, undefined);
});

test('a re-transcribed delivery moves the cut once the coverage follows', () => {
  const realigned = structuredClone(semanticDecision);
  // The speaker pauses longer before the answer: W4 shifts 150 -> 180, so the covering
  // clip C01 must be re-cut to 180 ticks; C02 then lands on the moved word.
  realigned.speech = {
    language: 'zh',
    words: speech.words.map((word) => word.id === 'W4'
      ? { ...word, startTicks: 150, endTicks: 180 }
      : (word.id === 'W5' || word.id === 'W6')
        ? { ...word, startTicks: word.startTicks + 30, endTicks: word.endTicks + 30 }
        : word),
  };
  realigned.clips = realigned.clips.map((clip) => clip.id === 'C01'
    ? { ...clip, sourceOutTicks: 180 }
    : clip);
  const second = resolveEditDecision(realigned).decision;
  assert.deepEqual(second.clips.map((clip) => [clip.id, clip.timelineInTicks]), [['C01', 0], ['C02', 180], ['C03', 240]]);
  assert.deepEqual(validateEditDecision(second, { A01: 300, A02: 300, A03: 300 }), second);
});

test('quote binds the edit hash to the resolved cut, not the anchor wording', () => {
  const plan = (decision) => ({
    schemaVersion: '1.0.0', id: 'P01', mode: 'local_composition', round: 1,
    editDecision: decision,
    assets: [{ id: 'A01', path: 'a.png', sha256: 'a'.repeat(64), kind: 'image', durationTicks: 300, source: 'test', authorizedAt: '2026-09-16T00:00:00Z' }],
    output: { aspect: '16:9', width: 1920, height: 1080, fps: 30, requireAudio: false },
  });
  const literal = resolveEditDecision(semanticDecision).decision;
  const fromSemantic = quotePlan(plan(semanticDecision), 'rough', 1);
  const fromLiteral = quotePlan(plan(literal), 'rough', 1);
  assert.equal(fromSemantic.editHash, fromLiteral.editHash);
  assert.equal(fromSemantic.totalSeconds, fromLiteral.totalSeconds);
});

test('semantic declarations are validated before resolution', () => {
  const missingWord = structuredClone(semanticDecision);
  missingWord.moments = [{ id: 'answer', wordId: 'W99', affinity: 'end' }];
  assert.throws(() => resolveEditDecision(missingWord), /unknown word/);

  const unsorted = structuredClone(semanticDecision);
  unsorted.speech = { language: 'zh', words: [speech.words[1], speech.words[0]] };
  assert.throws(() => resolveEditDecision(unsorted), /sorted and non-overlapping/);

  const duplicate = structuredClone(semanticDecision);
  duplicate.moments = [duplicate.moments[0], { id: 'answer', wordId: 'W1', affinity: 'start' }];
  assert.throws(() => resolveEditDecision(duplicate), /duplicate moment id/);

  const unknownMoment = structuredClone(semanticDecision);
  unknownMoment.clips[0].anchor = { at: 'moment:missing' };
  assert.throws(() => resolveEditDecision(unknownMoment), /unknown moment/);

  const noSpeech = structuredClone(semanticDecision);
  delete noSpeech.speech;
  assert.throws(() => resolveEditDecision(noSpeech), /require speech/);
});

test('v1 decisions pass through resolution untouched and anchored revisions stay revisable', () => {
  const literal = { ...semanticDecision, schemaVersion: '1.0.0' };
  delete literal.speech;
  delete literal.moments;
  delete literal.selections;
  literal.clips = [
    { id: 'C01', assetId: 'A01', sourceInTicks: 0, sourceOutTicks: 150, timelineInTicks: 0, track: 0, transition: 'cut', gainDb: 0 },
    { id: 'C02', assetId: 'A02', sourceInTicks: 0, sourceOutTicks: 60, timelineInTicks: 150, track: 0, transition: 'cut', gainDb: 0 },
  ];
  const passthrough = resolveEditDecision(literal);
  assert.equal(passthrough.resolved, false);
  assert.equal(passthrough.decision, literal);
  assert.deepEqual(passthrough.anchors, []);

  const revised = reviseEditDecision(semanticDecision, [{ op: 'update', id: 'C02', patch: { anchor: { at: 'tick:150' } } }]);
  assert.equal(revised.decision.revision, 2);
  const resolved = resolveEditDecision(revised.decision);
  assert.deepEqual(resolved.decision.clips.map((clip) => [clip.id, clip.timelineInTicks]), [['C01', 0], ['C02', 150], ['C03', 210]]);
});

test('semantic schema variants stay closed Draft 2020-12 documents', () => {
  assertSupportedSchema(schema('edit_decision'));
});
