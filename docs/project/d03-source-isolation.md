# D03 来源隔离与数据库迁移（成员 D）

对应任务书 D03、启动书 T09 与正向标签/数据库变更。本文记录实现口径、迁移内容与实际验证结果，供 A/B/C 联调与验收复核。

## 1. 本次改动范围

| 层 | 文件 | 改动 |
| --- | --- | --- |
| 领域 | `domain/EmotionTag.java` | 新增 `QUIET`、`SHADE`、`OPEN` 三个正向标签，顺序与前端联合类型一致 |
| 仓储接口 | `repository/ReportScope.java` | 新增来源口径枚举 `REAL_ONLY` / `SIMULATED_ONLY` / `ALL`，带 `matches(boolean)` |
| 仓储接口 | `repository/EmotionReportRepository.java` | 新增 `findWithin(bounds, since, scope)`；两参重载保留为 `ALL` 兼容口径 |
| 内存实现 | `repository/memory/MemoryEmotionReportRepository.java` | 按口径过滤，`scope` 为 null 时回退 `ALL` |
| JDBC 实现 | `repository/jdbc/JdbcEmotionReportRepository.java` | 按口径拼接 `AND simulated = FALSE/TRUE`；标签读取遇到未知旧值回退 `OTHER` 并告警 |
| 演示种子 | `config/DemoDataInitializer.java` | 标签轮转扩到 8 个；正向标签只配 0/25 的低压力记录 |
| 迁移 | `db/migration/V5__report_source_scope_and_positive_tags.sql` | 扩展 tag 约束、加真实数据部分索引、补正向标签演示种子 |
| 文档 | `docs/团队协作与接口约定.md` | 标签取值表 + 来源口径表 + B 的跟进项 |

未改 V1~V4 任何一行；V5 由 D 统一编号，B 如需字段请提出，不要另开同版本迁移。

## 2. 来源口径规则

`emotion_report.simulated` 区分演示种子与真实反馈。规则只有一条：**凡是对外结论、真实统计、验收取数，必须用 `REAL_ONLY`**；`ALL` 仅为演示模式（默认 profile，全部数据都是模拟的）保留，否则热力图会变空。

写入侧不受口径影响：`ReportService.submit` 保存的记录恒为 `simulated = false`，去重与限频逻辑未变。

## 3. V5 迁移内容

1. `ALTER TABLE emotion_report DROP CONSTRAINT IF EXISTS emotion_report_tag_check`，再重建为包含 8 个标签的 CHECK 约束（V1 的内联 CHECK 由 PostgreSQL 自动命名为 `emotion_report_tag_check`）。
2. `COMMENT ON COLUMN emotion_report.simulated`，把口径写进数据库自身文档。
3. 两个部分索引，只覆盖真实数据，供 `REAL_ONLY` 查询使用：
   - `idx_emotion_report_real_reported_at (reported_at DESC) WHERE simulated = FALSE`
   - `idx_emotion_report_real_location USING GIST (location) WHERE simulated = FALSE`
4. 补 60 条正向标签演示记录（`simulated = TRUE`，设备号 `simulated-positive-0..59`，压力恒为 0 或 25），落在 V3 的两个低压力簇上，使 demo 与 postgres 两种模式都能看到新标签。

历史数据兼容：旧库 `emotion_report` 只有 5 个旧标签，扩展约束后仍然合法；JDBC 读取时若遇到枚举不认识的历史值，回退 `OTHER` 并打 WARN，不让整次查询失败。通勤记录的历史来源与时长仍沿用 D02 的“未知口径”（`route_source` 为空读作 `UNKNOWN`，`estimated_seconds` 为空读作 null）。

## 4. 实际验证结果

环境：Windows 本地 PostgreSQL 16.15 + PostGIS 3.6，数据库 `commute_mood`，JDK 26 编译到 17 目标，Maven 离线（`./mvnw -o`）。JaCoCo 0.8.13 不支持 Java 26 类文件，统一加 `-Djacoco.skip=true`。

### 4.1 单元与接口测试

`./mvnw -o -Djacoco.skip=true test`：**Tests run 83, Failures 0, Errors 0, Skipped 5**（5 项为依赖 Docker 的 Testcontainers 用例，本机无 Docker，按“未运行”记录，不计入通过）。

新增用例：

| 测试类 | 数量 | 覆盖点 |
| --- | --- | --- |
| `MemoryEmotionReportRepositoryTest` | 8 | 三种口径、两参重载等价 `ALL`、null 口径回退、时间与边界仍生效、新标签可写入、写侧去重不受口径影响 |
| `JdbcEmotionReportRepositoryTest` | 5 | SQL 是否按口径追加 `simulated = FALSE/TRUE`、`ALL` 不加过滤、两参重载走 `ALL`、行映射读取新标签且未知旧值回退 `OTHER` |
| `EmotionTagSyncTest` | 4 | V5 约束列表与枚举一一对应、V1 未被改写、种子只用合法标签、枚举顺序与前端联合类型一致 |
| `ReportScopeTest` | 3 | 三种口径的 `matches` 语义 |
| `ApiSmokeTest`（新增 2 项） | 20 | 提交 `SHADE` 返回 201 且能被 `REAL_ONLY` 读到、演示口径读不到该真实设备；未知标签 `NOT_A_TAG` 返回 `400 invalid_request` |

### 4.2 旧库升级路径（V2 → V3 → V4 → V5）

本地库原本停在 V2，以 `postgres` profile 启动应用由 Flyway 实际执行：

```
Migrating schema "public" to version "3 - campus demo seed"
Migrating schema "public" to version "4 - commute idempotency"
Migrating schema "public" to version "5 - report source scope and positive tags"
Successfully applied 3 migrations to schema "public", now at version v5
Started CommuteMoodApplication in 3.179 seconds
```

升级后核对：`flyway_schema_history` 1~5 全部 `success = t`；约束实际定义包含 8 个标签；种子分布为 NOISE/CROWD/SUN/ODOR/OTHER 各 100 条、QUIET/SHADE/OPEN 各 20 条，全部 `simulated = t`；两个部分索引已创建。

### 4.3 全新初始化路径（V1 → V5）

`commute` 角色无 `CREATEDB` 权限，因此在同一数据库内用全新 schema `fresh_v5_check` 等价验证从零建库：Flyway `Creating schema "fresh_v5_check"` 后连续应用 5 个版本，`Successfully applied 5 migrations ... now at version v5`，应用正常启动。核对结果：种子 560 条且全部 `simulated = t`、`emotion_report_tag_check` 存在、`commute_record` 的 `operation_id`/`snapshot_id`/`route_source`/`estimated_seconds` 四列齐全。验证完 `DROP SCHEMA ... CASCADE`，本地库只保留 `public`。

### 4.4 运行期真实数据隔离

应用运行中对 `/api/v1/reports` 提交 `tag=SHADE` 的真实反馈：

- 返回 `201 {"status":"created"}`；库内出现 1 条 `simulated = f` 记录。
- 同一校园边界框、7 天窗口下：`ALL` 计 561 条，`REAL_ONLY` 计 1 条 —— 560 条演示种子被正确排除。
- `EXPLAIN` 显示 `REAL_ONLY` 查询走 `Index Scan using idx_emotion_report_real_location`，新索引生效。
- 未知标签走 HTTP 层返回 `400 invalid_request`（枚举反序列化失败）；直接对数据库插入 `tag='FOG'` 被 `emotion_report_tag_check` 拒绝。
- 验证用的真实记录与临时设备档案已删除，本地库恢复为纯演示数据。

## 5. 需要同步的点

1. **B（B05 热力图/路线采样）**：`HeatmapService` 第 44 行仍调用两参重载（等价 `ALL`）。请改为按 profile 或请求参数传 `REAL_ONLY`，真实统计才不会混入演示种子。D 未修改 B 的业务服务，只提供口径能力。
2. **A/C（前端类型）**：C03 分支的 `EmotionTag` 已含 `QUIET|SHADE|OPEN`，与后端枚举、V5 约束完全一致，合并后无需再改字段名；标签中文名与 emoji 仍由前端维护。
3. **D05 衔接**：趋势与历史查询沿用同一 `ReportScope` 口径，历史记录缺失新字段时按“未知”处理，不补零、不猜测。

## 6. 验收对照

| D03 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 真实查询不混入模拟反馈 | 通过 | 4.4：`REAL_ONLY` 1 条 vs `ALL` 561 条；内存/JDBC 用例各覆盖 |
| 新旧标签可读取 | 通过 | 4.1 `JdbcEmotionReportRepositoryTest` 行映射；4.2 库内 QUIET/SHADE/OPEN 各 20 条；未知值回退 `OTHER` |
| 迁移无编号冲突 | 通过 | V5 为 D 新增的唯一版本，V1~V4 未改；`EmotionTagSyncTest` 断言 V1 保持五个旧标签 |
| 升级和全新初始化均通过 | 通过 | 4.2（V2→V5）与 4.3（V1→V5 全新 schema） |
| 内存模式筛选规则一致 | 通过 | 4.1 两实现口径用例 + `ApiSmokeTest` 在 demo profile 下端到端验证 |
