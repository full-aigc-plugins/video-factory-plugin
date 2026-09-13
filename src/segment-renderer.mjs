import { spawnSync } from 'node:child_process';
import { mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { compileSegment } from './ffmpeg-compiler.mjs';
import { collectMedia } from './media-collector.mjs';

export async function renderSegment({ source, profile, destination, timeoutMs = 120000 }) {
  mkdirSync(dirname(destination), { recursive: true });
  const temp = `${destination}.tmp-${process.pid}.mp4`;
  const spec = compileSegment(source, profile, temp);
  const result = spawnSync(spec.bin, spec.args, { ...spec.options, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 1 << 24 });
  if (result.error?.code === 'ETIMEDOUT') throw new Error('segment render timeout');
  if (result.error) throw new Error(`segment renderer unavailable: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`segment render failed: ${(result.stderr ?? '').slice(-2000)}`);
  const tempReceipt = await collectMedia(temp, { provenanceOk: true });
  if (!tempReceipt.decodeOk || !tempReceipt.hashVerified) throw new Error('segment verification failed');
  renameSync(temp, destination);
  const receipt = await collectMedia(destination, { provenanceOk: true });
  return { path: destination, attempts: 1, receipt };
}
