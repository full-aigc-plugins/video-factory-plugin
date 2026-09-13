import { canonicalHash } from './plan.mjs';
import { editDurationSeconds } from './edit-decision.mjs';

export function quotePlan(plan, stage, revision) {
  if (!['rough', 'final'].includes(stage)) throw new Error('stage must be rough or final');
  const totalSeconds = editDurationSeconds(plan.editDecision);
  const outputPixels = plan.output.width * plan.output.height;
  return {
    schemaVersion: '1.0.0',
    stage,
    revision,
    planHash: canonicalHash(plan),
    editHash: canonicalHash(plan.editDecision),
    round: plan.round,
    clips: plan.editDecision.clips?.length ?? 0,
    totalSeconds,
    outputPixels,
    estimatedTemporaryBytes: Math.ceil(totalSeconds * outputPixels * plan.output.fps * 0.08),
    remoteInvocations: 0,
    requiresApproval: true,
  };
}

export function verifyApproval(approval, quote) {
  const fields = [['stage', quote.stage], ['planHash', quote.planHash], ['editHash', quote.editHash], ['round', quote.round], ['quoteRevision', quote.revision]];
  if (fields.some(([key, expected]) => approval?.[key] !== expected)) throw new Error('approval mismatch');
}
