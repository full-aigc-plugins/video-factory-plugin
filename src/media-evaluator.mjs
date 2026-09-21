const gate = (id, ok) => ({ id, status: ok ? 'PASS' : 'FAIL' });
// Three-state gate for evidence the caller may be unable to verify. Absent is NOT_RUN
// ("could not check"), which is a different fact from FAIL ("checked and inconsistent").
const flagGate = (id, value) => ({ id, status: value === undefined ? 'NOT_RUN' : value === true ? 'PASS' : 'FAIL' });

// Exported so callers can tell an unverified REQUIRED gate (which caps the decision at review)
// from an unverified ADVISORY gate (which does not).
export const REQUIRED_GATE_IDS = ['file', 'hash', 'decode', 'videoStream', 'duration', 'dimensions', 'fps', 'audio', 'timeline', 'provenance', 'container', 'videoCodec', 'pixelFormat', 'audioFormat'];
export const ADVISORY_GATE_IDS = ['blackFrames', 'freezeFrames', 'silence', 'subtitleTiming', 'avSync', 'duplicateShots', 'rhythm', 'semanticConsistency'];

export function evaluateMedia(plan, receipt, evidence = {}, humanLabel = 'unlabeled', { detectorsSkipped = false } = {}) {
  const expected = plan.output;
  const required = [
    gate('file', receipt.exists === true),
    gate('hash', receipt.hashVerified === true),
    gate('decode', receipt.decodeOk === true),
    gate('videoStream', receipt.width > 0 && receipt.height > 0),
    gate('duration', Math.abs(receipt.durationSeconds - expected.durationSeconds) <= 0.15),
    gate('dimensions', receipt.width === expected.width && receipt.height === expected.height),
    gate('fps', Math.abs(receipt.fps - expected.fps) <= 0.01),
    gate('audio', !expected.requireAudio || receipt.hasAudio === true),
    flagGate('timeline', receipt.timelineOk),
    flagGate('provenance', receipt.provenanceOk),
    gate('container', String(receipt.container).split(',').includes('mp4')),
    gate('videoCodec', receipt.videoCodec === 'h264'),
    gate('pixelFormat', receipt.pixelFormat === 'yuv420p'),
    gate('audioFormat', !expected.requireAudio || (receipt.audioCodec === 'aac' && receipt.audioSampleRate === 48000)),
  ];
  const advisory = ADVISORY_GATE_IDS.map((id) => ({ id, status: evidence[id] ?? 'NOT_RUN' }));
  const failedRequired = required.filter((item) => item.status === 'FAIL').map((item) => item.id);
  const unverifiedRequired = required.filter((item) => item.status === 'NOT_RUN').length;
  // A pass asserts that every check that could be performed was performed and succeeded.
  const decision = failedRequired.length || humanLabel === 'rejected' ? 'fail'
    : humanLabel === 'approved' && unverifiedRequired === 0 && !detectorsSkipped && advisory.every((item) => item.status !== 'FAIL') ? 'pass' : 'review';
  return { schemaVersion: '1.0.0', decision, failedRequired, gates: [...required, ...advisory], humanLabel };
}
