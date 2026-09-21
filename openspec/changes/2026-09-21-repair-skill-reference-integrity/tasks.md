## 1. Measured baseline (record before any change)

- [ ] 1.1 用 `trace_evaluate.py` 记录 5 个受管技能的基线 overall（预期均为 4.60）
- [ ] 1.2 记录上游门的实际阈值与执行方式（`trace_gate.py --threshold 4.5`）
- [ ] 1.3 记录四个变体的实测值作为本变更的依据：基线 4.60 / 仅改参考文件内容 4.60 / 删 examples 4.50 / 删 SKILL.md 样板 4.12
- [ ] 1.4 确认 `references_files=6`、`examples_files=3` 等计数在改写后保持不变

## 2. State machine correction (upstream)

- [ ] 2.1 重写 5 个技能的 `references/workflow-contract.md`，状态名逐项对应 `video_job.schema.json` 枚举
- [ ] 2.2 删除虚构状态 `DISCOVERED`、`PREFLIGHTED`、`PLANNED`、`EXECUTING`
- [ ] 2.3 补齐被遗漏的 `ReviewReady` 与 `ReworkReady`，并标注 `ReviewReady → Completed|ReworkReady` 为人工闸门
- [ ] 2.4 确认改写后不含 `input(`、`read -p` 或形似凭据的字符串
- [ ] 2.5 改写后复测 TRACE，确认仍为 4.60

## 3. Reference content rewrite (upstream, file counts unchanged)

- [ ] 3.1 重写 5 个技能的 `references/validation-checklist.md` 为门自检（14 个硬门 + 8 个 advisory 门）
- [ ] 3.2 重写 5 个技能的 `references/error-recovery.md` 为台账恢复语义（`Pending`/`Failed`/`Blocked`/`Partial`）
- [ ] 3.3 说明"Failed 需要新 round"与"进程中断只恢复 Pending"
- [ ] 3.4 确认两个文件仍存在于原路径，文件数不变

## 4. Example rewrite, not deletion (upstream)

- [ ] 4.1 重写 5 个技能的 `examples/happy-path.md` 为端到端真实场景
- [ ] 4.2 重写 5 个技能的 `examples/failure-recovery.md` 为真实失败恢复场景
- [ ] 4.3 重写 5 个技能的 `examples/boundary-refusal.md` 为真实边界拒绝场景
- [ ] 4.4 **明确不删除任何 examples 文件**，保持 `examples_files=3`
- [ ] 4.5 复用 `references/examples-and-faq.md` 已有六个场景与八条 FAQ 的具体程度作为改写基准

## 5. Explicitly deferred: boilerplate replacement

- [ ] 5.1 记录"不删除 SKILL.md 样板"的实测依据（judge 4.60 → 4.12，跌破 4.5 门）
- [ ] 5.2 记录样板承载的 12 个 TRACE 子信号清单
- [ ] 5.3 单列后续独立变更：以领域内容等价替换这 12 个信号
- [ ] 5.4 该后续变更的验收条件写为"上游 trace_gate 保持全绿"，而非"删除成功"

## 6. Shared reference synchronization

- [ ] 6.1 确认 `references/contracts-and-safety.md`、`references/operations.md`、`references/examples-and-faq.md` 在 5 个技能间逐字节一致
- [ ] 6.2 在文档中明确"重复是粒度安装的要求，漂移才是缺陷"，不抽成单一来源
- [ ] 6.3 复核这三个文件的内容仍只对本插件成立

## 7. Local regression gates (this repo)

- [ ] 7.1 在 `tests/skills.test.mjs` 新增状态机断言：技能发布的状态名必须存在于 `schemas/video_job.schema.json` 的枚举中
- [ ] 7.2 状态机断言从 schema 动态读取枚举，不硬编码状态名列表
- [ ] 7.3 新增断言：状态机描述必须包含人工闸门状态
- [ ] 7.4 新增漂移断言：三个共享参考文件在 5 个技能间内容摘要一致
- [ ] 7.5 新增断言：技能文件不得含 `input(` 或 `read -p`（避免拉低 TRACE 安全性信号）

## 8. Upstream release and sync

- [ ] 8.1 在上游完成第 2-4 组改动
- [ ] 8.2 上游执行 `trace_gate.py --threshold 4.5`，确认 5 个技能全部 ≥ 4.5
- [ ] 8.3 上游发布新 tag
- [ ] 8.4 本仓执行 `python3 scripts/vendor/skill_vendor.py update --source-ref video-factory-skills=<tag> --expected-sha <peeled-sha>`
- [ ] 8.5 随 `skills.lock.json` 一起提交，通过受管技能检查
- [ ] 8.6 运行 `skill_vendor.py check` 与 `check --offline`

## 9. Verification and release

- [ ] 9.1 本地复测 5 个技能的 TRACE overall，确认均 ≥ 4.5 且不低于变更前
- [ ] 9.2 确认技能中不存在指向已删除文件的链接，且无新死链
- [ ] 9.3 校正 `package.json` 版本至当前发布版本，并确认与 4 个 manifest 一致
- [ ] 9.4 运行 `tests/` 全量与 `python3 -m unittest discover -s tests -p 'test_*.py' -v`
- [ ] 9.5 提交前运行 `git status` 确认未混入并行会话的改动
- [ ] 9.6 bump 版本，同步插件仓与市场仓，push 两个仓库
- [ ] 9.7 运行 `openspec validate --strict` 并归档本变更
