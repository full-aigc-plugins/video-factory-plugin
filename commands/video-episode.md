---
description: 口播切片精剪：ASR 词级时间轴 → 切片点 → 粗剪 MP4 + SRT + 切割清单
argument-hint: "<口播音频/视频文件与目标时长>"
skills: video-episode-slicing
---

执行口播切片精剪场景：

1. **转写**：需要词级时间轴时调用 volcengine-design 插件
   （`scripts/volcengine_asr.py submit/wait`，词级毫秒时间戳，写入 words.jsonl）。
   已有 words.jsonl 或其他带词级时间戳的转写则直接用。
2. **切片**：`node src/cli.mjs episode-slice <words.jsonl> --out-dir <out>`
   ——句末标点与静音间隙（>400ms）为强切点，产出 cutlist.json + subtitles.srt。
3. **粗剪**：`node src/cli.mjs episode-roughcut <out/cutlist.json> --output rough-cut.mp4`
   （ffmpeg concat，copy 优先失败自动转码）。
4. **交付**：rough-cut.mp4（对齐 SRT 时间轴）+ subtitles.srt + cutlist.json
   ——三样导入剪映/任何剪辑器人工精修。

注意：剪映 6.0+ 草稿文件已加密，本场景交付通用格式而非原生草稿；
转写依赖 volcengine-design 插件的凭据（VOLCENGINE_APP_ID/ACCESS_TOKEN）。
