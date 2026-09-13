---
name: codex-vedio-factory-judge
description: Use when a rough or final video needs deterministic media gates, advisory semantic review, and explicit human acceptance or rework labels.
---

# Judge a Vedio Factory artifact

Run `bin/vedio-factory evaluate`. Required file, hash, decode, stream, duration, dimensions, frame
rate, audio, timeline, and provenance gates decide technical validity. Keep advisory findings and
human labels separate; a model score cannot override deterministic failure or human rejection.
