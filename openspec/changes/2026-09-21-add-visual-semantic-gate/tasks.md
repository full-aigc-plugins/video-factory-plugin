## 1. Contract and schema

- [ ] 1.1 新增 `schemas/semantic_evidence.schema.json`：四维分数、可相加总分、缺口清单、所评帧标识与内容摘要、目标图摘要
- [ ] 1.2 确认 `MediaScores` schema 无需变更（`semanticConsistency` 已是 gate id 之一）
- [ ] 1.3 裁定目标参考图在 `VideoPlan` 中的登记方式（新增可选字段或复用 `assets`），保持既有计划仍可校验
- [ ] 1.4 在 `THIRD_PARTY_NOTICES.md` 补入 dream-loop（MIT）方法来源说明

## 2. Evidence emission

- [ ] 2.1 `evaluate --target <image> --emit-evidence <dir>` 产出目标图与成片帧的同尺度配对物证包
- [ ] 2.2 复用 `video-shots` 既有 frames/sheets 能力，不新增抽帧与拼表实现
- [ ] 2.3 物证包写入可哈希清单，逐项记录来源、帧标识与内容摘要
- [ ] 2.4 保证该路径不调用模型、不联网、不读取 API key 或任何凭据
- [ ] 2.5 未提供目标图时命令失败并明确指出缺少目标参考图

## 3. Score intake and gate composition

- [ ] 3.1 `evaluate --semantic-evidence <json>` 读取并按 schema 校验评分文件
- [ ] 3.2 校验评分引用的每个帧标识确实存在于物证包中，拒绝无依据评分
- [ ] 3.3 评分通过校验后写入 evidence 的 `semanticConsistency` 门并参与 advisory 判定
- [ ] 3.4 硬编码 advisory 边界：该门不得把硬门 `fail` 抬成 `review`，不得阻止人工批准或驳回
- [ ] 3.5 目标图缺失或无评分时该门为 `NOT_RUN`，判定上限为 `review`
- [ ] 3.6 台账记录评分文件摘要与目标图摘要，使判定可追溯

## 4. Rubric

- [ ] 4.1 四维 rubric 写入技能文档：构图 0-3、光照 0-3、材质 0-3、细节 0-1，总分 10
- [ ] 4.2 要求每条缺口可执行：点名具体成因与修复方向，禁止"这棵树看着假"一类不可执行反馈
- [ ] 4.3 写入"逐像素对齐目标、不设妥协"的严格度要求，同时允许"模型或场景需整体重做"这类大结论
- [ ] 4.4 要求评分在独立上下文中进行，不继承实现者的推理过程

## 5. Skill and documentation

- [ ] 5.1 `skills/video-factory-judge/SKILL.md` 补入视觉语义门的执行顺序（硬门 → 策略门 → 语义建议 → 人工决定）与 advisory 边界
- [ ] 5.2 `skills/video-factory-harness/SKILL.md` 补入该门在标准工作流中的位置与该门不可软化硬门的规则
- [ ] 5.3 `skills/video-factory-plan/` 补入目标参考图的准备要求与"禁止 concept art"提示纪律
- [ ] 5.4 更新 `skills/video-factory-judge/references/operations.md` 的门清单与 rubric 摘要

## 6. Verification

- [ ] 6.1 用例：提供目标图与合法评分 → 门有状态且参与判定
- [ ] 6.2 用例：提供目标图但无评分 → 门为 `NOT_RUN`，判定上限为 `review`
- [ ] 6.3 用例：不提供目标图 → 门为 `NOT_RUN`，且既有判定结果与变更前一致
- [ ] 6.4 用例：评分引用了物证包外的帧 → 回填被拒绝且门保持 `NOT_RUN`
- [ ] 6.5 用例：该门为 `FAIL` 而硬门全 PASS → 判定为 `review`；该门为 `PASS` 而硬门有 `FAIL` → 判定为 `fail`
- [ ] 6.6 用例：人工标签 `rejected` 且该门 `PASS` → 判定为 `fail`
- [ ] 6.7 验证物证产出路径无网络调用与凭据读取
- [ ] 6.8 运行 `tests/` 全量并补齐新增用例
- [ ] 6.9 bump minor 版本，同步插件仓与市场仓，push 两个仓库
- [ ] 6.10 运行 `openspec validate --strict` 并归档本变更
