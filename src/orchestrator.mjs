import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { verifyApproval, quotePlan } from './approval.mjs';
import { assembleVideo } from './assembler.mjs';
import { analyzeEditPolicy, validateEditDecision } from './edit-decision.mjs';
import { effectiveAssemblyDuration, outputProfile, segmentKey } from './ffmpeg-compiler.mjs';
import { renderFinal } from './final-renderer.mjs';
import { failSegment, markSegment, newJob, pendingSegments, readLedger, transition, writeLedger } from './job-ledger.mjs';
import { evaluateMedia } from './media-evaluator.mjs';
import { analyzeMedia } from './media-analysis.mjs';
import { findMissingAssetRequirements, registerAssets, writeAssetRequirements } from './paths.mjs';
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
  mkdirSync(workRoot, { recursive: true });
  const requirements = findMissingAssetRequirements(plan.assets, inputRoot);
  if (requirements.length) {
    const requirementsPath = writeAssetRequirements(join(workRoot, 'asset-requirements.json'), requirements);
    throw new Error(`missing assets; requirements written to ${requirementsPath}`);
  }
  const assets = await registerAssets(plan.assets, inputRoot);
  const durations = Object.fromEntries(plan.assets.map((asset) => [asset.id, asset.durationTicks ?? Number.MAX_SAFE_INTEGER]));
  validateEditDecision(plan.editDecision, durations);
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
    try {
      const outcome = await renderSegment({ source: { id: clip.id, kind: asset.kind, path: asset.path, sourceInSeconds: clip.sourceInTicks * secondsPerTick, durationSeconds: (clip.sourceOutTicks - clip.sourceInTicks) * secondsPerTick, motion: clip.motion ?? 'static', transition: clip.transition }, profile, destination });
      job = markSegment(job, clip.id, outcome.receipt, { attempts: outcome.attempts, reused: outcome.reused });
      writeLedger(ledgerPath, job);
    } catch (error) {
      job = failSegment(job, clip.id, error);
      job = transition(job, 'Partial', 'segment failed; automatic retry disabled');
      writeLedger(ledgerPath, job);
      throw error;
    }
  }
  job = transition(job, 'Collecting', 'all segments rendered');
  writeLedger(ledgerPath, job);
  const segmentPaths = plan.editDecision.clips.map((clip) => job.segments.find((segment) => segment.id === clip.id).receipt.path);
  const artifactPath = join(outputRoot, `${basename(plan.id)}-${stage}-${canonicalHash(plan).slice(0, 12)}.mp4`);
  const clipDurations = plan.editDecision.clips.map((clip) => (clip.sourceOutTicks - clip.sourceInTicks) * secondsPerTick);
  const transitions = plan.editDecision.clips.map((clip) => clip.transition);
  const durationSeconds = effectiveAssemblyDuration(clipDurations, transitions);
  const needsMastering = stage === 'final' && (plan.output.audioAssetId || plan.output.audioTracks?.length || plan.output.subtitleAssetId || plan.output.watermarkAssetId || plan.output.title);
  const assemblyPath = needsMastering ? join(workRoot, `assembled-${canonicalHash(plan).slice(0, 12)}.mp4`) : artifactPath;
  let receipt = await assembleVideo(segmentPaths, profile, assemblyPath, 120000, { durations: clipDurations, transitions });
  if (needsMastering) {
    receipt = await renderFinal({
      inputVideo: assemblyPath,
      audioPath: plan.output.audioAssetId ? assets[plan.output.audioAssetId].path : null,
      audioTracks: plan.output.audioTracks?.map((track) => ({
        ...track,
        path: assets[track.assetId].path,
        timelineInSeconds: track.timelineInTicks * secondsPerTick,
      })),
      subtitlePath: plan.output.subtitleAssetId ? assets[plan.output.subtitleAssetId].path : null,
      watermarkPath: plan.output.watermarkAssetId ? assets[plan.output.watermarkAssetId].path : null,
      title: plan.output.title,
      profile,
      destination: artifactPath,
      durationSeconds,
    });
  }
  job = transition(job, 'Verifying', 'assembled artifact');
  const evidence = analyzeMedia(receipt.path, {
    durationSeconds,
    hasAudio: receipt.hasAudio,
    videoStartSeconds: receipt.videoStartSeconds,
    audioStartSeconds: receipt.audioStartSeconds,
    subtitlePath: plan.output.subtitleAssetId ? assets[plan.output.subtitleAssetId].path : null,
  });
  Object.assign(evidence, analyzeEditPolicy(plan.editDecision));
  const scores = evaluateMedia({ output: { ...profile, durationSeconds, requireAudio: Boolean(plan.output.requireAudio) } }, receipt, evidence, 'unlabeled');
  job = transition(job, scores.failedRequired.length ? 'Failed' : 'ReviewReady', 'media evaluation complete');
  job = { ...job, revision: job.revision + 1, artifact: receipt, scores };
  writeLedger(ledgerPath, job);
  return { job, receipt, scores, quote };
}
