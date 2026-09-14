# Factory Skills TRACE 评测记录

日期：2026-09-14  
范围：仅 5 个 Factory 自有 Skills；原样 ReelBench Skills 不改写、不按本规则优化。

## 确定性基分

| Skill | T | R | A | C | E | Overall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| codex-video-factory-use | 4.50 | 4.00 | 4.33 | 4.38 | 3.95 | 4.23 |
| codex-video-factory-plan | 4.50 | 4.00 | 4.33 | 4.00 | 3.95 | 4.16 |
| codex-video-factory-run | 4.50 | 3.55 | 4.33 | 3.75 | 3.90 | 4.01 |
| codex-video-factory-judge | 4.33 | 3.55 | 4.33 | 3.67 | 3.90 | 3.96 |
| codex-video-factory-recover | 4.33 | 3.55 | 4.33 | 3.75 | 3.90 | 3.97 |

## 结论

确定性脚本判定为 Good，尚未达到 Excellent。触发描述、安全边界、中文场景、批准、失败和恢复
规则清晰；主要扣分来自窄 Skill 没有各自复制 5–8 份 examples/references。项目选择单一共享参考源，
避免为刷结构分复制文档。路由 Skill 提供快速开始、四份深度参考、六类实例和八项 FAQ；其他 Skill
链接该来源并保留自己的执行门禁。

不把本报告美化为 5.0。发布判断以真实路由测试、CLI 行为、媒体验收和完整性门为主；未来若拆分
更多独立工作流，再为对应 Skill 增加真实案例，而不是生成重复占位文件。
