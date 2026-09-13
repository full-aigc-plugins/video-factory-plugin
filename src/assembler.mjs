import { spawnSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { compileAssembly, compileDissolveAssembly } from './ffmpeg-compiler.mjs';
import { collectMedia } from './media-collector.mjs';

const concatEscape = (path) => path.replaceAll("'", "'\\''");

export async function assembleVideo(segmentPaths, profile, destination, timeoutMs = 120000, timeline = null) {
  if (!segmentPaths.length) throw new Error('assembly requires at least one segment');
  mkdirSync(dirname(destination), { recursive: true });
  const listPath = join(dirname(destination), `.concat-${process.pid}.txt`);
  const temp = `${destination}.tmp-${process.pid}.mp4`;
  writeFileSync(listPath, `${segmentPaths.map((path) => `file '${concatEscape(path)}'`).join('\n')}\n`);
  try {
    const hasDissolve = timeline?.transitions?.includes('dissolve');
    const spec = hasDissolve
      ? compileDissolveAssembly(segmentPaths, timeline.durations, timeline.transitions, profile, temp)
      : compileAssembly(listPath, profile, temp);
    const result = spawnSync(spec.bin, spec.args, { ...spec.options, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 1 << 24 });
    if (result.error) throw new Error(`assembly unavailable: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`assembly failed: ${(result.stderr ?? '').slice(-2000)}`);
    await collectMedia(temp, { provenanceOk: true, timelineOk: true });
    renameSync(temp, destination);
    return collectMedia(destination, { provenanceOk: true, timelineOk: true });
  } finally {
    rmSync(listPath, { force: true });
  }
}
