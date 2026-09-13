export function validateEditDecision(decision, assetDurations = {}) {
  const ids = new Set();
  const byTrack = new Map();
  for (const clip of decision.clips ?? []) {
    if (ids.has(clip.id)) throw new Error(`duplicate clip id: ${clip.id}`);
    ids.add(clip.id);
    if (!Number.isInteger(clip.sourceInTicks) || !Number.isInteger(clip.sourceOutTicks)
      || clip.sourceInTicks < 0 || clip.sourceOutTicks <= clip.sourceInTicks
      || clip.sourceOutTicks > (assetDurations[clip.assetId] ?? -1)) {
      throw new Error(`invalid source range: ${clip.id}`);
    }
    if (!Number.isInteger(clip.timelineInTicks) || clip.timelineInTicks < 0) throw new Error(`invalid timeline position: ${clip.id}`);
    const end = clip.timelineInTicks + clip.sourceOutTicks - clip.sourceInTicks;
    const entries = byTrack.get(clip.track) ?? [];
    if (entries.some((item) => clip.timelineInTicks < item.end && end > item.start)) throw new Error(`timeline overlap: ${clip.id}`);
    entries.push({ start: clip.timelineInTicks, end });
    byTrack.set(clip.track, entries);
  }
  return decision;
}

export function diffEditDecision(previous, next) {
  const old = new Map((previous.clips ?? []).map((clip) => [clip.id, clip]));
  const changed = (next.clips ?? []).filter((clip) => JSON.stringify(old.get(clip.id)) !== JSON.stringify(clip)).map((clip) => clip.id);
  const removed = [...old.keys()].filter((id) => !(next.clips ?? []).some((clip) => clip.id === id));
  return { changed, removed };
}

export function reviseEditDecision(previous, changes) {
  const next = structuredClone(previous);
  for (const change of changes) {
    const index = next.clips.findIndex((clip) => clip.id === change.id);
    if (index < 0) throw new Error(`unknown clip id: ${change.id}`);
    if (change.op === 'remove') next.clips.splice(index, 1);
    else if (change.op === 'update') next.clips[index] = { ...next.clips[index], ...change.patch, id: change.id };
    else if (change.op === 'move') next.clips[index] = { ...next.clips[index], timelineInTicks: change.timelineInTicks };
    else throw new Error(`unsupported edit operation: ${change.op}`);
  }
  next.revision = previous.revision + 1;
  return { decision: next, diff: diffEditDecision(previous, next) };
}

export function analyzeEditPolicy(decision) {
  const clips = decision.clips ?? [];
  const duplicate = clips.some((clip, index) => index > 0
    && clip.assetId === clips[index - 1].assetId
    && clip.sourceInTicks === clips[index - 1].sourceInTicks
    && clip.sourceOutTicks === clips[index - 1].sourceOutTicks);
  const durations = clips.map((clip) => clip.sourceOutTicks - clip.sourceInTicks);
  let rhythm = 'SKIPPED';
  if (durations.length >= 6) {
    const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
    rhythm = Math.max(...durations) - Math.min(...durations) <= average * 0.1 ? 'FAIL' : 'PASS';
  }
  return { duplicateShots: duplicate ? 'FAIL' : 'PASS', rhythm };
}
