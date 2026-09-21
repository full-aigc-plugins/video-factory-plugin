// Round-snapshot, gap-fingerprint, regression, and stagnation detection for the
// revision-loop-discipline change (2026-09-21-add-revision-loop-discipline).
//
// Design constraints (from the change's design.md):
// - Backward compatible: ledgers without a snapshots[] field are treated as round 1.
// - Gap fingerprints use only the controlled dimension enum, never free text.
// - Regression is only reported when both rounds carry a total score.
// - Stagnation is advisory: it never advances job state, never auto-retries, and
//   always converges on a human decision.
// - Snapshots store summaries only (score, gate digest, gap fingerprints), not full
//   gate lists or review prose, to keep the ledger small.

import { createHash } from 'node:crypto';

// Sentinel for "no score available" — the rubric minimum is 0, so -1 is unambiguous.
export const NO_SCORE = -1;

// Controlled gap dimensions — the same four used by the semantic-evidence rubric.
export const GAP_DIMENSIONS = ['composition', 'lighting', 'materials', 'details'];

const DEFAULT_STAGNATION_ROUNDS = 2;
const DEFAULT_IMPROVEMENT_THRESHOLD = 1.0;

// Deterministic gap fingerprint from (dimension, frame) pairs only.
// Free-text issue/fix strings are deliberately excluded so a re-worded gap is
// still recognised as the same gap across rounds.
export function gapFingerprint(gaps = []) {
  const canonical = gaps
    .map((gap) => `${gap.dimension ?? ''}:${gap.frame ?? ''}`)
    .sort()
    .join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

// Gate digest: which advisory gates failed, in a stable order.
export function gateDigest(gates = []) {
  return gates
    .filter((gate) => gate.status === 'FAIL')
    .map((gate) => gate.id)
    .sort()
    .join(',');
}

// Append a round snapshot to the ledger's snapshots[] array.
// Returns the updated ledger (does not mutate the input).
export function recordRoundSnapshot(job, { totalScore, gates, gaps } = {}) {
  const snapshots = Array.isArray(job.snapshots) ? [...job.snapshots] : [];
  snapshots.push({
    round: job.round ?? snapshots.length + 1,
    revision: job.revision ?? 1,
    decision: job.scores?.decision ?? 'unlabeled',
    totalScore: typeof totalScore === 'number' ? totalScore : NO_SCORE,
    gateDigest: gateDigest(gates ?? job.scores?.gates ?? []),
    gapFingerprint: gapFingerprint(gaps),
    at: new Date().toISOString(),
  });
  return { ...job, snapshots };
}

// Detect regression: current total < previous total (only when both rounds carry a real score).
export function detectRegression(snapshots = []) {
  if (snapshots.length < 2) return { regressed: false, current: null, previous: null };
  const current = snapshots[snapshots.length - 1];
  const previous = snapshots[snapshots.length - 2];
  const hasCurrent = typeof current.totalScore === 'number' && current.totalScore !== NO_SCORE;
  const hasPrevious = typeof previous.totalScore === 'number' && previous.totalScore !== NO_SCORE;
  if (!hasCurrent || !hasPrevious) {
    return { regressed: false, current: null, previous: null };
  }
  return {
    regressed: current.totalScore < previous.totalScore,
    current: current.totalScore,
    previous: previous.totalScore,
  };
}

// Detect stagnation with two conditions (design.md decision 4):
//   (a) best score has not improved by >= threshold within the last N rounds
//   (b) the same gap fingerprint has appeared N times consecutively
// Returns { stagnated, reason, bestScore, roundsSinceImprovement, gapStreak }.
export function detectStagnation(snapshots = [], {
  rounds = DEFAULT_STAGNATION_ROUNDS,
  improvementThreshold = DEFAULT_IMPROVEMENT_THRESHOLD,
} = {}) {
  if (snapshots.length < rounds) return { stagnated: false };

  // Condition (a): best score improvement stall.
  const scored = snapshots.filter((snap) => typeof snap.totalScore === 'number' && snap.totalScore !== NO_SCORE);
  let roundsSinceImprovement = 0;
  let bestScore = scored.length ? scored[0].totalScore : null;
  if (scored.length >= 2) {
    let reference = scored[0].totalScore;
    for (let i = 1; i < scored.length; i += 1) {
      if (scored[i].totalScore > reference + improvementThreshold - 1e-9) {
        reference = scored[i].totalScore;
        roundsSinceImprovement = 0;
      } else {
        roundsSinceImprovement += 1;
      }
      if (scored[i].totalScore > bestScore) bestScore = scored[i].totalScore;
    }
  }
  const scoreStalled = roundsSinceImprovement >= rounds;

  // Condition (b): same gap fingerprint streak.
  let gapStreak = 1;
  for (let i = snapshots.length - 2; i >= 0; i -= 1) {
    if (snapshots[i].gapFingerprint === snapshots[snapshots.length - 1].gapFingerprint
        && snapshots[i].gapFingerprint !== '') {
      gapStreak += 1;
    } else break;
  }
  const gapStagnated = gapStreak >= rounds;

  const stagnated = scoreStalled || gapStagnated;
  return {
    stagnated,
    reason: stagnated
      ? (scoreStalled
        ? `best score has not improved by ${improvementThreshold} in ${rounds} rounds`
        : `the same gap fingerprint has appeared ${gapStreak} rounds in a row`)
      : null,
    bestScore,
    roundsSinceImprovement: scoreStalled ? roundsSinceImprovement : 0,
    gapStreak: gapStagnated ? gapStreak : 0,
  };
}

// Compose the full round analysis: regression + stagnation in one call.
// Pure function; does not mutate the ledger.
export function analyzeRounds(job, options = {}) {
  const snapshots = Array.isArray(job.snapshots) ? job.snapshots : [];
  const regression = detectRegression(snapshots);
  const stagnation = detectStagnation(snapshots, options);
  return { snapshots, regression, stagnation };
}
