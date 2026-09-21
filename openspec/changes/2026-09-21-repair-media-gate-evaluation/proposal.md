## Why

`evaluate` 是 `video-factory-judge` 技能文档指定的唯一判定入口，但它在两条独立路径上都产不出有效判定，实测可复现。

**缺陷一：唯一入口恒为 `fail`。** `src/cli.mjs:99` 调用 `collectMedia(argv[1])` 时未传入来源/时间线上下文，`src/media-collector.mjs:6` 的默认值 `provenanceOk = false, timelineOk = false` 被原样送入 `src/media-evaluator.mjs:11-12` 的两个必需门。用一份 640x360 / 30fps / h264 / yuv420p / aac 48k、12 项硬门全部 PASS 的成片实测：

```
decision: "fail"
failedRequired: ["timeline", "provenance"]
```

只要这两个门由硬编码假值生产，该命令就永远不可能返回 `pass` 或 `review`。

**缺陷二：advisory 门全部未运行。** `evaluate` 不构造 evidence，`src/media-evaluator.mjs:21` 的 8 个 advisory 门全部 `NOT_RUN`。而 orchestrator 路径（`src/orchestrator.mjs:118-123`）会通过 `analyzeMedia` + `analyzeEditPolicy` 填充其中 7 个——说明生产者已经存在，只是判定入口没调用它们。

**两者叠加造成死路。** `skills/video-factory-judge/SKILL.md:12` 把"时间线和来源"列为第一步硬门，且同文件规定"硬门失败不能人工放行"。当唯一入口必然返回 fail、规则又禁止放行时，该技能按文档执行无法收敛。

**根因是二态门接受了三态现实。** `MediaScores` schema 的 gate status 枚举已经包含 `PASS/FAIL/SKIPPED/NOT_RUN` 四态，但评估器把"证据缺失"和"证据显示失败"都压成了布尔 `false`。

## What Changes

- `collectMedia` 的来源/时间线字段缺省为"未提供"而非 `false`；`evaluateMedia` 把"未提供"判为 `NOT_RUN`、把显式 `false` 判为 `FAIL`。
- 时间线门改为派生：由计划推导期望时长并与回执比对，不再依赖调用方声明。该门因此无需台账即可成立。
- `evaluate` 新增 `--ledger`，从台账读取来源证据（分段回执集合与 descriptorKey）；缺失时来源门保持 `NOT_RUN` 并输出补齐指引。
- `evaluate` 调用 `analyzeMedia` + `analyzeEditPolicy` 填充 7 个已有生产者的 advisory 门。
- `failedRequired` 语义不变（只收集实际 `FAIL`），修复点在上游不再喂假 `false`。
- `video-factory-judge` 技能同步修正，并补入规则：`NOT_RUN` 不得当作 `PASS`，也不得被人工批准转为通过。

## Capabilities

### New Capabilities
- `media-gate-evaluation`: 成片的确定性硬门与策略门判定契约，覆盖证据来源、四态门语义、派生门规则与判定合成规则。

### Modified Capabilities
None. 现有规格 `cross-host-plugin-identity` 与 `immutable-skill-supply-chain` 均不涉及媒体判定行为。

## Impact

- `src/media-collector.mjs`、`src/media-evaluator.mjs`、`src/cli.mjs`
- `skills/video-factory-judge/SKILL.md` 与 `references/operations.md`
- `tests/runtime-render.test.mjs`、`tests/reelbench-runtime.test.mjs`、`tests/contracts.test.mjs` 需覆盖四态语义
- 无 schema 变更，无数据迁移；`run` 路径的审批链不受影响
- 属行为修复，按仓库要求需 bump 版本并同步插件仓与市场仓

## Constraint: 代码可立即落地，技能文档受上游约束

**核心缺陷修复不被阻塞。** 缺陷本身在 `src/cli.mjs`、`src/media-evaluator.mjs`、`src/media-collector.mjs`，三者均为插件本地代码，可直接修改、测试并发布。

**文档部分受上游约束。** `skills.lock.json` 声明 `video-factory-judge` 来自 `full-aigc-skills/video-factory-skills` @ `v1.0.1`（sha `6077533c5dd9c5089998e07c557f6a2d5f6c2203`），属插件外部受管。`.github/workflows/skills-check.yml` 的 "Reject direct edits to externally managed skills" 步骤会在 PR 中比对改动文件前缀，命中即失败，除非同时改动 `skills.lock.json`。

因此第 4 组任务（`video-factory-judge/SKILL.md` 与 `references/operations.md`）必须经上游发版：上游改写 → 发布新 tag → 本仓 `python3 scripts/vendor/skill_vendor.py update --source-ref video-factory-skills=<tag> --expected-sha <peeled-sha>`。

上游发布链当前存在已知阻塞——`full-aigc-skills/video-factory-skills` 的 `notify-consumers.yml` 最近一次运行结论为 failure（run 35594549361，2026-09-21T11:31:57Z），成因是分发令牌的跨仓权限。该问题的修复归属 `2026-09-21-select-sync-token-by-source`。
