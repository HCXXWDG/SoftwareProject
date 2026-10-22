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

### 1.1 本轮追加的交付物（验收过程中发现并修掉的 D 归属问题）

| 文件 | 类型 | 内容 |
| --- | --- | --- |
| `backend/src/main/java/com/example/commutemood/api/ApiExceptionHandler.java` | 改动 | 错误信封重做：不再回传 `exception.getMessage()`；`MethodArgumentNotValidException` / `HttpMessageNotReadableException` / 缺参数 / 缺请求头 / 类型不匹配 / 时间非法各自组织中文文案，参数类 400 统一带 `fields`（字段名 → 原因），出口处用正则兜底把任何含 `com.example`、`org.springframework` 等特征的消息降级为通用文案（缺陷 5，证据见 3.6） |
| `backend/src/test/java/com/example/commutemood/api/ApiErrorContractTest.java` | 新增 | 6 项防泄露守门测试：断言所有 400 响应体不含内部包名/类名/方法签名，且参数类 400 必须点名出错字段 |
| `docs/团队协作与接口约定.md` | 改动 | 第 3 节新增「统一错误信封」：四个固定键 + `fields`、六个 `code` 对照表、前端处理建议、"错误响应不得包含实现细节"这一条硬约束 |
| `docs/生产部署指南.md` | 改动 | 第 1.2 节新增「PostGIS 与 pgcrypto 扩展必须由超级用户先建好」：compose 路径为什么没事、托管库路径必须预先执行的四条 SQL、`currentSchema` 必须带 `public`（缺陷 8） |
| `frontend/e2e/` 其余 5 个 spec | 改动 | 6 个 spec 共 18 处过期选择器 `查看预设路线` → `查看路线`（`app.e2e.ts` 3、`app.integration.e2e.ts` 2、`campus-boundary.e2e.ts` 1、`mobile.e2e.ts` 6、`pwa-sw.e2e.ts` 1、`welcome-flow.e2e.ts` 5）。这是 `Full-stack E2E` 卡在第一幕超时的直接原因（缺陷 1） |
| `.github/workflows/android-build.yml` | 改动 | `Android APK Verification` job 的 `android-actions/setup-android@v3` → `@v4`（v3 会安装早已下架的 `tools` 包，必然 exit 1）（缺陷 7） |

**关于"验收任务不改生产代码"这条口径的说明**：D06 首轮严格遵守，因此第 1 节原文写的是"未改动任何生产代码"。本轮之所以动了 `ApiExceptionHandler`、E2E spec 和 CI workflow，是因为这三处的归属本来就在 D（全局异常映射属 D 的 API 错误契约、`frontend/e2e/` 由 D 主改、workflow 无人认领且 D 是唯一有证据的人），而不是"顺手改别人的模块"。**B 与 A 的代码一行没动**：缺陷 2/3/4/6 全部留在第 6 节等对应成员处理，其中缺陷 2 需要 B 先改 compare 响应，A 才能改前端。

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

### 3.2.2 本轮追加（错误信封修复 + 前端基线复核之后）

上面两轮 154 是修复前的数字，保留作为历史证据。本轮又做了三件事，因此基线数字有变化：

| 项目 | 结果 |
| --- | --- |
| 全量后端套件（不带 `COMMUTE_TEST_JDBC_URL`） | `Tests run: 160, Failures: 0, Errors: 0, Skipped: 12`，BUILD SUCCESS。相比 154 增加了 `ApiErrorContractTest` 的 6 项，跳过数不变 |
| `ApiErrorContractTest` 单独跑 | `Tests run: 6, Failures: 0, Errors: 0, Skipped: 0` |
| 前端 `npm test`（vitest，本机首次跑通） | `Test Files 5 failed | 10 passed (15)`、`Tests 17 failed | 71 passed (88)`，与 CI 完全一致；17 项逐项核对后**全部是断言过期，没有一项功能回归**，已按归属拆给 A（14 项）与 C（3 项），详见 Issue #68 的补充留言 |
| `frontend/e2e` Mock 套件（本机 Playwright + Chromium） | `24 passed (18.3s)`，exit 0。D 已把 6 个 spec 里 18 处过期选择器 `查看预设路线` 换成 `查看路线` |
| `frontend/e2e` Full-stack 套件 | 仍然失败，但**失败点从 `app.integration.e2e.ts:50` 的选择器超时后移到第 167 行的 `Expected: 201, Received: 400`**，即缺陷 2 的完成通勤契约不通。选择器问题已排除，剩下的是 A/B 的功能缺陷，不是 D 的测试问题 |

前端能在本机跑起来（`npm install` 360 个包 + `npx playwright install chromium`）是本轮新增的能力，之前第 4 节把"前端 `npm test`"记为未运行，现在已实测。

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

### 3.6 错误信封修复后的实测（缺陷 5 复核 + 缺陷 2 定性）

`ApiExceptionHandler` 重写后，用 `demo` profile 跑在 8080 上逐条 curl 复核。左边是前端会真实发出的请求，右边是现在的响应体（`timestamp` 已省略）：

| 场景 | 请求 | HTTP | 响应体 |
| --- | --- | --- | --- |
| 完成通勤缺快照字段 | `POST /commutes/complete`，请求体取自 `App.tsx:135-150` 的真实结构 | `400` | `{"status":400,"code":"invalid_request","message":"请求体校验失败：snapshotId、operationId","fields":{"snapshotId":"不能为null","operationId":"不能为空"}}` |
| 枚举取值非法 | `POST /reports`，`"tag":"NOT_A_TAG"` | `400` | `{"status":400,"code":"invalid_request","message":"字段取值不合法：tag","fields":{"tag":"取值不在允许范围内，或类型不匹配"}}` |
| 字段类型不匹配 | `POST /reports`，`"stressLevel":"很堵"` | `400` | `{"status":400,"code":"invalid_request","message":"字段取值不合法：stressLevel","fields":{"stressLevel":"取值不在允许范围内，或类型不匹配"}}` |
| 请求体不是合法 JSON | `POST /routes/compare`，body 为 `{` | `400` | `{"status":400,"code":"invalid_request","message":"请求体不是合法的 JSON，或字段取值不在允许范围内。"}` |
| 缺请求头 | `GET /routes/history`（不带 `X-Device-Id`） | `400` | `{"status":400,"code":"invalid_request","message":"缺少必需请求头：X-Device-Id","fields":{"X-Device-Id":"该请求头为必填"}}` |
| 缺查询参数 | `GET /heatmap`（不带 `bbox`） | `400` | `{"status":400,"code":"invalid_request","message":"缺少必需参数：bbox","fields":{"bbox":"该参数为必填"}}` |
| 查询参数类型错 | `GET /heatmap?bbox=…&zoom=bad` | `400` | `{"status":400,"code":"invalid_request","message":"参数格式不正确：zoom","fields":{"zoom":"取值类型或格式不符合要求"}}` |
| 时区非法 | `GET /commutes/trends?timezone=Not/AZone` | `400` | `{"status":400,"code":"invalid_request","message":"时间或时区取值不合法。"}` |

八条响应体里都没有包名、类名、方法签名或堆栈。这一组同时被 `ApiErrorContractTest`（6 项）固化成回归测试，断言方式是"整个响应体字符串不得包含 `com.example` / `org.springframework` / `org.hibernate` / `java.lang.` / `Validation failed for argument` / `rejected value` / `default message` 任一特征"——新增错误分支时如果又直接把框架消息回传，测试会立刻红。

**顺带把缺陷 2 的严重程度定死了**：表格第一行就是 A 侧现在真实发出的请求体，服务端返回 400。也就是说"完成通勤"这个动作在当前前后端组合下**必然失败**，不是"多一次往返"那么轻。`Full-stack E2E` 在 `app.integration.e2e.ts:167` 断言 `Expected: 201, Received: 400`，与此完全对应（此前该 spec 卡在第 50 行的选择器超时，把这个更严重的问题挡住了；选择器已由 D 修好，见缺陷 1）。

## 4. 未运行项（按 D06 口径：环境缺失导致跳过的检查不计为通过）

| 检查 | 状态 | 原因 |
| --- | --- | --- |
| `PostgisIntegrationTest`（5 项）本机 | **本机未运行** | 本机无 Docker，Testcontainers 起不来，整类 `@EnabledIf` 跳过。**CI 上已实际通过**：PR #69 头提交 `7ad3331` 的 `Backend CI` 日志为 `Tests run: 5, Failures: 0, Errors: 0, Skipped: 0`（16.67 s），全量 `Tests run: 154, Failures: 0, Errors: 0, Skipped: 0`、BUILD SUCCESS。D06 新增的 7 项同样在 CI 上首次真实执行并通过（3.2.1）。因此这一行只是"本机环境缺失"，不是"该项没有验证" |
| 前端 `npm run build` | **未运行** | 生产构建与体积检查本轮没有做；`npm test` 与两个 Playwright 套件已经在本机跑通并记入 3.2.2，构建这一项仍待补 |
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
| 8 | 完成通勤的评分取自服务端快照，预计时长与实际时长不混淆 | 部分（**本轮由"通过（口径）"下调**） | 服务端口径成立：curl 直接带 `snapshotId`/`operationId`/`routeId`/`endStressLevel` 时，响应里的 `selectedScore=36.0`、`estimatedSeconds=26146`、`fastestScore=51.0` 全部来自快照（3.3 步骤 5）。**但用前端真实发出的请求体打同一个接口得到 400**（3.6 表格第一行、缺陷 2），也就是说这条场景在"用户点按钮"这个层面根本没走通，不能算通过。另外时长数值本身也不可信（缺陷 3） |
| 9 | 模拟记录不参与真实模式统计；几何等价路线评分保持稳定 | 部分 | 反馈侧 simulated 隔离已落地。**通勤侧 `routeSource` 恒为 `UNKNOWN`（B04 未交付），"模拟通勤不进真实统计"目前无法端到端证明**（缺陷 6）。几何等价评分稳定性属 B，未验证 |
| 10 | 返回、重新规划、趋势重试和移动端面板操作均无阻断问题 | 未运行 | 全部是浏览器/移动端交互，见第 8 节清单 |

十条中 **1 条可判"通过"、6 条"部分"、3 条"未运行"**（场景 8 本轮由"通过（口径）"下调为"部分"，理由见该行）。**当前不满足启动书的发布标准**。

> **口径提醒**：下面这个排序是按 `feature/member-d-d06-acceptance` 头（≈ #65 之后的 D 基线）排的。B 的 #67 已经修掉了缺陷 3、4 与缺陷 2 的服务端半边，所以**在 #67 合并之后这个排序会变**。B 在 #69 的留言里专门提醒了这一点：后续记录要区分"旧 D 基线"与"B 当前头"，不要按旧实现重复报修。

按当前基线的优先级：

1. **缺陷 2 的前端半边 —— 完成通勤必然 400**。这是唯一一个"用户点了必然失败"的核心动作。服务端已就绪（D02 契约 + #67 回传 `snapshotId`），只剩 A 接。已开 Issue #70。
2. **缺陷 10 / 11 —— D 欠的联调项**。demo 完成通勤 422、评分可空之后 D 侧全线还是 primitive `double` + NOT NULL。第 2 条尤其要紧：**真实用户第一次通勤会丢失或被写成假零分**。这两条依赖 #67 的类型，必须基于 B 的分支做。
3. **缺陷 1 —— 前端基线全红**。D 已修掉自己那 18 处 E2E 选择器（Mock 套件 `24 passed`），剩下 17 项 vitest 断言过期分属 A（14）与 C（3），改法已逐项写进 Issue #68。
4. **缺陷 12 —— D06 夹具与共享 E2E 口径**跟着 #67 升级，否则合并后 D06 那 4 项会变成假失败。
5. 缺陷 3、4、6 都在 B 侧，其中 3、4 已在 #67 修好待合并复核，6（`resolveRouteSource`）按 #67 的说法由 D 在预留接入点消费快照来源。

缺陷 5（400 泄露 Java 内部细节）与缺陷 7 的 workflow 部分**本轮已由 D 修完**，不再计入卡点。

## 6. 剩余缺陷与风险

按归属排列，每条都附本次拿到的证据。

| # | 缺陷 | 归属 | 证据 | 影响 |
| --- | --- | --- | --- | --- |
| 1 | 同步分支的提交 `2151d50` 改了 `WelcomePage.tsx` 的按钮文案（`查看预设路线` → `查看路线`），但没有同步更新 8 个文件里的 26 处断言，导致 `Frontend CI`、`E2E CI`、`Full-stack E2E` 在所有从 `codex/sync-latest-20261018` 派生的分支上全红（`develop` 的 `d14ecbc` 是绿的，`Backend CI` 各处都绿） | A（`frontend/src` 与前端测试） | 已开 Issue #68，并在 PR #65/#67/#55 留言。PR #65 头提交 `08174e1` 的 checks 实测：`Backend CI` success、`Android Build` success、`Frontend CI` **failure**、`Full-stack E2E` **failure**、`E2E CI` **cancelled**、`Android APK Verification` failure | **D06 的浏览器端验收整体被阻塞**：Mock/Full-stack E2E 在修好之前跑不出可信结果。**本轮已把归属拆开**：`frontend/e2e/` 归 D 主改，其中 18 处过期选择器已由 D 修好并实测 Mock 套件 `24 passed`（3.2.2）；剩下的 17 项 vitest 失败全部在 A 的 3 个文件（14 项）与 C 的 2 个文件（3 项）里，逐项定性与改法已写进 Issue #68 的补充留言。**撤回原先"改组件回到旧文案"的建议**——逐项对着源码核对后，组件的新文案与新行为都是有意为之且功能完好，过期的是断言，所以应当改断言而不是改组件。其中 `RoutePreviewPage.test.tsx:129` 已排除"离线入口回归"的怀疑（`handleEnterOfflineMap` 仍然调用 `onEnterMap(MOCK_ROUTE_COMPARISON, true)`，只是按钮文案变成了 `进入离线地图`）；`viewport.test.ts` 的 `scoreToColor(0)` 蓝→绿一项需要 C 自己确认是有意调整还是改丢了。不要逐条 `skip` |
| 2 | `POST /api/v1/routes/compare` 的响应里没有 `snapshotId`。**服务端半边已由 B 的 #67 修好**（compare 现在返回有效的 `snapshotId`，仅在设备归属保存成功后返回，沿用 30 分钟有效期）。**前端半边仍然不通**：`frontend/src/App.tsx:135-150` 与 `types/index.ts:75-87` 至今还在发 D02 之前的请求体，没有 `snapshotId` 也没有 `operationId`，所以在 develop / #69 这个基线上点"完成通勤"必然 400 | **A**（前端接入）；B 的部分已完成 | 3.3 步骤 3（旧基线响应键无 `snapshotId`）、3.6 表格第一行（用 A 的真实请求体实测 400）；B 在 #69 与 #56 的 2026-10-22 复核留言确认 #67 头已回传有效 `snapshotId` | 已开 Issue #70 跟踪，assignee 为 A。**注意口径**：本文 3.3/3.4 的实测是在 `feature/member-d-d06-acceptance` 头（等同 #65 之后的 D 基线）上做的，**不代表 B #67 头的行为**；后续复核要写明用的是哪个头，不要按旧实现重复报修。`Full-stack E2E` 的 `app.integration.e2e.ts:167`（`Expected: 201, Received: 400`）在 A 接完之前不会转绿 |
| 3 | mock 路线的几何与时长明显不合理：起终点直线距离约 887 m，返回的三条路线却是 31516 m / 76919 m / 114678 m，时长 23345 s / 26146 s / 29881 s（6.5–8.3 小时），折线经度跨到 120.01–120.46（±20 km）。**已由 B 的 #67 修复**（B01 步行候选验证 + 采样稳定化），本文记录的是旧 D 基线上的现象 | B（已完成，待 #67 合并后复核） | 3.3 步骤 3、5 与 `p_hist.json` 的完整折线；落库后 `estimated_seconds=26146`、`duration_minutes=436` | 旧基线上会污染下游：趋势的 `averageEstimatedSeconds=26146.0`、历史的 `durationMinutes=436`，C05 的折线图和答辩演示会显示"一次通勤 7 小时"。**#67 合并后需要重新实测一遍这条链路**，本文的数值不能直接当作合并后的结论 |
| 4 | `route-scenic` 的 `confidence` 只有 0.01，却照样返回 `stressScore=62.49`，响应里没有任何低置信度标记。**已由 B 的 #67 修复**：新增 `ScoringStatus`，无有效评分时 `stressScore` 为 null（NON_NULL 下整个键不出现），且不再给出 `leastStressfulRouteId` 与舒适标签 | B（已完成，待 #67 合并后复核） | 3.3 步骤 3（旧基线）；#67 的「公共契约变化」一节 | 旧基线与启动书场景 4「不出现无依据的舒适标签」冲突。**这一条反过来给 D 和 A 都派了活**：评分变可空之后，D 的 `CommuteRecord` 不能再用 primitive `double`（见缺陷 10），A 的 `responseValidators.ts` 也不能再要求两个评分必须是数字 |
| 5 | ~~非法枚举的 400 响应把 Java 实现细节吐给客户端~~ **已修复（本轮）**。原现象：`JSON parse error: Cannot deserialize value of type com.example.commutemood.domain.EmotionTag from String "BOGUS_TAG": ...`；同类问题还包括校验失败时回吐 `Validation failed for argument [1] in public org.springframework.http.ResponseEntity<...> com.example.commutemood.api.CommuteController.complete(java.lang.String, ...)` | D（全局异常映射） | 3.3 步骤 2e（修复前）、3.6（修复后） | 现在 `ApiExceptionHandler` 自己组织中文文案，参数类 400 统一带 `fields`（字段名 → 原因），出口处还有正则兜底：任何含 `com.example` / `org.springframework` 等特征的消息一律降级为通用文案，原文只进服务端日志。守门测试 `ApiErrorContractTest`（6 项）断言所有 400 响应体不含内部包名/类名/方法签名。契约已写进 `docs/团队协作与接口约定.md` 第 3 节「统一错误信封」 |
| 6 | `CommuteService.resolveRouteSource` 仍是占位实现，无条件 `return RouteSource.UNKNOWN` | B（B04）→ 之后 D 对接一行 | 3.3 步骤 5 的 `routeSource:"UNKNOWN"`；趋势 `unknownSourceCommutes` 等于全部记录数 | 通勤侧的"演示数据不进真实统计"无法验证；PR #67 若把 demo 快照标成 `DEMO`，`app.integration.e2e.ts` 里"趋势计数递增"那条断言会立刻变成假失败（已在该处留注释，改成断言 `excludedDemoCommutes` 递增即可）。等 B 在 #67 回复口径后我再动这个 D 归属的文件 |
| 7 | `Android APK Verification` 在 CI 上失败，**根因已定位并由 D 修复**：`.github/workflows/android-build.yml` 第 171 行用的是 `android-actions/setup-android@v3`，v3 会执行 `sdkmanager tools`，而 `tools` 包早已从 Android SDK 仓库下架，日志为 `Warning: Failed to find package 'tools'` + `exit code 1`。同文件的 `Android Build` job 用的是 `@v4` 且一直是绿的。另：C 的 PR #57–#61 目标分支是 `main` 而不是 `develop` | D 已修（workflow）/ C + 仓库维护者（分支基线） | 各 PR 的 checks 列表；CI job 日志 | 这一项不是 required check，不阻塞合并，但会一直制造红叉噪音。分支基线不一致会让 C 的改动绕过 develop 的 required checks，且 `mergeable_state` 为 `behind`（+49 commits / 150+ files），review 时 diff 里全是别人的改动，建议改 base 到 `develop` |
| 8 | 全新库上 Flyway V1 的 `CREATE EXTENSION IF NOT EXISTS postgis` 只在扩展已由超级用户装好时才是空操作；`commute` 角色 `rolsuper=f`，真·全新数据库上会在 V1 直接失败 | D（迁移）+ 部署文档 | 本机 `pg_extension`：`postgis`/`pgcrypto` 都在 `public`；`pg_roles`：`commute` 非超级用户、无 CREATEDB | 本次实测之所以通过，是因为扩展早就装好了。**本轮已补进 `docs/生产部署指南.md` 第 1.2 节**：写清 compose 路径为什么没事（镜像把 `POSTGRES_USER` 建成超级用户）、托管库/DBA 建库路径必须先用超级用户执行的四条 SQL、以及 `currentSchema` 必须带 `public` 否则 `geometry(Point,4326)` 与 `digest()` 解析不到。V1 本身不改（V1–V5 已上线，禁止重写），改的是文档与部署顺序 |
| 9 | demo 与 postgres 两种 profile 的热力格数量差一倍以上（116 vs 55） | D + B（种子数据） | 3.5 | 不是缺陷，但演示时切换 profile 会让地图明显变稀，需要提前说明，避免被当成 bug 现场排查 |
| 10 | **（本轮新增，D 欠的联调项）DEMO 完成通勤被 422 挡住**。已确认的口径是"demo 可以记录，但读侧排除"，而当前实现是写入门禁直接抛 `DemoResultRejectedException` | **D**（`CommuteService`） | B 2026-10-22 用真实 JAR 探针实测仍得 422；#69 留言 [#6331331827](https://github.com/HCXXWDG/SoftwareProject/pull/69#issuecomment-6331331827) | 演示模式下"完成通勤"这个动作走不通，答辩现场必踩。改法：去掉写入门禁，改由 `TrendService` / `CommuteHistoryService` 在读侧按来源排除 |
| 11 | **（本轮新增，D 欠的联调项）评分变可空之后 D 侧全线还是 primitive**。B 的 #67 让"无有效评分"时 `stressScore` 为 null（NON_NULL 下键直接不出现），但 D 的 `CommuteRecord.selectedScore` / `fastestScore` 仍是 primitive `double`，JDBC 侧对应列是 NOT NULL | **D**（领域模型 / DTO / JDBC / 迁移 / 趋势判空） | 同上留言："仅删除门禁会因 primitive double / NOT NULL 产生解箱 500 或假零分" | **真实用户第一次通勤（还没有任何反馈、拿不到评分）会直接丢失或写进假零分**，与启动书场景 4「不出现占位零分」正面冲突。改法：`double` → `Double`、DTO 与响应体允许缺键、JDBC 列改可空、新增一个迁移（V1–V5 禁止重写，所以只能是 V6）、`TrendService` 的均值计算要跳过 null 而不是当 0 |
| 12 | **（本轮新增，D 欠的联调项）D06 夹具与共享 E2E 口径需要跟着 #67 升级**。`CommutePersistenceAcceptanceTest.comparison()` 还在用 `RouteComparison` 的旧 5 参构造器 | **D**（D06 测试与 `frontend/e2e/`） | B 在 #69 留言里源码确认（非宣称已跑过真库）："合入 B 后，当前严格来源门禁会拒绝这些并发/归属/冲突场景的正常写入" | 合入 #67 后 D06 那 4 项并发/归属/冲突测试会变成假失败。改法：夹具升级为显式 `REAL + REAL + VALID + scoringVersion`，并**另测**演示来源与缺评分两个场景；**不能为了让旧夹具通过而把未知来源当 REAL**。同时同步共享 E2E 里 DEMO 排除后的 `totalCommutes` / `excludedDemoCommutes` 口径 |
| 13 | **（本轮新增）合并冲突风险**：#67 与 #69 都改了 `ApiExceptionHandler.java` 与 `docs/团队协作与接口约定.md` | D + B（谁后合谁解） | #67 的 changed files 列表 | 不阻塞功能，但两个 PR 合并顺序（#55 → #62 → #63 → #64 → #65 → #67 → #69）里后合的那个必须 rebase 解一次冲突。D 的错误信封重做要保留，B 新增的三个 handler（`snapshot_not_found` / `snapshot_expired` / `demo_result_not_allowed`）也要保留——其中 `demo_result_not_allowed` 在缺陷 10 修完后可能整个不再触发，届时一并清理 |

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
22. 若做 Android 包体验：按 `docs/ANDROID_RELEASE.md` 与 `npm run build:android` 走一遍，记录 APK 是否可安装启动；CI 上的 `Android APK Verification` 此前因 workflow 用了已下架的 `setup-android@v3` 而失败，**本轮已由 D 对齐到 `@v4`**（缺陷 7），如果仍看到红叉请贴新的 job 日志，不要再按旧结论当作环境问题忽略。

### 8.4 回填要求

每项写「通过 / 失败 / 未运行」三态之一，失败项附截图与复现步骤，并注明是前端还是后端问题（按第 6 节的归属表）。环境缺失导致没跑的写"未运行"，不要写"通过"。结果补进本文件第 8 节末尾或另开 `docs/project/d06-browser-mobile-checklist-result.md`，由 D 汇总进最终验收。

## 9. 需要同步的点

1. **A**：`frontend/e2e/app.integration.e2e.ts` 由 D 主改，本轮把完成通勤断言从 200 改成 201 并加了三条守门人注释；同一批 6 个 spec 里 18 处过期选择器 `查看预设路线` 也已由 D 换成 `查看路线`，**你在 #68 的修复里不用再动 `frontend/e2e/`**，只改 `src/` 下那 3 个测试文件即可，避免同时改同一批文件。另外 `TrendResult` 的 6 个统计字段与 `CommuteHistoryItem` 的 `legacyRecord`/`missingFields` 已写进 `docs/团队协作与接口约定.md`，历史页可直接用。**最要紧的一条**：`src/types/index.ts:75-87` 的 `CommuteCompleteRequest` 与 `App.tsx:135-150` 的调用点还是 D02 之前的结构，缺 `snapshotId` 和 `operationId`，所以现在点"完成通勤"必然 400（缺陷 2、3.6 表格第一行）。这一步不再等 B——#67 已经让 compare 回传有效的 `snapshotId`，只等你接；同时请按 B 在 #56 的留言改 `responseValidators.ts`（缺分数不补 0、无有效评分不要求 `leastStressfulRouteId`、`NO_ROUTE` 接受空候选）。已开 Issue #70 跟踪。错误响应的结构本轮也重做了：所有 400 现在带 `fields`（字段名 → 中文原因），`message` 可以直接展示给用户，不会再出现 Java 方法签名，详见契约文档第 3 节「统一错误信封」——`services/api.ts` 若要给用户更好的提示，读 `fields` 即可。
2. **B**：你在 #69 与 #56 的 2026-10-22 复核我都读了，**接受"D06 的绿只代表 D 自己的基线，不代表与 #67 的组合已验收"这个批评**，本文已按"旧 D 基线 vs B 当前头"重新标注（第 5 节的口径提醒、缺陷 2/3/4 三行）。缺陷 2 的服务端半边、3、4 都确认由 #67 修好，我不再按旧实现重复报修，Issue #70 也已相应更正并把 assignee 改成 A。你派的三件联调活我记成了缺陷 10/11/12，**因为都依赖 #67 的 `RouteSource` / `ScoringStatus` / 新 `RouteComparison` 构造器 / `scoringVersion`，我会基于你的分支头另开一个联调分支来做，不在 #69 上动**。两个待你确认的点：(a) 缺陷 10 修完后 `DemoResultRejectedException` 与 `demo_result_not_allowed` 这个 code 是否还要保留（读侧排除之后写入不再拒绝，这个 422 就没有触发路径了）；(b) 缺陷 11 的可空迁移我打算编成 **V6**，如果你的分支上已经占了 V6 请告诉我，我改成 V7。另外 #67 与 #69 都改了 `ApiExceptionHandler.java` 和 `docs/团队协作与接口约定.md`，合并顺序里后合的那个要解一次冲突（缺陷 13），我这边会保留你新增的三个 handler。
3. **C**：第 8 节是给你的 4 工时清单，前置是 #68。#68 里有 3 项归你（`MapSurface.test.tsx` 2 项 + `viewport.test.ts` 1 项），其中 `scoreToColor(0)` 由蓝改绿这一项**只有你能定**是有意调整还是改丢了。另外 demo 与真实库的热力格数量差一倍（116 vs 55，见 3.5），演示时切 profile 地图会变稀，这是种子数据差异不是 bug；PR #57–#61 的目标分支请从 `main` 改成 `develop`，否则绕过了 develop 的 required checks，而且 `mergeable_state` 是 `behind`（+49 commits），review 时 diff 里全是别人的改动。`Android APK Verification` 的红叉已由 D 修掉（workflow 里 `setup-android@v3` → `@v4`），不用再当环境问题排查。
4. **仓库维护者**：缺陷 8 的部署前置（超级用户建扩展）**本轮已由 D 补进 `docs/生产部署指南.md` 第 1.2 节**，请复核这段的归属与措辞是否与其他部署约定冲突。另外**分支保护需要 admin 权限才能读改**：当前 token 只有 `push` + `triage`（`admin: false`），`/rulesets` 返回空、`/branches/develop/protection` 返回 404，所以 required checks 的实际配置只能靠 `.github/workflows/README.md` 的记录，无法核对。其中"最后一次推送需由其他成员批准"这一条对排期影响最大——任何人再推一次，已有 approval 就作废，建议**先把测试改完、各自推完，再统一找人批准**，不要边批准边推。
5. **CI**：D06 新增的 7 项数据库测试已随本 PR（#69）在 CI 上首次真实执行，`Backend CI` 为 success、`Tests run: 154, Failures: 0, Errors: 0, Skipped: 0`——CI 有 Docker，走的是 Testcontainers 路径而非本机 PG 路径，两条取库路径都已验证（3.2.1）。本轮追加 `ApiErrorContractTest` 6 项后本机基线为 `160 / 0 / 12`（3.2.2）。后续若这些测试在 CI 上失败，请按"跳过不等于通过"的口径处理，不要改成 `@Disabled` 或放宽断言；`ApiErrorContractTest` 是防信息泄露的守门测试，尤其不要为了让某个 400 通过而往 `LEAK_MARKERS` 里删项。

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
| 通过启动书规定的关键场景 | 第 5 节：**1 条通过、6 条部分、3 条未运行**；**当前不满足发布标准**。卡点按当前 D 基线排序是缺陷 2 的前端半边（完成通勤必然 400）、缺陷 10/11（D 欠的联调项）、缺陷 1（前端基线）、缺陷 12（夹具升级）；缺陷 3/4 与缺陷 2 的服务端半边已由 B 的 #67 修好，待合并后复核。**注意这一节记的是旧 D 基线，#67 合并后排序会变** |
| 环境缺失导致跳过的检查不计为通过 | 第 4 节全部写"未运行"并注明原因；集成测试用 `@EnabledIf` 整类跳过并在 `IntegrationDatabase` 的 Javadoc 里写明"跳过 ≠ 通过"；三轮结果分别证明"本机有库时真跑"（154/0/5）、"无库时干净跳过"（154/0/12）与"CI 有 Docker 时 12 项全部真跑"（154/0/**0**，3.2.1） |

### 10.1 本轮追加的交付（D06 之外的顺手修复）

D06 的验收过程里发现了一批不属于"验收"本身、但归 D 或必须由 D 牵头协调的问题，本轮一并处理：

| 交付 | 内容 | 证据 |
| --- | --- | --- |
| 错误信封重做 | `ApiExceptionHandler` 不再回传 `exception.getMessage()`；每类异常自己组织中文文案，参数类 400 统一带 `fields`，出口处用正则兜底把任何含内部包名的消息降级为通用文案，原文只进服务端日志 | 3.6 的 8 条实测响应体 |
| 防泄露守门测试 | 新增 `ApiErrorContractTest`（6 项），断言所有 400 响应体不含 `com.example` / `org.springframework` / `Validation failed for argument` / `rejected value` 等特征 | `Tests run: 6, Failures: 0`；全量基线由 154 变为 `160 / 0 / 12` |
| 契约文档 | `docs/团队协作与接口约定.md` 第 3 节新增「统一错误信封」小节：四个固定键 + `fields`、六个 `code` 的完整对照表、前端处理建议、"不得包含实现细节"这一条硬约束 | 文档 diff |
| 共享 E2E 选择器 | `frontend/e2e/` 6 个 spec 里 18 处 `查看预设路线` → `查看路线` | Mock 套件 `24 passed (18.3s)`，exit 0 |
| CI workflow | `.github/workflows/android-build.yml` 的 `Android APK Verification` job 由 `android-actions/setup-android@v3` 对齐到 `@v4`（v3 会安装早已下架的 `tools` 包，必然失败） | 缺陷 7 |
| 前端基线定性 | 本机首次跑通 `npm test` 与两个 Playwright 套件，把 17 项 vitest 失败逐项对着源码核对，确认**全部是断言过期而非功能回归**，按归属拆给 A（14）/ C（3），并撤回原先"改组件回到旧文案"的建议 | Issue #68 补充留言、3.2.2 |
| 合并条件核对 | 逐项查了 16 个开放 PR 的 checks 与 `mergeable_state`，确认 `develop`（`d14ecbc`）本身是全绿的，红叉全部来自同步分支 `codex/sync-latest-20261018`；并核实当前 token 无 admin 权限，分支保护只能由仓库维护者读改 | 第 9 节第 4 条 |

## 11. 合并阻塞清单（2026-10-22 全仓盘点，17 个开放 PR）

D06 验收时只核对了 checks 与 `mergeable_state`。这一节把"到底还差什么才能合并"逐项拆开，并且给出每个红叉的**已定位根因**。数据来源是 GitHub API 的 `pulls` / `commits/{sha}/check-runs` / `actions/runs` / `actions/jobs/{id}/logs`，以及各分支的实际文件内容。

### 11.1 结论先说

- **没有一个 PR 存在 git 冲突**：17 个开放 PR 的 `mergeable` 全是 `true`。之前担心的 `ApiExceptionHandler.java` / `docs/团队协作与接口约定.md` 在 #67 与 #69 之间会撞，GitHub 目前判定不冲突（两个 PR 的 base 都是 develop，改动行不重叠）；真正会撞的是 #54 与 #55 的 `WelcomePage.tsx`，见 11.4。
- **卡住合并的只有两类东西**：必需检查红叉（`Frontend CI` / `E2E CI` / `Full-stack E2E`），以及**一个批准都没有**。
- **`Android APK Verification` 与 `Android Build` 不是必需检查**（`.github/workflows/README.md:17-18` 列的必需项只有 `Frontend CI`、`Backend CI`、`E2E CI`、`Full-stack E2E`），它们的红叉不阻塞合并，只是噪音。
- 三个必需检查的红叉根因全部定位完毕，**没有一个需要改后端代码**：一个是文案与选择器不匹配（11.2），一个是 vitest 断言过期（#68），一个是前端还在提交旧请求体（#70）。

### 11.2 根因一：`E2E CI` 的 `cancelled` 是 20 分钟超时被杀，不是并发取消

`E2E CI` 在 #55 / #62 / #63 / #64 / #65 / #67 上全部是 `cancelled`，此前没人说清为什么。以 #67 的 run `39712309025` 为证：

```
created 2026-10-22T02:36:24Z   updated 2026-10-22T02:56:44Z   →  20 分 20 秒
step Set up job / Checkout / Set up Node.js / Install dependencies / Install Chromium   success
step Run end-to-end tests      cancelled      ← 只有这一步
step Upload Playwright report  success
```

`.github/workflows/e2e.yml:25` 是 `timeout-minutes: 20`；GitHub 对超时被杀的 job 报的结论就是 `cancelled`。10-21 那次（run `39616196409`）同样卡满 20 分 22 秒。

**根因**：#55 的同步把欢迎页按钮文案从 `查看预设路线` 改成了 `查看路线`（`frontend/src/pages/WelcomePage.tsx:73`；develop 上还是第 49 行的 `查看预设路线`），但共享的 `frontend/e2e/` 里 18 处选择器没有跟着改（`app.e2e.ts` 3、`app.integration.e2e.ts` 2、`campus-boundary.e2e.ts` 1、`mobile.e2e.ts` 6、`pwa-sw.e2e.ts` 1、`welcome-flow.e2e.ts` 5）。

**时间刚好算得平**：`frontend/playwright.config.ts` 是 `timeout: 30_000`、CI 下 `retries: 2`、`workers: 1`；`testIgnore` 排除 `*.integration.e2e.ts` 和 `pwa-sw.e2e.ts`，所以 Mock 套件实际撞上的是 15 处。每个用例点不到按钮等满 30 秒再重试两次 ≈ 90 秒，串行 15+ 个用例 ≈ 22 分钟 > 20 分钟上限，job 必被杀。

**反证**：#69 与 #55/#67 同源（都含 `0d3da53`），唯一相关差异就是 D 在 commit `9a9a4c0` 里把这 18 处改成了 `查看路线`。#69 的 `E2E CI` 两次运行分别 51 秒和 66 秒 **success**（run `39725039871` / `39724369348`），本机 Mock 套件 `24 passed (18.3s)`。**20 分钟超时 → 50 秒通过。**

**修法**：`git cherry-pick 9a9a4c0` 到 #55 的分支（只动 `frontend/e2e/` 6 个文件）。⚠️ 不要单独提到 develop——develop 的欢迎页还渲染 `查看预设路线`，单独改 e2e 会把 develop 自己的 E2E CI 弄挂。已在 #55 留言。A 在 #56 上已独立改掉 16 处，只剩 `app.integration.e2e.ts` 第 46、47 行两处，已在 #56 留言标出。

### 11.3 根因二：`Android APK Verification` 的 20 秒失败是环境烂了，与代码无关

#67 的 job `119606240250` 日志（`actions/jobs/{id}/logs`，注意要先取 302 的 `Location` 再不带 Authorization 请求，直接跟随重定向会 401）：

```
Warning: Failed to find package 'tools'
Error: The process '/usr/local/lib/android/sdk/cmdline-tools/16.0/bin/sdkmanager' failed with exit code 1
```

`.github/workflows/android-build.yml` 的 `android-apk-verify` job 用 `android-actions/setup-android@v3`（develop 第 171 行、#54 分支第 175 行），v3 会执行 `sdkmanager tools`，而 `tools` 包已从 Android SDK 仓库下架；同文件第 45 行的 `Android Build` job 用 `@v4`，同一次运行里是 success。这就是缺陷 7 的修法依据，`95001cf` 已把第 171 行对齐到 `@v4`。

**注意这个修复目前被关在 #69 里**，其他分支要等 #69 合并才拿得到。因为它不是必需检查，所以不阻塞合并；但今天重跑任何 PR 都会看到这根红叉。

**顺带一个容易误判的点**：#52 / #53 / #54 三个 PR 的 6~8 个 check 全绿，包括 `Android APK Verification`——但它们最后一次运行是 **2026-07-01**，早于 `tools` 下架。**那三个绿勾是四个月前留下的，不代表今天重跑还会绿。**

### 11.4 三个 PR 改同两个文件：#52 ⊂ #53，#54 覆盖两者但引入一处回归

#52 / #53 / #54 都改 `.github/workflows/android-build.yml` 和 `frontend/src/services/api.ts`，是同一个问题（APK 连不上后端）的三层版本：

| | workflow 未配置变量时写什么 | `api.ts` |
| --- | --- | --- |
| #52 | `VITE_API_BASE_URL=`（空串） | 8 秒 `AbortController` 超时 + `AbortError` 友好提示 |
| #53 | `VITE_API_BASE_URL=__OFFLINE__` | #52 全部 + `NO_BACKEND` 哨兵，进 `request()` 立刻抛错 |
| #54 | `VITE_API_BASE_URL=`（**空串，回到 #52**） | #53 全部（判断挪到运行时 `getApiBase()`）+ `localStorage` 可配置地址 + 欢迎页设置 UI |

**#54 的问题**：它保留了 `NO_BACKEND === "__OFFLINE__"` 的判断，却把 workflow 改回写空串，于是 `getApiBase()` 返回 `""`，那段抛错在 CI 打出的 APK 里一次都走不到，"没配后端"退化成相对路径 `fetch("/api/v1/...")`，在 Capacitor WebView 里拿回 index.html —— 正是 #53 要修的 `非 JSON 响应 (text/html)`。一行修法是把判断改成 `if (!base || base === NO_BACKEND)`（顺带覆盖"用户点了清除"这条路径）。

**建议**：以 #54 为准收口、改掉那行判断，#52 / #53 用 `close`（不是 `merge`）关掉。三个 PR 依次合并会让 `api.ts` 开头几行常量和 workflow 两个 `.env.production` 步骤被改三遍，后两次必然冲突。已在三个 PR 上各留一条评审。

**另外**：#54 对 `WelcomePage.tsx` 是 `+74 −6`，#55 对同一文件是 `+50 −26`，两边都动了组件顶部注释和 `welcome-page__cta` 附近 → **后合的那个必须手工解冲突**。#54 没有改按钮文案，rebase 到 #55 之后要留意别把 `查看路线` 带回 `查看预设路线`。

### 11.5 C 的五个 PR base 设成了 `main`，而 `main` 落后 develop 48 个提交

| PR | 分支含 develop 头？ | 相对 develop | GitHub 显示的 diff | `mergeable_state` |
| --- | --- | --- | --- | --- |
| #57 | 是 | 领先 1 | **49 commits / 154 files / +12953 −2543** | `behind` |
| #58 | 是 | 领先 1 | **49 commits / 153 files / +12971 −2524** | `behind` |
| #59 | 是 | 领先 1 | **49 commits / 152 files / +12896 −2523** | `behind` |
| #60 | 否 | 落后 48、领先 3 | 1 commit / 4 files / +232 −3 | `blocked` |
| #61 | 否 | 落后 48、领先 3 | 1 commit / 3 files / +250 −0 | `blocked` |

#57~#59 的分支本身已经是"develop + 1 个提交"，只是 base 填成了 `main`，于是 GitHub 拿四个月前的 main 做基准，把 develop 上所有人这四个多月的工作（含 D 的 V1~V6 迁移）全算成"这个 PR 的改动"。**把 base 改成 `develop` 即可，不用动代码**，diff 会立刻缩成 1 个提交。#60 / #61 的分支不含 develop，需要先 `git rebase origin/develop` 再改 base。

改 base 会影响 CI 结果与评审上下文，属于作者该拍的事，D 没有代改，只在 #57 留了一条覆盖五个 PR 的说明（含 API 命令）。

### 11.6 评审批准：17 个 PR 里只有 4 个拿到过批准

| PR | 作者 | 评审数 | 已批准 | `mergeable_state` |
| --- | --- | --- | --- | --- |
| #52 #53 #54 | HCXXWDG | 0 | — | `blocked`（CI 全绿，只差批准） |
| #55 | xlm-xlm | 0 | — | `blocked` |
| #56 | xlm-xlm | 1 | — | `clean`（base 不是 develop，只有 1 个 check） |
| #57~#61 | xie-cheng-ai | 0 | — | `behind` ×3 / `blocked` ×2 |
| #62 #63 #64 #65 | ahao9968 | 1 | **xie-cheng-ai** | `blocked`（CI 红） |
| #67 | HCXXWDG | 1 | — | `blocked` |
| #69 | ahao9968 | 3 | — | `blocked` |
| #71 | ahao9968 | 0 | — | `clean`（base 不是 develop，**check 数为 0**） |

分支保护要求"至少一名非作者批准 + 最后一次推送由其他成员批准 + 解决全部评审对话"。目前**只有 C 批准过 D 的 #62~#65**，其余方向一条批准都没有。也就是说：即使所有红叉修好，没有互评也一个都合不进去。

**可以立刻推进的**：#52 / #53 / #54 的 CI 全绿（虽然是四个月前的绿），`mergeable_state` 是 `blocked` 而非 `dirty`，只差批准；但按 11.4 的结论这三个应当收口成 #54，所以 D 没有直接批准，而是留了评审说明。#61 也是全绿只差批准，但它 base 是 `main`（11.5），批准并合并等于绕过 develop 把 C05 推进发布分支，同样先留说明没有批。

### 11.7 base 不是 develop/main 的 PR 拿不到任何 CI

四个必需 workflow 的触发条件都是 `pull_request: branches: [develop, main]`（`android-build.yml:3-11` 同）。所以：

- **#56**（base = `codex/sync-latest-20261018`）只有 1 个 check，A 今天那两个 commit（`1ae7f2e` / `69e67ae`）的 vitest 结果没有任何 CI 验证过；
- **#71**（base = `codex/member-b-route-correctness`）**check 数为 0**，D07 的验证只有本机的 `208 通过 / 0 失败 / 9 跳过` 和真实 PostgreSQL 链路实测。

两个 PR 都需要在上游合并后把 base 改到 develop 才能看到 CI。已在 #56 与 #71 各留一条说明。

### 11.8 建议的合并顺序（修订版）

B 原定 `#55 → #62 → #63 → #64 → #65 → #67`。按本轮盘点补充：

1. **先修 #55 的 18 处选择器**（`cherry-pick 9a9a4c0`）——不修的话 #55 及其下游每一个 PR 的必需检查 `E2E CI` 都会卡满 20 分钟。
2. `#55` → develop。
3. `#54`（改掉 11.4 那行判断、解决与 #55 的 `WelcomePage.tsx` 冲突）→ develop；`#52` `#53` 关闭为"被 #54 覆盖"。
4. `#62 → #63 → #64 → #65`（D 的四个，C 已批准，等 CI 转绿）。
5. `#67`（B）→ develop。
6. `#69`（D 的 D06 验收）→ develop，随后 #71 rebase 到 develop 并改 base，等四个必需检查跑绿再合。
7. `#57~#59` 改 base 为 develop（不用动代码）、`#60~#61` rebase 到 develop 后改 base，逐个合入。
8. 最后 `develop` → `main` 做一次发布合并（`main` 现在落后 48 个提交）。

每一步都还缺"非作者批准 + 最后推送由他人批准"，这部分只能靠四个人互相 review，工具解决不了。
