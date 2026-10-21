# D06 数据库与端到端验收组织（成员 D）

对应任务书 D06 与启动书第八节「发布前至少通过以下场景」。目标：组织全新建库、旧库迁移、并发幂等与归属校验的集成测试，汇总全流程、离线恢复和移动端检查，形成**实际运行结果、未运行项、剩余缺陷、启动说明**四项交付。C 固定承担 4 工时的浏览器与移动端验收协助，本次把可直接执行的检查清单写在第 8 节；A 按联调需要参与；失败问题回到对应成员修复。

检查日期：2026 年 10 月 21 日。所有数字均来自当天本机实际运行，不沿用历史记录。

## 1. 交付物

| 文件 | 类型 | 内容 |
| --- | --- | --- |
| `backend/src/test/java/com/example/commutemood/integration/IntegrationDatabase.java` | 新增 | 集成测试的取库解析器：显式 JDBC 参数 → Testcontainers → 不可用；提供一次性 schema 的建/删与 `currentSchema` URL 拼装 |
| `backend/.../integration/DatabaseMigrationAcceptanceTest.java` | 新增 | 3 项：空 schema 一次迁移到 V5、停在 V3 的老库升级后历史行不丢、重复迁移是空操作 |
| `backend/.../integration/CommutePersistenceAcceptanceTest.java` | 新增 | 4 项：12 线程并发重放同一 `operationId` 只落一条、跨设备用同一 `snapshotId` 一律 404、快照过期 410、同 `operationId` 换内容 409 |
| `frontend/e2e/app.integration.e2e.ts` | 改动 | 共享 E2E 场景（D 主改）：完成通勤断言由过期的 `200` 改为 D02 口径的 `201 created`；给「热力图非空」「趋势计数递增」两条断言补上守门人注释，写明各自防的是哪个回归 |
| `docs/测试/E2E测试说明.md` | 改动 | 修正「完成通勤返回 200」的过期描述为 201/200/409 三态；新增「后端数据库验收集成测试（D06）」一节，含取库顺序、跳过口径、schema 隔离理由与本机运行命令 |
| `docs/project/d06-database-e2e-acceptance.md` | 新增 | 本文：验收记录 |

未改动任何生产代码、迁移文件和仓储实现。D06 是验收组织任务，本轮发现的问题按归属回给对应成员（第 6 节），不在验收任务里顺手改别人的模块。

## 2. 运行环境

| 项 | 值 |
| --- | --- |
| 操作系统 | Windows 11，无 WSL |
| JDK | JDK 26（编译目标 Java 17） |
| Maven | 仓库自带 wrapper，离线模式 `-o` |
| JaCoCo | **必须带 `-Djacoco.skip=true`**：JaCoCo 0.8.13 读不懂 JDK 26 编译出的 class 文件 |
| PostgreSQL | 16.15，本机安装 |
| PostGIS | 3.6，已由超级用户装在 `commute_mood` 的 `public` schema |
| 数据库角色 | `commute`：`rolsuper=f`、`rolcreatedb=f` |
| Docker | **本机没有**，因此 Testcontainers 路径在本机不可用 |
| 后端 profile | `demo`（默认，内存仓储，Flyway 关闭）与 `postgres`（JDBC 仓储，Flyway 开启）各实测一轮 |

角色没有 CREATEDB，是集成测试用 **schema 而不是 database** 做隔离的直接原因：每个测试类建一个一次性 schema，通过 JDBC 的 `currentSchema=<schema>,public` 排在 `public` 之前，测试结束 `DROP SCHEMA ... CASCADE`。`public` 必须留在 search_path 里，否则 PostGIS 的 `geometry(Point,4326)`（V1）和 pgcrypto 的 `digest()`（V2）解析不到。

## 3. 实际运行结果

### 3.1 数据库集成测试：7 项全部通过

```bash
cd backend
COMMUTE_TEST_JDBC_URL="jdbc:postgresql://localhost:5432/commute_mood" \
COMMUTE_TEST_JDBC_USERNAME=commute COMMUTE_TEST_JDBC_PASSWORD=commute_dev_password \
  ./mvnw -o -Djacoco.skip=true \
  -Dtest='DatabaseMigrationAcceptanceTest,CommutePersistenceAcceptanceTest' test
```

| 测试类 | 项数 | 结果 |
| --- | --- | --- |
| `DatabaseMigrationAcceptanceTest` | 3 | 通过 |
| `CommutePersistenceAcceptanceTest` | 4 | 通过 |

覆盖到的具体行为：

1. **全新建库**：空 schema 上 `Flyway.migrate()` 应用 5 个版本（`1..5` 全部 `success=t`），`PostGIS_Version()` 非空，`ST_SRID(ST_SetSRID(ST_MakePoint(...),4326))=4326`，V4 的新列与部分唯一索引 `uq_commute_device_operation` 出现在 `pg_indexes`，V5 的标签约束接受 `QUIET`、拒绝 `BOGUS_TAG`（`DataIntegrityViolationException`），种子数据 simulated 行数 > 0 且非 simulated 行数为 1。
2. **旧库迁移**：先 `target("3")` 迁到 V3，确认 V4/V5 的新列不存在；插入一条只有 V1 列的历史行；再迁到 V5，该行完整保留、四个新列全为 NULL；用 `JdbcCommuteRecordRepository.findByDeviceSince` 读回，`routeSource=UNKNOWN`、`estimatedSeconds=null`、`operationId=null`；两条 `operation_id` 为 NULL 的行可以共存（部分唯一索引不误伤），同一 `operation_id` 插两次抛异常；被重放的历史行由 `CommuteRecordDeduplication` 折叠（4 行 → 3 条唯一，`duplicateCount=1`）。
3. **迁移幂等**：`validate()` 不抛异常，第二次 `migrate()` 执行 0 个迁移，`emotion_report`/`emotion_cell` 行数不变。
4. **并发幂等**：12 个线程由 `CountDownLatch` 同时放行提交同一 `operationId`，全部响应 ∈ {201,200}，**恰好一个 201、十一个 200**，库里 `(device_hash, operation_id)` 只有 1 行，趋势 `totalCommutes` 只 +1，`/commutes/history` 只有 1 条且 `operationId` 一致。
5. **归属校验**：另一台设备用同一 `snapshotId`、以及随机 UUID，都返回 404 `snapshot_not_found`，库里不为入侵设备落任何行，其 `/routes/history` 为空；快照所有者本人提交返回 201 且 `snapshotId` 匹配。
6. **快照过期**：把 `route_query.created_at` 改成 2 小时后，提交返回 410 `snapshot_expired`（不是 404），且不落行。
7. **操作 ID 冲突**：201 → 同内容重放 200 duplicate（`commuteId` 相同）→ 同 `operationId` 换路线 409 conflict 并回带 `existingCommuteId`；库里始终 1 行，`totalCommutes=1`。

### 3.2 全量后端套件

| 命令 | 结果 |
| --- | --- |
| 带 `COMMUTE_TEST_JDBC_URL`（本机 PG 可用） | `Tests run: 154, Failures: 0, Errors: 0, Skipped: 5`，BUILD SUCCESS，19.9 s |
| 不带该变量（模拟无库无 Docker 的机器） | `Tests run: 154, Failures: 0, Errors: 0, Skipped: 12`，BUILD SUCCESS，14.4 s |

跳过的 5 项是 `PostgisIntegrationTest`（Testcontainers 需要 Docker，本机没有），另外 7 项是 D06 新增的两个类——两者都通过 `@EnabledIf("...IntegrationDatabase#isAvailable")` 整类跳过，**记为未运行，不计为通过**。第二轮 154/0/12 是为了证明"环境缺失时干净跳过、不误报失败"，即其他开发者在没有数据库的机器上 `./mvnw -o test` 仍然 BUILD SUCCESS。两轮结束后 `pg_namespace` 里 `LIKE 'd06%'` 的 schema 数均为 **0**，`public.commute_record` 仍是验证前的 7 行——一次性 schema 没有污染开发库。

### 3.2.1 CI 上的同一套测试：154 项 0 跳过

本 PR（#69，头提交 `7ad3331`）的 `Backend CI` 为 **success**，日志里 12 项数据库测试全部真实执行，**没有一项跳过**：

| 测试类 | CI 结果 |
| --- | --- |
| `PostgisIntegrationTest` | `Tests run: 5, Failures: 0, Errors: 0, Skipped: 0`，16.67 s |
| `DatabaseMigrationAcceptanceTest` | `Tests run: 3, Failures: 0, Errors: 0, Skipped: 0`，0.889 s |
| `CommutePersistenceAcceptanceTest` | `Tests run: 4, Failures: 0, Errors: 0, Skipped: 0`，1.187 s |
| 合计 | `Tests run: 154, Failures: 0, Errors: 0, Skipped: 0`，BUILD SUCCESS |

CI 的 ubuntu-latest 有 Docker，所以走的是 Testcontainers `postgis/postgis:16-3.4` 路径；本机走的是 `COMMUTE_TEST_JDBC_URL` 指向的真实 PostgreSQL 16.15 + PostGIS 3.6。**两条取库路径都验证过，且结果一致**——这正是 `IntegrationDatabase` 存在的意义：本机没 Docker 不等于测试没跑，CI 有 Docker 也不等于本机开发者会被迫跳过。第 4 节里"本机未运行"的 5 项 `PostgisIntegrationTest`，据此可以判定为**在 CI 上已通过**。

### 3.3 `postgres` profile：全新建库 → 启动 → 全流程实测

在一个全新空 schema `d06_live_pg` 上按第 7 节的方式启动后端（`SPRING_PROFILES_ACTIVE=postgres`，`SPRING_DATASOURCE_URL` 带 `currentSchema=d06_live_pg,public`）：

- Flyway 日志：`Successfully validated 5 migrations` → `Migrating schema "d06_live_pg" to version "1 - create schema"` … `"5 - report source scope and positive tags"` → `Successfully applied 5 migrations to schema "d06_live_pg", now at version v5 (execution time 00:00.170s)`。
- `flyway_schema_history`：installed_rank 1–5，version 1–5，`success` 全为 `t`。
- 建出的表：`commute_record`、`device_profile`、`emotion_cell`、`emotion_report`、`flyway_schema_history`、`route_query`（6 张）。
- `GET /actuator/info` → `"mode":"postgres"`。

随后用设备 `d06-pg-live` 走完启动书要求的链路，全部为真机 HTTP 请求：

| # | 请求 | 实际结果 |
| --- | --- | --- |
| 1 | `GET /api/v1/heatmap?bbox=120.26067,31.47278,120.27946,31.49417&zoom=16&hours=168` | 200，**55 个热力格**；首格 `16:133629:34977`，中心 `(120.26655, 31.47975)`，`score=32.44`，`dominantTag=QUIET`，`count=5` |
| 1b | 同上但 bbox 换成北京 `(116.38…39.895…)` | 200，`[]`。种子区外返回空数组而不是报错，属正确行为，前端需能处理"空热力图" |
| 2 | `POST /api/v1/reports`，`CROWD`/`stressLevel=75`/`(120.273915, 31.479302)` | 201 `created` / `report_created` / `counted=true` |
| 2b | 完全相同的上报再来一次 | 200 `duplicate` / `report_duplicate` / `counted=false`，消息「五分钟内已提交过附近路段，本次不重复计入。」 |
| 2c | `tag=QUIET`、`stressLevel=20` | 400 `invalid_request`「stressLevel must be one of 0, 25, 50, 75, 100」 |
| 2d | `tag=QUIET`、`stressLevel=25` | 201 `report_created`（V5 新增的正向标签在真实库上可用） |
| 2e | `tag=BOGUS_TAG` | 400 `invalid_request`，但消息把 Java 类名和枚举全量吐给了客户端（缺陷 5） |
| 3 | `POST /api/v1/routes/compare`，起点 `(120.2735103, 31.4753281)` → 终点 `(120.2743195, 31.4832753)` | 200，3 条路线：`route-fast` 31516 m / 23345 s / `stressScore 51.0`；`route-calm` 76919 m / 26146 s / `36.0`；`route-scenic` 114678 m / 29881 s / `62.49` 且 `confidence=0.01`。`fastestRouteId=route-fast`、`leastStressfulRouteId=route-calm`、`recommendAlternative=true`、推荐语「明天试 少心累路线 B：预计心累指数降低 15 分。」**响应里没有 `snapshotId`**（缺陷 2） |
| 4 | `GET /api/v1/routes/history?limit=1` | 200，拿到快照 `a05c1180-2000-44f2-90c5-6a84ab0556fc` |
| 5 | `POST /api/v1/commutes/complete`，`routeId=route-calm`、`endStressLevel=25`、新 `operationId` | **201** `created`，`commuteId=97079162-…`，`selectedScore=36.0`、`estimatedSeconds=26146`、`durationMinutes=436`、`routeSource="UNKNOWN"`——评分与时长全部取自快照，请求体里没有这两个字段 |
| 5b | 同 `operationId` 同内容重放 | **200** `duplicate`，`commuteId` 与首次完全相同 |
| 5c | 同 `operationId` 改成 `route-fast`/`endStressLevel=75` | **409** `conflict`，回带 `existingCommuteId`/`existingSnapshotId`/`existingRouteId` |
| 5d | 设备 `d06-pg-intruder` 用同一个 `snapshotId` | **404** `snapshot_not_found` |
| 5e | 随机 UUID 当 `snapshotId` | **404** `snapshot_not_found`（与 5d 同码同消息，不泄露"存在但不属于你"） |
| 6 | 再取一个快照，用 SQL 把 `created_at` 改成 2 小时后提交 | **410** `snapshot_expired`「查询快照已过期，请重新规划路线。」 |
| 7 | 直接查库 | `commute_record` 共 8 行：7 行是 V3 种子（`operation_id` NULL、`estimated_seconds` NULL、`route_source` NULL、`duration_minutes` 18–24），1 行是步骤 5 写入的新记录（`estimated_seconds=26146`、`duration_minutes=436`、`route_source=UNKNOWN`）。新记录没有覆盖或改动任何历史行 |
| 8 | `GET /api/v1/commutes/trends?days=7&timezone=Asia/Shanghai`（`d06-pg-live`） | 200，`points` 7 个、日期 `2026-10-15 … 2026-10-21` 严格升序；只有最后一天有数据：`averageStress=25.0`、`commuteCount=1`、`averageEstimatedSeconds=26146.0`、`estimatedSampleCount=1`；前 6 天只有 `commuteCount:0` 与 `estimatedSampleCount:0`，**没有 `averageStress` 键**（Jackson `non_null`），也没有补 0。`totalCommutes=1`、`unknownSourceCommutes=1`、`excludedDemoCommutes=0`、`deduplicatedCommutes=0`、`outOfWindowCommutes=0`；`summary.direction="unknown"`、`sampleSufficient=false` |
| 9 | `GET /api/v1/commutes/history?days=7`（`d06-pg-live`） | 200，1 条，`legacyRecord=false`、`missingFields=[]`、`operationId`/`snapshotId`/`estimatedSeconds` 齐全、`completedDate="2026-10-21"`、`timezone="Asia/Shanghai"` |
| 10 | `GET /api/v1/commutes/trends?days=30`（种子设备 `demo-browser`） | 200，`points` 30 个，其中 7 天有数据（10-15 … 10-21，各 `commuteCount=1`、`estimatedSampleCount=0`、无 `averageEstimatedSeconds` 键）；`totalCommutes=7`、`unknownSourceCommutes=7`——V3 种子的历史形态数据被正确计入且不假装有时长样本 |
| 11 | `GET /api/v1/commutes/history?days=30&limit=3`（`demo-browser`） | 200，3 条全部 `legacyRecord=true`、`missingFields=["operationId","snapshotId","estimatedSeconds"]`、`estimatedSeconds` 键不存在、`durationMinutes` 24/23/22 仍在——旧数据没有让历史接口解析失败 |

验证结束后停止应用（8080 已释放）、`DROP SCHEMA d06_live_pg CASCADE`、复查 `LIKE 'd06%'` 的 schema 数为 0、`public.commute_record` 仍为 7 行。

### 3.4 `demo` profile：全流程实测

默认 profile（内存仓储、Flyway 关闭）启动后 `GET /actuator/info` → `"mode":"demo"`，用设备 `d06-live-demo` 走同一条链路：

| 步骤 | 实际结果 |
| --- | --- |
| `GET /heatmap`（同上 bbox/zoom/hours） | 200，**116 个热力格**；首格 `16:133626:34980`，`score=43.94`，`confidence=0.17`，`count=1`，`dominantTag=OPEN` |
| `POST /reports` 及重放 | 201 `report_created` `counted=true` → 200 `report_duplicate` `counted=false` |
| `POST /routes/compare` | 200，3 条路线，时长与 `postgres` 完全一致（23345 / 26146 / 29881 s） |
| `GET /routes/history?limit=1` | 快照 `4465b824-9deb-4c93-87b2-15dd07a00aa3` |
| `POST /commutes/complete` | 201 `created`，`commuteId=6b17e1ba-…`，`routeSource="UNKNOWN"`、`estimatedSeconds=26146`、`durationMinutes=436`、`selectedScore=36.0` |
| 重放 / 换内容 / 换设备 | 200 `duplicate`（`commuteId` 相同）/ 409 `conflict`（带 `existingCommuteId`）/ 404 `snapshot_not_found` |
| `GET /commutes/trends?days=7` | 7 个升序日点位，仅当天有数据（`averageStress=50.0`、`commuteCount=1`、`averageEstimatedSeconds=26146.0`、`estimatedSampleCount=1`）；`totalCommutes=1`、`unknownSourceCommutes=1`、`deduplicatedCommutes=0`、`outOfWindowCommutes=0` |
| `GET /commutes/history` | 1 条，`legacyRecord=false`、`missingFields=[]` |

结论：**幂等、归属校验、过期、趋势与历史口径在两种 profile 上逐项一致**，差异只在持久化本身（内存 vs PostgreSQL）和种子数据量。

### 3.5 两种 profile 的可观察差异

同一个 bbox/zoom/hours，demo 返回 116 格、全新 postgres 库返回 55 格。原因是 demo 由 `DemoDataInitializer` 在内存里生成种子，postgres 由 V2/V3 迁移的 SQL 生成种子，两者数量与分布不同。这不是缺陷，但意味着**答辩演示时"切到真实库热力图会变稀"是可预期的**，需要提前告知 C 和演示同学（第 9 节）。

## 4. 未运行项（按 D06 口径：环境缺失导致跳过的检查不计为通过）

| 检查 | 状态 | 原因 |
| --- | --- | --- |
| `PostgisIntegrationTest`（5 项）本机 | **本机未运行** | 本机无 Docker，Testcontainers 起不来，整类 `@EnabledIf` 跳过。**CI 上已实际通过**：PR #69 头提交 `7ad3331` 的 `Backend CI` 日志为 `Tests run: 5, Failures: 0, Errors: 0, Skipped: 0`（16.67 s），全量 `Tests run: 154, Failures: 0, Errors: 0, Skipped: 0`、BUILD SUCCESS。D06 新增的 7 项同样在 CI 上首次真实执行并通过（3.2.1）。因此这一行只是"本机环境缺失"，不是"该项没有验证" |
| 前端 `npm run build` / `npm test` | **未运行** | 本机 `frontend/node_modules` 缺失，且当前前端基线被 Issue #68 阻塞（缺陷 1），先修基线再跑更有意义 |
| Mock E2E `npm run test:e2e` | **未运行** | 同上（Playwright 依赖未安装） |
| Full-stack E2E `npm run test:e2e:integration` | **未运行** | 同上；这也是本次改动的 `app.integration.e2e.ts` 唯一能验证它的方式，**该文件的 201 断言改动尚未经过实际运行**，只有后端真机 HTTP 结果（3.3 步骤 5）作为契约依据 |
| PWA E2E `npm run test:pwa` | **未运行** | 同上 |
| Android 构建与 APK 校验 | **未运行** | 本机未配置 Android SDK；CI 上该 job 目前因环境原因失败（缺陷 7） |
| 真实高德地图连接验证 | **未运行** | 无 Key，两层 E2E 都显式清空高德环境变量走离线模式 |
| 浏览器与移动端人工验收 | **未运行** | 任务书指定由 C 承担 4 工时，清单见第 8 节 |
| JaCoCo 覆盖率 | **未生成** | 必须 `-Djacoco.skip=true` 才能在 JDK 26 上跑通，因此没有覆盖率数据 |

## 5. 启动书十条关键场景对照

启动书第八节「发布前至少通过以下场景」。下表只写本次有实证的部分，没有实证的一律写"未运行"，不用"应该通过"代替。

| # | 场景 | 状态 | 证据 / 缺口 |
| --- | --- | --- | --- |
| 1 | 默认和非默认端点均获取或明确无法获取对应路线 | 部分 | 默认端点：`POST /routes/compare` 200 返回 3 条路线（3.3 步骤 3）。**非默认端点未验证**，属前端 + B |
| 2 | 相同端点、无候选、单候选、异常时长和空折线得到明确处理 | 部分 | 无路线/单路线的响应结构由 `ApiSmokeTest` 覆盖。**异常时长本次实测存在但没有被任何测试拦截**（缺陷 3）；空折线未验证 |
| 3 | API 失败后能重试；演示模式全页面来源标识一致 | 未运行 | 前端场景。后端侧 `GET /actuator/info` 稳定返回 `mode`，可作为来源标识数据源（3.3、3.4） |
| 4 | 离线结果不出现占位零分和无依据的舒适标签，不进入真实统计 | 部分 | 反馈侧 `simulated` 隔离已由 D03 落地并实测（上报 201/去重 200）。**路线侧 `route-scenic` `confidence=0.01` 仍带 `stressScore=62.49` 返回，响应里没有低置信度标记**（缺陷 4） |
| 5 | 连续查询时只展示最后一次选择的结果 | 未运行 | 前端场景。后端 `/routes/history?limit=1` 返回最新快照，实测正常 |
| 6 | 反馈失败保留草稿，成功后刷新当前视口；查询失败不重复写入 | 部分 | "不重复写入"已实测：同点位 5 分钟内重复上报 200 `report_duplicate` `counted=false`（3.3 步骤 2b、3.4）。**前端草稿保留与视口刷新未运行** |
| 7 | 同一次通勤重复发送和并发发送仅增加一条记录 | **通过** | 12 线程并发只落 1 行、恰好 1 个 201 + 11 个 200（3.1 第 4 项）；真机串行重放 201→200 且 `commuteId` 相同（3.3 步骤 5/5b、3.4） |
| 8 | 完成通勤的评分取自服务端快照，预计时长与实际时长不混淆 | **通过（口径）** | 请求体只带 `routeId` 与 `endStressLevel`，响应里的 `selectedScore=36.0`、`estimatedSeconds=26146`、`fastestScore=51.0` 全部来自快照（3.3 步骤 5）。**口径成立，但时长数值本身不可信**（缺陷 3），所以"数值合理"这一半不成立 |
| 9 | 模拟记录不参与真实模式统计；几何等价路线评分保持稳定 | 部分 | 反馈侧 simulated 隔离已落地。**通勤侧 `routeSource` 恒为 `UNKNOWN`（B04 未交付），"模拟通勤不进真实统计"目前无法端到端证明**（缺陷 6）。几何等价评分稳定性属 B，未验证 |
| 10 | 返回、重新规划、趋势重试和移动端面板操作均无阻断问题 | 未运行 | 全部是浏览器/移动端交互，见第 8 节清单 |

十条中 2 条可判"通过"、5 条"部分"、3 条"未运行"。**当前不满足启动书的发布标准**，主要卡点是前端基线（缺陷 1）与 B 侧的快照 ID、路线时长、来源判定三项。

## 6. 剩余缺陷与风险

按归属排列，每条都附本次拿到的证据。

| # | 缺陷 | 归属 | 证据 | 影响 |
| --- | --- | --- | --- | --- |
| 1 | 同步分支的提交 `2151d50` 改了 `WelcomePage.tsx` 的按钮文案（`查看预设路线` → `查看路线`），但没有同步更新 8 个文件里的 26 处断言，导致 `Frontend CI`、`E2E CI`、`Full-stack E2E` 在所有从 `codex/sync-latest-20261018` 派生的分支上全红（`develop` 的 `d14ecbc` 是绿的，`Backend CI` 各处都绿） | A（`frontend/src` 与前端测试） | 已开 Issue #68，并在 PR #65/#67/#55 留言。PR #65 头提交 `08174e1` 的 checks 实测：`Backend CI` success、`Android Build` success、`Frontend CI` **failure**、`Full-stack E2E` **failure**、`E2E CI` **cancelled**、`Android APK Verification` failure | **D06 的浏览器端验收整体被阻塞**：Mock/Full-stack E2E 在修好之前跑不出可信结果。建议改组件回到旧文案或一次性改 26 处断言，不要逐条 `skip`。同时 `WelcomePage.test.tsx` 的 `起点`/`终点`/`留学生公寓` 已过期（新文案是 `选择起点`/`选择终点` + `学生公寓区`/`第一教学楼`/`图书馆`/`三食堂`），`RoutePreviewPage.test.tsx:129` 需要单独判断是不是真的离线入口回归 |
| 2 | `POST /api/v1/routes/compare` 的响应里没有 `snapshotId`，前端只能再调一次 `GET /routes/history?limit=1` 才能拿到，多一次往返且存在"拿到别人/上一次快照"的时序风险 | B（`RouteController` / 路线 DTO） | 3.3 步骤 3 的响应键为 `fastestRouteId, leastStressfulRouteId, recommendAlternative, recommendation, routes`，无 `snapshotId` | D02 时已提出，至今未处理。`CommuteService` 的归属校验是好的，但取快照 ID 的路径不该绕历史接口 |
| 3 | mock 路线的几何与时长明显不合理：起终点直线距离约 887 m，返回的三条路线却是 31516 m / 76919 m / 114678 m，时长 23345 s / 26146 s / 29881 s（6.5–8.3 小时），折线经度跨到 120.01–120.46（±20 km） | B（路线生成 / B01、B03） | 3.3 步骤 3、5 与 `p_hist.json` 的完整折线；落库后 `estimated_seconds=26146`、`duration_minutes=436` | 直接污染下游：趋势的 `averageEstimatedSeconds=26146.0`、历史的 `durationMinutes=436`，C05 的折线图和答辩演示会显示"一次通勤 7 小时"，看起来像功能坏了 |
| 4 | `route-scenic` 的 `confidence` 只有 0.01，却照样返回 `stressScore=62.49`，响应里没有任何低置信度标记 | B（评分与采样） | 3.3 步骤 3 | 与启动书场景 4「不出现无依据的舒适标签」冲突；前端无法区分"可信评分"和"几乎没有样本的猜测" |
| 5 | 非法枚举的 400 响应把 Java 实现细节吐给客户端：`JSON parse error: Cannot deserialize value of type com.example.commutemood.domain.EmotionTag from String "BOGUS_TAG": not one of the values accepted for Enum class: [OTHER, QUIET, ODOR, NOISE, SUN, CROWD, OPEN, SHADE]` | D 可修（全局异常映射）/ 需与 A 对齐文案 | 3.3 步骤 2e | 泄露内部类名与包名，且消息不可本地化。建议统一成「tag 必须是 CROWD/NOISE/… 之一」的稳定结构，与其他 400 一致 |
| 6 | `CommuteService.resolveRouteSource` 仍是占位实现，无条件 `return RouteSource.UNKNOWN` | B（B04）→ 之后 D 对接一行 | 3.3 步骤 5 的 `routeSource:"UNKNOWN"`；趋势 `unknownSourceCommutes` 等于全部记录数 | 通勤侧的"演示数据不进真实统计"无法验证；PR #67 若把 demo 快照标成 `DEMO`，`app.integration.e2e.ts` 里"趋势计数递增"那条断言会立刻变成假失败（已在该处留注释，改成断言 `excludedDemoCommutes` 递增即可）。等 B 在 #67 回复口径后我再动这个 D 归属的文件 |
| 7 | `Android Build` / `Android APK Verification` 在 CI 上失败，属 CI 环境问题而非功能问题；C 的 PR #57–#61 目标分支是 `main` 而不是 `develop` | C + 仓库维护者 | 各 PR 的 checks 列表 | 移动端验收没有可信的自动信号，只能靠第 8 节的人工清单；分支基线不一致会让 C 的改动绕过 develop 的 required checks |
| 8 | 全新库上 Flyway V1 的 `CREATE EXTENSION IF NOT EXISTS postgis` 只在扩展已由超级用户装好时才是空操作；`commute` 角色 `rolsuper=f`，真·全新数据库上会在 V1 直接失败 | D（迁移）+ 部署文档 | 本机 `pg_extension`：`postgis`/`pgcrypto` 都在 `public`；`pg_roles`：`commute` 非超级用户、无 CREATEDB | 本次实测之所以通过，是因为扩展早就装好了。生产部署指南必须写明"先用超级用户建扩展"，否则第一次部署会失败（第 7 节已写入） |
| 9 | demo 与 postgres 两种 profile 的热力格数量差一倍以上（116 vs 55） | D + B（种子数据） | 3.5 | 不是缺陷，但演示时切换 profile 会让地图明显变稀，需要提前说明，避免被当成 bug 现场排查 |

## 7. 启动说明

以下命令都在仓库根目录执行，Windows 用 Git Bash（`./mvnw`）或 PowerShell（`.\mvnw.cmd`）。

### 7.1 前置

- JDK 17 或更高（本机 JDK 26 可用，但**任何 Maven 命令都要带 `-Djacoco.skip=true`**）。
- Node 22（CI 各 workflow 用的版本；`package.json` 没有 `engines` 约束，低版本可能也能跑，但以 22 为准）。
- 只有跑 `postgres` profile 或数据库集成测试时才需要 PostgreSQL 16 + PostGIS 3。纯 demo 模式不需要数据库。

### 7.2 数据库准备（postgres profile）

```sql
-- 用 postgres 超级用户执行（psql -U postgres）
CREATE ROLE commute LOGIN PASSWORD 'commute_dev_password';
CREATE DATABASE commute_mood OWNER commute;
\c commute_mood
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
GRANT ALL ON SCHEMA public TO commute;
```

**扩展必须由超级用户先建好**：V1 迁移里虽然写了 `CREATE EXTENSION IF NOT EXISTS`，但 `commute` 不是超级用户，只有扩展已存在时这句才是空操作（缺陷 8）。表、索引、约束和种子数据都由 Flyway 自动完成，不需要手工建表。

### 7.3 后端

demo 模式（默认，内存仓储，无需数据库，重启后数据清空）：

```bash
cd backend
./mvnw -o -Djacoco.skip=true spring-boot:run
```

postgres 模式（JDBC 仓储 + Flyway 自动迁移）：

```bash
cd backend
SPRING_PROFILES_ACTIVE=postgres ./mvnw -o -Djacoco.skip=true spring-boot:run
```

连接参数默认 `localhost:5432/commute_mood`、用户 `commute`、密码 `commute_dev_password`，可用 `POSTGRES_HOST`/`POSTGRES_PORT`/`POSTGRES_DB`/`POSTGRES_USER`/`POSTGRES_PASSWORD` 覆盖；设备哈希盐用 `DEVICE_HASH_SALT` 覆盖（生产必须改，默认值仅供本地）。

确认启动成功：

```bash
curl -s http://localhost:8080/actuator/info
# demo 模式 → {"app":{...,"mode":"demo",...}}
# postgres 模式 → {"app":{...,"mode":"postgres",...}}
```

`mode` 字段就是前端"演示模式来源标识"的数据源。

### 7.4 前端

```bash
cd frontend
npm install
npm run dev                        # 开发服务器，默认代理 /api 到 8080
npm run build                      # tsc --noEmit + vite build + PWA
npm run test                       # vitest
npm run test:e2e                   # Mock E2E（拦截 /api/v1）
npm run test:e2e:integration       # Full-stack E2E（需要后端已在 8080 跑 demo 模式）
npm run test:pwa                   # PWA E2E
```

两层 Playwright 配置会显式清空高德环境变量，因此本地不需要 Key，地图走离线模式。

### 7.5 测试

```bash
# 后端全量（无数据库也能跑，12 项数据库测试会整类跳过）
cd backend && ./mvnw -o -Djacoco.skip=true test

# 后端全量 + 用本机 PostgreSQL 跑数据库集成测试
cd backend
COMMUTE_TEST_JDBC_URL="jdbc:postgresql://localhost:5432/commute_mood" \
COMMUTE_TEST_JDBC_USERNAME=commute COMMUTE_TEST_JDBC_PASSWORD=commute_dev_password \
  ./mvnw -o -Djacoco.skip=true test

# 只跑 D06 的数据库验收
cd backend
COMMUTE_TEST_JDBC_URL="jdbc:postgresql://localhost:5432/commute_mood" \
COMMUTE_TEST_JDBC_USERNAME=commute COMMUTE_TEST_JDBC_PASSWORD=commute_dev_password \
  ./mvnw -o -Djacoco.skip=true \
  -Dtest='DatabaseMigrationAcceptanceTest,CommutePersistenceAcceptanceTest' test
```

集成测试用完即删自己的一次性 schema，不会动 `public` 里的数据；跑完可用
`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'd06%';` 复查是否为 0 行。
在有 Docker 的机器（含 CI）上不需要设任何环境变量，Testcontainers 会自动起 `postgis/postgis:16-3.4`。

## 8. 给 C 的浏览器与移动端验收清单（4 工时）

前置：先确认 Issue #68 的前端基线已修（否则第 2、3 组会大面积红，分不清是缺陷还是断言过期）。后端按 7.3 的 demo 模式跑在 8080，前端 `npm run dev`。截图沿用 `docs/测试/` 现有命名（如 `v1.0.0-chrome-desktop.png`、`v1.0.0-chrome-mobile-390x844.png`），本次建议前缀 `v1.1.0-`。

### 8.1 桌面浏览器正常流程（约 60 分钟）

1. 打开首页，确认欢迎页 CTA 文案与实际断言一致（`查看路线` / `查看预设路线`，取决于 #68 的修法），点击后进入路线页。
2. 选择起点与终点（学生公寓区 → 第一教学楼等预设项），提交查询；确认返回 3 条路线卡片，最快与少心累路线各自有标识，推荐语与 `recommendAlternative` 一致。
3. **确认路线卡片上显示的时长**：当前后端返回 23345/26146/29881 秒，若页面显示"6 小时 29 分"这类数值，请截图并回填到缺陷 3，不要在前端做四舍五入掩盖。
4. 地图上确认热力格渲染（demo 模式同一 bbox 约 116 格），点击/悬停一个格子能看到 `dominantTag` 与 `score`。
5. 长按（或右键）地图某点提交情绪反馈，标签选 `CROWD`、压力 75：确认成功提示，并确认**当前视口刷新后新反馈出现在热力图上**。
6. 立刻在同一位置再提交一次：确认页面显示的是"重复反馈/未计入"这类可理解提示，而不是失败或静默成功（后端返回 200 `report_duplicate`、`counted=false`）。
7. 选择一条非最快路线 → 完成通勤 → 选结束压力 50 → 提交：确认返回成功提示（后端 201 `created`）；页面上若有通勤次数展示，确认 +1，没有就用接口复核（第 8 项）。
8. 趋势与历史目前**还没有页面**（`frontend/src/pages/` 只有 `WelcomePage.tsx`、`MapPage.tsx`、`RoutePreviewPage.tsx`），属 A05/C05 未交付。本次先用接口验收，等页面交付后重跑：`GET /api/v1/commutes/trends?days=7&timezone=Asia/Shanghai` 应返回连续 7 个自然日、日期升序，没有数据的日子**不含 `averageStress` 键**（不是 0），折线图据此断开；若展示时长，必须先看 `estimatedSampleCount > 0`。
9. 同样用接口验收历史：`GET /api/v1/commutes/history?days=30`。新完成的记录 `legacyRecord=false`、`missingFields=[]`；设备 `demo-browser` 的种子记录 `legacyRecord=true`、`missingFields=["operationId","snapshotId","estimatedSeconds"]` 且**没有 `estimatedSeconds` 键**——页面交付后这些缺失字段要显示为空白，不能显示 0。
10. 刷新页面，确认设备标识保持不变（`localStorage`），历史与趋势仍能读到同一份数据。

### 8.2 异常与离线恢复（约 60 分钟）

11. 停掉后端（或改前端指向不存在的端口），重复第 2 步：确认有超时/网络错误的可理解提示，**没有无限转圈**，且提示里区分"网络不可达"与"服务返回错误"。
12. 后端离线时提交情绪反馈：确认草稿被保留（文字、标签、压力值不丢），恢复后端后重新提交成功。
13. 后端离线时点"完成通勤"：确认失败提示明确，且**恢复后重复点击不会写出两条记录**（后端幂等已保证，但前端不该重复扣用户操作）。
14. 连续快速查询两组不同端点：确认页面最终只展示**最后一次**选择的结果，没有迟到响应覆盖。
15. 无路线/单路线端点各查一次：确认空态文案明确，不显示占位 0 分或无依据的"舒适"标签。
16. 无高德 Key（默认即是）时确认地图走离线底图，页面有离线来源标识，且演示模式下所有页面的来源标识一致。

### 8.3 移动端（约 90 分钟）

17. Chrome DevTools 设备模拟 390×844：确认路线面板不超出视口、可滚动、底部操作按钮始终可达（不被安全区/地址栏遮挡）。
18. 再取一个更窄视口（320×568 或 280×653）重复第 17 步，确认没有横向滚动条、文字不截断。
19. 地图手势：单指拖动、双指缩放、长按反馈三者互不打架；长按能稳定唤出反馈表单（这是移动端最容易失败的一步，请录屏或连拍）。
20. 路线卡片列表在窄屏下确认不溢出、按钮点击区域足够大（≥44 px）；等趋势页/历史页（A05/C05）交付后，补做"折线图不溢出、坐标轴标签不重叠、历史列表项可点击"三项。
21. 旋转屏幕（或切换横屏模拟）确认面板与地图不出现布局断裂。
22. 若做 Android 包体验：按 `docs/ANDROID_RELEASE.md` 与 `npm run build:android` 走一遍，记录 APK 是否可安装启动；CI 上的 `Android APK Verification` 目前因环境原因失败（缺陷 7），**不要把它当作功能失败的证据**。

### 8.4 回填要求

每项写「通过 / 失败 / 未运行」三态之一，失败项附截图与复现步骤，并注明是前端还是后端问题（按第 6 节的归属表）。环境缺失导致没跑的写"未运行"，不要写"通过"。结果补进本文件第 8 节末尾或另开 `docs/project/d06-browser-mobile-checklist-result.md`，由 D 汇总进最终验收。

## 9. 需要同步的点

1. **A**：`frontend/e2e/app.integration.e2e.ts` 由 D 主改，本轮把完成通勤断言从 200 改成 201 并加了三条守门人注释。A 若在 #68 的修复里也要动这个文件，请先看注释再改，避免把断言放宽回去。另外 `TrendResult` 的 6 个统计字段与 `CommuteHistoryItem` 的 `legacyRecord`/`missingFields` 已写进 `docs/团队协作与接口约定.md`，历史页可直接用。
2. **B**：缺陷 2（compare 无 `snapshotId`）、3（路线时长/几何不合理）、4（低置信度无标记）、6（`resolveRouteSource` 占位）都在你这边。缺陷 3 优先级最高——它会让 C05 的趋势图和答辩演示显示"一次通勤 7 小时"。缺陷 6 请直接在 PR #67 里回一句口径（demo 快照算 `DEMO` 还是 `UNKNOWN`），我按你的答复改 `resolveRouteSource` 和对应的 E2E 断言。
3. **C**：第 8 节是给你的 4 工时清单，前置是 #68。另外 demo 与真实库的热力格数量差一倍（116 vs 55，见 3.5），演示时切 profile 地图会变稀，这是种子数据差异不是 bug；PR #57–#61 的目标分支请从 `main` 改成 `develop`，否则绕过了 develop 的 required checks。
4. **仓库维护者**：缺陷 8 的部署前置（超级用户建扩展）建议同步进 `docs/生产部署指南.md`，D 可以在下一轮补，但需要有人复核部署文档的归属。
5. **CI**：D06 新增的 7 项数据库测试已随本 PR（#69）在 CI 上首次真实执行，`Backend CI` 为 success、`Tests run: 154, Failures: 0, Errors: 0, Skipped: 0`——CI 有 Docker，走的是 Testcontainers 路径而非本机 PG 路径，两条取库路径都已验证（3.2.1）。后续若这些测试在 CI 上失败，请按"跳过不等于通过"的口径处理，不要改成 `@Disabled` 或放宽断言。

## 10. 验收对照

| 任务书 D06 要求 | 本次交付 |
| --- | --- |
| 组织全新建库的集成测试 | `DatabaseMigrationAcceptanceTest.migratesFreshDatabaseThroughAllFiveVersions` + 3.3 真机全新 schema 启动（5 个迁移、6 张表、`mode=postgres`） |
| 组织旧库迁移的集成测试 | `upgradesLegacyDatabaseWithoutLosingExistingRows`、`keepsReappliedMigrationsIdempotent` + 3.3 步骤 7/10/11 的历史种子行实证 |
| 组织并发幂等的集成测试 | `recordsOneCommuteWhenSameOperationIdArrivesConcurrently`（12 线程 1×201 + 11×200、库里 1 行）+ 3.3 步骤 5/5b/5c |
| 组织归属校验的集成测试 | `hidesSnapshotFromOtherDevices`、`reportsExpiredSnapshotAsGoneInsteadOfMissing`、`distinguishesOperationIdConflictFromDuplicate` + 3.3 步骤 5d/5e/6 |
| 汇总全流程、离线恢复和移动端检查 | 3.3/3.4 后端全流程实测；第 8 节给出浏览器与移动端清单（含离线恢复第 11–16 项），执行由 C 承担 4 工时 |
| D 主改共享 E2E 场景 | `frontend/e2e/app.integration.e2e.ts` 契约断言更新到 D02/D05 口径并补守门人注释；`docs/测试/E2E测试说明.md` 同步修正 |
| 形成实际运行结果 | 第 3 节（含完整命令与逐项响应） |
| 形成未运行项 | 第 4 节（9 类检查全部标注"未运行"及原因） |
| 形成剩余缺陷 | 第 6 节（9 条，含归属与证据） |
| 形成启动说明 | 第 7 节（数据库准备、两种 profile、前端、测试命令） |
| 通过启动书规定的关键场景 | 第 5 节：2 条通过、5 条部分、3 条未运行；**当前不满足发布标准**，卡点是缺陷 1/2/3/4/6 |
| 环境缺失导致跳过的检查不计为通过 | 第 4 节全部写"未运行"并注明原因；集成测试用 `@EnabledIf` 整类跳过并在 `IntegrationDatabase` 的 Javadoc 里写明"跳过 ≠ 通过"；三轮结果分别证明"本机有库时真跑"（154/0/5）、"无库时干净跳过"（154/0/12）与"CI 有 Docker 时 12 项全部真跑"（154/0/**0**，3.2.1） |
