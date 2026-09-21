## Purpose

保证技能中发布的内容与代码强制执行的契约一致：技能描述的状态模型必须对应代码中的状态枚举与合法迁移，参考文件与示例文件必须承载领域内容，任何改写必须保持技能评分门所依赖的结构信号（包括文件数量），跨技能重复的共享参考文件必须保持同步而不发生漂移。

## ADDED Requirements

### Requirement: Published state models match the enforced contract
技能中发布的状态模型 MUST 与代码强制执行的契约一致：状态命名 MUST 与 `video_job.schema.json` 的枚举逐项对应，合法迁移 MUST 与台账实现一致。MUST NOT 发布代码中不存在的状态，MUST NOT 遗漏承载人工闸门的状态。

#### Scenario: State machine is accurate
- **WHEN** 技能描述作业状态迁移
- **THEN** 所列状态与合法迁移均可在 schema 枚举与台账迁移表中找到对应

#### Scenario: Invented state
- **WHEN** 技能列出一个代码中不存在的状态
- **THEN** 校验失败并指出该状态

#### Scenario: State machine omits the human gate
- **WHEN** 技能描述状态迁移但未包含人工闸门所在的状态
- **THEN** 校验失败并指出缺失的状态

#### Scenario: Assertion follows the schema
- **WHEN** schema 的状态枚举发生变更
- **THEN** 校验从 schema 动态读取枚举，无需同步修改断言中的状态名列表

### Requirement: Reference and example files carry domain content
技能引用的每个参考文件与示例文件 MUST 承载该技能的领域内容。MUST NOT 引用仅含通用模板实例的文件。

#### Scenario: Reference is domain-specific
- **WHEN** 技能引用 `references/` 或 `examples/` 下的文件
- **THEN** 该文件内容只对本插件或本技能成立

#### Scenario: Reference points at a missing file
- **WHEN** 技能正文引用了不存在的文件
- **THEN** 校验失败并指出该死链

### Requirement: Content rewrites preserve structural signal counts
改写参考文件或示例文件 MUST 保持技能评分门所依赖的结构信号，其中 MUST 包含 `references/` 与 `examples/` 下的文件数量。删除文件 MUST 先对照评分门阈值验证余量。MUST NOT 以删除方式来消除内容问题。

#### Scenario: File count preserved
- **WHEN** 重写参考文件或示例文件的内容
- **THEN** 文件路径与文件数量保持不变

#### Scenario: Deletion is evaluated against the gate
- **WHEN** 某文件被考虑删除
- **THEN** 先评估删除后的评分是否仍满足门阈值，且保留余量；低于阈值时 MUST NOT 删除

#### Scenario: Content rewrite introduces no safety findings
- **WHEN** 改写参考文件内容
- **THEN** 内容不含形似凭据的字符串，也不含交互式输入痕迹（`input(`、`read -p`）

### Requirement: Scoring-bearing content is replaced, not removed
当某段内容同时承载技能评分信号时，MUST NOT 直接删除该内容；如需移除，MUST 以承载等价信号的领域内容替换。

#### Scenario: Content carries scoring signals
- **WHEN** 评估移除某段内容的后果
- **THEN** 若移除会使技能评分低于门阈值，则改为等价替换，且替换后评分不低于移除前

#### Scenario: Replacement is verified against the gate
- **WHEN** 完成一次等价替换
- **THEN** 以技能评分门的实际执行结果作为验收依据，而非以"内容已移除"作为完成标准

### Requirement: Duplicated shared references do not drift
跨技能重复的共享参考文件 MUST 保持内容一致。修复 MUST NOT 只落地到部分技能。重复本身 MUST 被允许——技能按用户粒度安装，每个技能必须自带其参考文件。

#### Scenario: Shared reference stays in sync
- **WHEN** 校验多个技能携带的同一共享参考文件
- **THEN** 各副本的内容摘要一致

#### Scenario: Partial update
- **WHEN** 某次改动只更新了部分技能的共享参考文件副本
- **THEN** 校验失败并指出内容不一致的技能

### Requirement: Integrity gates run in the consuming repository
消费方仓库 MUST 对 vendored 后的技能快照独立执行完整性与回归校验，MUST NOT 完全依赖上游自律。

#### Scenario: Snapshot validated after sync
- **WHEN** 技能快照通过上游同步更新
- **THEN** 消费方仓库的校验在本地快照上执行，失败即阻断
