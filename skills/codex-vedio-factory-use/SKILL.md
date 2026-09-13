---
name: codex-vedio-factory-use
description: Use when a request involves automatic video editing, rough cuts, final cuts, synchronized shot review, media verification, or recovery and must be routed to the correct Vedio Factory workflow.
---

# Codex Vedio Factory

Route shot breakdown requests to `video-shots` and annotated review-video requests to `video-sync`.
Route edit planning to `codex-vedio-factory-plan`, rendering to `codex-vedio-factory-run`,
acceptance to `codex-vedio-factory-judge`, and interrupted jobs to `codex-vedio-factory-recover`.

Do not claim native AI video generation. Missing images or Blender animation are standard asset
requirements for their owning plugins, not work performed by this plugin.
