import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

const findExecutable = (name, envPath = process.env.PATH ?? '') => {
  for (const directory of envPath.split(delimiter)) {
    const candidate = join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  return null;
};

export function probeCapabilities({ envPath } = {}) {
  const ffmpeg = findExecutable('ffmpeg', envPath);
  const ffprobe = findExecutable('ffprobe', envPath);
  const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find((candidate) => {
    try { accessSync(candidate, constants.X_OK); return true; } catch { return false; }
  }) ?? null;
  return { available: Boolean(ffmpeg && ffprobe), required: { ffmpeg, ffprobe }, optional: { chrome }, nativeVideo: { available: false, status: 'NOT_RUN' } };
}
