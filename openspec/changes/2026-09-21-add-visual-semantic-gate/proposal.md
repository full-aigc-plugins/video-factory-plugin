## Why

`src/media-evaluator.mjs:21` 声明的 8 个 advisory 门中，`semanticConsistency` 在全仓没有任何生产者。全仓检索该标识只有两处命中：门列表本身，以及 `tests/runtime-render.test.mjs:32` 传入的测试假数据。CHANGELOG 0.1.0 逐项声明交付了 black/freeze/silence/subtitles/AV offset/duplicates/rhythm 七个门，第八个既未交付，也未在 CHANGELOG 中声明。

由此产生的实际能力缺口是：**插件能回答"这条成片技术上是否合规、剪辑策略是否有风险"，但完全不能回答"这条成片是不是用户想要的样子"。** 现有 14 个硬门与 8 个 advisory 门全部是自洽性检查——把成片与计划和回执比对，从不把成片与用户意图比对。

而插件已经具备产出视觉物证的全部管道：`skills/video-shots/scripts/video-shots.mjs` 产出逐镜头关键帧（`frames/S01a.jpg` 起手帧、`S01b.jpg` 收尾帧）与联系表（`sheets/`，一张表覆盖二十余个镜头，a/b 对照即运镜），`video-sync` 产出同步审阅面板与审阅 MP4。更关键的是 `analyze-finalize` 的返回状态字面上就叫 `AWAITING_CODEX_ANNOTATION`——**流水线本来就设计成停在等一个具备视觉能力的 agent 来标注**，只是那个 agent 的判定从未被结构化为一个门。

`research/dream-loop`（MIT，Anshu Chimala）提供了一套可直接移植的视觉评审方法：四维 rubric、逐像素对齐目标的严格度、以及"反馈必须点名具体成因与修复方向"的可执行性要求。本变更移植其 rubric 与纪律，不移植其自循环与模型调用。

## What Changes

- 为 `semanticConsistency` 门建立生产者：目标参考图 × 成片物证 × 结构化 rubric，由宿主 agent 的视觉能力评分后回填。
- `evaluate --target <image> --emit-evidence <dir>`：产出目标图与成片帧的同尺度配对物证包，供宿主 agent 阅读。该路径不调用模型、不联网、不读凭据。
- `evaluate --semantic-evidence <json>`：接收宿主 agent 的评分，schema 校验与证据绑定校验后写入 evidence 并参与判定。
- 新增 `schemas/semantic_evidence.schema.json` 约束评分结构。
- rubric 采用四维结构（构图 / 光照 / 材质 / 细节，权重 0-3-3-3-1，总分 10），并要求每条缺口可执行。
- 目标参考图作为哈希绑定的一等产物登记。
- 该门严格保持 advisory：模型分不得软化硬门失败，不得阻止人工批准或驳回。

## Capabilities

### New Capabilities
- `visual-semantic-consistency`: 以目标参考图为基准的成片视觉语义判定契约，覆盖目标图登记、物证产出、评分回填与 advisory 边界。

### Modified Capabilities
None.

## Impact

- `src/media-evaluator.mjs`（接入 `semanticConsistency` 生产者）、`src/cli.mjs`（两个新参数路径）
- 新增 `schemas/semantic_evidence.schema.json`
- `src/integrations/reelbench-adapter.mjs`（复用既有 frames/sheets 产出，不新增抽帧实现）
- `skills/video-factory-judge/`、`skills/video-factory-harness/SKILL.md`、`skills/video-factory-plan/`
- 依赖 `2026-09-21-repair-media-gate-evaluation` 交付的四态门语义与 evidence 回填管道
- 不引入外部生成 API、API key、npm 依赖或网络调用；不上传任何素材
- 新增功能，按仓库要求需 bump minor 版本并同步插件仓与市场仓

## Constraint: 可本地落地的范围与受上游约束的范围

**可直接落地（插件本地）**：`src/cli.mjs`、`src/media-evaluator.mjs`、`src/integrations/reelbench-adapter.mjs`、新增的 `schemas/semantic_evidence.schema.json`、以及 `skills/video-factory-harness/SKILL.md`（`plugin-local-skills.json` 声明为插件本地）。

**受上游约束**：`skills.lock.json` 声明 `video-factory-judge` 与 `video-factory-plan` 来自 `full-aigc-skills/video-factory-skills` @ `v1.0.1`（sha `6077533c5dd9c5089998e07c557f6a2d5f6c2203`），属插件外部受管。`.github/workflows/skills-check.yml` 会拒绝未经 `skills.lock.json` 的受管技能改动。因此第 5 组中针对 judge 与 plan 的文档改动必须经上游发版；rubric 正文建议先在 `video-factory-harness`（本地）落地使其即时生效，judge 与 plan 的正文随上游 tag 补齐。

上游发布链当前存在已知阻塞——`full-aigc-skills/video-factory-skills` 的 `notify-consumers.yml` 最近一次运行结论为 failure（run 35594549361，2026-09-21T11:31:57Z），成因是分发令牌的跨仓权限。该问题的修复归属 `2026-09-21-select-sync-token-by-source`。
