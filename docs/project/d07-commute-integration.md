# D07 通勤写入与 B #67 的集成（成员 D）

对应 B 在 PR #69 评审里交给 D 的三项集成工作（comment 6331331827）。目标：让 `POST /api/v1/commutes/complete` 与 B #67 引入的 `RouteSource` / `ScoringStatus` / `scoringVersion` 口径对齐——**通勤记录不再因为"演示来源"或"没有评分"而写入失败，但也不能因此补造假数据**。

分支：`feature/member-d-d07-commute-integration`，基点是 B 的头 `fb53530`（`origin/codex/member-b-route-correctness`），PR base 设为 B 的分支而不是 `develop`，这样 diff 里只有 D 的改动。

## 1. 为什么要改

B 的 #67 把"没有可验证评分"从异常变成了**正常状态**：`ScoredRoute.stressScore` / `stressExposure` 可空，并带 `ScoringStatus`（`VALID` / `INSUFFICIENT_DATA` / `UNAVAILABLE`）。典型场景是真实用户的第一次通勤——路线服务可用，但沿途还没有任何真实反馈，算不出压力评分。

而 D02~D06 的写侧口径是"只有 REAL 路线 + REAL 反馈 + VALID 评分才能完成通勤"，两条拒绝路径：

| 情况 | 旧行为 | 后果 |
| --- | --- | --- |
| 快照 `routeSource=DEMO` | 抛 `DemoResultRejectedException` → 422 `demo_result_not_allowed` | 演示流程走不通，E2E 只能靠 Mock 绕过 |
| 快照没有 VALID 评分 | 400 拒绝 | **真实用户的第一次通勤直接失败**，记录永久丢失 |

第二条是硬缺陷：它和 D03/D05 的"演示数据不进真实统计"口径其实是两件事。"不进统计"是**读侧**责任，不该用"不许写"来实现——不许写的结果是数据根本不存在，事后无法审计、无法补算，也无法区分"用户没通勤"和"用户通勤了但当时算不出分"。

新口径：**写入侧只判幂等与快照归属；来源与评分只决定"怎么存"和"读侧算不算"，不决定"能不能存"。**

## 2. 改动清单

| 文件 | 改动 |
| --- | --- |
| `domain/CommuteRecord.java` | `selectedScore` / `fastestScore` / `confidence` 由原始类型 `double` 改为 `Double`（规范构造器与 13 参兼容构造器都改），补 javadoc 说明"缺就是 `null`，由读侧跳过而不是当 0" |
| `application/CommuteService.java` | 删除 DEMO 拒绝分支；`resolveRouteSource` 由"拒绝闸门"改为纯归类（快照没声明才是 `UNKNOWN`）；新增 `hasVerifiableScoring(comparison, selected)`——它只决定**评分是否落库**，不决定记录是否写入；新增两个 `finiteOrNull` 重载，把 `NaN`/`Infinity` 也归一成 `null` |
| `application/TrendService.java` | `buildRecommendation` 增加 `alternativeScore` / `alternativeDurationRatio` / `fastestScore` / `confidence` 四项判空，避免 `Double` 拆箱 NPE，也避免"缺置信度"被当成 0 参与推荐判断 |
| `repository/jdbc/JdbcCommuteRecordRepository.java` | 行映射 `selected_score` / `fastest_score` / `confidence` 由 `rs.getDouble` 改为 `nullableDouble`。`rs.getDouble` 对 SQL NULL 返回 `0.0`，会把"没有评分"读成"压力 0 分" |
| `resources/db/migration/V6__commute_nullable_scores.sql`（新增） | 三列 `DROP NOT NULL` + 三个取值范围 CHECK（`0~100` / `0~100` / `0~1`）+ 三条列注释 |
| `domain/RouteComparison.java` | 更新 `@Schema` 描述，把"只有 REAL+REAL+VALID 才能完成通勤"改成新口径 |
| `api/RouteSnapshotFlowTest.java`（**B 的文件**） | 两个编码旧行为的用例改写，见 §4 |
| `config/DemoDataInitializer.java`、`CommuteHistoryServiceTest`、`TrendServiceTest` | `double` → `Double` 引起的 4 处编译错误：条件表达式里的 `int` 字面量不能装箱成 `Double`，改为 `62.0` / `43.0` / `50.0` / `60.0` |

`CommuteHistoryItem`（D05 的 DTO）三个评分字段本来就是 `Double`，无需改动；`CommuteHistoryService` 本来就在读侧过滤 `routeSource != DEMO`，也无需改动——D07 的读侧排除能力 D05 已经建好了，这次只是把写侧的闸门拆掉。

## 3. 数据库变更（V6）

```sql
ALTER TABLE commute_record
    ALTER COLUMN selected_score DROP NOT NULL,
    ALTER COLUMN fastest_score  DROP NOT NULL,
    ALTER COLUMN confidence     DROP NOT NULL;
```

V1 只在三列上写了 `NOT NULL`，没有取值范围检查。V6 顺手补上 CHECK，避免脏值（负分、超过 100、置信度大于 1）落库——`CHECK` 里带 `IS NULL OR`，所以放宽可空与加范围约束不冲突。

三条硬规则的遵守情况：

- **不改写 V1~V5**：V6 是独立新文件，只放宽约束，不做数据修复。
- **已有行不受影响**：V2 播种的 7 行 `commute_record` 取值是 `62 / 43 / 62 / 0.72`，`ADD CONSTRAINT ... CHECK` 默认会全表校验，先在真实库里用 `BEGIN; ... ROLLBACK;` 跑过一遍确认通过（见 §5.1），再交给 Flyway 正式应用。
- **迁移号由 D 统一分配**：B 的分支上只有 V1~V5，V6 空闲，无冲突。

## 4. 测试口径的修订

`RouteSnapshotFlowTest` 是 B 的文件，D07 改它是**改断言口径、不是改被测行为**，已在 PR 描述里单独点出来请 B 复核：

| 原用例 | 新用例 | 断言变化 |
| --- | --- | --- |
| `demoSnapshotCannotEnterRealCommuteStatistics`（期望 422） | `demoSnapshotIsRecordedButExcludedFromRealCommuteStatistics` | 期望 201 + `routeSource=DEMO` + `selectedScore`/`fastestScore` 键不存在；trends `totalCommutes=0`、`excludedDemoCommutes=1`；history 长度 0 |
| `realRouteWithoutFeedbackHasNoScoresAndCannotComplete`（期望 400） | `realRouteWithoutFeedbackHasNoScoresButStillCompletes` | 期望 201 + `routeSource=REAL` + `estimatedSeconds=80` + 三个评分键都不存在；trends `totalCommutes=1`；history 长度 1 |

两个用例名里都保留了"排除"和"仍然完成"的对照，是为了让读测试名的人直接看出口径：**演示数据不是被拒绝，而是被写入后在读侧排除**。

## 5. 验证记录（2026-10-22）

### 5.1 真实数据库验证 V6

本机无 Docker，`PostgisIntegrationTest` / `PostgisRouteSnapshotFlowTest` / `CommutePersistenceAcceptanceTest` / `DatabaseMigrationAcceptanceTest` 一律跳过，**记为未运行、不计为通过**。所以 V6 与可空评分的读写路径改用本地真实 PostgreSQL 验证：

环境：PostgreSQL 16.15 + PostGIS 3.6，库 `commute_mood`，角色 `commute`（非超级用户），验证前 Flyway 历史停在 V5。

**第一步：先在事务里空跑 V6 再回滚**，确认语法与 CHECK 全表校验都能过，避免给 Flyway 留一条 `success=false` 的历史（Postgres 的 DDL 可事务，回滚干净）：

```
BEGIN → ALTER TABLE → ALTER TABLE → COMMENT ×3
 selected_score | YES
 fastest_score  | YES
 confidence     | YES
ROLLBACK
```

**第二步：以 `postgres` profile 启动应用，让 Flyway 正式应用**（`SPRING_PROFILES_ACTIVE=postgres ROUTE_DEMO_ENABLED=true`）：

```
Migrating schema "public" to version "6 - commute nullable scores"
Successfully applied 1 migration to schema "public", now at version v6 (execution time 00:00.011s)
Started CommuteMoodApplication in 3.582 seconds
```

启动后核对库内实际状态：`flyway_schema_history` 第 6 行 `success=t`；三列 `is_nullable=YES`；三条列注释写入成功；`pg_constraint` 里 `chk_commute_selected_score` / `chk_commute_fastest_score` / `chk_commute_confidence` 均为 `CHECK ((col IS NULL) OR (col >= 0 AND col <= 100))` 形式（`confidence` 上界 1）。

### 5.2 演示快照的完整写入链路（真实库 + JDBC）

`POST /routes/compare`（无高德 key，`ROUTE_DEMO_ENABLED=true`）返回 `routeSource=DEMO`、`feedbackSource=NONE`、`scoringStatus=UNAVAILABLE`，三条演示路线的 `stressScore` 键都不存在，并带 `snapshotId`。

用它完成通勤：

| 请求 | 响应 |
| --- | --- |
| `POST /commutes/complete`（首次） | **201**，`status=created`、`routeSource=DEMO`、`estimatedSeconds=984`、`durationMinutes=17`，**无 `selectedScore` / `fastestScore` / `confidence` 键** |
| 同一 `operationId` 重放 | **200**，`status=duplicate`，返回同一个 `commuteId`，趋势不重复计数 |
| `GET /commutes/trends?days=7` | `totalCommutes=0`、`excludedDemoCommutes=1`、`deduplicatedCommutes=0`，7 个日桶全部 `commuteCount=0` 且无 `averageStress` 键 |
| `GET /commutes/history` | `[]` |

直接查库确认落的是 SQL NULL 而不是 0：

```
route_source               | DEMO
estimated_seconds          | 984
selected_score             | (null)
fastest_score              | (null)
confidence                 | (null)
alternative_score          | (null)
alternative_duration_ratio | (null)
```

旧代码在这里会 422，记录根本不存在；`rs.getDouble` 的旧行映射则会把这三个 NULL 读成 `0.0`，前端就会显示"压力 0 分"。两个缺陷都被这次真实库验证覆盖到了。

### 5.3 JDBC 读回 NULL 与趋势判空

往库里插两条 `route_source='REAL'` 的记录（同一设备）：一条三个评分全 NULL，一条有 `selected_score=62 / fastest_score=62 / alternative_score=43 / alternative_duration_ratio=1.12` 但 `confidence` 为 NULL。

`GET /commutes/history` 结果：

- 无评分那条：`selectedScore` / `fastestScore` / `confidence` / `alternative*` 键**全部不存在**——证明 `nullableDouble` 行映射生效。
- 有评分那条：`selectedScore=62.0`、`fastestScore=62.0`、`alternativeLabel=少心累路线 B`、`alternativeScore=43.0`、`alternativeDurationRatio=1.12` 照常返回，只有 `confidence` 键不存在。
- 两条都带 `legacyRecord=true` + `missingFields=["snapshotId"]`（D05 的旧记录标记对 NULL 列同样生效，且没有把可空评分误报进 `missingFields`）。

`GET /commutes/trends` 结果：`totalCommutes=2`、`excludedDemoCommutes=1`、`unknownSourceCommutes=0`；`recommendation` 是"继续积累沿途反馈，当前优先选择最快路线。"——**没有**给出改走替代路线的建议。这条正好压中 `TrendService` 的判空：`fastestScore - alternativeScore = 19 ≥ 10`、`ratio = 1.12 ≤ 1.20` 两个条件都满足，只有 `confidence` 是 NULL，旧代码会在这里拆箱 NPE 或把 NULL 当 0 处理。

整个验证过程 `pg-d07.log` 里 `ERROR` / `Exception` 计数为 **0**。验证用的 3 条通勤记录、1 条快照、1 条 `device_profile` 已从库里删除，`commute_record` 恢复为 V2 播种的 7 行。

### 5.4 单元测试与集成测试

B 的头 `fb53530` 上的基线（B 自述）：**199 通过、9 项无 Docker 跳过**。D07 改完后同一命令（`./mvnw -o -Djacoco.skip=true test`）：

```
Tests run: 208, Failures: 0, Errors: 0, Skipped: 9
BUILD SUCCESS
```

`RouteSnapshotFlowTest` 3 项全过。9 项跳过全部是 Testcontainers 相关，与基线一致，没有新增跳过。`-Djacoco.skip=true` 是必须的：JaCoCo 0.8.13 读不了本机 JDK 26 生成的 class 文件。

## 6. 未验证与遗留

| # | 事项 | 状态 |
| --- | --- | --- |
| 1 | Testcontainers 的 4 个数据库用例（含 `CommutePersistenceAcceptanceTest` / `DatabaseMigrationAcceptanceTest`）在本机跳过 | 未运行。CI（ubuntu-latest，有 Docker）会跑；合并前必须以 CI 绿为准，本机 §5 的真实库验证只作补充证据 |
| 2 | `DemoResultRejectedException` 与错误码 `demo_result_not_allowed` 现在没有任何地方抛出 | **保留未删**，等 B 答复（PR #69 comment 6333057581）。删掉会动到 B 的 `ApiExceptionHandler` 分支，属于跨边界改动 |
| 3 | "真实路线但无反馈"的记录 `route_source` 记成 `REAL` 还是 `UNKNOWN` | D 的实现记 `REAL`（来源确实是真实路线服务，缺的是评分不是来源），已在 PR 里请 B 确认口径 |
| 4 | `commute_record` 没有 `scoring_version` 列，`RouteComparison.scoringVersion` 不落库 | 未处理。若将来要按评分算法版本回溯或重算，需要 V7 加列；本轮 B 没有要求，D 不擅自扩表 |
| 5 | D06 的验收夹具升级为显式来源、补演示/缺评分用例（D07-3） | **阻塞**：`CommutePersistenceAcceptanceTest` / `DatabaseMigrationAcceptanceTest` 在 #69 分支上，不在 B 的分支上，本分支的 208 项里没有它们。等 #67 合入 develop、#69 跟上之后再做 |
| 6 | 前端 `完成通勤` 仍然提交 D02 之前的旧请求体 | 未修复，属 A 的范围，已记为 Issue #70。A 修完后还要处理评分键可能不存在的情况（见契约文档 §3 D07 小节） |
| 7 | `#67` 与 `#69` 在 `ApiExceptionHandler.java` 与 `docs/团队协作与接口约定.md` 上有冲突 | 已在 PR #69 里提示；按 B 定的合并顺序 `#55 → #62 → #63 → #64 → #65 → #67` 走，D07 排在 #67 之后 |

## 7. 对其他人的影响

- **B**：`RouteSnapshotFlowTest` 的两个用例被 D 改了断言口径，请复核新口径是否与你 #67 的意图一致；`RouteComparison` 的 `@Schema` 描述被 D 更新成"演示快照与无可验证评分的快照仍可完成通勤"。
- **A**：完成通勤返回体与历史明细里 `selectedScore` / `fastestScore` / `confidence` **可能整个键不存在**，必须判空，缺失时显示"暂无评分"而不是 0 分；`demo_result_not_allowed` 的 422 分支已成死代码，可以移除。
- **C**：地图与图表不受影响；如果历史页要展示评分，同样按"键不存在 = 暂无评分"处理。
- **部署**：V6 只放宽约束，升级不需要停机也不需要数据修复；`postgis` 与 `pgcrypto` 扩展必须由超级用户预先建好这一前置条件不变（见 `docs/生产部署指南.md` §1.2）。
