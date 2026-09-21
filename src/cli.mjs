import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { quotePlan } from './approval.mjs';
import { resolveEditDecision, analyzeEditPolicy } from './edit-decision.mjs';
import { collectMedia, verifyReceipt } from './media-collector.mjs';
import { analyzeMedia } from './media-analysis.mjs';
import { evaluateMedia, REQUIRED_GATE_IDS, ADVISORY_GATE_IDS } from './media-evaluator.mjs';
import { acceptJob, recoverySummary, runApproved } from './orchestrator.mjs';
import { canonicalHash, validateVideoPlan } from './plan.mjs';
import { probeCapabilities } from './probe.mjs';
import { readLedger } from './job-ledger.mjs';
import { effectiveAssemblyDuration, outputProfile } from './ffmpeg-compiler.mjs';
import { assertReviewInput, runAnalyzeEvidence, runFinalizeAnalysis, runReviewSync } from './integrations/reelbench-adapter.mjs';

const HELP = `video-factory — automatic editing and verified video composition

Commands:
  probe
  analyze <video>
  analyze-finalize <shots.json> --track <track.json> --frames <frames-dir>
  validate-plan <plan.json>
  quote <plan.json> --stage rough|final
  run <plan.json> --stage rough|final --approval <approval.json>
  review-sync <rough-cut> <shots.json>
  status <ledger.json>
  evaluate <artifact> <plan.json> [--stage rough|final] [--ledger <job.json>] [--skip-detectors]
  accept <ledger.json> --decision approved|rejected [--note text]
  recover <ledger.json>
`;

const flag = (argv, name, fallback = null) => {
  const index = argv.indexOf(name);
  return index < 0 ? fallback : argv[index + 1] ?? true;
};
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// Provenance is only establishable from the job ledger: it asserts that the artifact under
// evaluation is the recorded one and that every segment receipt still verifies. Without a
// ledger the gate stays absent so the evaluator reports NOT_RUN instead of a false FAIL.
const resolveProvenance = async (ledgerPath, artifactPath, plan, clipCount) => {
  if (!ledgerPath) return {};
  const job = readLedger(String(ledgerPath));
  if (!job.artifact) throw new Error('ledger records no artifact; provenance cannot be verified');
  if (job.planHash !== canonicalHash(plan)) throw new Error('ledger does not match the evaluated plan');
  const collected = await collectMedia(artifactPath);
  const checks = await Promise.all(job.segments.map((segment) => (segment.receipt ? verifyReceipt(segment.receipt) : { ok: false })));
  const artifactCheck = await verifyReceipt(job.artifact);
  const matchesRecordedArtifact = collected.sha256 === job.artifact.sha256 && collected.bytes === job.artifact.bytes;
  const complete = job.segments.length === clipCount && job.segments.every((segment) => typeof segment.receipt?.descriptorKey === 'string');
  return { provenanceOk: artifactCheck.ok && matchesRecordedArtifact && complete && checks.every((check) => check.ok) };
};

export async function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  const [command] = argv;
  if (!command || command === '--help' || command === '-h') {
    io.stdout.write(HELP);
    return 0;
  }
  try {
    if (command === 'probe') { io.stdout.write(`${JSON.stringify(probeCapabilities(), null, 2)}\n`); return 0; }
    if (command === 'validate-plan') {
      const plan = validateVideoPlan(readJson(argv[1]));
      io.stdout.write(`${JSON.stringify({ valid: true, planHash: canonicalHash(plan) }, null, 2)}\n`); return 0;
    }
    if (command === 'quote') {
      const plan = validateVideoPlan(readJson(argv[1]));
      io.stdout.write(`${JSON.stringify(quotePlan(plan, flag(argv, '--stage', 'rough'), 1), null, 2)}\n`); return 0;
    }
    if (command === 'analyze') {
      const out = resolve(String(flag(argv, '--out', 'reelbench-analysis')));
      io.stdout.write(`${JSON.stringify(runAnalyzeEvidence(argv[1], out), null, 2)}\n`); return 0;
    }
    if (command === 'analyze-finalize') {
      const shotsPath = resolve(argv[1]);
      const outputDir = resolve(String(flag(argv, '--out', dirname(shotsPath))));
      const result = runFinalizeAnalysis({
        shotsPath,
        trackPath: resolve(String(flag(argv, '--track', `${outputDir}/track.json`))),
        framesPath: resolve(String(flag(argv, '--frames', `${outputDir}/frames`))),
        outputDir,
        video: flag(argv, '--video'),
      });
      io.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return 0;
    }
    if (command === 'review-sync') {
      assertReviewInput(await collectMedia(argv[1], { provenanceOk: true }));
      const output = resolve(String(flag(argv, '-o', 'review-sync.mp4')));
      const panels = resolve(String(flag(argv, '--panels', 'review-panels')));
      const evidenceDir = resolve(String(flag(argv, '--evidence', `${output}.evidence`)));
      const result = await runReviewSync({ video: argv[1], shotsPath: argv[2], output, panels, evidenceDir });
      io.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return 0;
    }
    if (command === 'run') {
      const planPath = resolve(argv[1]);
      const root = dirname(planPath);
      const result = await runApproved({ planPath, approvalPath: resolve(String(flag(argv, '--approval'))), ledgerPath: resolve(String(flag(argv, '--ledger', `${planPath}.job.json`))), inputRoot: resolve(String(flag(argv, '--input-root', root))), workRoot: resolve(String(flag(argv, '--work-root', `${root}/.video-work`))), outputRoot: resolve(String(flag(argv, '--output-root', `${root}/output`))), stage: String(flag(argv, '--stage', 'rough')) });
      io.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return 0;
    }
    if (command === 'status' || command === 'recover') {
      const job = readLedger(argv[1]);
      io.stdout.write(`${JSON.stringify(command === 'status' ? job : recoverySummary(job), null, 2)}\n`); return 0;
    }
    if (command === 'accept') {
      const ledgerPath = resolve(argv[1]);
      const updated = await acceptJob({ ledgerPath, decision: String(flag(argv, '--decision')), note: String(flag(argv, '--note', '')) });
      io.stdout.write(`${JSON.stringify(updated, null, 2)}\n`); return 0;
    }
    if (command === 'evaluate') {
      const plan = validateVideoPlan(readJson(argv[2]));
      const artifactPath = resolve(argv[1]);
      const edit = resolveEditDecision(plan.editDecision).decision;
      const secondsPerTick = plan.editDecision.timebase.numerator / plan.editDecision.timebase.denominator;
      const durations = edit.clips.map((clip) => (clip.sourceOutTicks - clip.sourceInTicks) * secondsPerTick);
      const transitions = edit.clips.map((clip) => clip.transition);
      const stage = String(flag(argv, '--stage', 'final'));
      const durationSeconds = effectiveAssemblyDuration(durations, transitions);
      const expected = { ...outputProfile(stage, plan.output), durationSeconds, requireAudio: plan.output.requireAudio };
      const receipt = await collectMedia(artifactPath);
      const detectorsSkipped = argv.includes('--skip-detectors');
      const evidence = detectorsSkipped
        ? Object.fromEntries(['blackFrames', 'freezeFrames', 'silence', 'subtitleTiming', 'avSync'].map((id) => [id, 'SKIPPED']))
        : analyzeMedia(artifactPath, {
          durationSeconds,
          hasAudio: receipt.hasAudio,
          videoStartSeconds: receipt.videoStartSeconds,
          audioStartSeconds: receipt.audioStartSeconds,
          subtitlePath: null,
        });
      Object.assign(evidence, analyzeEditPolicy(plan.editDecision));
      const scores = evaluateMedia({ output: expected }, {
        ...receipt,
        // Derived from the plan, not asserted by the caller, so it holds even without a ledger.
        timelineOk: Math.abs(receipt.durationSeconds - durationSeconds) <= 0.15,
        ...await resolveProvenance(flag(argv, '--ledger', ''), artifactPath, plan, edit.clips.length),
      }, evidence, 'unlabeled', { detectorsSkipped });
      io.stdout.write(`${JSON.stringify(scores, null, 2)}\n`);
      const notRun = scores.gates.filter((item) => item.status === 'NOT_RUN');
      for (const gate of notRun.filter((item) => REQUIRED_GATE_IDS.includes(item.id))) {
        io.stderr.write(`unverified required gate "${gate.id}": ${
          gate.id === 'provenance'
            ? 'pass --ledger <job.json> from the approved run to verify segment receipts and artifact identity'
            : 'no evidence producer for this invocation'}. The decision is capped at review.\n`);
      }
      const advisory = notRun.filter((item) => ADVISORY_GATE_IDS.includes(item.id)).map((item) => item.id);
      if (advisory.length) io.stderr.write(`advisory gates without evidence: ${advisory.join(', ')} (advisory only; they do not cap the decision)\n`);
      return 0;
    }
    if (command === 'episode-slice') {
      // words timeline (volcengine bigmodel ASR, one JSON per line) → keep segments + SRT + cutlist.
      const { parseWordsFile, buildCutPlan, writeEpisodeArtifacts } = await import('./slicing.mjs');
      const words = parseWordsFile(readFileSync(resolve(argv[1]), 'utf8'));
      const mediaPath = flag(argv, '--media', null);
      const plan = buildCutPlan(words, {
        silenceGapMs: Number(flag(argv, '--silence-gap-ms', 400)),
        minSegmentMs: Number(flag(argv, '--min-segment-ms', 800)),
        maxSegmentMs: Number(flag(argv, '--max-segment-ms', 30_000)),
      });
      const artifacts = writeEpisodeArtifacts(resolve(flag(argv, '--out-dir', '.')), plan, { mediaPath });
      io.stdout.write(`${JSON.stringify({ summary: plan.summary, ...artifacts }, null, 2)}\n`); return 0;
    }
    if (command === 'episode-roughcut') {
      // media + cutlist.json → one rough-cut MP4 (ffmpeg concat, copy-first).
      const { roughCut } = await import('./rough-cut.mjs');
      const cutlist = readJson(argv[1]);
      const segments = cutlist.segments.map((s) => ({ startUs: s.startUs, endUs: s.endUs, durationUs: s.durationUs }));
      const output = flag(argv, '--output', 'rough-cut.mp4');
      const result = roughCut(cutlist.media ?? flag(argv, '--media'), segments, resolve(output), io);
      io.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return 0;
    }
    io.stderr.write(`Unknown command: ${command}\n`); return 2;
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return /only local_composition/.test(error.message) ? 3 : /approval/.test(error.message) ? 4 : 1;
  }
}
