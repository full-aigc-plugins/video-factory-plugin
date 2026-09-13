import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { verifyApproval, quotePlan } from './approval.mjs';
import { assembleVideo } from './assembler.mjs';
import { validateEditDecision } from './edit-decision.mjs';
import { outputProfile, segmentKey } from './ffmpeg-compiler.mjs';
import { markSegment, newJob, pendingSegments, readLedger, transition, writeLedger } from './job-ledger.mjs';
import { evaluateMedia } from './media-evaluator.mjs';
import { registerAssets } from './paths.mjs';
import { canonicalHash, validateVideoPlan } from './plan.mjs';
import { probeCapabilities } from './probe.mjs';
import { renderSegment } from './segment-renderer.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

export function recoverySummary(job) {
  const pending = (job.segments ?? []).filter((item) => item.state === 'Pending').map((item) => item.id);
  const failed = (job.segments ?? []).filter((item) => item.state === 'Failed').map((item) => item.id);
  return { state: job.state, pending, failed, nextAction: pending.length ? 'resume_pending' : failed.length ? 'new_round_required' : 'continue_state_machine' };
}

export async function runApproved({ planPath, approvalPath, ledgerPath, inputRoot, workRoot, outputRoot, stage }) {
  const plan = validateVideoPlan(readJson(planPath));
  const approval = readJson(approvalPath);
  const capabilities = probeCapabilities();
  if (!capabilities.available) throw new Error('ffmpeg and ffprobe are required');
  const quote = quotePlan(plan, stage, 1);
  verifyApproval(approval, quote);
  const assets = await registerAssets(plan.assets, inputRoot);
  const durations = Object.fromEntries(plan.assets.map((asset) => [asset.id, asset.durationTicks ?? Number.MAX_SAFE_INTEGER]));
  validateEditDecision(plan.editDecision, durations);
  mkdirSync(workRoot, { recursive: true });
  mkdirSync(outputRoot, { recursive: true });
  let job = existsSync(ledgerPath) ? readLedger(ledgerPath) : newJob({ id: plan.id, planHash: quote.planHash, stage, shotIds: plan.editDecision.clips.map((clip) => clip.id) });
  if (job.planHash !== quote.planHash || job.stage !== stage) throw new Error('ledger does not match approved plan');
  if (job.state === 'AwaitingApproval' || job.state === 'Partial' || job.state === 'Blocked') job = transition(job, 'Running', 'approved execution');
  writeLedger(ledgerPath, job);
  const profile = outputProfile(stage, plan.output);
  const secondsPerTick = plan.editDecision.timebase.numerator / plan.editDecision.timebase.denominator;
  for (const clip of plan.editDecision.clips) {
    if (!pendingSegments(job).includes(clip.id)) continue;
    const asset = assets[clip.assetId];
    const descriptor = { id: clip.id, assetHash: asset.sha256, sourceInTicks: clip.sourceInTicks, sourceOutTicks: clip.sourceOutTicks, profile };
    const destination = join(workRoot, 'segments', `${clip.id}-${segmentKey(descriptor)}.mp4`);
    const outcome = await renderSegment({ source: { id: clip.id, kind: asset.kind, path: asset.path, sourceInSeconds: clip.sourceInTicks * secondsPerTick, durationSeconds: (clip.sourceOutTicks - clip.sourceInTicks) * secondsPerTick, motion: clip.motion ?? 'static' }, profile, destination });
    job = markSegment(job, clip.id, outcome.receipt);
    writeLedger(ledgerPath, job);
  }
  job = transition(job, 'Collecting', 'all segments rendered');
  writeLedger(ledgerPath, job);
  const segmentPaths = plan.editDecision.clips.map((clip) => job.segments.find((segment) => segment.id === clip.id).receipt.path);
  const artifactPath = join(outputRoot, `${basename(plan.id)}-${stage}-${canonicalHash(plan).slice(0, 12)}.mp4`);
  const receipt = await assembleVideo(segmentPaths, profile, artifactPath);
  job = transition(job, 'Verifying', 'assembled artifact');
  const durationSeconds = plan.editDecision.clips.reduce((sum, clip) => sum + (clip.sourceOutTicks - clip.sourceInTicks) * secondsPerTick, 0);
  const scores = evaluateMedia({ output: { ...profile, durationSeconds, requireAudio: Boolean(plan.output.requireAudio) } }, receipt, {}, 'unlabeled');
  job = transition(job, scores.failedRequired.length ? 'Failed' : 'ReviewReady', 'media evaluation complete');
  job = { ...job, revision: job.revision + 1, artifact: receipt, scores };
  writeLedger(ledgerPath, job);
  return { job, receipt, scores, quote };
}
