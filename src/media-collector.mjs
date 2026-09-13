import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { sha256File } from './hash.mjs';

export async function collectMedia(path, { provenanceOk = true } = {}) {
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`media artifact missing: ${path}`);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], { encoding: 'utf8', maxBuffer: 1 << 24 }));
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  if (!video) throw new Error('media artifact has no video stream');
  execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1 << 24 });
  const [num, den] = String(video.avg_frame_rate ?? video.r_frame_rate ?? '0/1').split('/').map(Number);
  const firstHash = await sha256File(path);
  const secondHash = await sha256File(path);
  return {
    schemaVersion: '1.0.0', path, sha256: secondHash, bytes: statSync(path).size,
    durationSeconds: Number(probe.format?.duration ?? video.duration ?? 0),
    width: Number(video.width), height: Number(video.height), fps: den ? num / den : 0,
    hasAudio: probe.streams?.some((stream) => stream.codec_type === 'audio') ?? false,
    container: probe.format?.format_name ?? '', exists: true, hashVerified: firstHash === secondHash,
    decodeOk: true, provenanceOk,
  };
}

export async function verifyReceipt(receipt) {
  if (!existsSync(receipt.path)) return { ok: false, reason: 'missing' };
  const actual = await sha256File(receipt.path);
  return { ok: actual === receipt.sha256 && statSync(receipt.path).size === receipt.bytes, reason: actual === receipt.sha256 ? null : 'hash_mismatch' };
}
