# ReelBench 第三方许可证工程审查

日期：2026-09-14  
结论：`PASS`（工程合规检查，不构成法律意见）

## 来源与范围

- 仓库：`https://github.com/eternityspring/reelbench-skills`
- 固定提交：`75520c7b32ab5af8b22c5e4f79705efbbc0d8e07`
- 许可证：Apache-2.0
- 分发范围：`skills/video-shots/` 15 个文件、`skills/video-sync/` 12 个文件
- 修改：两个上游目录内 27 个文件均未修改

## 履约证据

- 完整许可证副本：`licenses/reelbench-Apache-2.0.txt`
- 来源、固定提交、修改范围：`THIRD_PARTY_NOTICES.md`
- Git Blob 与 SHA-256 双锁：`upstream/reelbench.lock.json`
- 分发测试：`tests/upstream.test.mjs`
- 上游 `video-shots` 对 `shuohao-skills` 的来源说明保留在原始 README 中

升级只能人工发起：下载新提交、审查 27 文件差异、重建锁、执行上游自测与真实视频验收，
然后发布新插件版本。禁止自动跟随上游分支。
