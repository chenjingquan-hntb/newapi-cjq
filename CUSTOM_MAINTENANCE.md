# 自定义 new-api 的维护与发布指南

更新日期：2026-09-10。保留 new-api / QuantumNous 项目标识、版权和上游历史。

> 当前状态：已保全二开代码并建立官方更新集成候选；**不是已批准上线的版本**。
> 本轮没有部署、重启服务器、迁移线上数据库、切换流量或启用自动发布。

## 1. 仓库与分支分工

| 对象 | 用途 | 本轮状态 |
| --- | --- | --- |
| `origin` | QuantumNous/new-api 官方源码，只用于获取更新 | 保留原地址 |
| `personal` | chenjingquan-hntb/newapi-cjq 自有仓库 | 默认 push 目标 |
| `upstream-sync` | 官方源码镜像，不混入二开 | 对齐 `bdef117505247769268b209665fb3ad7554c3da7` |
| `codex/feature/bulk-email` | 保存原有群发邮件功能及渠道缓存修复 | `7f14a6330`，已推送 |
| `codex/custom-main` | 二开集成主线 | 暂留 `7f14a6330`；当前是源码保全点，不是经过认证的生产版本 |
| `codex/integrate/upstream-20260910` | 本次官方更新候选 | 官方合并 `a4eed1321`，校验流程 `5c2269e33`，邮件轮询修复 `9b103df4c` |
| `codex/production` | 现有生产记录分支 | 未移动；不能仅凭这个名字推断服务器二进制源码 |
| `develop` / `release` / `docker-build` | 旧流程分支 | 未更改，默认分支仍为 `develop` |

本地 `remote.pushDefault=personal`，`main` 的 pushRemote 和跟踪远端均指向 personal。
这不是阻止显式 `git push origin` 的权限墙；不要向官方仓库执行 push。

现有默认分支的 `sync-upstream.yml` 只同步镜像，不把官方更新合入二开，也不部署。
其现有实现使用 `--force-with-lease` 更新镜像，因此不要在镜像分支开发。
本轮手动同步镜像和二开保全主线均为 fast-forward，没有强制重写历史。

历史差距校正：原二开基线 `eb99ab1b4` 落后本次官方目标 47 个提交；
原镜像 `064ed943e` 仅落后该目标 1 个提交，不是镜像落后 46 个提交。

## 2. 本次保留与集成内容

- 群发邮件后端、管理员路由、收件人筛选/去重、异步任务和前端入口已形成独立提交。
- 保留渠道缓存中不存在分组时初始化 map 的修复，同时接入官方新的模型解析行为。
- 解决渠道缓存和七种语言文件的合并冲突，保留官方翻译与自定义邮件文案。
- 邮件任务轮询使用现有 TanStack Query；pending/running 时刷新，完成后停止。
  新增两个 UI 回归用例，覆盖这两种初始状态、发送按钮锁定、完成结果与停止轮询。
- 此次候选合入的是固定官方 main 提交，不等同于只挑选某一个核心功能，也不等同于正式发布标签。
- 2026-09-10 查询 GitHub releases/latest 返回 `v1.0.0-rc.36`，发布时间为
  `2026-09-08T13:01:52Z`；虽然 API prerelease=false，标签仍含 rc，不应擅自称为稳定版。
  后续每次升级都重新核对发布信息，并冻结具体 SHA。

## 3. 已执行验证与边界

CI 工作流只做验证：`.github/workflows/custom-verify.yml`。
监听 feature / integrate / custom-main 分支；不带服务器凭据，不构建或发布生产镜像。
前端全部测试限制两个 worker，减少共享 runner 资源竞争，不跳过测试、不自动重试失败。

### 首轮 GitHub CI：34424908091，源码 5c2269e33

- Linux 后端：`go vet ./...`、`go build ./...`、独立 relaykit vet/build、`make test` 通过。
- 三数据库回归任务通过。实际版本：SQLite **3.50.4**、MySQL **8.4.11**、PostgreSQL **15.19**。
- 三数据库执行命令：

```sh
go test -count=1 -v ./model -run 'Migration|PrefillGroup|TokenKey'
go test -count=1 -v ./service -run '^TestFixedPriceBillingDatabaseMatrix$'
```

MySQL/PostgreSQL 使用 GitHub runner 的临时容器，model 和 billing 使用独立测试数据库。
SQLite 由测试使用真实 SQLite 引擎，不是 mock；没有连接线上数据库。

- 前端 117/118 文件、1138/1139 用例通过；失败为上游未改动的
  `setup-guide.test.tsx` 的可见性断言。不能把此轮称为全绿。

### 本地验证

- frozen Bun 安装、typecheck、生产构建通过。
- 群发邮件组件与新增测试文件的定向 oxlint 通过；前端新增两个回归用例通过。
- `go test -count=1 ./service -run 'TestNormalizeBulkEmailRequest|TestBulkEmailRecipientsFiltersDisabledAndDeduplicates'` 通过。
- relaykit 在 `GOWORK=off` 下独立 build / vet / test 通过。
- 首次本地全量前端运行两处失败；降低并发后的定向重跑 2 文件/14 用例通过。
  重跑通过不抹去初次失败，也不能据此宣称全量前端测试已通过。
- Windows Go service 全量运行存在未改动的渠道亲和性缓存测试失败；疑似时间戳生成测试键冲突，
  尚未证明根因。Linux CI 后端已通过，但不能称为 Windows 全量通过。
- 全库前端 lint 存在未修改文件的错误；本轮仅对涉及的邮件 UI 文件进行定向 lint，不宣称全库 lint 通过。

### 第二轮 GitHub CI：34425561018，源码 9b103df4c

Linux 后端与三库回归通过。前端 118/119 文件、1140/1141 用例通过，仍失败在相同的
setup-guide 可见性断言；新增邮件用例通过。降低并发并没有解决该失败。
已定位该断言会在 CardStaggerItem 的透明度入场动画尚未完成时执行；
`17d92d5b2` 将断言置于 waitFor 中，保留 toBeVisible 和原有业务断言，未跳过测试或修改页面业务逻辑。
修正后的本地定向测试 2 文件/8 用例通过。最终整体验证另见下一轮结果。

### 最终代码验证：34426002359，源码 17d92d5b2

**三个 CI job 全部通过**：Linux backend、database-regressions、frontend。
前端 typecheck、119 个测试文件 / 1141 个测试用例、生产 build 通过。
本地 Windows 也重新运行了 `bun run test -- --maxWorkers=2`，119 文件 / 1141 用例全部通过。
未跳过或删除失败测试；保留前两轮失败记录用于追踪。
此成功结果覆盖 17d92d5b2 的代码，之后指南和本地二进制忽略项属于文档/仓库维护变更。
**全绿不等于第 4 节的完整数据库升级演练已经完成。**
## 4. 上线前仍必须完成的门禁

**现有三库回归不是完整的数据库升级认证。** 本次官方更新包含 SQLite 驱动及其他数据库相关变化。
当前 go.mod 声明的组合为 GORM 1.25.12、MySQL driver 1.5.7、PostgreSQL driver 1.5.9、
glebarez/sqlite 1.11.0（原基线为 1.9.0）。记录版本不代表已经证明其完整升级兼容性。
在以下门禁全部通过前，不推进 custom-main，不移动 production，不上线候选：

1. 检查 GORM 核心、SQLite/MySQL/PostgreSQL 方言和驱动的兼容版本组合。
2. 在隔离 SQLite / MySQL / PostgreSQL 上验证全新数据库启动与迁移，并至少启动两次。
3. 用最近发布版本建立具有代表性数据的数据库，再升级候选；验证现有数据、索引、约束、
   唯一性和再次启动的幂等性。另需补测实际线上版本的数据升级路径，不能只测空库。
4. 对共用迁移路径覆盖独立日志数据库；有最低版本特性依赖时，补测项目要求的最低版本。
5. 明确记录每个引擎版本、基线与候选 SHA、命令、第一次/第二次启动结果、数据完整性结果。
6. 解决或明确定位前端/Windows 测试问题，候选完整验证通过；不得以删测试或跳过错误换取绿灯。
7. 在隔离测试环境做登录、渠道转发/流式响应、扣费/退款、管理权限、邮件预览和小批量发送验收。
   邮件只发给指定测试收件箱，不能自动向真实用户群发。
8. 发布前核对真实 systemd / Docker / Nginx 路由，备份数据库、配置、二进制/镜像并演练恢复。
   数据库迁移后不保证换回旧二进制即可回滚；应明确配套数据库恢复和停写窗口。

本机 Docker daemon 不可用，因此已采用 GitHub 隔离容器做现有回归。
完整“发布基线 → 候选”的三库升级/重复启动/独立日志库演练尚未完成；这是发布门禁缺口，不是本次已完成项目。

## 5. 以后如何开发与同步

### 新二开功能

1. 保存当前未提交工作（不要盲目 add 全目录），从审核后的 custom-main 新开 `codex/feature/<功能>`。
2. 一个功能形成清晰提交；尽量把业务逻辑放在 service、接口放在 controller/router，避免到处改核心代码。
3. 补功能/权限/计费回归及七种语言翻译；数据库变化按第 4 节做真实三库验证。
4. 通过 PR 审核与 CI 合入 custom-main。保留功能提交历史，不直接在镜像分支修改。

### 官方更新

```sh
git fetch origin --tags
git fetch personal
# 从已审核二开主线创建新的集成候选，不在生产分支直接 pull：
git switch -c codex/integrate/upstream-YYYYMMDD personal/codex/custom-main
# 用审核时冻结的官方提交或发布标签替换下面的占位值：
git merge --no-ff <verified-upstream-sha>
```

优先按发布版本定期 merge，保留官方 ancestry，降低长期重复冲突。
必须提前引入单项功能/安全修复时，可 cherry-pick 经审查的小范围提交，并记录来源和依赖；
大型跨层变更不宜随意拆取。每次同步重新执行门禁，不因“来自官方”跳过数据库、计费或权限验收。

### 发布

- CI 全绿只表示自动化覆盖通过，不替代迁移演练与生产批准。
- 仅在门禁满足并获得明确上线批准后，推进 custom-main，生成不可变 release tag / SHA 镜像，部署并验收。
- 在真实部署成功后记录 production 对应 SHA、镜像 digest、配置版本及备份位置，不提前移动生产标记。
- 不使用旧 Docker 流程硬编码的其他发布者镜像地址，不使用浮动 latest 作为唯一版本证据。
- 将来启用自动发布前，单独审查环境审批、分支保护、最小权限、可信工作流来源和回滚逻辑。
  受保护的旧分支不自动保护新 custom-main 分支。

## 6. 本地未入库资产

本轮对原始 Git 历史和工作文件做了仓库外备份，包括原本未跟踪的文件。
交付备份目录中的 `repository.bundle` 已验证；`working-files/` 保存当时修改与未跟踪的非忽略文件。
中途取消生成的 `source-backup.zip` 不完整，不能用于恢复。

以下资产仍保留本地，没有加入公开仓库或启用：

- `custom-delivery.yml`、`.github/scripts/`、`deploy/`：发布脚手架，仍需独立审查。
- `MIGRATION_RUNBOOK.md`、`legal-html/`、`tools/`：含站点/环境特定内容，不作为经过验证的新发布指南。
- `tools/sub2api-migrate/apply_full.py` 含立即执行的破坏性清表逻辑，禁止把它当默认 dry-run 工具执行。
- `new-api-linux-amd64`：旧部署二进制保留本地并加入精确忽略项，不提交大型二进制。

此前核对的服务器二进制与本地旧二进制 SHA256 相同：
`5577f7a2bd95f1a7db27d20451855de8d8898619e51de4b9de8f6385c5eace6b`。
该哈希只能说明被核对的旧二进制一致，不能证明新候选源码已在服务器运行。
本轮源码已经前进，服务器没有由本轮更新；不要把“本地当前源码”和“服务器现有部署”称为同一版本。
