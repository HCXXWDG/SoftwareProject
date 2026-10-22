# 成员 A：当前交接与服务重启恢复验收

日期：2026-10-22。仓库为 HCXXWDG/SoftwareProject，继续草稿 PR #56、`codex/member-a-frontend`，目标仍为 `codex/sync-latest-20261018`。本文是当前 A 交接入口；10月18日交接清单保留为历史设计，不作为现行接口。未合并、发布、更新其他成员分支或代签。

## A01–A05 当前范围

| 任务 | 已实现与证据 | 后续条件 |
| --- | --- | --- |
| A01 请求 | 超时、取消、设备会话回退、响应检查、无自动写入重试；本轮修正404/410业务错误分类 | 新契约变化继续同步验证器 |
| A02 预览 | 端点竞态隔离、明确错误重试、匹配端点的显式演示、无/单路线；实际B合法nullable响应可进入地图 | 真实外部路线提供方另验 |
| A03 导航 | 返回/重新规划/历史端点恢复，底图与后端能力分开；C01小写来源与评分Props对接 | C完整分支整合、原3项地图测试由C核对 |
| A04 报告与通勤 | 报告成功仅刷新有效视口；D07快照最小请求、五档感受、先存储再POST、原操作重试、确认成功后只刷新GET；真实D07开发/PWA/重启浏览器证据 | 组合数据库、真实来源及正式启用条件继续验收 |
| A05 趋势与历史 | 独立查询/错误/旧数据刷新状态；最近路线查询入口恢复原坐标再比较，不复用旧评分和ID | 通勤记录历史页面不是该最近路线查询交付，本轮未扩展该页面 |

实现与复跑材料：[B契约](member-a-b-contract-integration.md)、[C01 Props](member-a-c01-integration.md)、[通勤操作恢复](member-a-operation-recovery.md)、[D07用户链路](member-a-d07-user-flow.md)、[生产PWA与数据库证据](member-a-pwa-d07-acceptance.md)、[共享全栈入口](member-a-shared-fullstack-entry.md)。

## 本轮实际缺陷

`completeCommute` 已区分业务错误，但 `useCommuteOperation` 原先把任意HTTP404/410都覆盖为“路线快照已失效”。普通端点不存在、代理错误或状态与业务码不匹配，也会被误导为快照问题。

现在仅 `404 + snapshot_not_found` 或 `410 + snapshot_expired` 使用需核对原记录的提示；其他错误保留原错误文案。所有失败仍保留原操作号、请求体与固定完成时间，不据此清理待确认状态、换号或开始下一次通勤。新增6项参数化回归覆盖普通404/410、其他业务码、状态/业务码错配，以及重试原请求。

现行请求只含 `snapshotId`、`operationId`、`routeId`、`endStressLevel`、`completedAt`。201 created与200 duplicate严格校验回执；评分和预计时长由服务端快照提供，可空评分不补零。`VITE_COMMUTE_RECORDING_ENABLED` 默认false，仅在匹配后端的验收进程启用。

## 真实服务重启验收

独立规格 `frontend/e2e/member-a.restart.integration.e2e.ts`，配置 `playwright.member-a-restart.config.ts`。页面5405/API18085与共享入口5173/8080隔离，测试直接启动固定D07打包JAR，并仅停止自己创建的Java子进程；端口占用即拒绝启动。通过本进程Tomcat日志及health双重确认服务启动，每次启动日志作为诊断附件保存。

实际步骤：

1. 比较生成原快照，选择路线及到达感受。完整请求真正发往D07，确认201 created后丢弃浏览器回执，页面进入待确认。
2. 停止该Java进程并启动新的同版内存demo服务。页面重载生成不同快照，恢复原待确认请求；观察1秒无自动通勤POST。
3. 两次明确点击“重试原通勤”，后端均实际返回404 `snapshot_not_found`。每次请求体与原请求相同，sessionStorage原字串不变；页面保留核对提示，无新建/完成新通勤入口。

本机使用D07 `5b0964bfab666ec63ac41a681ce79eb8b9276696` 的现有JAR、JDK21、本机Chrome：**1/1通过，0重试**。运行后5405及18085监听均已关闭。该用例证明内存服务重启丢失快照时的前端处理，不证明数据库持久化恢复，也不等价于实际等待30分钟TTL过期。DEMO通勤不进入真实历史；空历史不能证明原提交未保存。

```powershell
$env:PLAYWRIGHT_CHANNEL='chrome'
$env:MEMBER_A_D07_BACKEND_DIR='固定D07检出的backend绝对路径'
# 可选：MEMBER_A_RESTART_JAVA 指定本机 java 可执行文件
npm run test:e2e:member-a-restart
```

工作流新增可选布尔输入 `verify_restart`，默认false；启用时先打包同一backend目录，再运行独立重启规格。正常PR的共享4项不混入该规格。手动组合A前端与固定D07：

```powershell
gh workflow run fullstack-e2e.yml --repo HCXXWDG/SoftwareProject `
  --ref codex/member-a-frontend `
  -f backend_ref=5b0964bfab666ec63ac41a681ce79eb8b9276696 `
  -f verify_restart=true
```

云端结果需标明对应A提交和运行链接，另记于PR #56，不能用本机结果代替。

## 本轮验证及整合边界

- 定向Vitest：hook29、snapshot50、App13，合计**92/92通过**，包含于下列总数。
- 全量Vitest：**461/464通过、0跳过**。仍失败的3项是既有MapSurface热力详情、热力更新不重建AMap、viewport压力/置信度颜色契约；未删除、跳过或放宽。
- TypeScript/Vite/PWA生产构建通过；全部integration/config类型检查通过。
- 独立重启浏览器：**1/1通过**；共享入口列表保持**4项/2文件**。此前共享云端4/4、受控浏览器33/33、默认PWA5/5及D07生产PWA3/3见各记录，本轮未把历史套件记作重跑。

核对整合候选#72仍为`5f6f242`，只包含较早A业务实现`6c2ca7c`；最新A验收与配置增量仍待整合候选作者纳入并运行默认自身后端检查。其既有Full-stack失败不据本轮手动fixture验收改称成功。

D06旧库升级、范围CHECK与并发专项、完整C分支与原3项地图失败、Android工具链组合、真实高德/设备/生产部署仍需对应负责人推进。本轮未关闭#68/#70，未更改分支保护、其他PR目标或旧仓库。
