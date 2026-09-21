## Purpose

约束成片的确定性判定契约：每个门必须指出自己的证据来源，必须区分"无法判定"与"判定失败"，必须填充所有已有确定性生产者的门，并在证据不可得时给出可执行的补齐路径，而不是给出一个无法通过的死判定。

## ADDED Requirements

### Requirement: Unverified gates are distinguishable from failed gates
评估器 MUST 把"证据缺失，无法判定"与"证据显示失败"表达为不同的门状态：前者为 `NOT_RUN`，后者为 `FAIL`。评估器 MUST NOT 用布尔默认值把未提供的证据记为硬门失败。

#### Scenario: Required gate evidence is absent
- **WHEN** 对成片执行判定但未提供来源证据
- **THEN** 来源门状态为 `NOT_RUN` 且不出现在 `failedRequired` 中

#### Scenario: Required gate evidence shows failure
- **WHEN** 提供了来源证据且该证据表明分段回执校验不通过、缺少 descriptorKey 或素材数与计划不一致
- **THEN** 来源门状态为 `FAIL` 并出现在 `failedRequired` 中

#### Scenario: Unverified gate cannot yield a pass
- **WHEN** 判定结果中存在 `NOT_RUN` 的必需门，且人工标签为 approved
- **THEN** 判定 MUST NOT 合成为 `pass`，最高只能为 `review`

#### Scenario: Unverified gate is not silently accepted
- **WHEN** 判定输出中存在 `NOT_RUN` 门
- **THEN** 输出 MUST NOT 把该门表示为已通过

### Requirement: Every gate with a producer is populated
评估器 MUST 填充所有存在确定性生产者的门。只有当本机能力缺失或调用方显式要求跳过时，门状态才允许为 `SKIPPED`；只有确实不存在生产者的门才允许为 `NOT_RUN`。

#### Scenario: Media detectors and policy checks run
- **WHEN** 对成片执行判定且本机具备 ffmpeg 与 ffprobe
- **THEN** 黑帧、冻结、静音、字幕时序、音画偏移、重复镜头与节奏七个门均得到 `PASS`、`FAIL` 或 `SKIPPED` 之一，而非 `NOT_RUN`

#### Scenario: Detectors are skipped on request
- **WHEN** 调用方显式要求跳过检测器
- **THEN** 相关门状态为 `SKIPPED` 而非 `PASS`，且判定上限为 `review`

### Requirement: Timeline verification is derived, not asserted
时间线门 MUST 由计划推导的期望时长与回执实测时长计算得出，MUST NOT 依赖调用方声明的布尔值。判定容差 MUST 与 `run` 路径保持一致。

#### Scenario: Artifact duration matches plan
- **WHEN** 回执时长与计划推导时长的差值在容差内
- **THEN** 时间线门状态为 `PASS`，且该门独立于台账可用

#### Scenario: Artifact duration diverges
- **WHEN** 回执时长与计划推导时长的差值超出容差
- **THEN** 时间线门状态为 `FAIL` 并出现在 `failedRequired` 中

### Requirement: Judge entry point cannot deadlock on unverifiable gates
判定入口 MUST 在证据不可得时给出该证据的具体获取方式，使调用方能够补齐后重新判定。判定入口 MUST NOT 仅返回一个无法通过且无补齐路径的结果。

#### Scenario: Sources unavailable at evaluation time
- **WHEN** 判定入口缺少台账或分段回执
- **THEN** 输出包含该门的 `NOT_RUN` 状态、对应证据的获取方式，以及判定上限为 `review` 的结论
