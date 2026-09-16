export function validateEditDecision(decision, assetDurations = {}) {
  const ids = new Set();
  let timelineEnd = 0;
  for (const [index, clip] of (decision.clips ?? []).entries()) {
    if (ids.has(clip.id)) throw new Error(`duplicate clip id: ${clip.id}`);
    ids.add(clip.id);
    if (!Number.isInteger(clip.sourceInTicks) || !Number.isInteger(clip.sourceOutTicks)
      || clip.sourceInTicks < 0 || clip.sourceOutTicks <= clip.sourceInTicks
      || clip.sourceOutTicks > (assetDurations[clip.assetId] ?? -1)) {
      throw new Error(`invalid source range: ${clip.id}`);
    }
    if (!Number.isInteger(clip.timelineInTicks) || clip.timelineInTicks < 0) throw new Error(`invalid timeline position: ${clip.id}`);
    if (clip.track !== 0) throw new Error('0.1.0 supports video track 0 only');
    if (index === 0 && clip.timelineInTicks !== 0) throw new Error('timeline must start at tick 0');
    if (index > 0 && clip.timelineInTicks < (decision.clips[index - 1]?.timelineInTicks ?? 0)) throw new Error(`clips must be in timeline order: ${clip.id}`);
    if (index > 0 && clip.timelineInTicks !== timelineEnd) throw new Error(`timeline gap or overlap: ${clip.id}`);
    const end = clip.timelineInTicks + clip.sourceOutTicks - clip.sourceInTicks;
    timelineEnd = end;
  }
  return decision;
}

const semanticId = (value, kind) => {
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(value)) throw new Error(`invalid ${kind} id: ${value}`);
  return value;
};

function assertSemantics(decision) {
  const words = decision.speech?.words ?? [];
  const wordIndex = new Map();
  let previousEnd = -1;
  for (const word of words) {
    if (wordIndex.has(word.id)) throw new Error(`duplicate word id: ${word.id}`);
    if (word.endTicks <= word.startTicks) throw new Error(`invalid word span: ${word.id}`);
    if (word.startTicks < previousEnd) throw new Error(`speech words must be sorted and non-overlapping: ${word.id}`);
    previousEnd = word.endTicks;
    wordIndex.set(word.id, word);
  }
  const moments = new Map();
  for (const moment of decision.moments ?? []) {
    semanticId(moment.id, 'moment');
    if (moments.has(moment.id)) throw new Error(`duplicate moment id: ${moment.id}`);
    if (!wordIndex.has(moment.wordId)) throw new Error(`moment ${moment.id} references unknown word: ${moment.wordId}`);
    moments.set(moment.id, moment);
  }
  const selections = new Map();
  for (const selection of decision.selections ?? []) {
    semanticId(selection.id, 'selection');
    if (selections.has(selection.id)) throw new Error(`duplicate selection id: ${selection.id}`);
    for (const field of ['startWordId', 'endWordId']) {
      if (!wordIndex.has(selection[field])) throw new Error(`selection ${selection.id} references unknown word: ${selection[field]}`);
    }
    selections.set(selection.id, selection);
  }
  return { words, wordIndex, moments, selections };
}

function resolveAnchorTicks(anchor, semantics) {
  const { wordIndex, moments, selections } = semantics;
  const wordTicks = (wordId, affinity) => {
    const word = wordIndex.get(wordId);
    return affinity === 'end' ? word.endTicks : word.startTicks;
  };
  const at = anchor.at ?? '';
  const offset = anchor.offsetTicks ?? 0;
  if (at === 'speech:start') return (semantics.words[0]?.startTicks ?? 0) + offset;
  if (at === 'speech:end') return (semantics.words.at(-1)?.endTicks ?? 0) + offset;
  if (at.startsWith('tick:')) return Number(at.slice(5)) + offset;
  if (at.startsWith('moment:')) {
    const moment = moments.get(at.slice(7));
    if (!moment) throw new Error(`anchor references unknown moment: ${at.slice(7)}`);
    return wordTicks(moment.wordId, moment.affinity) + offset;
  }
  if (at.startsWith('selection:')) {
    const [prefix, id, boundary] = at.split(':');
    if (!['start', 'end'].includes(boundary)) throw new Error(`invalid anchor form: ${anchor.at}`);
    const selection = selections.get(id);
    if (!selection) throw new Error(`anchor references unknown selection: ${id}`);
    return boundary === 'start'
      ? wordTicks(selection.startWordId, selection.startAffinity) + offset
      : wordTicks(selection.endWordId, selection.endAffinity) + offset;
  }
  throw new Error(`invalid anchor form: ${anchor.at}`);
}

/**
 * Semantic time resolution (borrowed from Hypit): moments and selections name word-boundary
 * events; anchored clips take their timeline position from those events, so a re-transcribed
 * delivery moves the cut with the words instead of breaking the plan.
 *
 * Returns the literal 1.0.0-shaped decision the compiler consumes, sorted into timeline order,
 * plus the anchor report. Pure: never mutates the input. v1 decisions pass through unchanged.
 */
export function resolveEditDecision(decision) {
  const clips = decision.clips ?? [];
  const hasAnchors = clips.some((clip) => clip.anchor !== undefined);
  if (!hasAnchors && decision.speech === undefined && decision.moments === undefined && decision.selections === undefined) {
    return { decision, resolved: false, anchors: [] };
  }
  if (!decision.speech) throw new Error('anchored clips require speech words');
  const semantics = assertSemantics(decision);
  const anchors = [];
  const resolved = clips.map((clip) => {
    if (clip.anchor === undefined) return { ...clip };
    const timelineInTicks = resolveAnchorTicks(clip.anchor, semantics);
    anchors.push({ clipId: clip.id, at: clip.anchor.at, offsetTicks: clip.anchor.offsetTicks ?? 0, timelineInTicks });
    const { anchor: _anchor, ...literal } = clip;
    return { ...literal, timelineInTicks };
  }).sort((left, right) => left.timelineInTicks - right.timelineInTicks);
  const literal = {
    schemaVersion: '1.0.0',
    id: decision.id,
    revision: decision.revision,
    timebase: decision.timebase,
    clips: resolved,
  };
  const unbounded = Object.fromEntries(resolved.map((clip) => [clip.assetId, Number.MAX_SAFE_INTEGER]));
  validateEditDecision(literal, unbounded);
  return { decision: literal, resolved: true, anchors };
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

const dissolveDuration = (previous, current) => Math.min(0.5, previous / 2, current / 2);

export function effectiveAssemblyDuration(durations, transitions) {
  return durations.reduce((total, duration, index) => index === 0
    ? duration
    : total + duration - (transitions[index] === 'dissolve' ? dissolveDuration(durations[index - 1], duration) : 0), 0);
}

export function editDurationSeconds(decision) {
  const secondsPerTick = decision.timebase.numerator / decision.timebase.denominator;
  const durations = decision.clips.map((clip) => (clip.sourceOutTicks - clip.sourceInTicks) * secondsPerTick);
  return effectiveAssemblyDuration(durations, decision.clips.map((clip) => clip.transition));
}
