## Purpose

为多来源技能同步建立凭据选择与使用契约：按来源仓库的 owner 选择对应凭据，把凭据的影响面严格限制在传输层，保持锁文件与校验语义不变，并确保凭据不进入日志、仓库文件、持久化 git 配置或错误信息。

## ADDED Requirements

### Requirement: Credentials are selected by source owner
同步流程 MUST 依据来源仓库的 owner 选择对应凭据，MUST NOT 依赖来源 package 名。同一 owner 下新增技能库 MUST NOT 需要修改选择逻辑。

#### Scenario: Known owner is mapped
- **WHEN** 来源仓库属于一个已映射的 owner
- **THEN** 使用该 owner 对应的凭据执行读取

#### Scenario: Unknown owner
- **WHEN** 来源仓库的 owner 未被映射
- **THEN** 走无凭据读取路径，保持公开来源的既有行为

#### Scenario: Authentication is required but token is absent
- **WHEN** 某来源被配置为要求认证，而对应凭据缺失
- **THEN** 流程显式失败，MUST NOT 静默降级为匿名读取

### Requirement: Credentials stay confined to the transport layer
凭据 MUST 只影响读取传输。锁文件的 ref、peeled commit SHA 与内容摘要校验 MUST NOT 因凭据而改变。凭据 MUST NOT 写入锁文件、技能快照或被提交的任何文件。

#### Scenario: Verification semantics unchanged with credentials
- **WHEN** 使用凭据完成一次同步
- **THEN** ref、peeled SHA 与内容摘要的校验逻辑与结果与不使用凭据时一致

#### Scenario: Offline check performs no authentication
- **WHEN** 以离线模式执行完整性检查
- **THEN** 不进行任何凭据读取，且校验结果与变更前一致

#### Scenario: Credential excluded from committed artifacts
- **WHEN** 同步完成并产出锁文件与技能快照
- **THEN** 其中不包含任何凭据内容

### Requirement: Credentials never leak
凭据 MUST NOT 出现在日志、错误信息、进程命令行参数或持久化的 git 配置中。运行时使用的临时凭据载体 MUST 在使用后销毁。

#### Scenario: Failure output is redacted
- **WHEN** 读取上游失败并输出错误
- **THEN** 输出中不含凭据明文

#### Scenario: Git configuration stays clean
- **WHEN** 完成一次带凭据的读取
- **THEN** git 配置文件与远端 URL 中不含凭据

#### Scenario: Credential not passed on the command line
- **WHEN** 以凭据执行 git 操作
- **THEN** 凭据不出现在进程的命令行参数中

### Requirement: Read credentials are separated from write credentials
读取来源库的凭据与推送分支、创建变更请求的凭据 MUST 分开。二者 MUST NOT 共用同一变量，也 MUST NOT 互相回退。

#### Scenario: Distinct credentials are used
- **WHEN** 同步流程先读取上游再推送分支
- **THEN** 两个步骤分别使用各自声明的凭据

#### Scenario: Read credential cannot authorize writes
- **WHEN** 读取凭据被配置
- **THEN** 该凭据不参与推送分支或创建变更请求

### Requirement: Dispatch outcomes are reported honestly
本仓对上游分发现状的记录 MUST 如实反映实际运行结论。MUST NOT 把跨仓权限问题表述为已修复。

#### Scenario: Dispatch still failing upstream
- **WHEN** 上游分发工作流最近一次运行结论为失败
- **THEN** 相关文档与变更记录如实标注该状态，并指出修复归属

#### Scenario: Documentation matches configuration
- **WHEN** 文档描述受管技能的来源仓库
- **THEN** 来源 owner 与锁文件中记录的一致
