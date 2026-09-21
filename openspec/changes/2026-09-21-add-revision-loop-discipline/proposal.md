## Why

跨轮迭代的基础设施已经齐备，但**没有任何跨轮比较**，每一轮的判定与上一轮完全独立：

- `VideoPlan` schema 已把 `round` 列为 required（`schemas/video_plan.schema.json`）。
- 台账已有单调递增 `revision` 与合法迁移表（`src/job-ledger.mjs:11-16`）。
- `quote` 与 approval 已把 round、quote revision 纳入绑定，`verifyApproval` 会逐项比对（`src/approval.mjs:20,39`）。
- `diffEditDecision(previous, next)` 已实现，能算出哪些 clip 变了。

后果是三种失败模式在插件里既无法被发现、也无法被报告：

1. **空转。** 连续改了 5 轮，判定与分数没有任何变化，配额与时间被消耗却无人知晓。
2. **回归。** 本轮成片比上一轮更差，但因为是同一条独立判定路径，判定结果与之前相同——"更差"这件事在系统里没有任何位置被记录。
3. **无出口的微调。** `skills/video-factory-run/SKILL.md` 只规定"Failed 需要新 round"，从未定义何时该停止微调、何时该换整体方案、何时该把决定交回人类。agent 因而可以无限次微调下去。

`research/dream-loop`（MIT，Anshu Chimala）的 Pro workflow 给出一套可直接移植的跨轮纪律：评审必须拿到上一轮的截图与结论；"若产物回归，分数就应该更差"；最佳分连续两轮未提升整整一分、或评审连续两次点出同一缺口 → 停止微调、改做架构级变更；架构级变更也无效 → 停止并请人类裁定。

## What Changes

- 台账记录每轮的判定快照（总分、门状态摘要、缺口指纹），使跨轮比较可计算且可审计。
- 引入回归检测：本轮总分低于上一轮时，在判定输出与台账历史中显式标记回归。
- 引入停滞判定：最佳分连续 N 轮未达到提升阈值，或同一缺口连续出现 N 次 → 升级为"需要架构级变更"。
- 停滞升级的终点固定为人类裁定：判定不得自动推进作业状态，也不得自动触发新一轮。
- 明确 N 的默认值与可配置方式，并把纪律写入技能文档。
- `skills/video-factory-harness/SKILL.md`、`video-factory-run/SKILL.md`、`video-factory-recover/SKILL.md` 同步补入。

## Capabilities

### New Capabilities
- `revision-loop-discipline`: 跨轮迭代的收敛纪律，覆盖判定快照、回归检测、停滞升级与人类出口。

### Modified Capabilities
None.

## Impact

- `src/job-ledger.mjs`（跨轮快照与状态）、`src/orchestrator.mjs`（判定后写入快照）、`src/media-evaluator.mjs`（缺口指纹）
- `skills/video-factory-harness/SKILL.md`（插件本地，可直接改）
- `skills/video-factory-run/SKILL.md`、`skills/video-factory-recover/SKILL.md`（**上游受管，见约束**）
- 依赖 `2026-09-21-add-visual-semantic-gate` 提供的可比分数；该变更未落地时退化为仅比较门状态摘要
- 不改变人工审批的终审地位，不引入自动循环、自动重试或自动状态推进

## Constraint: 上游受管技能不可本地修改

`skills.lock.json` 声明以下 5 个技能来自 `full-aigc-skills/video-factory-skills` @ `v1.0.1`（sha `6077533c5dd9c5089998e07c557f6a2d5f6c2203`），属插件外部受管：`video-factory-use`、`video-factory-plan`、`video-factory-run`、`video-factory-judge`、`video-factory-recover`。

`.github/workflows/skills-check.yml` 的 "Reject direct edits to externally managed skills" 步骤会在 PR 中比对改动文件前缀，命中即失败，除非同时改动 `skills.lock.json`。

因此本变更中针对 `video-factory-run` 与 `video-factory-recover` 的文档改动**必须经上游发版**：在上游改技能 → 发布新 tag → 本仓 `python3 scripts/vendor/skill_vendor.py update --source-ref video-factory-skills=<tag> --expected-sha <peeled-sha>`。插件本地可直接修改的范围是 `video-factory-harness`、`video-episode-slicing`、`video-shots`、`video-sync`。

上游发布链当前存在已知阻塞（dispatch token 跨仓权限），修复归属 `2026-09-21-select-sync-token-by-source` 与各技能库自身的发布流程。
