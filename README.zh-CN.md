# Codex Video Factory

![Codex × Video Factory — 将素材转化为可审阅影片](assets/video-factory-hero.png)

Codex Video Factory 是本地优先的 Codex 视频工厂插件，负责已有视频拉片、自动剪辑规划、粗剪、同步审阅视频、终版合成、中断恢复和媒体质量回执。仓库、插件、包、CLI 与 Skill 标识统一使用规范的 `video` 拼写。

## 状态与版本

插件以 vendored CLI（`bin/video-factory`）形式提供供 Codex 调用；无远端运行、无 API Key、无 npm 运行依赖。它是 Codex 本地插件包的一部分，本 README 不单独追踪版本号。

## 快速开始

```bash
bin/video-factory probe
bin/video-factory analyze source.mp4 --out reelbench-analysis
# Codex 按原样 video-shots Skill 标注 shots.json 后：
bin/video-factory analyze-finalize reelbench-analysis/shots.json --track reelbench-analysis/track.json --frames reelbench-analysis/frames
bin/video-factory validate-plan video-plan.json
bin/video-factory quote video-plan.json --stage rough
bin/video-factory run video-plan.json --stage rough --approval rough-approval.json
bin/video-factory review-sync output/rough.mp4 reelbench-analysis/shots.json
bin/video-factory quote video-plan.json --stage final
bin/video-factory run video-plan.json --stage final --approval final-approval.json
bin/video-factory accept final-job.json --decision approved --note "已播放并确认"
```

粗剪和终版各自批准。批准绑定 stage、plan hash、edit hash、round 和报价 revision；素材、剪辑决定或输出规格发生变化，旧批准立即失效。

## 可以做什么

| 用户目标 | 路由 | 产物 |
| --- | --- | --- |
| 给已有视频拉片、拆镜、分析运镜和节奏 | 原样 `video-shots` | `shots.json`、track、frames、报告 |
| 把画面与镜头信息同步展示 | 原样 `video-sync` | 内部同步审阅 MP4 |
| 根据素材自动剪辑 | Factory Plan + Run | 可恢复粗剪、EditDecision、台账 |
| 字幕、音轨、转场、多画幅和终版验收 | Factory Run + Judge | H.264/AAC MP4、回执、评分 |

本插件没有图形工作台，不生成图片，不控制 Blender，也不调用外部视频生成 API。PartMe Studio 负责 UI、项目和审片；Image Factory 与 Blender Plugin 通过公开字段交付带 SHA-256 的素材。

### 环境

- Node.js 18+
- FFmpeg 和 ffprobe（必需）
- Chrome（只在 `video-sync` 增强审阅时需要）
- 零 npm 运行依赖、零 API Key

## 边界与契约

- 不提供图形工作台、不生成图片、不控制 Blender、不调用外部视频生成 API。
- 无 npm 运行依赖、无 API Key、无远端运行。
- 每次批准绑定 stage、plan hash、edit hash、round 和报价 revision；素材、剪辑或输出规格变化立即让旧批准失效。
- 输入必须是 `--input-root` 之下的常规文件，且 SHA-256 必须匹配。
- 网络 URL、路径穿越、符号链接逃逸、特殊文件、素材哈希变化、任意 FFmpeg 表达式和凭据字段都会被拒绝。

## 文档导航

- [CLI 实操手册](docs/guides/current-cli-recipes.zh-CN.md)
- [架构与边界设计规格](docs/superpowers/specs/2026-09-14-codex-video-factory-plugin-design.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
