## Why

为支持同一插件同时从 `full-aigc-skills` 与 `full-stack-skills` 两个技能库拉取技能，两个库各自的同步令牌（`FULL_AIGC_SKILLS_SYNC_TOKEN`、`FULL_STACK_SKILLS_SYNC_TOKEN`）已配置到下游插件仓库。核实后结论是：**按当前代码路径，这两个令牌无法被需要它们的流程读到，跨库拉取能力尚未生效。**

已核实的四处事实：

1. **令牌装在了接收侧，而需要令牌的流程跑在发送侧。** 采样 `full-aigc-plugins/{video-factory,dreamina-canvas,blender-design}-plugin` 与 `full-stack-plugins/codeguard-plugin`，四个仓库均有三个密钥：`FULL_AIGC_SKILLS_SYNC_TOKEN`、`FULL_STACK_SKILLS_SYNC_TOKEN`、`SKILLS_SYNC_TOKEN`。而真正执行分发的 14 个技能库仓库（`full-aigc-skills` 下 9 个、`full-stack-skills` 下 5 个）只配了旧的 `SKILLS_SYNC_TOKEN`。采样三个上游仓库的结果一致：`full-aigc-skills/video-factory-skills`、`full-aigc-skills/dreamina-skills`、`full-stack-skills/codeguard-skills` 均无新令牌。

2. **GitHub Actions 只能读自己仓库的密钥。** `notify-consumers.yml` 运行在技能库仓库内，用 `secrets.SKILLS_SYNC_TOKEN` 调 `gh api POST repos/<consumer>/dispatches`。因此放在消费侧的两个新令牌对这段代码不可见，装在那里不会改变分发结果。

3. **分发链在 aigc 侧确实仍然失败。** `full-aigc-skills/video-factory-skills` 的 `notify-consumers.yml` 最近一次运行（2026-09-21T11:31:57Z，run 35594549361）结论为 **failure**；更早的 v1.0.1 release 触发（2026-09-19）同样 failure。对照 `full-stack-skills/codeguard-skills`，其分发运行在 2026-09-19 有三个 **success** —— 说明 full-stack 侧现有的 `SKILLS_SYNC_TOKEN` 权限是通的，而 aigc 侧不是。

4. **消费侧拉取当前完全不带凭据。** `scripts/vendor/skill_vendor.py` 用锁文件里的明文 URL 执行 `git ls-remote` 与 `git fetch`（`fetch_checkout` 直接 `git remote add origin repo`），没有注入任何凭据。采样到的三个上游仓库目前都是 PUBLIC，所以公开读不需要令牌——这也说明新令牌的真实用途是**让消费侧对指定技能库的读取可认证**，而不是给分发用。

结论：当前配置与代码之间存在一个方向性错配。本变更把消费侧按来源选择凭据的能力补齐，使"同一插件从两个库拉取"真正成立，并把分发侧的权限问题明确划出本仓范围。

## What Changes

- 消费侧按来源仓库的 owner 选择对应凭据：`full-aigc-skills` → `FULL_AIGC_SKILLS_SYNC_TOKEN`，`full-stack-skills` → `FULL_STACK_SKILLS_SYNC_TOKEN`，未知 owner 走无凭据路径或显式失败。
- `skill_vendor.py` 在 `ls-remote` 与 `fetch` 时注入所选凭据，凭据只影响传输层；锁文件的 ref/peeled SHA/内容摘要校验逻辑完全不变。
- 凭据安全约束：不得写入日志、不得进入锁文件、不得写进持久化的 git remote 配置、不得出现在错误信息中。
- **补全 package 路由**：本仓 `skills-sync.yml` 仍是单来源模板，缺 `inputs.package` 与 `REQUESTED_PACKAGE`，且把 package 名硬编码为 `video-factory-skills`。同组织内 `image-factory-plugin` 已实现该路由（见下），照抄即可。
- `skills-sync.yml` 的写入凭据（推送 `chore/skills-sync` 分支与创建 PR）与来源库读取凭据分离，两者不得混用。
- 处置目标仓新增的同名 `SKILLS_SYNC_TOKEN`（见下），消除它对插件仓自身分支推送与 PR 创建的潜在影响。
- 修正 `skills-sync.yml` PR 正文中的来源仓库错误（正文写 `full-stack-skills/video-factory-skills`，锁文件实为 `full-aigc-skills/video-factory-skills`）。
- 明确本仓范围：技能库侧的分发工作流与密钥配置属各库自身，另案处理。

## 补充事实（2026-09-21 实测，含并行会话核对）

**下发范围已完整，两端都无代码读取。** 消费端 `full-aigc-plugins` 19 个仓 + `full-stack-plugins` 4 个仓**全部**同时具备两个新 secret；而所有消费仓的 `skills-sync.yml` 仍为 `secrets.SKILLS_SYNC_TOKEN || secrets.GITHUB_TOKEN`。推送端抽查 6 个技能库同样只读到旧名。即**两个新 token 目前两端都是死配置**。

**同组织内已有可照抄的 package 路由。** `image-factory-plugin` 的 lock 有两个来源（`full-aigc-skills/image-factory-skills` + `partme-ai/baoyu-skills`），其 `skills-sync.yml` 已实现：

```yaml
inputs.package → REQUESTED_PACKAGE: ${{ github.event.client_payload.package || inputs.package || 'image-factory-skills' }}
arguments+=(--source-ref "$REQUESTED_PACKAGE=$REQUESTED_REF")
arguments+=(--expected-sha "$REQUESTED_PACKAGE=$REQUESTED_SHA")
```

而 lock 层 `skill_vendor.py` 早已支持多 source（`sources` 数组 + `validate_assignment_packages` 按 package 校验）。**本仓缺的只是工作流这一层的路由。** 注意上述先例按 **package** 路由，**不带凭据**——本变更的凭据路由是在其之上的新增部分。

**第三个 owner 的真实存在。** `image-factory-plugin` 的第二来源是 `partme-ai/baoyu-skills`，其 owner 既非 `full-aigc-skills` 也非 `full-stack-skills`。这印证了"未知 owner 必须走无凭据路径"是必需能力，而非理论分支。

**新增风险：目标仓被写入了一个同名旧 secret。** `full-aigc-plugins/video-factory-plugin` 现也存在 `SKILLS_SYNC_TOKEN`（时间戳 `2026-09-21T11:29:39Z`，此前为空）。该 secret 不是本链路所需，但会改变插件仓**自身**行为：此前无此 secret → 回退到 `GITHUB_TOKEN` → 推分支与建 PR 一直成功；现在存在 → 改用它 → **若该 token 对插件仓没有 Contents 写权限，一旦出现真实 diff，`chore/skills-sync` 分支推送与 PR 创建会失败**。近期运行全程走 `changed=false` 分支，因此该路径**尚未被验证**。两条处置：删除该 secret 以恢复已知可用的 `GITHUB_TOKEN` 回退，或确认它对插件仓有 Contents 写权限。

## Capabilities

### New Capabilities
- `source-credential-selection`: 多来源技能同步的凭据选择与使用契约，覆盖按来源选凭据、凭据保密边界、与写入凭据的分离，以及校验逻辑不受传输层影响。

### Modified Capabilities
None.

## Impact

- `scripts/vendor/skill_vendor.py`（凭据注入）
- `.github/workflows/skills-sync.yml`（凭据传入与 PR 正文修正）
- `tests/test_skill_vendor.py`（凭据选择与泄漏防护断言）
- 不改 `skills.lock.json` 结构与校验语义，不改受管技能内容
- 跨仓依赖：14 个技能库仓库的分发权限修复不在本仓范围内（见下）

## 跨仓依赖与决策待定项

本变更只覆盖消费侧。**分发侧存在一个必须由你裁定方向的设计分叉：**

- **路线一（推式／分发，当前实现）**：技能库主动 dispatch 到消费仓库。所需令牌必须放在**技能库**上，且必须具备对**消费方组织**仓库的分发写权限。代价：一个可写消费仓库的高权限令牌要复制到每个技能库，任一技能库被攻破即波及它全部的消费方。规模：已具备分发工作流的技能库实测 **14 个**（`full-aigc-skills` 9 个 + `full-stack-skills` 5 个），若要全库覆盖则约 **38 个**；消费端 **23 个**插件仓。
- **路线二（拉式，与已创建的令牌命名一致）**：消费侧按计划轮询（`skills-sync.yml` 已有每日 `41 3 * * *` 的 cron），发现上游最新 release tag 并升级（`gh api repos/<lib>/releases/latest`），用库专属令牌认证 clone；自身分支与 PR 操作继续用 `GITHUB_TOKEN`（历史运行已证可用）。令牌放在**消费侧**、只需对**技能库**的读权限，权限面最小，且不再依赖任何跨组织写凭据。规模：只改 **23 个消费仓**。

现配置（库专属令牌放在消费侧）只在路线二下成立。因此本变更按路线二设计，同时保留路线一在 `full-stack-skills` 侧已通的路径作为可选快通道。若你选择路线一作为权威路径，则需改为在各技能库配置具备消费方组织写权限的令牌，并相应调整本变更。

本判断与同仓 `docs/plans/2026-09-21-upstream-v1.0.2-and-openspec-split.md` §0.4 的独立实测结论一致（该处亦推荐路线二）。
