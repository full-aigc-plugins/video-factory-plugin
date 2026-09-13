# Codex Video Factory

Codex Video Factory is a local-first Codex plugin for shot analysis, automatic edit planning, rough cuts,
synchronized review videos, final composition, recovery, and media quality receipts. The repository keeps
the canonical `video` spelling across repository, plugin, package, CLI, and Skill identifiers.

## What it owns

- Original ReelBench `video-shots`: analyze existing footage, cut points, motion, shot semantics, and gates.
- Original ReelBench `video-sync`: build an internal picture-plus-shot-data review video.
- Factory runtime: validate a closed `EditDecision`, bind approvals, render resumable segments, assemble
  cuts, embed local audio/subtitles, evaluate media, and record immutable receipts.

It does not provide a graphical studio, generate images, control Blender, or call an external video API.
PartMe Studio owns UI and projects; Image Factory and Blender Plugin return authorized, hashed assets.

## Requirements

- Node.js 18 or newer
- FFmpeg and ffprobe
- Chrome only for the enhanced `video-sync` review workflow

There are no npm runtime dependencies and no API keys.

## Quick start

```bash
bin/video-factory probe
bin/video-factory validate-plan video-plan.json
bin/video-factory quote video-plan.json --stage rough
bin/video-factory run video-plan.json --stage rough --approval rough-approval.json
bin/video-factory review-sync output/rough.mp4 reelbench-analysis/shots.json
bin/video-factory quote video-plan.json --stage final
bin/video-factory run video-plan.json --stage final --approval final-approval.json
```

Every approval binds the stage, plan hash, edit hash, round, and quote revision. Any asset, edit, or output
change invalidates the old approval. Inputs must be regular files beneath `--input-root` and match SHA-256.

See the [Chinese guide](README.zh-CN.md), [CLI recipes](docs/guides/current-cli-recipes.zh-CN.md),
[architecture specification](docs/superpowers/specs/2026-09-14-codex-video-factory-plugin-design.md), and
[third-party notices](THIRD_PARTY_NOTICES.md).
