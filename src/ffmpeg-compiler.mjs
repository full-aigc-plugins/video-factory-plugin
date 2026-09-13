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

const visualFilter = (profile, motion = 'static', transition = 'cut', durationSeconds) => {
  if (!['static', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right'].includes(motion)) throw new Error(`unsupported motion: ${motion}`);
  if (!['cut', 'fade', 'dissolve'].includes(transition)) throw new Error(`unsupported transition: ${transition}`);
  const fit = `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${profile.fps}`;
  const frames = Math.max(1, Math.round(durationSeconds * profile.fps));
  let filters = fit;
  if (motion === 'zoom-in') filters += `,zoompan=z='min(zoom+0.0008,1.08)':d=1:s=${profile.width}x${profile.height}:fps=${profile.fps}`;
  if (motion === 'zoom-out') filters += `,zoompan=z='if(eq(on,1),1.08,max(zoom-0.0008,1.0))':d=1:s=${profile.width}x${profile.height}:fps=${profile.fps}`;
  if (motion === 'pan-left') filters += `,zoompan=z=1.05:x='(iw-iw/zoom)*(1-on/${frames})':y='(ih-ih/zoom)/2':d=1:s=${profile.width}x${profile.height}:fps=${profile.fps}`;
  if (motion === 'pan-right') filters += `,zoompan=z=1.05:x='(iw-iw/zoom)*on/${frames}':y='(ih-ih/zoom)/2':d=1:s=${profile.width}x${profile.height}:fps=${profile.fps}`;
  if (transition === 'fade') {
    const fadeDuration = Math.min(0.25, durationSeconds / 3);
    filters += `,fade=t=in:st=0:d=${fadeDuration},fade=t=out:st=${Math.max(0, durationSeconds - fadeDuration)}:d=${fadeDuration}`;
  }
  return filters;
};

export function compileSegment(source, profile, destination) {
  if (!['image', 'video'].includes(source.kind)) throw new Error(`unsupported source kind: ${source.kind}`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(source.path)) throw new Error('network protocols are not allowed');
  if (!(source.durationSeconds > 0)) throw new Error('segment duration must be positive');
  const args = ['-v', 'error', '-y'];
  if (source.kind === 'image') args.push('-loop', '1', '-i', source.path);
  else args.push('-ss', String(source.sourceInSeconds ?? 0), '-i', source.path);
  args.push('-f', 'lavfi', '-i', `anullsrc=r=${profile.audioRate}:cl=stereo`, '-t', String(source.durationSeconds),
    '-map', '0:v:0', '-map', '1:a:0', '-vf', visualFilter(profile, source.motion, source.transition, source.durationSeconds),
    '-c:v', 'libx264', '-preset', profile.preset, '-crf', String(profile.crf), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', String(profile.audioRate), '-shortest', '-movflags', '+faststart', destination);
  return { bin: 'ffmpeg', args, options: { shell: false, stdio: ['ignore', 'ignore', 'pipe'] } };
}

export function compileAssembly(listPath, profile, destination) {
  return { bin: 'ffmpeg', args: ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', destination], options: { shell: false, stdio: ['ignore', 'ignore', 'pipe'] } };
}

const dissolveDuration = (previous, current, transition) => transition === 'dissolve'
  ? Math.min(0.5, previous / 2, current / 2)
  : 0.001;

export function effectiveAssemblyDuration(durations, transitions) {
  return durations.reduce((total, duration, index) => index === 0 ? duration : total + duration - (transitions[index] === 'dissolve' ? dissolveDuration(durations[index - 1], duration, 'dissolve') : 0), 0);
}

export function compileDissolveAssembly(paths, durations, transitions, profile, destination) {
  if (paths.length < 2) throw new Error('dissolve assembly requires at least two segments');
  if (paths.length !== durations.length || paths.length !== transitions.length) throw new Error('dissolve assembly arrays must have equal length');
  for (const path of [...paths, destination]) if (/^[a-z][a-z0-9+.-]*:/i.test(path)) throw new Error('network protocols are not allowed');
  const args = ['-v', 'error', '-y'];
  for (const path of paths) args.push('-i', path);
  const filters = [];
  let video = '0:v';
  let audio = '0:a';
  let duration = durations[0];
  for (let index = 1; index < paths.length; index += 1) {
    const cross = dissolveDuration(durations[index - 1], durations[index], transitions[index]);
    const offset = Math.max(0, duration - cross);
    const nextVideo = `v${index}`;
    const nextAudio = `a${index}`;
    filters.push(`[${video}][${index}:v]xfade=transition=fade:duration=${cross}:offset=${Number(offset.toFixed(6))}[${nextVideo}]`);
    filters.push(`[${audio}][${index}:a]acrossfade=d=${cross}[${nextAudio}]`);
    video = nextVideo;
    audio = nextAudio;
    duration += durations[index] - cross;
  }
  args.push('-filter_complex', filters.join(';'), '-map', `[${video}]`, '-map', `[${audio}]`,
    '-c:v', 'libx264', '-preset', profile.preset, '-crf', String(profile.crf), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', String(profile.audioRate), '-movflags', '+faststart', destination);
  return { bin: 'ffmpeg', args, options: { shell: false, stdio: ['ignore', 'ignore', 'pipe'] } };
}
