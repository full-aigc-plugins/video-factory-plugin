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

## 3a. 语义一致性门（advisory，不软化硬门）

`evaluate` 产出 14 个硬门 + 8 个 advisory 门。advisory 中 `semanticConsistency` 是
**唯一**没有确定性生产者的门——它需要宿主 agent 的视觉能力来评分，CLI 只负责
产出物证与校验回填。

- `evaluate --target <image> --emit-evidence <dir>` 产出目标图 + 逐镜头关键帧
  （S##a/S##b）+ `semantic-evidence.json` 清单（每条帧带 sha256）。该路径
  不调用模型、不联网、不读凭据。
- `evaluate --target <image> --semantic-evidence <score.json>` 接收宿主评分，
  schema 校验（四维分数 0-3/0-3/0-3/0-1 + 可相加总分 + 每条缺口含帧标识、
  成因、修复方向），并校验评分引用的每个帧确实存在于物证清单中（防编造）。
- 该门**永远 advisory**：PASS 不软化硬门 FAIL，FAIL 不阻止人工批准或驳回。
- 无 `--target` 时该门 `NOT_RUN`，行为与未启用该能力时完全一致。

## 3b. 轮次纪律（何时停下，不交回自动循环）

宿主 agent 在多轮迭代视觉结果时，遵守以下纪律：

1. **评分必须独立上下文**：评分者不得继承实现该轮改动的 agent 的推理过程；
   换一个干净上下文再评，防止"实现者自评自通过"。
2. **跨轮回归要识别**：某一轮总分低于上一轮，下一轮评分应如实更低，不得
   为抬分而背离上一轮结论。
3. **停滞升级**：最佳分连续 2 轮未提升 ≥1 分，或同一缺口连续出现 2 次 →
   停手，整体重审（素材、镜头职责、结构），不继续微调。
4. **停滞收敛于人工**：架构级变更后仍停滞 → 交人类裁定，不自动循环、不
   自动重试。

## 3c. 素材获取阶梯（何时用哪一级，不走捷径）

宿主 agent 为 plan 准备素材时，按固定顺序逐级判定，不因时间、成本或主观
判断跳过前序级别：

1. **外部下载**：默认不允许，除非用户显式授权。授权状态记入素材记录的
   `source` 字段。
2. **生成式素材**：不视为"下载网络素材"。具备图像生成能力时，纹理、法线、
   天空盒应由生成式产出，禁止用纯色或程序化噪声替代——该选择对观感的贡献
   高于几何复杂度，不属于可省略细节。
3. **本地建模**：中性级别，由场景复杂度、可用工具与时间预算共同裁定；需要
   精细 3D 资产且本机装有 Blender 时给出正向评估，而非默认跳过。
4. **程序化**：最后一级。仅当它是仅剩选项，或确实产生最贴合目标的结果时才
   采用；不接受"更快""省 token""时间紧"作为理由。

每一级被判定为不可用时，记录具体不可用条件（无凭据、被显式禁止、无匹配
模型、目标不要求该级别细节），拒绝泛化表述。该阶梯不改变授权边界：素材
仍须落在授权根内并携带哈希，URL 仍不能直接写入 asset path。

## 4. 纪律

- 各 `video-factory-*` 技能（plan/run/judge/recover/use）已随插件分发：
  **对应阶段先读对应技能**；场景级入口见 `/video-episode`。
- CLI 每步输出是事实来源；"应该剪好了"不算数，验证结论必须来自命令输出。
- 配额与时长约束以 quote 输出为准；ffmpeg 失败原文上报，不转述。
