import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const maxMatch = (text, pattern) => {
  let maximum = 0;
  for (const match of text.matchAll(pattern)) maximum = Math.max(maximum, Number(match[1]));
  return maximum;
};

const timestampSeconds = (hours, minutes, seconds, millis = '0') => (
  Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis.padEnd(3, '0').slice(0, 3)) / 1000
);

const subtitleBoundsValid = (text, durationSeconds) => {
  const ranges = [];
  for (const match of text.matchAll(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/g)) {
    ranges.push([timestampSeconds(...match.slice(1, 5)), timestampSeconds(...match.slice(5, 9))]);
  }
  for (const match of text.matchAll(/^Dialogue:[^,]*,(\d{1,2}):(\d{2}):(\d{2})[.](\d{1,2}),(\d{1,2}):(\d{2}):(\d{2})[.](\d{1,2}),/gm)) {
    ranges.push([timestampSeconds(...match.slice(1, 5)), timestampSeconds(...match.slice(5, 9))]);
  }
  return ranges.length > 0 && ranges.every(([start, end]) => start >= 0 && end > start && end <= durationSeconds + 0.05);
};

export function classifyDetections({ blackLog, freezeLog, silenceLog, subtitleText, avDeltaSeconds, durationSeconds }) {
  return {
    blackFrames: blackLog === undefined ? 'SKIPPED' : maxMatch(blackLog, /black_duration:([0-9.]+)/g) >= Math.min(0.5, durationSeconds * 0.8) ? 'FAIL' : 'PASS',
    freezeFrames: freezeLog === undefined ? 'SKIPPED' : maxMatch(freezeLog, /freeze_duration:([0-9.]+)/g) >= Math.min(1.5, durationSeconds * 0.9) ? 'FAIL' : 'PASS',
    silence: silenceLog === undefined ? 'SKIPPED' : maxMatch(silenceLog, /silence_duration:\s*([0-9.]+)/g) >= Math.min(2, durationSeconds * 0.9) ? 'FAIL' : 'PASS',
    subtitleTiming: subtitleText === undefined ? 'SKIPPED' : subtitleBoundsValid(subtitleText, durationSeconds) ? 'PASS' : 'FAIL',
    avSync: avDeltaSeconds === undefined ? 'SKIPPED' : Math.abs(avDeltaSeconds) <= 0.1 ? 'PASS' : 'FAIL',
  };
}

const detector = (path, kind, timeoutMs) => {
  const filters = {
    black: ['-vf', 'blackdetect=d=0.5:pix_th=0.10', '-an'],
    freeze: ['-vf', 'freezedetect=n=-60dB:d=1.5', '-an'],
    silence: ['-af', 'silencedetect=n=-50dB:d=2', '-vn'],
  };
  const result = spawnSync('ffmpeg', ['-v', 'info', '-i', path, ...filters[kind], '-f', 'null', '-'], {
    shell: false, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1 << 24, stdio: ['ignore', 'ignore', 'pipe'],
  });
  if (result.error?.code === 'ETIMEDOUT') throw new Error(`${kind} detector timeout`);
  if (result.error) throw new Error(`${kind} detector unavailable: ${result.error.message}`);
  return { exitCode: result.status, log: result.stderr ?? '' };
};

export function analyzeMedia(path, { durationSeconds, hasAudio = false, videoStartSeconds, audioStartSeconds, subtitlePath, timeoutMs = 120000 }) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) throw new Error('media analysis requires a local file');
  const black = detector(path, 'black', timeoutMs);
  const freeze = detector(path, 'freeze', timeoutMs);
  const silence = hasAudio ? detector(path, 'silence', timeoutMs) : null;
  for (const item of [black, freeze, silence].filter(Boolean)) if (item.exitCode !== 0) throw new Error('media detector failed');
  const statuses = classifyDetections({
    blackLog: black.log,
    freezeLog: freeze.log,
    silenceLog: silence?.log,
    subtitleText: subtitlePath ? readFileSync(subtitlePath, 'utf8') : undefined,
    avDeltaSeconds: hasAudio && Number.isFinite(videoStartSeconds) && Number.isFinite(audioStartSeconds) ? audioStartSeconds - videoStartSeconds : undefined,
    durationSeconds,
  });
  return {
    ...statuses,
    detectors: {
      black: { exitCode: black.exitCode },
      freeze: { exitCode: freeze.exitCode },
      silence: silence ? { exitCode: silence.exitCode } : { exitCode: null, status: 'SKIPPED' },
    },
  };
}
