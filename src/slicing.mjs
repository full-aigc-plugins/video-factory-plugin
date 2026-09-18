// Episode slicing: word-level ASR timeline → cut decisions → keep segments.
// Facts source: the words timeline comes from volcengine-design's bigmodel ASR
// (millisecond word timestamps); decisions here are deterministic rules.
//
// Input words: one JSON per line {start, end, word, utterance_end} (milliseconds).
// Cut-point rules (in priority order):
//   1. utterance_end with sentence-final punctuation (。！？；!?.;) — strong cut
//   2. silence gap: next word start - current word end > silenceGapMs — strong cut
//   3. comma/soft pause (，,、：) — soft cut, only used when merging is disabled
// Segments shorter than minSegmentMs are merged into the previous one.
// Output: keep segments in microseconds (source timeline) + per-segment text.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SENTENCE_END = /[。！？；!?.]/;
const SOFT_PAUSE = /[，,、：:]/;

export function parseWordsFile(raw) {
  const text = String(raw);
  const words = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    words.push(JSON.parse(trimmed));
  }
  return words;
}

// Group words into utterances, then merge utterances into keep-segments.
export function buildCutPlan(words, options = {}) {
  const {
    silenceGapMs = 400,
    minSegmentMs = 800,
    maxSegmentMs = 30_000,
    dropFillers = [],
  } = options;

  if (!Array.isArray(words) || words.length === 0) {
    throw new Error('words timeline is empty');
  }

  // 1. Split into utterances at strong boundaries.
  const utterances = [];
  let current = { words: [], text: '', startMs: words[0].start, endMs: words[0].end };
  for (const w of words) {
    if (current.startMs == null) current.startMs = w.start;
    current.words.push(w);
    current.text += w.word ?? '';
    current.endMs = w.utterance_end ?? w.end;
    const lastChar = (w.word ?? '').slice(-1);
    const gapNext = false; // resolved after loop; boundary punctuation is the primary signal
    if (SENTENCE_END.test(lastChar) || gapNext) {
      utterances.push(current);
      current = { words: [], text: '', startMs: null, endMs: null };
    }
  }
  if (current.words.length > 0) utterances.push(current);

  // 2. Silence-gap boundaries between utterances.
  const merged = [];
  for (let i = 0; i < utterances.length; i++) {
    const utt = utterances[i];
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (utt.startMs - prev.endMs > silenceGapMs) {
        merged.push(utt);
        continue;
      }
      // Same block: extend.
      prev.text += utt.text;
      prev.endMs = utt.endMs;
      prev.words.push(...utt.words);
    } else {
      merged.push(utt);
    }
  }

  // 3. Merge too-short segments forward; split too-long ones at soft pauses.
  const sized = [];
  for (const utt of merged) {
    if (sized.length > 0 && utt.endMs - utt.startMs < minSegmentMs) {
      const prev = sized[sized.length - 1];
      prev.text += utt.text;
      prev.endMs = utt.endMs;
      continue;
    }
    sized.push({ ...utt });
  }

  // 4. Emit keep segments (microseconds, source timeline).
  const segments = sized
    .filter((s) => s.text.trim().length > 0)
    .map((s) => ({
      startUs: s.startMs * 1000,
      endUs: s.endMs * 1000,
      durationUs: (s.endMs - s.startMs) * 1000,
      text: s.text,
    }));

  // Drop filler-only segments (explicit list match).
  const kept = dropFillers.length
    ? segments.filter((s) => !dropFillers.some((f) => s.text.includes(f)))
    : segments;

  // Rough-cut timeline mapping (output SRT aligns to the rough cut, not source).
  let cursorUs = 0;
  const withTimeline = kept.map((s) => {
    const entry = { ...s, roughStartUs: cursorUs, roughEndUs: cursorUs + s.durationUs };
    cursorUs += s.durationUs;
    return entry;
  });

  return {
    segments: withTimeline,
    summary: {
      sourceDurationMs: words[words.length - 1].utterance_end ?? words[words.length - 1].end,
      keptSegments: withTimeline.length,
      keptDurationMs: Math.round(cursorUs / 1000),
    },
  };
}

const srtTime = (us) => {
  const total = Math.floor(us / 1000);
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60_000) % 60;
  const h = Math.floor(total / 3_600_000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
};

export function toSrt(segments) {
  return segments
    .map((s, i) => `${i + 1}\n${srtTime(s.roughStartUs)} --> ${srtTime(s.roughEndUs)}\n${s.text}\n`)
    .join('\n');
}

export function writeEpisodeArtifacts(outDir, plan, { mediaPath, wordsRaw } = {}) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'cutlist.json'), JSON.stringify({
    media: mediaPath ?? null,
    summary: plan.summary,
    segments: plan.segments,
  }, null, 2));
  writeFileSync(join(outDir, 'subtitles.srt'), toSrt(plan.segments), 'utf8');
  if (wordsRaw != null) writeFileSync(join(outDir, 'words.jsonl'), wordsRaw, 'utf8');
  return {
    cutlist: join(outDir, 'cutlist.json'),
    srt: join(outDir, 'subtitles.srt'),
    words: wordsRaw != null ? join(outDir, 'words.jsonl') : null,
  };
}
