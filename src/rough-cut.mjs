// Rough-cut renderer: media file + keep segments (microseconds, source timeline)
// → one MP4 via the ffmpeg concat demuxer. Stream-copy first (fast, lossless
// when all segments share codec/params); a --re-encode pass is the fallback
// when the concat output is broken or durations mismatch.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ffmpegBin = () => process.env.VIDEO_FACTORY_FFMPEG || 'ffmpeg';

const run = (args, io) => {
  const result = spawnSync(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', ...args], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    io?.stderr?.write?.(`ffmpeg failed: ${result.stderr ?? ''}\n`);
    return false;
  }
  return true;
};

const ffprobeDurationUs = (path) => {
  const result = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path,
  ], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const seconds = Number.parseFloat(result.stdout.trim());
  return Number.isFinite(seconds) ? Math.round(seconds * 1_000_000) : null;
};

// Clamp segments to the actual media duration; drop out-of-range tails.
export function clampSegments(segments, mediaDurationUs) {
  if (mediaDurationUs == null) return segments;
  return segments
    .filter((s) => s.startUs < mediaDurationUs)
    .map((s) => ({ ...s, endUs: Math.min(s.endUs, mediaDurationUs), durationUs: Math.min(s.durationUs, mediaDurationUs - s.startUs) }))
    .filter((s) => s.durationUs > 0);
}

export function roughCut(mediaPath, segments, output, io = null, { reencode = false } = {}) {
  const media = resolve(mediaPath);
  if (!existsSync(media)) throw new Error(`media not found: ${media}`);
  const durationUs = ffprobeDurationUs(media);
  const clamped = clampSegments(segments, durationUs);
  if (clamped.length === 0) throw new Error('no keep segments inside media duration');

  const workDir = output + '.concat';
  mkdirSync(workDir, { recursive: true });

  const parts = [];
  clamped.forEach((seg, i) => {
    const part = join(workDir, `part-${String(i).padStart(4, '0')}${reencode ? '.ts' : '.mp4'}`);
    const ss = (seg.startUs / 1_000_000).toFixed(6);
    const to = (seg.durationUs / 1_000_000).toFixed(6);
    if (reencode) {
      run(['-ss', ss, '-t', to, '-i', media, '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-f', 'mpegts', part], io);
    } else {
      run(['-ss', ss, '-t', to, '-i', media, '-c', 'copy', part], io);
    }
    if (existsSync(part) && statSync(part).size > 0) {
      parts.push(part);
      const line = `file '${part.replace(/'/g, "'\\''")}'\n`;
      // concat list expects plain file lines
      parts[parts.length - 1] = part;
      void line;
    }
  });

  if (parts.length === 0) throw new Error('all segment extractions failed');

  const listFile = join(workDir, 'concat.txt');
  writeFileSync(listFile, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));

  const copyArgs = ['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', output];
  let ok = run(copyArgs, io);
  if (!ok && !reencode) {
    // Stream-copy concat failed (mixed params) — redo as mpegts re-encode pass.
    for (const part of parts) {
      const ts = part.replace(/\.mp4$/, '.ts');
      run(['-i', part, '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-f', 'mpegts', ts], io);
    }
    const tsList = join(workDir, 'concat-ts.txt');
    writeFileSync(tsList, parts.map((p) => `file '${p.replace(/\.mp4$/, '.ts').replace(/'/g, "'\\''")}'`).join('\n'));
    ok = run(['-f', 'concat', '-safe', '0', '-i', tsList, '-c', 'copy', '-movflags', '+faststart', output], io);
  }
  if (!ok) throw new Error('ffmpeg concat failed');

  const bytes = statSync(output).size;
  return { output, bytes, segments: clamped.length, durationUs: clamped.reduce((acc, s) => acc + s.durationUs, 0) };
}
