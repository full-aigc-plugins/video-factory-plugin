import { canonicalHash } from './plan.mjs';
import { editDurationSeconds, resolveEditDecision } from './edit-decision.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSchemaInstance } from './schema-lite.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APPROVAL_SCHEMA = JSON.parse(readFileSync(join(ROOT, 'schemas', 'video_approval.schema.json'), 'utf8'));

export function quotePlan(plan, stage, revision) {
  if (!['rough', 'final'].includes(stage)) throw new Error('stage must be rough or final');
  const edit = resolveEditDecision(plan.editDecision).decision;
  const totalSeconds = editDurationSeconds(edit);
  const outputPixels = plan.output.width * plan.output.height;
  return {
    schemaVersion: '1.0.0',
    stage,
    revision,
    planHash: canonicalHash(plan),
    editHash: canonicalHash(edit),
    round: plan.round,
    clips: edit.clips?.length ?? 0,
    totalSeconds,
    outputPixels,
    estimatedTemporaryBytes: Math.ceil(totalSeconds * outputPixels * plan.output.fps * 0.08),
    remoteInvocations: 0,
    requiresApproval: true,
  };
}

export function verifyApproval(approval, quote) {
  const issues = validateSchemaInstance(APPROVAL_SCHEMA, approval);
  if (issues.length) throw new Error(`${issues[0].path}: ${issues[0].message}`);
  const fields = [['stage', quote.stage], ['planHash', quote.planHash], ['editHash', quote.editHash], ['round', quote.round], ['quoteRevision', quote.revision]];
  if (fields.some(([key, expected]) => approval?.[key] !== expected)) throw new Error('approval mismatch');
}
