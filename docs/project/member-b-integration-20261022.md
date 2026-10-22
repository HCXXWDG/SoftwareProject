# 成员 B：A/B/D07 最小集成验收

日期：2026-10-22。分支：`codex/member-b-integration-20261022`，目标 `develop`。

## 范围与来源

从已 fetch 的 `origin/develop` (`d14ecbc`) 建立独立工作树，使用保留原提交的 merge 组装：

| 来源 | 固定提交 | 用途 |
| --- | --- | --- |
| B #67 | `fb53530` | 步行路线、来源/可空评分、快照、热力默认范围与 503 |
| D07 #71 | `5b0964b` | 演示/无评分通勤写入、V6 可空列、JDBC NULL 与趋势判空 |
| A #56 | `6c2ca7c` | B/D07 响应适配、C01 状态桥接、完成通勤与稳定操作恢复 |

B 的提交中已经包含 #55 及 D01–D05 的依赖；本候选**没有合入 D06 #69 或 C #57–#61 完整分支**，不能代替全项目发布候选。A 包含经其声明的 C01 接入桥接，不等于 C 的整组功能已验收。未修改原 B/A/D 分支、受保护 develop/main、开发者环境文件或凭据。

## 验证计划

- [x] 固定来源提交，完成三方无冲突组装。
- [x] `backend/mvnw.cmd clean verify`，区分通过、失败、无 Docker 跳过；V6 真库由 CI 单独核验。
- [x] `frontend/npm ci`、全量 Vitest 与生产构建，不删除/跳过已有断言；3 项失败如实保留。
- [x] A 受控浏览器与 PWA 回归，保留失败证据。
- [x] 用本候选的实际 Spring Boot 执行 A 的 D07 浏览器场景：移动端新建通勤、服务保存后丢失回执、同键显式重放；不替换 API 数据。
- [x] 建立指向 develop 的[草稿 PR #72](https://github.com/HCXXWDG/SoftwareProject/pull/72)，让此前以功能分支为 base 而未触发的检查真正运行。
- [x] 根据实际组合结果回给 A/C/D 可复现待办，不绕过 required checks 或非作者评审。

## 执行约束

无评分的 REAL 路线仍记 REAL：缺的是评分而非路线来源。DEMO 记录只进排除计数，不进入真实趋势/历史。评分为 null/缺键时不补 0。仅在隔离的 D07 验收环境设置 `VITE_COMMUTE_RECORDING_ENABLED=true`；默认部署开关保持关闭。

本地无 Docker 的跳过不计通过；模拟路线提供方的 REAL 场景不冒充真实高德验收。没有执行过的数据库升级、Android 真机、正式 Key 或完整 C 分支不能标为已验收。测试产物只保留在忽略目录，不提交。

## 结果

| 检查 | 实际结果 |
| --- | --- |
| 初始 `clean verify` | 208 项，199 实际通过，9 项无 Docker 跳过，0 失败/错误 |
| B 补强快照测试后的 `verify` | 210 项，200 实际通过，10 项无 Docker 跳过，0 失败/错误；新增真实零分用例由 memory/PostGIS 各复用一次 |
| `npm ci --no-audit --no-fund` | 成功，530 包；未修改依赖锁文件 |
| 全量 Vitest | 458 项，455 通过、3 失败、0 跳过；MapSurface 两项旧 aria-label 与 viewport 一项旧蓝红颜色断言，与 A 已报 C 基线一致 |
| 生产构建 | TypeScript、Vite、PWA 构建通过 |
| Mock E2E | 本机 Chrome 33/33，1 worker、0 重试；不计作真实后端测试 |
| PWA | 本机 Chrome 5/5，实际 SW 接管、API 不缓存、离线重载 |
| 实际后端 D07 浏览器 | 3/3：390/320px Demo 无评分完成 201；真实保存后丢失回执，刷新不自动写入，同键显式重放得到同 commuteId 的 200 duplicate |
| [Backend CI](https://github.com/HCXXWDG/SoftwareProject/actions/runs/39766113292)（源码提交 4759522） | **210/210，0 失败/错误/跳过**；PostgisRouteSnapshotFlowTest 5/5 + PostgisIntegrationTest 5/5，实际应用 V6 并验证空评分回读与有效零分 |
| [E2E CI](https://github.com/HCXXWDG/SoftwareProject/actions/runs/39766113335)（4759522） | 云端 Mock 浏览器通过；不当作实际后端验证 |
| [Frontend CI](https://github.com/HCXXWDG/SoftwareProject/actions/runs/39766113196)（4759522） | 仍为 3 项 C 地图断言失败，与本地一致，不宣称全绿 |

实际服务由本候选 JAR 在 18095 端口以隔离内存 demo 启动，空高德 Key，临时允许 5403 前端 CORS；测试完已停止。前两项不拦截 API，第三项只在真实服务保存后丢弃回执，不替换 API 数据。B 新增仓储回读与合法零分断言，不手改 A 的页面/API Client 或 D 的服务/迁移。

390/320px 成功截图由现有测试写入 `.tmp/member-a-commute-browser/**/commute-saved.png`，Vitest 结构化结果在 `.tmp/member-b-vitest.json`；均为忽略产物，不提交。未运行 Edge、Android 真机、真实高德 Key、完整 C 分支和 D06 的升级/并发验收。

## 剩余交接

- C：确认热点的 aria-label 和配色语义并修复 3 项地图单测；继续按 develop 整合完整 C PR，不能通过删测或默认有效评分让 CI 变绿。
- D：升级 #69 的真实来源 fixture/V6 迁移断言，接入后重验全新/旧库、并发、归属、过期；清理 422 死代码可后续统一处理，不阻塞当前来源语义确认。
- A/D：共享 `playwright.integration.config.ts` 会收集所有 `*.integration.e2e.ts`，但不同专用配置使用不同端口和写入开关；必须约定共享 CI 入口和默认部署能力，不能把专用 3/3 冒充共享 Full-stack E2E 全绿。

尚未完成的云端检查以草稿 PR 的实际结果为准。本候选不自动关闭 #68/#70，也不自动合并原 PR。

已在 #56/#57/#71 发布新的组合结果与可复现交接；B 对 D07 的来源与可空评分增量提交非作者批准，不等于批准本集成草稿或发布。以上 CI 链接绑定首次源码提交 4759522；后续报告文档提交不改变被测功能源码，仍需看 PR 当前 head 的检查。
