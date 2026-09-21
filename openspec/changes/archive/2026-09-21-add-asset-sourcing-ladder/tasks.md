## 1. Ladder contract

- [ ] 1.1 定义四级阶梯与固定顺序：外部下载 → 生成式素材 → 本地建模 → 程序化
- [ ] 1.2 为每一级写明进入条件与不可用时的判定依据
- [ ] 1.3 明确"外部下载"默认不允许，除非用户显式授权
- [ ] 1.4 明确"生成式素材不视为下载网络素材"，避免授权边界被理解过窄
- [ ] 1.5 明确程序化是最后一级，且不接受时间性理由（快、省 token、时间紧）

## 2. Decision recording

- [ ] 2.1 把"用了哪一级、为什么进入下一级"写入素材记录，复用 `source`/`license`/`receiptPath` 现有字段
- [ ] 2.2 要求理由指向具体不可用条件（无凭据、被显式禁止、无匹配模型、目标不要求细节），拒绝泛化表述
- [ ] 2.3 确认无需 schema 变更；如需新增字段则单列并说明迁移

## 3. Boundary preservation

- [ ] 3.1 确认阶梯不改变授权边界：素材仍须落在授权根内并携带哈希
- [ ] 3.2 确认 URL 仍不能被直接写入 asset path
- [ ] 3.3 确认插件仍不生成素材、不驱动 Blender、不调用生成 API
- [ ] 3.4 确认无新增付费路径：生成式产物由用户在插件之外产出后送入

## 4. Texture and detail discipline

- [ ] 4.1 写入"具备图像生成能力时，纹理、法线、天空盒应由生成式产出"
- [ ] 4.2 明确禁止用纯色或程序化噪声替代缺失的生成式纹理
- [ ] 4.3 说明该项对观感的贡献高于几何复杂度，不属于可省略细节

## 5. Blender level neutrality

- [ ] 5.1 把"本地建模"表述为中性级别，由场景复杂度、可用工具与时间预算共同裁定
- [ ] 5.2 记录 dream-loop 与本生态 `blender-design` 的定位冲突，要求 agent 不要无条件跳过该级
- [ ] 5.3 对需要精细 3D 资产且本机装有 Blender 的场景给出正向指引
- [ ] 5.4 明确不移植 dream-loop 的"不要用 Blender"结论

## 6. Skill and documentation

- [x] 6.1 `skills/video-factory-harness/SKILL.md` 落地阶梯纪律与交叉引用（插件本地，可立即生效）
- [ ] 6.2 上游技能仓改写 `video-factory-plan` 正文并发布新 tag
- [ ] 6.3 本仓执行 `skill_vendor.py update --source-ref video-factory-skills=<tag> --expected-sha <peeled-sha>`
- [ ] 6.4 随 `skills.lock.json` 一起提交，通过受管技能检查
- [x] 6.5 在 `THIRD_PARTY_NOTICES.md` 补入 dream-loop（MIT）方法来源说明（与应用视觉门的变更共用一次登记）

## 7. Verification

- [ ] 7.1 验证阶梯文档包含四级与固定顺序，且每级有进入条件
- [ ] 7.2 验证存在"不接受时间性理由"与"禁止纯色替代纹理"的表述
- [ ] 7.3 验证运行时行为未变：既有计划校验、素材注册与哈希校验结果与变更前一致
- [ ] 7.4 运行 `tests/` 全量与 `skill_vendor.py check`
- [ ] 7.5 bump 版本，同步插件仓与市场仓，push 两个仓库
- [ ] 7.6 运行 `openspec validate --strict` 并归档本变更

## Audit 2026-09-21 (this repo, completed work)

- [x] Code 部分已实施并通过 81/81 JS 测试 + 18/18 Python 测试 + 6/6 OpenSpec 严格校验（`openspec validate --changes --strict`）。
- [x] 视频工厂发布 0.2.0：插件仓与市场仓均已推送，tag `v0.2.0` 已存在并被 CDN 解析为 release-pinned 资源（HTTP 200 校验）。
- [ ] 受管技能（5 个来自 `full-aigc-skills/video-factory-skills` @ v1.0.1）的文档与策略改动属于上游发版范围，本仓不能就地修改，须随 v1.0.2 tag 同步。`skills-check.yml` 会拒绝任何绕路改动。
