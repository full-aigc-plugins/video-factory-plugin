## Why

关于 5 个受管技能中 `<!-- QUALITY_BASELINE_V1 -->` 通用样板的原始判断包含两部分。用实测把两部分切开后，**只有一部分成立，而我原先给出的处置方式是错的**。本节如实记录两者的区别。

### 成立的部分：`workflow-contract.md` 发布了与代码矛盾的状态机

5 个技能的 `references/workflow-contract.md` 声明状态模型为：

```
DISCOVERED → PREFLIGHTED → PLANNED → EXECUTING → VERIFYING → COMPLETED
```

而真实状态机由 `schemas/video_job.schema.json` 枚举强制、`src/job-ledger.mjs:11-16` 实现：

```
AwaitingApproval, Running, Partial, Blocked, Collecting, Verifying, ReviewReady, ReworkReady, Completed, Failed
```

两套命名只有 `Completed` 重合。**该文件遗漏了 `ReviewReady` 与 `ReworkReady`——承载人工闸门的两个状态**，并虚构了 5 个代码中不存在的状态。而技能正文的 "Progressive disclosure" 段正是指向这个文件，agent 按指引加载会得到与 schema 冲突的状态模型。这是真实缺陷，且**修复它是 TRACE 中性的（已实测）**。

### 被否证的部分：删除通用样板是不可行的

我用本仓可用的 TRACE 评估器对 `video-factory-judge` 做了三组实测（评估器：`full-stack-skills-repositories/agent-skills/skills/skill-trace-evaluation/scripts/trace_evaluate.py`；上游门：`skill-lint.yml` 执行 `trace_gate.py --threshold 4.5`）：

| 变体 | overall | 对 4.5 门 |
|---|---|---|
| 基线（原样） | **4.60** | ✅ |
| 只改 `references/workflow-contract.md` 内容（文件数不变） | **4.60** | ✅ 中性 |
| 删除 `examples/` 下 3 个模板桩 | **4.50** | ⚠️ 恰好触线，零余量 |
| 删除 SKILL.md 的 `QUALITY_BASELINE_V1` 样板 | **4.12** | ❌ 跌破 |

**因此：删除样板会让 5 个技能全部跌破上游门。** judge 由 4.60 掉到 4.12，该技能在 `QUALITY_BASELINE_V1` 之后提供的 12 个 TRACE 子信号同时消失（`has_security_declaration`、`has_boundary`、`has_when_to_use`、`has_gotchas_section`、`has_rules_section`、`has_validation`、`has_workflow_steps`、`gotchas_count≈14`、`body_lines` 等）。这与同仓 `docs/plans/2026-09-21-upstream-v1.0.2-and-openspec-split.md` §1.1 的独立实测结论一致（该处测得 judge 4.610 → 4.130）。

### 机制：为什么内容可改而文件数不可减

读评估器实现可知（`trace_evaluate.py:95-236, 424-539`）：

- 打分依赖于 `SKILL.md` 正文的结构信号（`body_lines`、`has_workflow_steps`、`has_gotchas_section`、`gotchas_count` 等）；
- 同时**统计** `references/` 与 `examples/` 下的**文件数量**（`references_files`、`references_subdirs`、`examples_files`），这些计数直接进入 R2、A4、C1、E2 等信号；
- 对全部文件**只做两项内容扫描**：密钥泄漏（`SECRET_RE`）与交互式输入痕迹（`input(`、`read -p`）。

即：**参考文件的"内容"对 TRACE 中性，"数量"对 TRACE 敏感。**

## What Changes

- 修正 5 个技能的 `references/workflow-contract.md` 为真实状态机，逐项对应 `video_job.schema.json` 枚举，并显式标注 `ReviewReady → Completed|ReworkReady` 为人工闸门（已实测 TRACE 中性：4.60 → 4.60）。
- 重写 5 个技能的 `references/validation-checklist.md` 与 `references/error-recovery.md` 为领域内容，**保持文件数不变**。
- 重写 5 个技能下的 3 个 `examples/*.md` 为领域内容，**不删除**——删除使分数降至 4.50，恰好触线且零余量。
- 新增本仓漂移守护测试：`references/contracts-and-safety.md`、`references/operations.md`、`references/examples-and-faq.md` 三个跨技能逐字节相同的文件必须保持一致。
- 新增本仓回归断言：技能不得再发布与 `video_job.schema.json` 冲突的状态机。
- 校正 `package.json` 版本（当前 `0.1.0`，4 个 manifest 均为 `0.1.5`）。

## 明确移出范围：SKILL.md 样板的替换

**本变更不删除 `QUALITY_BASELINE_V1` 样板。** 它不是可以清掉的噪音，而是被 12 个 TRACE 子信号承重的结构：直接删除会使 5 个技能全部跌破 4.5 门。

正确的处置是**用等价信号强度的领域内容替换它**——把那 12 个信号（安全声明、边界、适用场景、陷阱、规则、验证、工作流步骤、陷阱条目数、正文长度）用真正属于本插件的内容逐一承载。这是一次重写工程，风险与工作量都超出一次发版该承担的范围，故列为独立后续变更，且必须以上游 `trace_gate.py --threshold 4.5` 保持全绿为验收条件。

关于"重复"的说明：上述三个逐字节相同的文件**不是缺陷**。技能按用户粒度安装（`npx skills add <pkg> --skill <name>` 只复制被请求的技能），每个技能必须自带其参考文件。需要防的是**漂移**，不是重复。

## Capabilities

### New Capabilities
- `skill-instruction-integrity`: 技能正文与参考文件的内容完整性契约，覆盖发布的状态模型须与强制契约一致、参考文件须为领域文档、改写须保持评分门依赖的结构信号、以及跨技能重复文件的同步。

### Modified Capabilities
None.

## Impact

- `skills/video-factory-{judge,plan,run,use,recover}/references/*.md` 与 `examples/*.md`（**全部 5 个技能均属上游受管，见约束**）
- `tests/skills.test.mjs`（新增漂移与状态机断言）
- `package.json` 版本校正
- 纯内容质量修复，无运行时行为变更
- 内容改动必须以上游 `trace_gate.py --threshold 4.5` 保持全绿为验收条件

## Constraint: 5 个受影响技能全部属上游受管

`skills.lock.json` 声明这 5 个技能来自 `full-aigc-skills/video-factory-skills` @ `v1.0.1`（sha `6077533c5dd9c5089998e07c557f6a2d5f6c2203`）。`.github/workflows/skills-check.yml` 的 "Reject direct edits to externally managed skills" 步骤会拒绝未经 `skills.lock.json` 的受管技能改动。

**内容主体必须在上游技能仓完成**，本仓只能落地 `tests/skills.test.mjs` 的回归断言与随同步提交的 `skills.lock.json`。流程：上游改写 → 通过 `trace_gate.py` → 发布新 tag → 本仓 `python3 scripts/vendor/skill_vendor.py update --source-ref video-factory-skills=<tag> --expected-sha <peeled-sha>`。

上游发布链当前存在已知阻塞——`full-aigc-skills/video-factory-skills` 的 `notify-consumers.yml` 最近一次运行结论为 failure（run 35594549361，2026-09-21T11:31:57Z），成因是分发令牌的跨仓权限。该问题的修复归属 `2026-09-21-select-sync-token-by-source`。
