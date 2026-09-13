import { canonicalHash } from './plan.mjs';

const DIMENSIONS = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
};

export function outputProfile(stage, output = {}) {
  if (!['rough', 'final'].includes(stage)) throw new Error('stage must be rough or final');
  const [defaultWidth, defaultHeight] = stage === 'rough' ? (output.aspect === '9:16' ? [720, 1280] : output.aspect === '1:1' ? [720, 720] : [1280, 720]) : (DIMENSIONS[output.aspect ?? '16:9'] ?? DIMENSIONS['16:9']);
  const width = output.width ?? defaultWidth;
  const height = output.height ?? defaultHeight;
  if (![width, height].every((value) => Number.isInteger(value) && value > 0 && value % 2 === 0)) throw new Error('profile dimensions must be positive even integers');
  return { width, height, fps: output.fps ?? 30, crf: stage === 'rough' ? 28 : 20, preset: stage === 'rough' ? 'veryfast' : 'medium', audioRate: 48000 };
}

export const segmentKey = (descriptor) => canonicalHash(descriptor);

const visualFilter = (profile, motion) => {
  const fit = `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${profile.fps}`;
  if (motion === 'zoom-in') return `${fit},zoompan=z='min(zoom+0.0008,1.08)':d=1:s=${profile.width}x${profile.height}:fps=${profile.fps}`;
  if (motion === 'zoom-out') return `${fit},zoompan=z='if(eq(on,1),1.08,max(zoom-0.0008,1.0))':d=1:s=${profile.width}x${profile.height}:fps=${profile.fps}`;
  return fit;
};

export function compileSegment(source, profile, destination) {
  if (!['image', 'video'].includes(source.kind)) throw new Error(`unsupported source kind: ${source.kind}`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(source.path)) throw new Error('network protocols are not allowed');
  if (!(source.durationSeconds > 0)) throw new Error('segment duration must be positive');
  const args = ['-v', 'error', '-y'];
  if (source.kind === 'image') args.push('-loop', '1', '-i', source.path);
  else args.push('-ss', String(source.sourceInSeconds ?? 0), '-i', source.path);
  args.push('-f', 'lavfi', '-i', `anullsrc=r=${profile.audioRate}:cl=stereo`, '-t', String(source.durationSeconds),
    '-map', '0:v:0', '-map', '1:a:0', '-vf', visualFilter(profile, source.motion),
    '-c:v', 'libx264', '-preset', profile.preset, '-crf', String(profile.crf), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', String(profile.audioRate), '-shortest', '-movflags', '+faststart', destination);
  return { bin: 'ffmpeg', args, options: { shell: false, stdio: ['ignore', 'ignore', 'pipe'] } };
}

export function compileAssembly(listPath, profile, destination) {
  return { bin: 'ffmpeg', args: ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', destination], options: { shell: false, stdio: ['ignore', 'ignore', 'pipe'] } };
}
