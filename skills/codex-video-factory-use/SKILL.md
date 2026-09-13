---
name: codex-video-factory-use
description: Use when a request involves automatic video editing, rough cuts, final cuts, synchronized shot review, media verification, or recovery and must be routed to the correct Video Factory workflow.
---

# Codex Video Factory

Route shot breakdown requests to `video-shots` and annotated review-video requests to `video-sync`.
Route edit planning to `codex-video-factory-plan`, rendering to `codex-video-factory-run`,
acceptance to `codex-video-factory-judge`, and interrupted jobs to `codex-video-factory-recover`.

Do not claim native AI video generation. Missing images or Blender animation are standard asset
requirements for their owning plugins, not work performed by this plugin.
