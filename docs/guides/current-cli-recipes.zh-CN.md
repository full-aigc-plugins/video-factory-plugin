# Codex Video Factory 0.1.0 CLI 实操手册

## 1. 能力探测

```bash
bin/video-factory probe
```

`ffmpeg` 与 `ffprobe` 缺失会阻塞所有制作。Chrome 缺失只阻塞 `video-sync` 的增强审阅，不影响
普通粗剪和终版。`nativeVideo.available=false` 是真实能力状态，不会静默切换外部 API。

## 2. 拉片

```bash
bin/video-factory analyze input.mp4 --out reelbench-analysis
```

该命令执行原样 ReelBench 的 seed 分析入口。完整语义标注、验证与报告应按 `video-shots`
Skill 的原始流程继续，Factory 保留原始 stdout、stderr、退出码和证据路径。

## 3. 计划与批准

计划由 `assets`、`editDecision` 和 `output` 组成。时间统一使用有理 timebase 和整数 ticks；
素材必须带 SHA-256。常见操作：硬切 `cut`、淡入淡出 `fade`、叠化 `dissolve`；图片运动支持
`static`、`zoom-in`、`zoom-out`、`pan-left`、`pan-right`。

```bash
bin/video-factory validate-plan video-plan.json
bin/video-factory quote video-plan.json --stage rough
```

把报价中的 `planHash`、`editHash`、`stage`、`round` 和 `quoteRevision` 原样写入批准文件。先批准
粗剪，审片修改后创建新的 EditDecision revision，再报价并批准终版。

## 4. 粗剪、审阅和终版

```bash
bin/video-factory run video-plan.json \
  --stage rough \
  --approval rough-approval.json \
  --ledger rough-job.json \
  --input-root ./assets \
  --work-root ./.video-work \
  --output-root ./output

bin/video-factory review-sync output/project-rough-<hash>.mp4 shots.json \
  --panels review-panels \
  -o review-sync.mp4

bin/video-factory run video-plan.json \
  --stage final \
  --approval final-approval.json \
  --ledger final-job.json \
  --input-root ./assets \
  --work-root ./.video-work-final \
  --output-root ./output
```

粗剪默认 720p、CRF 28、`veryfast`。终版默认目标画幅、30 fps、CRF 20、`medium`、H.264、
`yuv420p`、AAC 48 kHz。SRT/ASS 字幕作为 MP4 字幕轨嵌入；这避免依赖本机缺失的 libass。

重要限制：原样 `video-sync` 依赖输入音轨决定结束时间。Factory 生成的分段和粗剪始终包含
规范化静音 AAC，因此可安全进入同步审阅；外部无音轨视频会在适配器边界被拒绝。

## 5. 状态、恢复和验收

```bash
bin/video-factory status rough-job.json
bin/video-factory recover rough-job.json
bin/video-factory evaluate output/final.mp4 video-plan.json
```

恢复只返回尚未完成的镜头；失败步骤不会自动重试。每个分段以素材哈希与编辑参数寻址，
未变化分段可复用。最终媒体会执行 ffprobe、完整解码、两次哈希、黑帧、冻结帧、静音和字幕
时间边界检查。`SKIPPED` 与 `NOT_RUN` 不得写成 `PASS`。

## 6. 缺素材交接

如果缺图、动画或用户素材，生成 `asset-requirements.json`，交给 Image Factory、Blender Plugin
或用户补齐。回传只接受公开字段：素材 ID、本地路径、SHA-256、类型、来源、授权、许可和回执
路径；不得 import 其他插件私有模块或读取它们的数据库。
