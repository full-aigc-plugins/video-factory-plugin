---
name: codex-video-factory-run
description: Use when a validated VideoPlan has an explicit matching rough-cut or final-cut approval and should be rendered, collected, and recorded without automatic retry.
---

# Run an approved edit

Verify capability, plan hash, edit hash, stage, round, and approval before launching FFmpeg.
Render only pending content-addressed segments, then assemble and verify the selected stage.
Never bypass approval, retry automatically, overwrite an accepted artifact, or pass arbitrary shell
or FFmpeg expressions from user-controlled input.
