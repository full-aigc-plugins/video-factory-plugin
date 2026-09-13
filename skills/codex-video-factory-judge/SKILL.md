---
name: codex-video-factory-judge
description: Use when a rough or final video needs deterministic media gates, advisory semantic review, and explicit human acceptance or rework labels.
---

# Judge a Video Factory artifact

## 使用方法

对粗剪、同步审阅版或终版执行 `bin/video-factory evaluate <artifact> <plan.json>`。先读取回执和
确定性证据，再做语义评价，最后记录人工标签；三者不得混成一个模型分数。

## 判定顺序

1. 硬门：文件、哈希、完整解码、视频流、时长、尺寸、帧率、必需音轨、时间线和来源。
2. 策略门：黑帧、冻结、静音、字幕越界；无证据写 `SKIPPED` 或 `NOT_RUN`。
3. 语义建议：叙事、节奏、镜头职责、声画同步、重复镜头和视觉一致性。
4. 人工决定：approved、rejected 或 rework；人工 rejected 永远不能被模型覆盖。

每个失败项必须说明证据、影响和修复方式。确定性失败直接 FAIL；艺术性策略提示默认进入 review，
由用户决定是否接受。不得凭肉眼声称哈希、编解码或精确时长已经通过。

参见 [操作与质量门](../codex-video-factory-use/references/operations.md) 和
[示例与 FAQ](../codex-video-factory-use/references/examples-and-faq.md)。
