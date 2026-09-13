import { spawnSync } from 'node:child_process';
import { mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { collectMedia } from './media-collector.mjs';

const assertLocalPath = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is required`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) throw new Error(`${label} must be a local file`);
};

export function compileMaster({ inputVideo, audioPath, subtitlePath, profile, destination, durationSeconds }) {
  assertLocalPath(inputVideo, 'inputVideo');
  assertLocalPath(destination, 'destination');
  if (audioPath) assertLocalPath(audioPath, 'audioPath');
  if (subtitlePath) assertLocalPath(subtitlePath, 'subtitlePath');
  const args = ['-v', 'error', '-y', '-i', inputVideo];
  if (audioPath) args.push('-i', audioPath);
  if (subtitlePath) args.push('-i', subtitlePath);
  args.push('-map', '0:v:0', '-map', audioPath ? '1:a:0' : '0:a?');
  if (subtitlePath) {
    const subtitleInput = audioPath ? 2 : 1;
    args.push('-map', `${subtitleInput}:s:0`, '-c:s', 'mov_text');
  }
  if (audioPath) args.push('-af', 'apad');
  args.push(
    '-c:v', 'libx264', '-preset', profile.preset, '-crf', String(profile.crf),
    '-pix_fmt', 'yuv420p', '-r', String(profile.fps),
    '-c:a', 'aac', '-ar', String(profile.audioRate),
  );
  if (durationSeconds) args.push('-t', String(durationSeconds));
  else args.push('-shortest');
  args.push('-movflags', '+faststart', destination);
  return { bin: 'ffmpeg', args, options: { shell: false, stdio: ['ignore', 'ignore', 'pipe'] } };
}

export async function renderFinal({ inputVideo, audioPath, subtitlePath, profile, destination, durationSeconds, timeoutMs = 180000 }) {
  mkdirSync(dirname(destination), { recursive: true });
  const temp = `${destination}.tmp-${process.pid}.mp4`;
  const spec = compileMaster({ inputVideo, audioPath, subtitlePath, profile, destination: temp, durationSeconds });
  const result = spawnSync(spec.bin, spec.args, { ...spec.options, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 1 << 24 });
  if (result.error?.code === 'ETIMEDOUT') throw new Error('final render timeout');
  if (result.error) throw new Error(`final renderer unavailable: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`final render failed: ${(result.stderr ?? '').slice(-2000)}`);
  const tempReceipt = await collectMedia(temp, { provenanceOk: true });
  if (!tempReceipt.decodeOk || !tempReceipt.hashVerified) throw new Error('final render verification failed');
  renameSync(temp, destination);
  return collectMedia(destination, { provenanceOk: true });
}
