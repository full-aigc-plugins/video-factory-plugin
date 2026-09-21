## Why

`VideoPlan.assets` 已要求每个素材携带 `sha256`、`kind`、`source`、`license`、`authorizedAt`、`receiptPath`（`schemas/video_plan.schema.json`）；`registerAssets` 会拒绝 URL 与符号链接逃逸；`run` 在素材缺失时写 `asset-requirements.json` 并中止。**但插件从未告诉 agent 这些素材从哪里来。** 现有技能只约束"送进来的素材必须已授权且哈希一致"，对"授权素材如何获得"完全沉默。

后果是 agent 面对缺失素材时只有两条路：停在 requirements 文件上等用户，或自行选择最省事的路径（通常是程序化生成或随手找一张替代图）。后者会一路通过全部硬门——因为所有硬门检查的是"这份素材是否与计划一致、是否已授权"，而不是"这份素材是否够好"。插件因此**结构性地无法阻止"素材质量不足"这一类失败**，而这恰恰是成片质量的主要瓶颈。

`research/dream-loop`（MIT，Anshu Chimala）的素材文档给出一套可直接移植的纪律：**逐级判定阶梯**（外部下载 → image-to-3D 生成 → 本地建模 → 程序化），每一级写明进入条件，并反复强调"不要因为时间/配额压力或你的主观判断而跳过前面的级别"、"不要用程序化噪声或纯色替代生成式纹理与法线"。

## What Changes

- 在 `video-factory-plan` 阶段引入素材获取阶梯，要求逐级判定并记录"为什么进入下一级"的依据。
- 素材来源与授权登记到 `AssetManifest` 已有字段，使阶梯决策可审计（用了哪一级、依据是什么）。
- 明确"外部下载"默认不允许，除非用户显式授权。
- 明确"生成式图像/3D 不视为下载网络素材"这一区分，避免 agent 把授权边界理解过窄而放弃更好的素材。
- 程序化（最后一级）必须记录选择理由，且不接受"因为快"作为理由。
- 不移植 dream-loop 中"不要用 Blender 建模，太慢太贵"的结论——它与本生态 `blender-design` 插件定位冲突，改为按场景裁定。

## Capabilities

### New Capabilities
- `asset-sourcing-discipline`: 素材获取的逐级判定契约，覆盖阶梯顺序、进入条件、授权边界与决策记录。

### Modified Capabilities
None.

## Impact

- `skills/video-factory-plan/`（**上游受管，见约束**）
- `skills/video-factory-harness/SKILL.md`（插件本地，做交叉引用与纪律说明）
- 运行时行为不变：素材仍须落在授权根内、仍须校验哈希、仍不接受 URL 作为 asset path
- 无 schema 变更；`AssetManifest` 的 `source`/`license`/`authorizedAt`/`receiptPath` 已足够承载阶梯决策
- 纯技能与文档层能力，无代码行为变更，按仓库要求仍须 bump 版本

## Constraint: 上游受管技能不可本地修改

`video-factory-plan` 属插件外部受管（`full-aigc-skills/video-factory-skills` @ `v1.0.1`，`skills.lock.json`）。`.github/workflows/skills-check.yml` 会拒绝未经 `skills.lock.json` 的受管技能改动。

因此本变更的文档主体**必须经上游发版**：在上游技能仓改写 → 发布新 tag → 本仓 `python3 scripts/vendor/skill_vendor.py update --source-ref video-factory-skills=<tag> --expected-sha <peeled-sha>`。插件本地可立即落地的是 `video-factory-harness` 中的交叉引用与纪律说明（该技能属 `plugin-local-skills.json`）。
