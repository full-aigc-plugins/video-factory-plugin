## 1. Gate semantics

- [x] 1.1 让 `collectMedia` 的来源/时间线字段缺省为未提供（`undefined`）而非 `false`
- [x] 1.2 在 `evaluateMedia` 中把"未提供"解释为 `NOT_RUN`、把显式 `false` 解释为 `FAIL`
- [x] 1.3 确认 `MediaScores` schema 无需变更（status 枚举已含四态）
- [x] 1.4 保持 `failedRequired` 只收集实际 `FAIL` 的现有语义
- [x] 1.5 导出 `REQUIRED_GATE_IDS` / `ADVISORY_GATE_IDS`，让调用方能区分"未验证的必需门（压判定上限）"与"未验证的 advisory 门（不压）"

## 2. Derived timeline gate

- [x] 2.1 在 `evaluate` 中由 `plan.editDecision` 推导期望时长，与回执时长比对后判定时间线门
- [x] 2.2 复核容差与 orchestrator 一致（0.15 秒）
- [x] 2.3 补用例：容差内为 `PASS`、超差为 `FAIL`

## 3. Provenance and advisory population

- [x] 3.1 为 `evaluate` 增加 `--ledger`，读取台账中的来源证据（分段回执集合与 descriptorKey）
- [x] 3.2 在 `evaluate` 中调用 `analyzeMedia` + `analyzeEditPolicy`，填充黑帧、冻结、静音、字幕时序、音画偏移、重复镜头、节奏七个门
- [x] 3.3 提供 `--skip-detectors` 逃生口，跳过时门状态为 `SKIPPED` 而非 `PASS`，且判定上限压到 `review`
- [x] 3.4 缺少来源证据时输出该证据的获取方式；必需门与 advisory 门分两行输出，措辞与是否压判定上限一致
- [x] 3.5 校验台账时复用既有 `verifyReceipt` 路径，并额外校验 `job.planHash === canonicalHash(plan)`、分段数等于 clip 数、每段携带 descriptorKey

## 3b. Implementation findings (found while building)

- [x] 3b.1 `mediaReceipt` schema 要求 `provenanceOk`/`timelineOk` 为**必需 boolean**，因此回执是"完全确定的主张"——`segment-renderer.mjs` 在 `renameSync` 后必须从已校验的临时回执继承这两个标志（同一份字节），不能留空
- [x] 3b.2 既有 6 个 orchestrator 用例正是被 3b.1 暴露出来的：分段回执丢标志 → 台账 schema 校验失败

## 4. Skill and documentation (BLOCKED — upstream vendored)

- [ ] 4.1 修正 `skills/video-factory-judge/SKILL.md`：说明来源门需台账、时间线门自动派生
- [ ] 4.2 补入规则：`NOT_RUN` 不得当作 `PASS`，也不得被人工批准转为通过
- [ ] 4.3 更新 `skills/video-factory-judge/references/operations.md` 的门清单与状态语义

**阻塞原因**：`video-factory-judge` 属 `skills.lock.json` 受管技能（`full-aigc-skills/video-factory-skills` @ v1.0.1）。`skills-check.yml` 会拒绝未经 `skills.lock.json` 的受管技能改动。须上游发版后随同步落地。

## 5. Verification

- [x] 5.1 用一份技术指标全部达标的成片验证 `evaluate` 返回 `review`（此前恒为 `fail`）：`decision=review`、`failedRequired=[]`、`timeline=PASS`、`provenance=NOT_RUN`、4 个检测器 advisory 已填充
- [x] 5.2 验证缺台账时来源门为 `NOT_RUN`、不进入 `failedRequired`，且 stderr 给出补齐路径与"判定上限为 review"
- [x] 5.3 记录修复前失败基线：`tests/orchestrator-cli.test.mjs` 原断言 `failedRequired === ['provenance','timeline']` 且为绿——**既有测试固化了该缺陷**，这是缺陷长期未被发现的原因
- [x] 5.4 运行 `tests/` 全量（81 pass / 0 fail）与 `python3 -m unittest discover -s tests -p 'test_*.py'`（18 pass）
- [x] 5.5 `python3 scripts/vendor/skill_vendor.py check --offline` 通过（未触碰受管技能）
- [ ] 5.6 按仓库要求 bump patch 版本，同步插件仓与市场仓，push 两个仓库
- [ ] 5.7 运行 `openspec validate --strict` 并归档本变更（待 4.x 与 5.6 完成）

## 6. Follow-up observations (out of scope, recorded for a separate change)

- [ ] 6.1 `duration` 门与 `timeline` 门在 orchestrator 与 `evaluate` 两条路径上计算的是同一个比较（回执时长 vs 计划推导时长，同一 0.15 容差），因此二者必然同时 PASS/FAIL。本变更保持该一致性（"两条路径判定标准不得分叉"），未消除冗余。若要区分语义（例如 `duration` 查绝对时长、`timeline` 查时间线对齐）应作为独立变更，因为它会改变既有判定形状
- [ ] 6.2 `src/job-ledger.mjs:61` 的 `recordHumanDecision` 在人工 approved 时直接合成 `decision: 'pass'`，未检查是否存在 `NOT_RUN` 的必需门。当前正常流程不可达（`runApproved` 总会把 provenance/timeline 写成显式 boolean），因此属潜在不一致而非可利用缺口。修复需与 `evaluateMedia` 的合成规则统一，建议随 `add-revision-loop-discipline` 一并处理
- [ ] 6.3 `semanticConsistency` 仍是唯一永为 `NOT_RUN` 的门（另 7 个 advisory 均有生产者）。它的生产者由 `2026-09-21-add-visual-semantic-gate` 交付；本变更的 stderr 已能正确把它标注为 advisory 而不误称压判定上限

## Audit 2026-09-21 (this repo, completed work)

- [x] Code 部分已实施并通过 81/81 JS 测试 + 18/18 Python 测试 + 6/6 OpenSpec 严格校验（`openspec validate --changes --strict`）。
- [x] 视频工厂发布 0.2.0：插件仓与市场仓均已推送，tag `v0.2.0` 已存在并被 CDN 解析为 release-pinned 资源（HTTP 200 校验）。
- [ ] 受管技能（5 个来自 `full-aigc-skills/video-factory-skills` @ v1.0.1）的文档与策略改动属于上游发版范围，本仓不能就地修改，须随 v1.0.2 tag 同步。`skills-check.yml` 会拒绝任何绕路改动。
