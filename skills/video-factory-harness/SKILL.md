---
name: video-factory-harness
description: "Video Factory calling spec: the Node CLI surface (probe/analyze/validate-plan/quote/run/review-sync/episode-*), the rough→human-review→final approval gate, hard rules from verification records, and delivery discipline. Read this before producing or cutting any video."
---

# 视频工厂调用规范

执行通道是本插件随附的 Node CLI：`<插件根>/src/cli.mjs`（自动剪辑与**验证式**合成）。
依赖：`ffmpeg/ffprobe` 在 PATH（媒体分析与合成必需）。

## 1. 子命令面

```
video-factory probe                          # 环境探测（第一步）
video-factory analyze <video>                # 镜头分析
video-factory analyze-finalize <shots.json> --track <track.json> --frames <dir>
video-factory validate-plan <plan.json>      # 计划校验（未过不进 quote）
video-factory quote <plan.json> --stage rough|final
video-factory run <plan.json> --stage rough|final --approval <approval.json>
video-factory review-sync <rough-cut> <shots.json>
video-factory episode-slice <words.jsonl> --out-dir <out>   # 口播切片（词级时间轴→切点）
video-factory episode-roughcut <cutlist.json> --output rough-cut.mp4
```

`episode-*` 的 words 时间轴来自 volcengine-design 插件的豆包 ASR
（词级毫秒时间戳）；口播场景全链见 `video-episode-slicing` 技能。

## 2. 硬规则（来自上游验证记录）

- **final 阶段必须持 approval 文件**——没有人工批准文件不进 final 合成。
- rough → 人工审 → final 是唯一节奏；跳过 rough 直接 final 属违规。
- `validate-plan` 不过的问题清单要逐条解决，不许带病 quote。

## 3. 标准工作流

1. **素材分析**：`probe` → `analyze` → `analyze-finalize` 产出 shots.json。
2. **计划与报价**：写 plan.json → `validate-plan` → `quote --stage rough`；
   超预算/超时长约束就不 run，如实上报。
3. **粗剪**：`run --stage rough` → 人工审粗剪 → `review-sync` 对轨。
4. **终剪**：拿到批准后 `run --stage final`，交付成片与验证报告。
5. **口播切片**（场景路径）：ASR 时间轴 → `episode-slice` → `episode-roughcut`，
   交付粗剪 MP4 + SRT + 切割清单三件套，人工精修。
6. 交付时列出：计划摘要、阶段产物路径、验证结论、未验证项。

## 4. 纪律

- 各 `video-factory-*` 技能（plan/run/judge/recover/use）已随插件分发：
  **对应阶段先读对应技能**；场景级入口见 `/video-episode`。
- CLI 每步输出是事实来源；"应该剪好了"不算数，验证结论必须来自命令输出。
- 配额与时长约束以 quote 输出为准；ffmpeg 失败原文上报，不转述。
