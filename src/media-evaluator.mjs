const gate = (id, ok) => ({ id, status: ok ? 'PASS' : 'FAIL' });

export function evaluateMedia(plan, receipt, evidence = {}, humanLabel = 'unlabeled') {
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
    gate('provenance', receipt.provenanceOk === true),
  ];
  const advisory = ['blackFrames', 'freezeFrames', 'silence', 'subtitleTiming', 'semanticConsistency'].map((id) => ({ id, status: evidence[id] ?? 'NOT_RUN' }));
  const failedRequired = required.filter((item) => item.status === 'FAIL').map((item) => item.id);
  const decision = failedRequired.length || humanLabel === 'rejected' ? 'fail'
    : humanLabel === 'approved' && advisory.every((item) => item.status !== 'FAIL') ? 'pass' : 'review';
  return { schemaVersion: '1.0.0', decision, failedRequired, gates: [...required, ...advisory], humanLabel };
}
