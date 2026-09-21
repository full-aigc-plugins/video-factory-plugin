## Context

参见 `proposal.md`。当前评估器（`src/media-evaluator.mjs`）用布尔值表达 14 个必需门，用 evidence 字段的有无表达 8 个 advisory 门。两条调用路径对同一组门给出不同结果：orchestrator 有完整上下文（`src/orchestrator.mjs:108-123`），`evaluate` 子命令没有（`src/cli.mjs:92-100`）。约束是不改 schema、不引入新依赖、不改变 `run` 路径已通过验证的审批与渲染行为。

## Goals / Non-Goals

**Goals:**

- 让"证据缺失"与"证据显示失败"在判定结果中可区分，且前者不得静默转为通过。
- 让 `evaluate` 对一份技术指标达标的成片能够返回 `pass` 或 `review`。
- 让所有已有确定性生产者的门真正参与判定。

**Non-Goals:**

- 不引入视觉语义判定；`semanticConsistency` 门由独立变更 `2026-09-21-add-visual-semantic-gate` 交付。
- 不放宽任何硬门的判定标准，不放宽人工审批的终审地位。
- 不修改 `MediaScores` schema，不改动 `run`/`accept` 的状态机。

## Decisions

1. **门状态用四态而非二态，且"未提供"必须可表达。** `MediaScores` schema 的 status 枚举已含 `PASS/FAIL/SKIPPED/NOT_RUN`（`schemas/media_scores.schema.json`），改动只需让生产者与解释器用上既有枚举，不必动契约。

2. **`collectMedia` 的来源/时间线字段缺省为 `undefined` 而非 `false`。** 这是缺陷根因：`false` 同时表示"已检查且不一致"和"从未检查"。改为可选字段后，`undefined` 表示未提供，显式 `false` 表示已检查且失败。保留显式传 `false` 的能力，避免破坏 orchestrator 中 `provenanceOk: job.artifact.provenanceOk` 的透传语义。

3. **时间线门改为派生而非输入。** 在 orchestrator 中该门本来就是算出来的（`src/orchestrator.mjs:113`：回执时长与计划推导时长之差在 0.15 秒内）。它不依赖工作目录或台账，因此 `evaluate` 可以自行推导，无需调用方提供。这也让该门在缺少台账时仍然有效。

4. **来源门需要台账，缺失时保持 `NOT_RUN`。** provenance 的判定依据是分段回执全部校验通过、每段携带 descriptorKey、且素材数与计划一致（`src/orchestrator.mjs:110-112`）——这些只存在于工作目录与 VideoJob 台账中。因此新增 `--ledger`。选择"报 `NOT_RUN` + 补齐指引"而不是"报 `FAIL`"，因为独立成片的来源确实无法在无台账时判定，报 FAIL 是把不可知说成失败。

5. **否决"由调用方声明来源状态"。** 曾考虑加 `--provenance-ok` 之类的调用方布尔参数，被否决：插件明令禁止调用方自述的"编造成功"，来源门若可由参数置真就失去了证据意义。

6. **`failedRequired` 语义保持不变。** 它已经只收集 `status === 'FAIL'` 的必需门，逻辑正确；问题只在上游把未提供喂成了失败。

## Risks / Trade-offs

- [放宽 `NOT_RUN` 后可能出现"判定停在 review 无人处理"] → judge 技能补一条显式规则：`NOT_RUN` 不得当作 `PASS`，且不得被人工批准转为通过；判定合成中 `NOT_RUN` 只能导向 `review`。
- [`NOT_RUN` 被误用为规避硬门的借口] → 要求 `evaluate` 对每个 `NOT_RUN` 门输出该证据的获取方式；连续两轮同一门 `NOT_RUN` 应在输出中升级提示。
- [`evaluate` 变成会调用 ffmpeg 的较慢命令] → 提供 `--skip-detectors` 逃生口；跳过时门状态为 `SKIPPED` 而非 `PASS`，判定上限为 `review`。
- [现有测试用手工 evidence 构造判定，语义收紧后断言失效] → 逐条核对 `tests/runtime-render.test.mjs:32` 一类用例，把"显式传值"与"缺省"两种情形分开断言。
- [时间线容差 0.15 秒对短片段偏宽] → 本次不改容差，保持与 orchestrator 一致；如需收紧应作为独立变更处理，避免两条路径判定标准分叉。
