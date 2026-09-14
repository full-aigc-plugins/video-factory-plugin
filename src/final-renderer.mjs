import { spawnSync } from 'node:child_process';
import { mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { collectMedia } from './media-collector.mjs';

const assertLocalPath = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is required`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) throw new Error(`${label} must be a local file`);
};

export function compileMaster({ inputVideo, audioPath, audioTracks = [], subtitlePath, watermarkPath, title, profile, destination, durationSeconds }) {
  assertLocalPath(inputVideo, 'inputVideo');
  assertLocalPath(destination, 'destination');
  if (audioPath) assertLocalPath(audioPath, 'audioPath');
  if (subtitlePath) assertLocalPath(subtitlePath, 'subtitlePath');
  if (watermarkPath) assertLocalPath(watermarkPath, 'watermarkPath');
  const tracks = audioTracks.length ? audioTracks : audioPath ? [{ path: audioPath, gainDb: 0, timelineInSeconds: 0, role: 'narration' }] : [];
  if (audioPath && audioTracks.length) throw new Error('use audioPath or audioTracks, not both');
  const args = ['-v', 'error', '-y', '-i', inputVideo];
  const indexedTracks = tracks.map((track, index) => {
    assertLocalPath(track.path, `audioTracks[${index}].path`);
    if (!Number.isFinite(track.gainDb) || track.gainDb < -60 || track.gainDb > 12) throw new Error('audio track gain must be between -60 and 12 dB');
    if (!Number.isFinite(track.timelineInSeconds) || track.timelineInSeconds < 0) throw new Error('audio track timeline offset must be non-negative');
    args.push('-i', track.path);
    return { ...track, inputIndex: index + 1 };
  });
  let nextInput = indexedTracks.length + 1;
  const watermarkInput = watermarkPath ? nextInput++ : null;
  if (watermarkPath) args.push('-loop', '1', '-i', watermarkPath);
  const subtitleInput = subtitlePath ? nextInput : null;
  if (subtitlePath) args.push('-i', subtitlePath);
  const filters = [];
  let videoMap = '0:v:0';
  if (watermarkInput) {
    const watermarkWidth = Math.max(2, Math.round(profile.width * 0.12 / 2) * 2);
    filters.push(`[${watermarkInput}:v:0]scale=${watermarkWidth}:-2[wm]`);
    filters.push('[0:v:0][wm]overlay=W-w-32:H-h-32:eof_action=pass[vout]');
    videoMap = '[vout]';
  }
  let audioMap = '0:a?';
  if (indexedTracks.length) {
    const labels = indexedTracks.map((track, index) => {
      const delayMs = Math.round(track.timelineInSeconds * 1000);
      filters.push(`[${track.inputIndex}:a:0]adelay=${delayMs}|${delayMs},volume=${track.gainDb}dB[a${index}]`);
      return `[a${index}]`;
    });
    filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0,apad[aout]`);
    audioMap = '[aout]';
  }
  if (filters.length) args.push('-filter_complex', filters.join(';'));
  args.push('-map', videoMap, '-map', audioMap);
  if (subtitlePath) {
    args.push('-map', `${subtitleInput}:s:0`, '-c:s', 'mov_text');
  }
  args.push(
    '-c:v', 'libx264', '-preset', profile.preset, '-crf', String(profile.crf),
    '-pix_fmt', 'yuv420p', '-r', String(profile.fps),
    '-c:a', 'aac', '-ar', String(profile.audioRate),
  );
  if (title) args.push('-metadata', `title=${String(title).slice(0, 200)}`);
  if (durationSeconds) args.push('-t', String(durationSeconds));
  else args.push('-shortest');
  args.push('-movflags', '+faststart', destination);
  return { bin: 'ffmpeg', args, options: { shell: false, stdio: ['ignore', 'ignore', 'pipe'] } };
}

export async function renderFinal({ inputVideo, audioPath, audioTracks, subtitlePath, watermarkPath, title, profile, destination, durationSeconds, timeoutMs = 180000 }) {
  mkdirSync(dirname(destination), { recursive: true });
  const temp = `${destination}.tmp-${process.pid}.mp4`;
  const spec = compileMaster({ inputVideo, audioPath, audioTracks, subtitlePath, watermarkPath, title, profile, destination: temp, durationSeconds });
  const result = spawnSync(spec.bin, spec.args, { ...spec.options, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 1 << 24 });
  if (result.error?.code === 'ETIMEDOUT') throw new Error('final render timeout');
  if (result.error) throw new Error(`final renderer unavailable: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`final render failed: ${(result.stderr ?? '').slice(-2000)}`);
  const tempReceipt = await collectMedia(temp);
  if (!tempReceipt.decodeOk || !tempReceipt.hashVerified) throw new Error('final render verification failed');
  renameSync(temp, destination);
  return collectMedia(destination);
}
