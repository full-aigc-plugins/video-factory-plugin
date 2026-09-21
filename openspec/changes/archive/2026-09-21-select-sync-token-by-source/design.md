## Context

参见 `proposal.md`。既有事实：`skills.lock.json` 的 `sources[]` 每项含 `package`、`repo`（明文 HTTPS URL）、`ref`、`sha` 与逐技能 `sha256`；`src/vendor/skill_vendor.py` 的 `fetch_checkout` 用 `git init` + `git remote add origin <repo>` + `git fetch --depth 1 origin <ref>` 取快照，无凭据注入；`check` 模式在不取远端时用摘要校验，取远端时用 `ls-remote` 校验 ref 与 peeled SHA。约束：不改锁文件结构与校验语义，不把凭据写入任何持久化或被提交的位置。

## Goals / Non-Goals

**Goals:**

- 让消费侧能从两个不同 owner 的技能库拉取技能，按来源选择正确凭据。
- 把凭据的影响面严格限制在传输层：校验逻辑、锁文件、快照内容都不因凭据而改变。
- 消除凭据进入日志、仓库文件、持久化 git 配置或错误信息的路径。

**Non-Goals:**

- 不修改 14 个技能库仓库的分发工作流与密钥（跨仓，另案）。
- 不改 `skills.lock.json` 的结构、字段或校验语义。
- 不改受管技能内容，不改 `plugin-local-skills.json`。
- 不改变 `skills-check.yml` 的受管技能拒绝逻辑。
- 不在本变更中决定方案 A 与方案 B 的取舍（见 proposal 的待定项）。

## Decisions

1. **凭据由来源 owner 决定，而不是由来源 package 决定。** 映射键取 `sources[].repo` 的 owner 段：`full-aigc-skills` → `FULL_AIGC_SKILLS_SYNC_TOKEN`，`full-stack-skills` → `FULL_STACK_SKILLS_SYNC_TOKEN`。理由：令牌是按组织签发的，同一组织下新增技能库不应需要改代码。

2. **未知 owner 走无凭据路径，并在显式要求认证时失败。** 公开库不需要凭据，因此默认允许无凭据读取；但如果配置要求某来源必须认证而对应令牌缺失，则必须显式失败，而不是静默降级为匿名读取。静默降级会把"认证失败"伪装成"正常同步"。

3. **凭据只进传输层，不进锁文件与快照。** 锁文件继续保存明文 URL（供人工核对与公开审计），凭据在运行期注入。曾考虑把带凭据的 URL 写进锁文件或 remote 配置，被否决：那会让凭据落入被提交的文件或磁盘上的持久配置。

4. **不使用 `git remote add origin <带凭据的 URL>`。** 该写法会把凭据持久化进 `.git/config` 并可能出现在 `git` 的错误输出中。改用运行期凭据提供机制（如临时 `GIT_ASKPASS` 脚本或 `-c credential.helper` 一次性传入），并在使用后立即销毁；任何实现都必须保证凭据不出现在进程命令行参数中（命令行可被同机其他进程读取）。

5. **读取凭据与写入凭据严格分离。** `skills-sync.yml` 需要两类凭据：读上游（库专属令牌）与推送同步分支/创建 PR（仓库自身令牌）。二者 MUST NOT 混用同一变量，也 MUST NOT 互相回退。理由：把两者混成一个变量会使最小权限原则失效——一个为读取签发的令牌不应具备写仓库的能力。

6. **校验路径与传输层解耦。** `check --offline` 完全不涉凭据；`check` 的 `ls-remote` 走与 `fetch` 相同的凭据选择逻辑，但校验内容（ref、peeled SHA、摘要）不变。理由：凭据只回答"能否读到"，不回答"读到的是否正确"。

7. **修正 PR 正文的来源仓库错误。** 当前正文写"Externally managed skills come from full-stack-skills/video-factory-skills"，而锁文件实为 `full-aigc-skills/video-factory-skills`。这是组织改名后的遗留，会让审查者按错误来源排查。

## Risks / Trade-offs

- [凭据泄漏到日志] → 所有 git 调用启用凭据脱敏，且断言测试覆盖"错误输出中不含令牌明文"。CI 中同时避免 `set -x` 与把令牌传给会回显参数的封装脚本。
- [凭据进入持久化 git 配置] → 采用一次性运行期机制并在用后清理；断言测试检查 `.git/config` 与远端 URL 中不含令牌。
- [未知 owner 被静默匿名读取] → 提供"要求认证的来源"配置项；命中时缺令牌即失败。
- [方案 A 与 B 未定时实现被返工] → 本变更只落地拉取侧的凭据选择机制，该机制在方案 B 下是核心、在方案 A 下无害（消费侧仍可用它做校验读取），因此两种方案下都不浪费。
- [上游库改为私有后 cron 间隔内同步延迟] → 保留方案 A 在可用路径上的即时触发（full-stack 侧当前已通）；同时把延迟明确写入文档，避免被误解为实时。
- [并发同步读取同一工作目录] → 沿用既有的一次性临时检出目录（`workdir/package`），不引入跨任务的共享状态。

## Migration Plan

1. 实现按 owner 选择凭据与运行期注入，默认行为在无令牌时与当前完全一致。
2. 在 `skills-sync.yml` 中把读取凭据与写入凭据分开传入，并修正 PR 正文来源。
3. 补测试：凭据选择映射、缺失令牌时显式失败、日志与 git 配置无令牌泄漏、离线校验不受影响。
4. 跑 `skill_vendor.py check` 与 `check --offline` 两种模式确认校验语义未变。
5. 14 个技能库仓库的分发权限修复另行处理（跨仓）。
6. bump 版本，同步插件仓与市场仓。
