# asset-sourcing-discipline Specification

## Purpose
为素材获取建立逐级判定纪律：规定固定的获取阶梯与每级的进入条件，要求记录"为什么进入下一级"的具体依据，并守住既有的授权与哈希边界，使"素材质量不足"这一结构性风险在计划阶段就有对抗手段，而不是只能等到判定阶段暴露为无门可依。
## Requirements
### Requirement: Asset acquisition follows a fixed descending ladder
素材获取 MUST 按固定顺序逐级判定：外部下载、生成式素材、本地建模、程序化。MUST NOT 在未评估前序级别的情况下直接使用后序级别。

#### Scenario: Ladder is evaluated in order
- **WHEN** 计划需要一份尚不存在的素材
- **THEN** 从第一级开始逐级判定，并记录每一级是否可用

#### Scenario: A prior level is skipped
- **WHEN** 直接使用后序级别而未评估前序级别
- **THEN** 该素材决策不完整，必须补齐前序级别的判定依据

### Requirement: External download requires explicit authorization
外部下载 MUST 默认不允许。只有在用户显式授权时才可使用，授权状态 MUST 被记录。

#### Scenario: Download not authorized
- **WHEN** 用户未显式授权外部下载
- **THEN** 该级判定为不可用，流程进入下一级

#### Scenario: Download authorized
- **WHEN** 用户显式授权外部下载
- **THEN** 该级可用，且素材来源与授权信息记入素材记录

#### Scenario: Generated assets are not downloads
- **WHEN** 素材由生成式模型产出而非自网络下载
- **THEN** 该素材 MUST NOT 被判定为违反"不下载网络素材"的限制

### Requirement: Each ladder transition records a concrete reason
进入下一级的理由 MUST 指向具体的不可用条件，MUST NOT 使用泛化表述。MUST NOT 以时间、成本或配额压力作为进入后续级别的理由。

#### Scenario: Concrete reason recorded
- **WHEN** 某一级被判定为不可用
- **THEN** 记录该级不可用的具体条件（无凭据、被显式禁止、无匹配模型、目标本身不要求该级别细节）

#### Scenario: Time-based reason rejected
- **WHEN** 进入后续级别的理由表述为"更快""省成本""时间紧"
- **THEN** 该理由不被接受，必须给出实质依据或改用更合适的级别

#### Scenario: Procedural is the last resort
- **WHEN** 素材以程序化方式产出
- **THEN** 记录表明其为仅剩选项，或该级别确实产生最贴合目标的结果

### Requirement: Sourcing discipline does not change authorization boundaries
无论素材来自哪一级，MUST 继续满足既有边界：落在授权根内、携带内容摘要、可被素材注册接受，且 MUST NOT 以 URL 作为素材路径。插件 MUST NOT 自行生成素材、驱动建模软件或调用生成 API。

#### Scenario: Generated asset enters the plan
- **WHEN** 用户提供由插件之外产出的生成式素材
- **THEN** 该素材按既有规则校验哈希与授权后进入计划，路径仍为本地文件

#### Scenario: URL is offered as an asset path
- **WHEN** 素材路径被写成 URL
- **THEN** 校验失败，与变更前行为一致

### Requirement: Local modeling remains a neutral option
本地建模 MUST 作为中性级别呈现，其取舍 MUST 由场景复杂度、可用工具与时间预算共同裁定。MUST NOT 无条件排除该级别。

#### Scenario: Detailed 3D asset is needed
- **WHEN** 目标要求精细 3D 资产且本机具备相应建模能力
- **THEN** 本地建模作为可选级别被正向评估，而不是默认跳过

#### Scenario: Simple asset is needed
- **WHEN** 目标只要求简单几何形状
- **THEN** 允许判定本地建模为过度手段并进入下一级，且记录该依据

### Requirement: Generated textures are preferred over procedural substitutes
在具备图像生成能力时，纹理与法线 MUST 优先由生成式产出。MUST NOT 以纯色或程序化噪声替代缺失的生成式纹理。

#### Scenario: Image generation available
- **WHEN** 计划需要纹理、法线或天空盒且具备图像生成能力
- **THEN** 使用生成式产出，而不是程序化填充

#### Scenario: Substituting procedural noise
- **WHEN** 以纯色或程序化噪声替代生成式纹理
- **THEN** 该替代需给出实质依据，否则不被接受

