import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GAP_DIMENSIONS,
  gapFingerprint,
  gateDigest,
  recordRoundSnapshot,
  detectRegression,
  detectStagnation,
  analyzeRounds,
} from '../src/round-snapshot.mjs';

const snap = (overrides = {}) => ({
  round: 1, revision: 1, decision: 'review',
  totalScore: null, gateDigest: '', gapFingerprint: '', at: '2026-09-22T00:00:00Z',
  ...overrides,
});

test('gapFingerprint is deterministic and ignores free-text rewording', () => {
  const gapsA = [
    { dimension: 'lighting', frame: 'S01a', issue: 'too dark', fix: 'add light' },
    { dimension: 'composition', frame: 'target', issue: 'off-center', fix: 'reframe' },
  ];
  const gapsB = [
    { dimension: 'composition', frame: 'target', issue: 'completely different wording', fix: 'different fix' },
    { dimension: 'lighting', frame: 'S01a', issue: 'underexposed', fix: 'increase exposure' },
  ];
  assert.equal(gapFingerprint(gapsA), gapFingerprint(gapsB));
  assert.notEqual(gapFingerprint(gapsA), gapFingerprint([{ dimension: 'materials', frame: 'S01b' }]));
});

test('gapFingerprint only uses controlled dimensions', () => {
  assert.deepEqual(GAP_DIMENSIONS, ['composition', 'lighting', 'materials', 'details']);
  const fp = gapFingerprint([{ dimension: 'lighting', frame: 'S01a' }]);
  assert.match(fp, /^[a-f0-9]{16}$/);
});

test('gateDigest captures only FAIL gates in stable order', () => {
  const gates = [
    { id: 'rhythm', status: 'FAIL' },
    { id: 'blackFrames', status: 'PASS' },
    { id: 'avSync', status: 'FAIL' },
    { id: 'silence', status: 'SKIPPED' },
  ];
  assert.equal(gateDigest(gates), 'avSync,rhythm');
});

test('recordRoundSnapshot appends without mutating input', () => {
  const job = { revision: 3, round: 1, scores: { decision: 'review', gates: [] } };
  const updated = recordRoundSnapshot(job, { gates: [], gaps: [] });
  assert.equal(job.snapshots, undefined);
  assert.equal(updated.snapshots.length, 1);
  assert.equal(updated.snapshots[0].revision, 3);
  assert.equal(updated.snapshots[0].round, 1);
});

test('detectRegression fires only when both rounds have scores and current < previous', () => {
  const none = detectRegression([snap(), snap()]);
  assert.equal(none.regressed, false);
  assert.equal(none.current, null);
  assert.equal(none.previous, null);
  const up = detectRegression([snap({ totalScore: 7 }), snap({ totalScore: 8 })]);
  assert.equal(up.regressed, false);
  const r = detectRegression([snap({ totalScore: 8 }), snap({ totalScore: 6.5 })]);
  assert.equal(r.regressed, true);
  assert.equal(r.previous, 8);
  assert.equal(r.current, 6.5);
});

test('detectStagnation fires when best score has not improved in 2 rounds', () => {
  const snaps = [snap({ totalScore: 5 }), snap({ totalScore: 5.5 }), snap({ totalScore: 5.8 })];
  const result = detectStagnation(snaps, { rounds: 2, improvementThreshold: 1.0 });
  assert.equal(result.stagnated, true);
  assert.match(result.reason, /has not improved by 1/);
});

test('detectStagnation fires when same gap fingerprint appears 2 rounds consecutively', () => {
  const fp = gapFingerprint([{ dimension: 'lighting', frame: 'S01a' }]);
  const snaps = [snap({ gapFingerprint: fp }), snap({ gapFingerprint: fp })];
  const result = detectStagnation(snaps, { rounds: 2 });
  assert.equal(result.stagnated, true);
  assert.match(result.reason, /same gap fingerprint/);
});

test('detectStagnation does not fire within threshold', () => {
  const snaps = [snap({ totalScore: 5 }), snap({ totalScore: 7 })];
  assert.equal(detectStagnation(snaps, { rounds: 2 }).stagnated, false);
});

test('detectStagnation is backward compatible with no snapshots', () => {
  assert.equal(detectStagnation([]).stagnated, false);
  assert.equal(detectStagnation([snap()]).stagnated, false);
});

test('analyzeRounds composes regression and stagnation', () => {
  const fp = gapFingerprint([{ dimension: 'details', frame: 'S01b' }]);
  const job = {
    round: 3, revision: 5,
    scores: { decision: 'review', gates: [{ id: 'rhythm', status: 'FAIL' }] },
    snapshots: [
      snap({ totalScore: 8, gapFingerprint: fp }),
      snap({ totalScore: 6, gapFingerprint: fp }),
    ],
  };
  const result = analyzeRounds(job);
  assert.equal(result.regression.regressed, true);
  assert.equal(result.stagnation.stagnated, true);
  assert.equal(result.stagnation.gapStreak >= 2, true);
});
