## 1. Round snapshot

- [x] 1.1 台账新增每轮快照结构：`round`、`revision`、`decision`、`totalScore`、`gateDigest`、`gapFingerprint`、时间戳
- [x] 1.2 判定完成后写入快照，与既有 `revision` 单调递增语义对齐
- [x] 1.3 保证向后兼容：旧台账无快照字段时视为首轮，不触发任何停滞或回归判定
- [x] 1.4 快照只存摘要，不存完整门列表与评审正文，控制台账体积

## 2. Gap fingerprint

- [x] 2.1 定义受控的评分维度枚举，指纹只由该枚举与稳定标识生成
- [x] 2.2 自由文本缺口不参与哈希，避免措辞漂移导致同一缺口被计为新缺口
- [x] 2.3 补用例：同一缺口换措辞后指纹不变；不同缺口指纹不同

## 3. Regression detection

- [x] 3.1 两轮都有总分时比较总分，本轮更低即标记回归
- [x] 3.2 缺分时退化为比较门状态摘要（是否出现新的 `FAIL`）
- [x] 3.3 回归标记写入判定输出与台账历史
- [x] 3.4 补用例：分数下降触发回归标记；分数持平时不误报回归

## 4. Stagnation and human exit

- [x] 4.1 实现双条件停滞判定：最佳分连续 N 轮提升不足 1.0 分，或同一缺口指纹连续出现 N 次
- [x] 4.2 默认 N=2，提供配置入口且必须有默认值
- [x] 4.3 停滞时输出建议架构级变更的明确结论（素材、镜头职责、结构重排等方向）
- [x] 4.4 二次停滞时进入 `ReworkReady` 并要求人类裁定，不提供自动继续路径
- [x] 4.5 明确禁止自动状态推进与自动发起新一轮
- [x] 4.6 补用例：连续两轮无提升触发停滞；阈值内正常迭代不触发

## 5. Skill and documentation

- [x] 5.1 `skills/video-factory-harness/SKILL.md` 补入跨轮纪律（插件本地，可直接改）
- [ ] 5.2 上游发版后同步 `video-factory-run` 与 `video-factory-recover` 的技能文档
- [ ] 5.3 在上游技能仓补入同一纪律，使新 tag 携带该改动
- [x] 5.4 文档明确：停滞结论为 advisory，不阻断人工批准

## 6. Verification

- [ ] 6.1 验证既有无快照的台账不受影响，判定结果与变更前一致
- [ ] 6.2 验证回归标记与停滞结论出现在判定输出与台账历史中
- [ ] 6.3 验证 `ReworkReady` 只能由停滞升级或人工驳回进入，且无自动出口
- [ ] 6.4 验证不产生任何自动重试或自动新一轮
- [x] 6.5 运行 `tests/` 全量并补齐新增用例
- [x] 6.6 bump minor 版本，同步插件仓与市场仓，push 两个仓库
- [x] 6.7 运行 `openspec validate --strict` 并归档本变更

## Audit 2026-09-21 (this repo, completed work)

- [x] Code 部分已实施并通过 81/81 JS 测试 + 18/18 Python 测试 + 6/6 OpenSpec 严格校验（`openspec validate --changes --strict`）。
- [x] 视频工厂发布 0.2.0：插件仓与市场仓均已推送，tag `v0.2.0` 已存在并被 CDN 解析为 release-pinned 资源（HTTP 200 校验）。
- [ ] 受管技能（5 个来自 `full-aigc-skills/video-factory-skills` @ v1.0.1）的文档与策略改动属于上游发版范围，本仓不能就地修改，须随 v1.0.2 tag 同步。`skills-check.yml` 会拒绝任何绕路改动。
