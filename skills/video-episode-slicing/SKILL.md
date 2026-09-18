---
name: video-episode-slicing
description: "Talking-head slicing scenario: word-level ASR timeline → deterministic cut points (sentence punctuation + silence gaps) → rough-cut MP4 + aligned SRT + cutlist JSON for manual fine-tune in any editor. Use when the user wants to cut a long 口播/voiceover recording down, or mentions 切片/粗剪/口播精剪."
---

# Episode Slicing — 口播切片精剪

The scenario chains two plugins: **volcengine-design** (perception: word-level
timeline) and **video-factory** (assembly: deterministic slicing + rough cut).
The deliverable is a rough cut a human fine-tunes — not a finished video.

## Chain

1. **Timeline** (volcengine-design): `scripts/volcengine_asr.py submit → wait`
   on the source audio/video; export words as JSONL
   (`{"start","end","word","utterance_end"}` in milliseconds, one per line).
2. **Slice** (video-factory): `node src/cli.mjs episode-slice <words.jsonl>
   --out-dir <out>` — cut points = sentence-final punctuation + silence gaps
   (>400ms, tunable); short segments merge forward. Outputs `cutlist.json`
   (microsecond keep ranges + text) and `subtitles.srt` aligned to the rough cut.
3. **Rough cut**: `node src/cli.mjs episode-roughcut <out/cutlist.json>
   --output rough-cut.mp4` (ffmpeg concat; copy first, re-encode fallback).
4. **Hand off**: rough-cut.mp4 + subtitles.srt + cutlist.json. In 剪映: import
   the MP4, add the SRT (or use 识别字幕), consult cutlist for what was removed.

## Cost & credentials

- ASR runs on the user's Volcengine credentials (≈0.8 元/小时档) via the
  volcengine-design plugin; without credentials step 1 fails fast with setup
  guidance. Steps 2-3 are local and free.

## Honest boundary

剪映 6.0+ encrypts draft files — this scenario does NOT write native drafts.
The rough-cut MP4 + SRT + cutlist combo imports into any editor. Do not
reverse-engineer the encrypted draft format.
