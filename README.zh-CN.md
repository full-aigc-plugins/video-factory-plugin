# Codex Video Factory

Codex Video Factory 是本地优先的 Codex 视频工厂插件，负责已有视频拉片、自动剪辑规划、
粗剪、同步审阅视频、终版合成、中断恢复和媒体质量回执。仓库、插件、包、CLI 与 Skill
标识统一使用规范的 `video` 拼写。

## 四种能力不要混淆

| 用户目标 | 路由 | 产物 |
| --- | --- | --- |
| 给已有视频拉片、拆镜、分析运镜和节奏 | 原样 `video-shots` | `shots.json`、track、frames、报告 |
| 把画面与镜头信息同步展示 | 原样 `video-sync` | 内部同步审阅 MP4 |
| 根据素材自动剪辑 | Factory Plan + Run | 可恢复粗剪、EditDecision、台账 |
| 字幕、音轨、转场、多画幅和终版验收 | Factory Run + Judge | H.264/AAC MP4、回执、评分 |

本插件没有图形工作台，不生成图片，不控制 Blender，也不调用外部视频生成 API。PartMe Studio
负责 UI、项目和审片；Image Factory 与 Blender Plugin 通过公开字段交付带 SHA-256 的素材。

## 环境

- Node.js 18+
- FFmpeg 和 ffprobe（必需）
- Chrome（只在 `video-sync` 增强审阅时需要）
- 零 npm 运行依赖、零 API Key

## 最短工作流

```bash
bin/video-factory probe
bin/video-factory validate-plan video-plan.json
bin/video-factory quote video-plan.json --stage rough
bin/video-factory run video-plan.json --stage rough --approval rough-approval.json
bin/video-factory review-sync output/rough.mp4 reelbench-analysis/shots.json
bin/video-factory quote video-plan.json --stage final
bin/video-factory run video-plan.json --stage final --approval final-approval.json
```

粗剪和终版各自批准。批准绑定 stage、plan hash、edit hash、round 和报价 revision；素材、剪辑
决定或输出规格发生变化，旧批准立即失效。网络 URL、路径穿越、符号链接逃逸、特殊文件、
素材哈希变化、任意 FFmpeg 表达式和凭据字段都会被拒绝。

详细命令见 [CLI 实操手册](docs/guides/current-cli-recipes.zh-CN.md)，架构与边界见
[设计规格](docs/superpowers/specs/2026-09-14-codex-video-factory-plugin-design.md)。
