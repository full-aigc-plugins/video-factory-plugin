import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS_SCRIPT = join(ROOT, 'skills/video-shots/scripts/video-shots.mjs');
const SYNC_SCRIPT = join(ROOT, 'skills/video-sync/scripts/video-sync.mjs');

const defaultRunner = (bin, args, options) => spawnSync(bin, args, { ...options, encoding: 'utf8' });

export function runAnalyzeSeed(video, outputDir, { runner = defaultRunner, node = process.execPath, threshold = 0.3 } = {}) {
  mkdirSync(outputDir, { recursive: true });
  const shotsPath = join(outputDir, 'shots.json');
  const trackPath = join(outputDir, 'track.json');
  const stderrPath = join(outputDir, 'seed.stderr.txt');
  const result = runner(node, [SHOTS_SCRIPT, 'seed', video, '--track', trackPath, '--threshold', String(threshold), '--title', basename(video)], {
    cwd: outputDir, shell: false, maxBuffer: 1 << 28,
  });
  writeFileSync(stderrPath, result.stderr ?? '');
  if (result.status !== 0) throw new Error(`ReelBench seed failed with exit ${result.status}`);
  writeFileSync(shotsPath, result.stdout ?? '');
  return { schemaVersion: '1.0.0', shotsPath, trackPath, framesPath: join(outputDir, 'frames'), stderrPath, status: 'NOT_RUN' };
}

export function runAnalyzeEvidence(video, outputDir, { runner = defaultRunner, node = process.execPath, threshold = 0.3 } = {}) {
  const evidence = runAnalyzeSeed(video, outputDir, { runner, node, threshold });
  const framesPath = evidence.framesPath;
  const sheetsPath = join(outputDir, 'sheets');
  const steps = [
    ['frames', evidence.shotsPath, '--video', video, '--dir', framesPath],
    ['sheet', evidence.shotsPath, '--dir', framesPath, '--out', sheetsPath, '--pick', 'a'],
    ['sheet', evidence.shotsPath, '--dir', framesPath, '--out', sheetsPath, '--pick', 'b'],
  ];
  const logs = [];
  for (const args of steps) {
    const result = runner(node, [SHOTS_SCRIPT, ...args], { cwd: outputDir, shell: false, maxBuffer: 1 << 28 });
    logs.push(`[${args[0]} ${args.at(-1)}]\n${result.stderr ?? ''}`);
    if (result.status !== 0) throw new Error(`ReelBench ${args[0]} failed with exit ${result.status}`);
  }
  const evidenceLogPath = join(outputDir, 'evidence.stderr.txt');
  writeFileSync(evidenceLogPath, logs.join('\n'));
  return { ...evidence, sheetsPath, evidenceLogPath, status: 'AWAITING_CODEX_ANNOTATION' };
}

export function mapGateOutput(output) {
  return String(output).split(/\r?\n/).filter((line) => /^[✅❌⊘]/u.test(line)).map((line) => {
    const marker = [...line][0];
    return { label: line.slice(marker.length).trim(), status: marker === '✅' ? 'PASS' : marker === '❌' ? 'FAIL' : 'SKIPPED' };
  });
}

export function validationCommand(shotsPath, trackPath, framesPath, node = process.execPath) {
  return { bin: node, args: [SHOTS_SCRIPT, 'validate', shotsPath, '--track', trackPath, '--frames', framesPath], options: { shell: false, encoding: 'utf8', maxBuffer: 1 << 28 } };
}

export function reviewSyncCommand(video, shotsPath, output, panels, node = process.execPath) {
  return {
    bin: node,
    args: [SYNC_SCRIPT, 'export', shotsPath, '--video', video, '--panels', panels, '-o', output],
    options: { shell: false, encoding: 'utf8', maxBuffer: 1 << 28 },
  };
}

export function assertReviewInput(receipt) {
  if (receipt?.hasAudio !== true) throw new Error('video-sync requires a normalized audio track to bound output duration');
}
