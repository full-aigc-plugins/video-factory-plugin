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
