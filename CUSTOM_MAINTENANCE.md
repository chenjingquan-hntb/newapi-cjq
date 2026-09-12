# new-api 二开维护与官方同步运行手册

更新日期：2026-09-12

本文件面向今后接手本仓库的 AI 模型和维护者，规定二次开发、官方版本同步、冲突解决、验证、审核和发布的标准流程。

本文件补充根目录 `AGENTS.md`。发生冲突时，始终以当前有效的 `AGENTS.md`、更深层目录中的 `AGENTS.md` 和用户本轮明确指令为准。

## 1. 维护目标与职责边界

维护目标：在持续保留自定义功能的同时，有控制地吸收 QuantumNous/new-api 官方更新，并保证每次候选版本都可审查、可验证、可回滚。

用户只承担最终审核门限。执行任务的模型负责完成审核前的全部可逆工作：

1. 检查仓库、远端、分支和工作区状态。
2. 调研现有实现和项目约束。
3. 创建功能分支或官方更新集成分支。
4. 实现代码、补充必要测试、处理冲突。
5. 执行适用的验证并如实记录结果。
6. 提交并推送功能分支或集成候选分支到 `personal`。
7. 准备完整的最终审核包。

在用户最终批准前，模型不得：

- 更新或重写 `codex/custom-main` 远程主线。
- 移动生产版本指针或声称某提交已经上线。
- 触发生产部署、切换流量、重启生产服务或操作线上数据库。
- 删除远程分支、标签或发布记录。
- 对共享二开主线执行强制推送。

模型不得为普通、可自主判断的实现细节反复请求用户确认。应按照项目既有模式作出合理、保守、可回滚的决定，并在最终审核包中列明。只有缺少凭据、需求存在会改变业务含义的关键歧义、需要不可逆外部操作，或项目强制验证无法执行时，才允许提前中断并请求必要输入。

## 2. 远端和分支模型

### 2.1 远端

| 名称 | 作用 | 规则 |
| --- | --- | --- |
| `origin` | QuantumNous/new-api 官方仓库 | 只获取官方更新，不向其推送 |
| `personal` | 自有二开仓库 | 功能分支、集成分支和二开主线均推送到这里 |

仓库通常配置 `remote.pushDefault=personal`，但这不是安全边界。模型仍不得执行 `git push origin`。

### 2.2 长期分支

| 分支 | 作用 | 是否允许直接开发 |
| --- | --- | --- |
| `upstream-sync` | 官方 `main` 的镜像，只用于观察官方开发进度 | 否 |
| `codex/custom-main` | 已通过用户审核的二开集成主线 | 否，所有修改先进入候选分支 |
| `codex/production` | 可选的生产版本记录指针 | 否；未明确重新启用前不能视为真实生产状态 |
| `develop` / `main` / `release` / `docker-build` | 历史同步、构建或发布流程分支 | 不作为新二开的开发基线 |

`upstream-sync` 允许自动任务使用 `--force-with-lease` 更新，因为它只是官方镜像。任何自定义提交都不得放在该分支，否则会被下一次同步覆盖。

### 2.3 临时工作分支

- 新功能或修复：`codex/feature/<简短名称>` 或 `codex/fix/<简短名称>`
- 官方更新集成：`codex/integrate/upstream-YYYYMMDD-<版本或短SHA>`
- 紧急官方补丁：`codex/integrate/hotfix-YYYYMMDD-<短SHA>`

每个分支只承担一个清晰目标。不得把多个不相关功能和官方同步混在同一个提交序列中。

### 2.4 版本标签

准备交付或部署的二开版本应创建不可变标签，例如：

```text
custom-2026.09.12-1
```

标签必须指向用户已批准的明确提交。不要移动或复用已经推送的标签。

## 3. 每次任务开始前的强制检查

任何二开或官方同步任务开始前，模型必须先执行并检查：

```powershell
git status --short --branch
git remote -v
git branch -vv
git fetch --prune origin
git fetch --prune personal
git log --graph --decorate --oneline --all -30
```

涉及官方版本标签时还必须执行：

```powershell
git fetch origin --tags --prune
git tag --sort=-version:refname
```

检查要求：

1. 确认仓库根目录确实是预期工作区。
2. 确认 `origin` 和 `personal` 没有指向错误仓库。
3. 确认当前工作区是否存在未提交修改或未跟踪文件。
4. 确认目标基线的本地提交和远程提交一致。
5. 确认官方目标版本的标签、完整 SHA 和提交日期。
6. 确认是否有其他功能分支正在修改相同区域。

发现既有未提交修改时不得运行 `reset --hard` 或 `clean`。必须先判断其来源并通过提交到独立分支、创建明确的备份，或其他不会丢失内容的方式保存。不得擅自删除用户工作。

## 4. 二次开发标准流程

### 4.1 建立功能分支

功能分支必须从最新的已审核二开主线创建：

```powershell
git switch codex/custom-main
git pull --ff-only personal codex/custom-main
git switch -c codex/feature/monitoring-page
```

不得从以下对象直接开始二开：

- `upstream-sync`
- `origin/main`
- 某个官方标签的 detached HEAD
- 未经审核的旧集成分支
- 名义上叫 `production` 但无法证明是当前生产源码的分支

### 4.2 实现前调研

模型必须先：

1. 阅读根目录和目标目录适用的全部 `AGENTS.md`。
2. 阅读任务触发的项目 skill 或强制设计文档。
3. 搜索已有组件、服务、DTO、路由、测试和调用点。
4. 确认功能是否会影响认证、计费、数据库、relaykit、插件协议或多语言。
5. 识别可观察行为和必要回归测试，而不是先写代码再猜项目结构。

前端改动必须优先复用现有业务组件。涉及前端用户文案时，必须使用 i18n，并完成所有受支持语言。涉及认证、计费、数据库、relaykit 或 JavaScript task plugin 时，严格执行 `AGENTS.md` 中对应的附加要求。

### 4.3 实现和提交

实现应保持提交职责清晰。例如：

```text
feat(api): add monitoring summary endpoint
feat(web): add monitoring page
test(web): cover monitoring loading and error states
```

提交前至少执行：

```powershell
git diff --check
git status --short
git diff --stat
git diff
```

模型必须检查是否意外提交了：

- 密钥、令牌、密码、连接串或生产数据。
- 构建产物、临时文件、日志和本地 IDE 状态。
- 与当前任务无关的大范围格式化。
- 对 new-api 或 QuantumNous 受保护标识的删除、替换或重命名。

完成后推送候选分支：

```powershell
git push -u personal codex/feature/monitoring-page
```

推送功能分支不等于更新二开主线，也不等于上线。

## 5. 官方更新同步标准流程

### 5.1 选择固定官方目标

用于生产候选的官方同步优先选择明确的官方发布标签，而不是漂移的 `origin/main`。

模型必须记录：

- 官方标签或固定提交。
- 完整提交 SHA。
- 提交日期。
- 当前 `codex/custom-main` 完整 SHA。
- 两者的提交差异和主要变更范围。

如果用户明确要求同步官方 `main`，也必须冻结执行时的完整 SHA；不得只写“最新 main”。

### 5.2 创建集成分支

```powershell
git switch codex/custom-main
git pull --ff-only personal codex/custom-main
git switch -c codex/integrate/upstream-20260913-rcXX
```

在集成前为当前已审核主线建立备份标签：

```powershell
git tag custom-before-upstream-20260913
git push personal custom-before-upstream-20260913
```

标签名称必须避免与既有标签冲突。

### 5.3 合并官方版本

```powershell
git merge --no-ff <官方标签或固定SHA>
```

长期二开主线吸收官方更新必须使用 merge，而不是通过以下方式覆盖：

```powershell
git reset --hard <官方版本>
git push --force
```

上述覆盖方式只适用于用户明确要求清空二开历史的特殊任务，不得作为日常同步流程。

### 5.4 合并后审计

即使 Git 没有产生文本冲突，模型仍必须检查语义冲突：

- 官方是否改变了二开依赖的路由、组件 props、状态结构或接口返回值。
- 官方是否删除、重命名或替代了二开修改过的文件。
- 官方是否引入了相同功能，导致二开功能重复或行为不一致。
- 官方是否改变认证、权限、计费、迁移或缓存语义。
- 自动合并是否保留了代码但破坏了调用顺序、权限门限或异常处理。

至少检查：

```powershell
git status --short
git diff --check
git log --graph --decorate --oneline codex/custom-main..HEAD
git diff --stat codex/custom-main...HEAD
git diff codex/custom-main...HEAD
```

## 6. 冲突解决规则

### 6.1 基本原则

冲突解决目标不是让 Git 标记消失，而是同时满足：

1. 保留仍然有效的二开业务能力。
2. 吸收官方的新结构、修复和安全改进。
3. 删除已经被官方等价实现替代的重复二开代码。
4. 不恢复官方已经移除的不安全或过期模式。
5. 为关键冲突决定提供测试或明确验证依据。

模型不得为了快速完成而对一批代码文件统一执行 `--ours` 或 `--theirs`。

合并官方版本时通常：

- `ours` 是二开集成侧。
- `theirs` 是被合入的官方版本。

但必须通过 `git status` 和当前合并方向再次确认，不能仅凭记忆判断。

### 6.2 处理步骤

```powershell
git status
```

逐个编辑冲突文件，删除冲突标记并形成最终实现，然后：

```powershell
git add <已解决文件>
git merge --continue
```

如果发现目标版本、基线或合并方向错误：

```powershell
git merge --abort
```

集成必须发生在临时集成分支上，因此中止合并不应损坏 `codex/custom-main`。

### 6.3 常见冲突专项规则

#### 前端路由、导航和页面结构

- 采用官方当前的路由和布局结构。
- 将二开页面重新接入官方的新结构。
- 同时保留官方新增入口和二开入口。
- 重新验证权限、懒加载、移动端布局、加载态、空态和错误态。

#### React 组件

- 官方重构或删除旧组件时，不得直接恢复整个旧文件。
- 优先把二开行为迁移到官方现有共享组件。
- 检查 props、Query key、缓存失效、状态生命周期和无障碍行为。

#### i18n locale JSON

- 按键合并，保留官方键和二开键。
- 不得整文件选择一侧覆盖另一侧。
- 检查 `en`、`zh`、`zh-TW`、`fr`、`ru`、`ja`、`vi`。
- 执行项目 i18n 同步和适用验证。

#### `package.json` 和 `bun.lock`

- 先解决依赖声明和版本约束。
- 再使用 Bun 按项目方式重新生成或校验锁文件。
- 不得手工拼接冲突锁文件。
- 不得无理由升级与任务无关的依赖。

#### Go DTO、接口和 JSON

- 保留官方协议变化和二开业务要求。
- 继续遵守可选标量指针、显式零值、JSON wrapper 和 relaykit 独立性规则。
- 不得为了兼容旧二开而破坏官方当前 API 契约。

#### 数据库和迁移

- 不得只以 SQLite 或 mock 通过为依据。
- 迁移、模型、索引、约束和 GORM 变化必须执行 `AGENTS.md` 规定的真实 SQLite、MySQL、PostgreSQL 验证。
- 无法完成三数据库验证时，候选必须标记为未通过审核门限。

#### 认证和权限

- 官方安全修复默认优先保留。
- 二开认证逻辑必须重新对照适用的最新 OWASP ASVS 和 Cheat Sheet。
- 不得用前端限制代替服务端权限、CSRF、重放、过期、单次使用或重新认证控制。

#### 计费和配额

- 官方计费安全修复默认优先保留。
- 重新追踪验证、估算、预扣费、结算、退款和日志审计完整链路。
- 不得恢复裸 `int` 转换、未限制乘数或可导致负额度的旧实现。

## 7. 验证矩阵

模型必须根据实际影响选择并执行验证，不能只运行最容易通过的命令。

### 7.1 仅前端改动

从 `web/` 执行：

```powershell
bun install --frozen-lockfile
bun run typecheck
bun run test -- --maxWorkers=2
bun run build
```

如全量测试存在与本次无关的既有失败，可以补充定向测试定位影响，但不得把定向测试通过描述为全量通过。必须记录全量失败项、定向结果和判断依据。

### 7.2 Go 后端改动

至少执行适用的定向测试、格式化、静态检查和构建。常用命令：

```powershell
gofmt -w <修改的Go文件>
go test -count=1 ./<受影响包>
go vet ./...
go build ./...
```

影响范围较大时执行项目现有完整测试入口。测试失败不得通过删除测试、跳过测试或放宽真实业务断言来掩盖。

### 7.3 relaykit 改动

必须独立验证：

```powershell
Set-Location relaykit
$env:GOWORK='off'
go vet ./...
go build ./...
go test ./...
```

根模块构建成功不能替代该验证。

### 7.4 数据库改动

严格执行根 `AGENTS.md` 的三数据库矩阵，记录：

- SQLite、MySQL、PostgreSQL 的准确版本。
- 使用的命令和环境。
- 新数据库初始化结果。
- 从最新已发布版本升级的结果。
- 重复启动或迁移的幂等性结果。
- 数据、索引、约束和唯一性检查结果。

无法实际运行其中任一数据库时，不得声称数据库兼容或任务完成。

### 7.5 特殊高风险改动

- 认证：记录 OWASP 参考、失败/过期/重放/绕过测试。
- 计费：记录边界、饱和、预扣费、结算、退款和审计验证。
- JavaScript task plugin：先读 `docs/plugin-api/v1.md`，检查 schema、类型定义和描述文案规则。
- billing expression：先读 `pkg/billingexpr/expr.md`。
- relay/provider：验证可选字段、显式零值、流式行为和上游契约。

## 8. 候选分支推送和最终审核门限

完成实现、冲突解决和验证后，模型应提交并推送候选分支：

```powershell
git push -u personal <当前功能或集成分支>
```

然后向用户提交唯一一次最终审核包。审核包必须包括：

1. **候选分支和提交**：分支名、完整 SHA、基线 SHA、官方目标标签/SHA。
2. **功能结果**：新增、修改、删除了什么，用户可观察行为是什么。
3. **官方同步范围**：吸收了哪些官方提交或版本。
4. **二开保留情况**：哪些二开功能已确认保留、迁移、替代或删除。
5. **冲突记录**：冲突文件、双方意图、最终选择和理由。
6. **验证记录**：实际执行的命令、通过项、失败项、跳过项和环境版本。
7. **风险与缺口**：未验证事项、兼容性风险、部署前置条件。
8. **发布计划**：批准后将如何更新 `codex/custom-main`、创建标签和部署。
9. **回滚计划**：回滚目标标签/提交和具体方式。

用户最终审核结果只有以下三类：

- **批准**：模型才可以把候选并入 `codex/custom-main`，推送主线，并按用户明确范围继续创建版本标签或执行发布。
- **要求修改**：模型继续在原候选分支修正并重新提交完整审核包。
- **拒绝**：保留候选分支供审计，不移动主线和生产指针。

任何强制验证未完成或存在未解决高风险问题时，模型必须明确标记“未通过审核门限”，不得请求用户把它当作可发布版本批准。

## 9. 批准后的主线更新

如果候选分支从当前 `codex/custom-main` 创建，且审核期间主线没有变化，应优先快进：

```powershell
git switch codex/custom-main
git pull --ff-only personal codex/custom-main
git merge --ff-only <已批准候选分支>
git push personal codex/custom-main
```

如果 `--ff-only` 失败，说明审核期间主线发生变化。模型不得直接强推，应返回候选分支：

1. 合并最新 `codex/custom-main`。
2. 重新处理冲突。
3. 重跑受影响验证。
4. 重新生成最终审核包。

只有在用户明确批准版本发布后，才创建并推送不可变二开标签。部署操作与代码合并是两个门限；批准合并不自动等于批准生产部署，除非用户明确把两者合并授权。

## 10. 回滚原则

- 首选回滚到最近一个已批准的不可变 `custom-*` 标签。
- 已发布的合并提交优先使用 `git revert` 形成可审计的反向提交。
- 不得通过强制重写 `codex/custom-main` 公共历史来完成常规回滚。
- 数据库迁移必须有单独的数据兼容和回滚判断；源码回滚不代表数据库自动可回滚。
- 回滚后仍需执行与受影响范围相匹配的验证。

## 11. 明令禁止

除非用户针对一次特殊任务明确要求并理解后果，否则模型不得：

- 在 `upstream-sync` 上开发或保留自定义提交。
- 向 `origin` 推送。
- 使用 `reset --hard` 加强制推送来同步日常官方更新。
- 强制推送或重写已经共享的 `codex/custom-main`。
- 未备份就删除分支、标签、工作区文件或未提交修改。
- 将未经完整验证的集成候选称为“已完成”“可上线”或“完全兼容”。
- 用 `ours`/`theirs` 批量覆盖所有冲突文件。
- 因官方重构而盲目恢复旧文件或旧安全行为。
- 跳过 `AGENTS.md` 中认证、数据库、计费、relaykit、插件和 i18n 的强制要求。
- 删除、替换或重命名受保护的 new-api / QuantumNous 项目标识和归属信息。
- 在用户最终批准前部署、重启生产服务、迁移线上数据库或切换生产流量。

## 12. 当前仓库基线快照

以下内容是 2026-09-12 的历史快照，未来模型必须重新 fetch 后再使用，不能把它当作永久现状：

- `personal/codex/custom-main`：`385d2dfd10d821b25c8a6766bd16eea248cb1652`，对应 `v1.0.0-rc.37`。
- 当前二开主线已被重置为纯官方 `v1.0.0-rc.37`，其中不包含旧二开功能。
- 获取时 `origin/main` 为 `043ff99a51ecad8229389ddd04f45f4b25a23ac6`，比 `v1.0.0-rc.37` 多 6 个提交。
- `upstream-sync` 由默认分支中的 GitHub Actions 定时镜像官方 `main`；它不自动合并二开主线，也不自动部署。
- 旧群发邮件二开保存在 `codex/feature/bulk-email`。
- 2026-09-10 的旧官方集成候选保存在 `codex/integrate/upstream-20260910`。
- 旧候选中的 `custom-verify.yml` 当前不在 `codex/custom-main`，不能假设推送二开分支会自动执行该验证流程。
- `codex/production`、`develop`、`main`、`release` 和 `docker-build` 是旧流程遗留状态，未重新核验前不得代表当前生产版本。

## 13. 模型执行摘要

今后模型接到二开任务时，必须遵循：

```text
读取规则和现状
  → fetch 两个远端
  → 从 codex/custom-main 建立 feature/fix 分支
  → 实现与测试
  → 推送 personal 候选分支
  → 提交最终审核包
  → 用户批准
  → 快进 codex/custom-main
  → 创建已批准版本标签
  → 按单独部署授权发布
```

接到官方同步任务时，必须遵循：

```text
冻结官方标签/SHA
  → 从 codex/custom-main 建立 integrate 分支
  → merge 官方版本
  → 逐项处理文本和语义冲突
  → 执行完整适用验证
  → 推送 personal 集成候选
  → 提交最终审核包
  → 用户批准
  → 快进 codex/custom-main
  → 创建已批准版本标签
  → 按单独部署授权发布
```
