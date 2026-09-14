# 0.1.0 真实运行验收

日期：2026-09-14

## 已通过的真实媒体场景

| 场景 | 权威测试 | 结果 |
| --- | --- | --- |
| ReelBench seed、track、关键帧、双联系表 | `tests/reelbench-runtime.test.mjs` | PASS |
| Codex 标注后的 15 门 validate 与 Markdown/HTML 报告 | 同上 | PASS，跳过门单独保留 |
| 原样 `video-sync` 同步审阅 MP4 | 同上 | PASS，原子发布并生成媒体回执 |
| 图片分段与粗剪 | `tests/runtime-render.test.mjs` | PASS |
| 六图片故事视频 | 同上 | PASS，6 镜、运动与淡入淡出 |
| 多段真实视频自动剪辑 | 同上 | PASS，含叠化 |
| Blender 公共回执交接 | 同上 | PASS，来源/路径/类型/SHA-256 对账 |
| 旁白+音乐多轨、字幕、水印、标题 metadata | 同上 | PASS |
| 16:9、9:16、1:1 | 同上 | PASS，H.264/yuv420p/AAC 48 kHz |
| 单镜头修改 | 同上 | PASS，未变镜头 0 次重渲 |
| 进程中断恢复 | 同上 | PASS，仅继续 Pending |
| 缺素材交接 | 同上 | PASS，渲染前生成 `asset-requirements.json` |

每个成片均执行 ffprobe、完整解码、二次 SHA-256、容器/编码/像素格式/帧率/尺寸/时长/音轨、
时间线和来源硬门。黑帧、冻结、静音、字幕越界、声画起始偏移、重复镜头和节奏为策略证据。

## 代表产物证据

| 产物 | SHA-256 | ffprobe 摘要 |
| --- | --- | --- |
| 六图故事粗剪 | `fb22e0c8a889a8a2ade99065ecd7e4e1568b127e7c6718f05d48e761f1cbde8a` | 3.021354s，320×180，H.264/yuv420p，AAC 48 kHz |
| 同步审阅版 | `b7bf8cc3a21784432016fe596ba3baf583c35b72a15c65becffd52fb5cb4edd4` | 1.984s，320×440，H.264/yuv420p，AAC 48 kHz |
| 多轨字幕水印终版 | `a4a04505642ec7c4541a5cc02aacd3b626275f323ab54f0cfd34d55692a94082` | 1.0s，320×180，H.264/yuv420p，AAC 48 kHz，mov_text |

帧级视觉检查为 `PASS`：故事首/中/尾颜色序列可区分，淡入淡出边界出现预期瞬时黑帧；同步审阅
版可见视频画面、S01 镜号、时间、景别/运镜和中文画面描述；终版可见右下角高对比青色水印。
这属于抽帧检查，不冒充人工连续播放。

## 需要与自动证据区分的门

- 人工连续播放和审美确认：`NOT_RUN`（需用户在发布前播放代表成片）
- 语义一致性：`NOT_RUN`，由 Codex/人工审片，不伪装成确定性 PASS
- 字幕烧录安全区：`SKIPPED`；本机 FFmpeg 9.0.1 没有 libass `subtitles` filter，0.1.0 默认
  将 SRT/ASS 转为 MP4 `mov_text` 字幕轨。插件不会把内嵌字幕宣称为已烧录安全区检查。

Chrome 缺失只阻塞同步审阅增强；普通粗剪、终版和媒体门仍可运行。原样 `video-sync` 需要输入
音轨界定时长，Factory 规范化分段始终带 AAC 静音轨，外部无音轨视频会在适配器边界被拒绝。
