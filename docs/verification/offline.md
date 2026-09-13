# 0.1.0 离线验证记录

日期：2026-09-14

## 环境

- Node.js：v24.18.0（插件最低要求 Node.js 18）
- FFmpeg：9.0.1
- ffprobe：9.0.1
- Chrome：153.0.8010.36（只用于 `video-sync`）
- npm 运行依赖：0
- 外部 API Key：0

## 已执行门禁

```bash
npm test
/usr/local/bin/python3 /Users/wandl/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```

结果：60 项 Node 测试通过，0 失败；插件结构校验通过。测试覆盖闭合契约、路径授权、素材与回执
哈希、报价和双阶段批准、失败记录、显式人工确认、内容寻址复用、拉片证据、同步审阅、FFmpeg
编译、媒体硬门、安全策略和七 Skill 路由。

上游原样自测由 `tests/upstream.test.mjs` 执行：

- `video-shots`：449 项断言通过
- `video-sync`：122 项断言通过
- 27/27 文件的 Git Blob 和 SHA-256 与锁文件一致

## 安全扫描结论

- 活跃代码只通过 argv 调用 Node、FFmpeg、ffprobe 和原样 ReelBench 脚本。
- 所有生成进程均 `shell: false`；未发现 `shell: true` 或用户 filter graph 透传。
- 网络 URL、路径穿越、符号链接、特殊文件、未知 Schema 字段和凭据字段被拒绝。
- 未发现外部视频 API、`OPENAI_API_KEY` 读取、npm 运行依赖或自动重试。
