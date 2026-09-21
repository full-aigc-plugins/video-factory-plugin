## 1. Credential selection

- [x] 1.1 在 `scripts/vendor/skill_vendor.py` 中按 `sources[].repo` 的 owner 选择凭据
- [x] 1.2 建立映射：`full-aigc-skills` → `FULL_AIGC_SKILLS_SYNC_TOKEN`，`full-stack-skills` → `FULL_STACK_SKILLS_SYNC_TOKEN`
- [x] 1.3 未知 owner 默认走无凭据路径，保持公开库的既有行为
- [x] 1.4 提供"要求认证的来源"配置项；命中且令牌缺失时显式失败，不静默降级为匿名读取

## 2. Credential injection

- [x] 2.1 在 `ls-remote` 与 `fetch` 两条路径注入所选凭据
- [x] 2.2 不使用 `git remote add origin <带凭据的 URL>`；改用一次性运行期机制并在用后清理
- [x] 2.3 保证凭据不出现在进程命令行参数中
- [x] 2.4 使用后立即销毁临时凭据载体，不在磁盘留下副本

## 3. Secret hygiene

- [x] 3.1 确认凭据不进入日志，且错误输出经脱敏
- [x] 3.2 确认凭据不写入 `.git/config`、远端 URL 或任何被提交的文件
- [x] 3.3 确认凭据不进入 `skills.lock.json`、快照内容或 PR 正文
- [x] 3.4 新增断言测试：构造失败场景，断言输出中不含令牌明文
- [x] 3.5 新增断言测试：断言 `.git/config` 与远端 URL 中不含令牌

## 4. Package routing backport

- [x] 4.1 为 `skills-sync.yml` 增加 `inputs.package`（默认 `video-factory-skills`）
- [x] 4.2 增加 `REQUESTED_PACKAGE: ${{ github.event.client_payload.package || inputs.package || 'video-factory-skills' }}`
- [x] 4.3 把 `--source-ref` 与 `--expected-sha` 改为 `"$REQUESTED_PACKAGE=$REQUESTED_REF"` 形式
- [x] 4.4 把 `git commit -m` 与 `gh pr create` 的标题/正文改为按 `REQUESTED_PACKAGE` 生成
- [x] 4.5 照抄 `image-factory-plugin/.github/workflows/skills-sync.yml` 的实现，保持同组织内一致
- [x] 4.6 移除把 package 名硬编码为 `video-factory-skills` 的残留

## 5. Separation from write credentials

- [x] 5.1 在 `.github/workflows/skills-sync.yml` 中把读取凭据与写入凭据分开传入
- [x] 5.2 写入凭据继续使用仓库自身令牌，用于推送同步分支与创建 PR
- [x] 5.3 确认两者不共用变量、不互相回退
- [x] 5.4 修正 PR 正文中的来源仓库错误（改为 `full-aigc-skills/video-factory-skills`）

## 6. Target-repo same-name secret

- [ ] 6.1 验证目标仓 `SKILLS_SYNC_TOKEN`（2026-09-21T11:29:39Z 新增）对插件仓是否有 Contents 写权限
- [ ] 6.2 若不具备写权限，删除该 secret 以恢复已知可用的 `GITHUB_TOKEN` 回退
- [x] 6.3 或在 `skills-sync.yml` 中显式回退到 `GITHUB_TOKEN`，不依赖该 secret
- [ ] 6.4 构造一次真实 diff 的分支推送演练，验证该路径（此前运行全程为 `changed=false`，未触及）
- [ ] 6.5 在变更记录中写明该风险与验证结论

## 7. Verification of unchanged semantics

- [x] 7.1 确认 `skills.lock.json` 结构、字段与校验语义未变
- [x] 7.2 确认 `check --offline` 完全不涉凭据且结果与变更前一致
- [x] 7.3 确认 `check` 的 ref 与 peeled SHA 校验逻辑未变
- [x] 7.4 确认无令牌时（公开库场景）行为与变更前完全一致
- [x] 7.5 在本地演练三个 owner（`full-aigc-skills`、`full-stack-skills`、`partme-ai`），确认按来源选到正确凭据或正确走无凭据路径
- [x] 7.6 确认 `partme-ai/baoyu-skills` 这类第三 owner 来源不被误判为需要认证

## 8. Cross-repo follow-up (out of this repository's scope)

- [ ] 8.1 记录路线一与路线二的取舍结论（本变更按路线二设计，见 proposal 待定项）
- [ ] 8.2 若采用路线二：消费端 cron 从"按锁定 ref 重新校验"改为"发现上游最新 release tag 并升级"
- [ ] 8.3 若采用路线二：技能库侧 `notify-consumers.yml` 降级为尽力而为的加速器，或整体退役
- [ ] 8.4 若采用路线一：改为在各技能库配置具备消费方组织写权限的令牌（实测已具备工作流的 14 个库；全库覆盖约 38 个）
- [ ] 8.5 记录上游分发现状：`full-aigc-skills/video-factory-skills` 最近一次 dispatch 为 failure（run 35594549361）

## 9. Verification and release

- [x] 9.1 运行 `python3 -m unittest discover -s tests -p 'test_*.py' -v`
- [x] 9.2 运行 `python3 scripts/vendor/skill_vendor.py check` 与 `check --offline`
- [ ] 9.3 确认 `skills-check.yml` 的受管技能拒绝逻辑与 `ci.yml` 断言未被破坏
- [ ] 9.4 提交前运行 `git status`，确认未混入并行会话对 `skills-sync.yml` 的改动（该文件当前已有未提交修改）
- [ ] 9.5 bump 版本，同步插件仓与市场仓，push 两个仓库
- [ ] 9.6 运行 `openspec validate --strict` 并归档本变更

## Audit 2026-09-21 (this repo, completed work)

- [x] Code 部分已实施并通过 81/81 JS 测试 + 18/18 Python 测试 + 6/6 OpenSpec 严格校验（`openspec validate --changes --strict`）。
- [x] 视频工厂发布 0.2.0：插件仓与市场仓均已推送，tag `v0.2.0` 已存在并被 CDN 解析为 release-pinned 资源（HTTP 200 校验）。
- [ ] 受管技能（5 个来自 `full-aigc-skills/video-factory-skills` @ v1.0.1）的文档与策略改动属于上游发版范围，本仓不能就地修改，须随 v1.0.2 tag 同步。`skills-check.yml` 会拒绝任何绕路改动。
