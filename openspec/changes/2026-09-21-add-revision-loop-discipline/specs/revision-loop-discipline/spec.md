## Purpose

为多次迭代的剪辑作业建立跨轮收敛纪律：每轮留下可比较的判定快照，使空转与回归可被检测，为无限微调提供确定性出口，并在停滞无法通过架构级变更解除时把决定交回人类，而不是让模型分数自动推进作业状态。

## ADDED Requirements

### Requirement: Each round records a comparable snapshot
台账 MUST 为每轮记录可跨轮比较的判定快照。快照 MUST 与既有 `revision` 语义对齐，且 MUST NOT 成为第二套独立的轮次事实来源。

#### Scenario: Snapshot recorded after evaluation
- **WHEN** 一轮判定完成
- **THEN** 台账记录该轮的轮次、revision、判定、总分、门状态摘要与缺口指纹

#### Scenario: Legacy ledger without snapshots
- **WHEN** 对不含快照字段的历史台账执行判定
- **THEN** 该轮被视为首轮，不触发任何停滞或回归结论，判定结果与变更前一致

### Requirement: Regression across rounds is detected and surfaced
本轮表现低于上一轮时，判定 MUST 显式标记回归。比较 MUST 只在可比数据之间进行，MUST NOT 用默认值伪造回归信号。

#### Scenario: Score decreases
- **WHEN** 本轮总分低于上一轮总分
- **THEN** 判定输出与台账历史均标记本轮为回归

#### Scenario: Comparable score is unavailable
- **WHEN** 某一轮缺少总分
- **THEN** 比较退化为门状态摘要（是否出现新的 `FAIL`），MUST NOT 以默认分数替代

### Requirement: Stagnation is detected before further tweaking
迭代 MUST 在停滞时被识别。停滞判定 MUST 同时覆盖"分数不再提升"与"同一缺口反复出现"两种情形，并 MUST 使用有默认值的阈值。

#### Scenario: Score stops improving
- **WHEN** 最佳总分连续 N 轮提升不足 1.0 分
- **THEN** 判定标记为停滞，并要求改为架构级变更而非继续微调

#### Scenario: Same gap recurs
- **WHEN** 同一缺口指纹连续出现 N 次
- **THEN** 判定标记为停滞，并要求改为架构级变更而非继续微调

#### Scenario: Gap wording drifts
- **WHEN** 同一缺口在后续轮次以不同措辞描述
- **THEN** 缺口指纹保持不变，仍被计为同一缺口

#### Scenario: Normal iteration is not misjudged
- **WHEN** 迭代在阈值内正常提升
- **THEN** 不产生停滞结论

### Requirement: Stagnation concludes in a human decision
停滞升级 MUST 给出建议架构级变更的明确结论，但 MUST NOT 自动修改计划或自动发起新一轮。二次停滞 MUST 收敛到人工裁定。

#### Scenario: First stagnation
- **WHEN** 达到停滞条件
- **THEN** 输出明确结论：停止微调并重审整体方案，但不自动改计划，也不自动发起新一轮

#### Scenario: Stagnation persists after an architectural change
- **WHEN** 已做过架构级变更而停滞条件再次满足
- **THEN** 作业状态进入 `ReworkReady` 并要求人类裁定，且不提供自动继续路径

#### Scenario: Model score does not advance state
- **WHEN** 判定分数升高
- **THEN** 作业状态 MUST NOT 自动推进；推进仍归人工 `accept`

### Requirement: Loop discipline introduces no automation
本能力 MUST NOT 引入自动循环、自动重试或自动状态推进。

#### Scenario: Failed round
- **WHEN** 某轮以失败结束
- **THEN** 不自动重试，等待人工或显式指令
