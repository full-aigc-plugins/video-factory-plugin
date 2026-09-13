import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { quotePlan } from './approval.mjs';
import { collectMedia } from './media-collector.mjs';
import { evaluateMedia } from './media-evaluator.mjs';
import { recoverySummary, runApproved } from './orchestrator.mjs';
import { canonicalHash, validateVideoPlan } from './plan.mjs';
import { probeCapabilities } from './probe.mjs';
import { readLedger, recordHumanDecision, writeLedger } from './job-ledger.mjs';
import { effectiveAssemblyDuration, outputProfile } from './ffmpeg-compiler.mjs';
import { assertReviewInput, runAnalyzeEvidence, runReviewSync } from './integrations/reelbench-adapter.mjs';

const HELP = `video-factory — automatic editing and verified video composition

Commands:
  probe
  analyze <video>
  validate-plan <plan.json>
  quote <plan.json> --stage rough|final
  run <plan.json> --stage rough|final --approval <approval.json>
  review-sync <rough-cut> <shots.json>
  status <ledger.json>
  evaluate <artifact> <plan.json>
  accept <ledger.json> --decision approved|rejected [--note text]
  recover <ledger.json>
`;

const flag = (argv, name, fallback = null) => {
  const index = argv.indexOf(name);
  return index < 0 ? fallback : argv[index + 1] ?? true;
};
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

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
      const updated = recordHumanDecision(readLedger(ledgerPath), String(flag(argv, '--decision')), String(flag(argv, '--note', '')));
      writeLedger(ledgerPath, updated);
      io.stdout.write(`${JSON.stringify(updated, null, 2)}\n`); return 0;
    }
    if (command === 'evaluate') {
      const plan = validateVideoPlan(readJson(argv[2]));
      const receipt = await collectMedia(argv[1], { provenanceOk: true, timelineOk: true });
      const secondsPerTick = plan.editDecision.timebase.numerator / plan.editDecision.timebase.denominator;
      const durations = plan.editDecision.clips.map((clip) => (clip.sourceOutTicks - clip.sourceInTicks) * secondsPerTick);
      const transitions = plan.editDecision.clips.map((clip) => clip.transition);
      const stage = String(flag(argv, '--stage', 'final'));
      const expected = { ...outputProfile(stage, plan.output), durationSeconds: effectiveAssemblyDuration(durations, transitions), requireAudio: plan.output.requireAudio };
      io.stdout.write(`${JSON.stringify(evaluateMedia({ output: expected }, receipt), null, 2)}\n`); return 0;
    }
    io.stderr.write(`Unknown command: ${command}\n`); return 2;
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return /only local_composition/.test(error.message) ? 3 : /approval/.test(error.message) ? 4 : 1;
  }
}
