import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { compileSegment, segmentKey } from './ffmpeg-compiler.mjs';
import { collectMedia, verifyReceipt } from './media-collector.mjs';

export async function renderSegment({ source, profile, destination, descriptorKey, timeoutMs = 120000 }) {
  descriptorKey ??= segmentKey({ rendererVersion: 1, source, profile });
  mkdirSync(dirname(destination), { recursive: true });
  const receiptPath = `${destination}.receipt.json`;
  if (existsSync(destination) && existsSync(receiptPath)) {
    try {
      const stored = JSON.parse(readFileSync(receiptPath, 'utf8'));
      const expectedBinding = segmentKey({ descriptorKey, sha256: stored.sha256, bytes: stored.bytes });
      if (stored.path === destination && stored.descriptorKey === descriptorKey && stored.bindingKey === expectedBinding && (await verifyReceipt(stored)).ok && stored.decodeOk && stored.hashVerified) {
        const decoded = await collectMedia(destination);
        if (decoded.sha256 === stored.sha256 && decoded.bytes === stored.bytes && decoded.decodeOk) return { path: destination, attempts: 0, reused: true, receipt: stored };
      }
    } catch {
      // Invalid caches are regenerated once by the explicit run, never retried automatically.
    }
  }
  const temp = `${destination}.tmp-${process.pid}.mp4`;
  const spec = compileSegment(source, profile, temp);
  const result = spawnSync(spec.bin, spec.args, { ...spec.options, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 1 << 24 });
  if (result.error?.code === 'ETIMEDOUT') throw new Error('segment render timeout');
  if (result.error) throw new Error(`segment renderer unavailable: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`segment render failed: ${(result.stderr ?? '').slice(-2000)}`);
  const tempReceipt = await collectMedia(temp, { provenanceOk: true, timelineOk: true });
  if (!tempReceipt.decodeOk || !tempReceipt.hashVerified) throw new Error('segment verification failed');
  renameSync(temp, destination);
  const collected = await collectMedia(destination);
  const receipt = { ...collected, descriptorKey, bindingKey: segmentKey({ descriptorKey, sha256: collected.sha256, bytes: collected.bytes }) };
  const receiptTemp = `${receiptPath}.tmp-${process.pid}`;
  writeFileSync(receiptTemp, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  renameSync(receiptTemp, receiptPath);
  return { path: destination, attempts: 1, reused: false, receipt };
}
