import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { verifyApproval, quotePlan } from './approval.mjs';
import { assembleVideo } from './assembler.mjs';
import { analyzeEditPolicy, resolveEditDecision, validateEditDecision } from './edit-decision.mjs';
import { effectiveAssemblyDuration, outputProfile, segmentKey } from './ffmpeg-compiler.mjs';
import { renderFinal } from './final-renderer.mjs';
import { failSegment, markSegment, newJob, pendingSegments, readLedger, recordHumanDecision, transition, writeLedger } from './job-ledger.mjs';
import { recordRoundSnapshot, analyzeRounds } from './round-snapshot.mjs';
import { evaluateMedia } from './media-evaluator.mjs';
import { analyzeMedia } from './media-analysis.mjs';
import { findMissingAssetRequirements, registerAssets, writeAssetRequirements } from './paths.mjs';
import { canonicalHash, validateVideoPlan } from './plan.mjs';
import { probeCapabilities } from './probe.mjs';
import { renderSegment } from './segment-renderer.mjs';
import { collectMedia, verifyReceipt } from './media-collector.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

export function recoverySummary(job) {
  const pending = (job.segments ?? []).filter((item) => item.state === 'Pending').map((item) => item.id);
  const failed = (job.segments ?? []).filter((item) => item.state === 'Failed').map((item) => item.id);
  return { state: job.state, pending, failed, nextAction: failed.length ? 'new_round_required' : pending.length ? 'resume_pending' : 'continue_state_machine' };
}

export async function acceptJob({ ledgerPath, decision, note = '' }) {
  const job = readLedger(ledgerPath);
  if (!job.artifact) throw new Error('artifact verification requires a recorded receipt');
  const receiptCheck = await verifyReceipt(job.artifact);
  if (!receiptCheck.ok) throw new Error(`artifact verification failed: ${receiptCheck.reason}`);
  const fresh = await collectMedia(job.artifact.path, { provenanceOk: job.artifact.provenanceOk, timelineOk: job.artifact.timelineOk });
  if (fresh.sha256 !== job.artifact.sha256 || fresh.bytes !== job.artifact.bytes || !fresh.decodeOk) throw new Error('artifact verification failed after decode');
  // Record a round snapshot before the human decision so cross-round regression and
  // stagnation analysis can compare completed rounds. Advisory only — never advances state.
  // totalScore is null here because the numeric rubric score lives in the host-agent
  // semantic-evidence file, not in the ledger; regression/stagnation degrade to gate-digest
  // comparison when totalScore is absent (design.md decision 3).
  const withSnapshot = recordRoundSnapshot(job, {
    gates: job.scores?.gates ?? [],
    gaps: [],
  });
  const updated = recordHumanDecision(withSnapshot, decision, note);
  updated.review = { ...updated.review, verifiedSha256: fresh.sha256, verifiedAt: new Date().toISOString() };
  writeLedger(ledgerPath, updated);
  return updated;
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
  const edit = resolveEditDecision(plan.editDecision).decision;
  validateEditDecision(edit, durations);
  mkdirSync(outputRoot, { recursive: true });
  let job = existsSync(ledgerPath) ? readLedger(ledgerPath) : newJob({ id: plan.id, planHash: quote.planHash, stage, shotIds: edit.clips.map((clip) => clip.id) });
  if (job.planHash !== quote.planHash || job.stage !== stage) throw new Error('ledger does not match approved plan');
  if (job.segments.some((segment) => segment.state === 'Failed')) throw new Error('failed segment requires a new round');
  if (['AwaitingApproval', 'Partial', 'Blocked', 'Collecting', 'Verifying'].includes(job.state)) job = transition(job, 'Running', 'approved execution or checkpoint recovery');
  writeLedger(ledgerPath, job);
  const profile = outputProfile(stage, plan.output);
  const secondsPerTick = plan.editDecision.timebase.numerator / plan.editDecision.timebase.denominator;
  for (const clip of edit.clips) {
    if (!pendingSegments(job).includes(clip.id)) continue;
    const asset = assets[clip.assetId];
    const descriptor = { rendererVersion: 1, id: clip.id, kind: asset.kind, assetHash: asset.sha256, timebase: plan.editDecision.timebase, sourceInTicks: clip.sourceInTicks, sourceOutTicks: clip.sourceOutTicks, sourceInSeconds: clip.sourceInTicks * secondsPerTick, durationSeconds: (clip.sourceOutTicks - clip.sourceInTicks) * secondsPerTick, motion: clip.motion ?? 'static', transition: clip.transition, gainDb: clip.gainDb, profile };
    const descriptorKey = segmentKey(descriptor);
    const destination = join(workRoot, 'segments', `${clip.id}-${descriptorKey}.mp4`);
    try {
      const outcome = await renderSegment({ source: { id: clip.id, kind: asset.kind, path: asset.path, sourceInSeconds: clip.sourceInTicks * secondsPerTick, durationSeconds: (clip.sourceOutTicks - clip.sourceInTicks) * secondsPerTick, motion: clip.motion ?? 'static', transition: clip.transition }, profile, destination, descriptorKey });
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
  try {
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
    const segmentChecks = await Promise.all(job.segments.map((segment) => verifyReceipt(segment.receipt)));
    receipt = {
      ...receipt,
      provenanceOk: segmentChecks.every((check) => check.ok) && job.segments.every((segment) => typeof segment.receipt.descriptorKey === 'string') && Object.keys(assets).length === plan.assets.length,
      timelineOk: Math.abs(receipt.durationSeconds - durationSeconds) <= 0.15,
    };
    job = transition(job, 'Verifying', 'assembled artifact');
    job = { ...job, revision: job.revision + 1, artifact: receipt };
    writeLedger(ledgerPath, job);
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
  } catch (error) {
    if (['Collecting', 'Verifying'].includes(job.state)) {
      job = transition(job, 'Blocked', `recoverable ${job.state.toLowerCase()} failure: ${String(error.message).slice(0, 500)}`);
      writeLedger(ledgerPath, job);
    }
    throw error;
  }
}
