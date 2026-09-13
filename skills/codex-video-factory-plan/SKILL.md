---
name: codex-video-factory-plan
description: Use when local images, clips, audio, or ReelBench shot evidence must be converted into a validated rough-cut or final-cut EditDecision before rendering.
---

# Plan a Video Factory edit

Create a closed `EditDecision` and `VideoPlan`. Preserve source hashes, stable clip IDs, integer
timeline ticks, track placement, transitions, subtitles, audio gains, output profile, and round.
Run `bin/video-factory validate-plan` and `quote`; do not render or invent missing assets.
