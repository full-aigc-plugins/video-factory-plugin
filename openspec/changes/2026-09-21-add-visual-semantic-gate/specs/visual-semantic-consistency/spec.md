## Purpose

以目标参考图为基准，为成片补齐视觉语义判定：在插件本身不调用任何模型的前提下，由宿主 agent 的视觉能力按结构化 rubric 评分，插件负责物证产出、评分校验与 advisory 边界，使"这条成片是否达到目标"成为可审计、有证据、不可伪造的判定。

## ADDED Requirements

### Requirement: Visual semantic evaluation has a real producer
声明为 advisory 的门 MUST 存在确定的生产路径。MUST NOT 声明一个没有任何生产者的门。

#### Scenario: Producer exists for the declared gate
- **WHEN** 检索 `semanticConsistency` 门的生产路径
- **THEN** 存在唯一的评分回填生产者，且该生产者在技能文档中有明确入口

#### Scenario: Declared gate has no producer
- **WHEN** 门列表中某个门名不存在任何生产路径
- **THEN** 校验 MUST 失败并指出该门

### Requirement: Target reference is a first-class bound artifact
视觉判定 MUST 以一个哈希绑定的目标参考图为基准。目标图 MUST 作为可审计产物登记，且同一判定内 MUST NOT 被替换。

#### Scenario: Target registered and hash-stable
- **WHEN** 提供目标参考图并执行判定
- **THEN** 判定结果记录该图的内容摘要，且同一判定内摘要保持不变

#### Scenario: Target absent
- **WHEN** 未提供目标参考图
- **THEN** `semanticConsistency` 门状态为 `NOT_RUN`，判定上限为 `review`，其余门不受影响

### Requirement: Evidence package is emitted without model calls
物证包 MUST 由本地确定性命令产出，MUST 包含目标图与成片帧的同尺度配对。产出过程 MUST NOT 调用模型、MUST NOT 联网、MUST NOT 读取 API key 或任何凭据。

#### Scenario: Evidence package generation
- **WHEN** 以目标图要求产出物证包
- **THEN** 产出包含目标图与成片帧配对物证及可哈希清单的结果，且过程无网络调用与模型调用

#### Scenario: No target supplied
- **WHEN** 未提供目标图而要求产出物证包
- **THEN** 命令失败并明确指出缺少目标参考图

### Requirement: Semantic score is advisory and cannot override deterministic gates
视觉语义分 MUST 保持 advisory。该门为 `FAIL` 时 MUST NOT 软化确定性硬门失败，MUST NOT 阻止人工批准或驳回。判定合成 MUST 保证硬门失败直接为 `fail`。

#### Scenario: Semantic gate fails while hard gates pass
- **WHEN** 全部硬门为 `PASS` 而 `semanticConsistency` 为 `FAIL`
- **THEN** 判定为 `review`，不得为 `pass`，也不得为 `fail`

#### Scenario: Semantic gate passes while a hard gate fails
- **WHEN** `semanticConsistency` 为 `PASS` 而存在硬门 `FAIL`
- **THEN** 判定为 `fail`，模型分不得改变该结果

#### Scenario: Human decision overrides semantic score
- **WHEN** 人工标签为 `rejected` 而 `semanticConsistency` 为 `PASS`
- **THEN** 判定为 `fail`

#### Scenario: Human approval is not blocked by the semantic gate
- **WHEN** 硬门全部 `PASS` 且人工标签为 `approved`，`semanticConsistency` 为 `FAIL`
- **THEN** 该门至多把判定压到 `review`，MUST NOT 阻止人工批准的最终生效

### Requirement: Score intake is evidence-bound
回填的评分 MUST 引用物证包中实际存在的帧。引用不存在的证据的评分 MUST 被拒绝。

#### Scenario: Valid score intake
- **WHEN** 评分的每条缺口都引用物证包中的帧标识
- **THEN** 评分被接受并写入该门，评分文件摘要记入台账

#### Scenario: Score references unknown evidence
- **WHEN** 评分引用了物证包中不存在的帧标识
- **THEN** 回填被拒绝，该门保持 `NOT_RUN`，并指出具体的无效引用

### Requirement: Rubric demands actionable gaps
评分 MUST 按四个维度给出（构图、光照、材质、细节），MUST 给出可相加的总分，且每条缺口 MUST 指出所评维度、具体成因与修复方向。MUST NOT 接受仅描述主观印象而无可执行内容的反馈。

#### Scenario: Actionable feedback accepted
- **WHEN** 评分包含缺口清单
- **THEN** 每条缺口包含所评维度、具体成因与修复方向，且总分由四维分数相加得出

#### Scenario: Non-actionable feedback rejected
- **WHEN** 某条缺口仅描述主观印象而未指出成因或修复方向
- **THEN** 校验失败并指出该条缺口
