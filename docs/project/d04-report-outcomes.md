# D04 报告写入与限制结果（成员 D）

对应任务书 D04。目标：沿用既有限频与时空去重，核对 demo 与 postgres 行为是否一致，并为“新增成功 / 重复报告 / 限频 / 参数错误”提供稳定响应，让 C 能准确展示结果、A 能分别处理报告保存与热力刷新。

## 1. 发现的问题

| # | 问题 | 影响 |
| --- | --- | --- |
| 1 | 重复提交返回 `409`，而前端 `services/api.ts` 对所有非 2xx 一律 `throw` | C02 已写好的 `result.status === "duplicate"` 分支永远走不到，重复提示是死代码，用户只看到通用失败 |
| 2 | 内存实现用经纬度方框（约 ±22 米）去重，JDBC 用 `ST_DWithin(..., 25)` 圆形半径 | 边界上（22~25 米）demo 与 postgres 结论相反，违反“两种模式不得出现相反行为” |
| 3 | 两种实现都是“先查重再写入”，无并发保护 | 同设备并发提交时两个请求都查不到重复，各写一条，重复反馈被计成新增 |
| 4 | 成功响应只有 `status` + `message`，没有机器可读的 `code` | 前端只能靠文案或 HTTP 码分支，文案一改就断 |
| 5 | 500 兜底处理不记录堆栈 | 本次调试中 postgres 侧报错只返回“服务暂时不可用”，日志里什么都没有，无法定位 |

## 2. 改动

| 文件 | 改动 |
| --- | --- |
| `repository/ReportDeduplication.java`（新增） | 去重口径单点定义：窗口 5 分钟（含边界）、半径 25 米、仅同设备之间；距离用 `GeoMath.distanceMeters` 大圆距离，与 PostGIS `geography` 口径一致 |
| `repository/memory/MemoryEmotionReportRepository.java` | 改用 `ReportDeduplication.isDuplicate`；`save` 全程持写锁，串行化“查重 + 写入” |
| `repository/jdbc/JdbcEmotionReportRepository.java` | 去重 SQL 的时间窗与半径由 `ReportDeduplication` 常量格式化生成（不再硬编码）；`save` 第一步取事务级咨询锁 `pg_advisory_xact_lock(hashtext(device_hash))`，事务结束自动释放 |
| `api/ReportController.java` | 成功 `201 report_created counted:true`；重复改为 `200 report_duplicate counted:false`；响应字段固定顺序，`counted` 明确表达是否计入新增 |
| `application/RateLimitExceededException.java` | 文案改为中文，与其他用户可见响应一致（映射仍是 `429 rate_limited`） |
| `api/ApiExceptionHandler.java` | 兜底 500 增加 `log.error` 堆栈记录，对外文案不变 |
| `docs/团队协作与接口约定.md` | 报告响应表、状态码变更说明、去重与并发口径 |

限频规则本身未改（每设备每分钟 10 次），`ReportService` 的校验顺序也未改：压力值 → 时间戳窗口 → 设备哈希 → 限频 → 落库，参数不合法时不会消耗限频额度、也不会碰存储。

## 3. 为什么把重复从 409 改成 200

`409` 在语义上表示请求冲突，但这里的重复提交并不是错误：请求被正确理解、此前已被记录、服务端不需要客户端做任何修正。更关键的是工程现实——前端 fetch 封装对非 2xx 一律抛异常，`409` 让 C 已经写好的分支成为死代码，要修就得动 A 负责的 `services/api.ts`。改成 `200 + counted:false` 后，C 的现有判断直接生效，A 不需要改错误处理链路，也与 D02 通勤重复提交返回 `200 duplicate` 的口径一致。

需要 HTTP 语义严格性的调用方仍可用 `code` 精确区分；`429`、`400` 保持 4xx 不变。

## 4. 验证结果

环境：本地 PostgreSQL 16.15 + PostGIS 3.6，schema 版本 V5，JDK 26 编译到 17 目标，`./mvnw -o -Djacoco.skip=true`。

### 4.1 自动化测试

**Tests run 105, Failures 0, Errors 0, Skipped 5**（5 项为 Testcontainers 用例，本机无 Docker，按未运行记录）。新增 22 项：

| 测试类 | 数量 | 覆盖点 |
| --- | --- | --- |
| `ReportDeduplicationTest` | 6 | 窗口边界（正好 5 分钟算重复、5 分 01 秒不算）、双向时间差、半径边界按米而非方框、不同设备不互相去重、null 安全 |
| `ReportServiceTest` | 8 | 落库字段（设备哈希、`simulated=false`、标签、坐标、ID）、缺时间戳用服务器时间、重复结果透传且不额外写、非法压力值/未来时间/超 24 小时/空设备头均在触达存储前拒绝、限频第 11 次抛异常且不落库 |
| `MemoryEmotionReportRepositoryTest`（+2） | 10 | 超出半径的两条都计入；16 线程并发同设备同点只有 1 条 `CREATED`、库里只有 1 行 |
| `JdbcEmotionReportRepositoryTest`（+3） | 8 | 咨询锁在查重与写入之前（`InOrder`）；重复时不产生任何写操作（`verifyNoMoreInteractions`）；去重 SQL 的窗口与半径与 `ReportDeduplication` 常量同源 |
| `ApiSmokeTest`（+3） | 23 | 重复返回 `200 report_duplicate counted:false`、成功返回 `201 report_created counted:true`、11 次提交第 11 次 `429 rate_limited`、非法压力值 `400 invalid_request` |
| `PostgisIntegrationTest`（改） | — | 重复断言从 `isConflict` 更新为 `200 + code + counted` |

### 4.2 postgres 模式实测（应用连真实库）

| 场景 | 请求 | 结果 |
| --- | --- | --- |
| 顺序重复 | 同设备同点同时间戳连提 3 次 | `201 created` → `200 duplicate` → `200 duplicate`，库里 1 行 |
| **并发竞态** | 同设备同点 **12 路并发** | 1 个 `201`、9 个 `200 duplicate`、2 个 `429`（触发每分钟 10 次限频）；**库中恰好 1 行**，`pg_locks` 无咨询锁残留 |
| 限频 | 同设备 11 个不同地点（间距约 1 公里） | 前 10 次 `201`，第 11 次 `429 {"code":"rate_limited","message":"提交过于频繁，请一分钟后再试。"}` |
| 非法压力值 | `stressLevel: 30` | `400 invalid_request` |
| 非法标签 | `tag: "FOG"` | `400 invalid_request` |
| 缺设备头 | 无 `X-Device-Id` | `400 invalid_request` |

并发那一组是本次修复的直接证据：加锁前这种打法会写入多行并把重复反馈计成新增，现在 12 个并发请求只产生 1 行。验证产生的真实记录与临时设备档案已全部删除，本地库恢复为纯演示数据（`simulated=false` 计数为 0）。

### 4.3 demo 模式

`ApiSmokeTest` 全部在默认（内存）profile 下运行，其中重复、限频、非法参数三项断言与 4.2 的 postgres 结果逐项对应，说明两种模式行为一致；差异只剩持久化本身（内存重启即丢，postgres 落库），已在 D01/D03 文档说明。

## 5. 需要同步的点

1. **C（C02 反馈失败恢复）**：重复提示分支现在能真正走到了，无需改代码；若要在 UI 上区分“重复”和“失败”，请读 `code`（`report_duplicate` / `rate_limited` / `invalid_request`），不要匹配文案。
2. **A（A04 联调）**：`services/api.ts` 不必为报告接口开特例；`counted` 字段可直接用于“我的反馈数”累加，重复提交不计数。报告保存与热力刷新仍是两个独立接口（`POST /api/v1/reports` 与 `POST /api/v1/heatmap/refresh`），后端未做隐式刷新，A 可分别处理。
3. **B**：本次未触碰热力图与路线相关服务。

## 6. 验收对照

| D04 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 不同失败原因可识别 | 通过 | 4.2：`rate_limited` / `invalid_request` 各自稳定 code；重复用 `report_duplicate` 且为 2xx |
| 重复反馈不会当作新增反馈计数 | 通过 | 4.2 顺序 3 次仅 1 行；12 路并发仅 1 行；响应 `counted:false` |
| 已有合法报告与参数校验继续工作 | 通过 | 105 项测试全通过，含既有报告用例；4.2 合法提交仍 `201` |
| demo 与 postgres 行为核对 | 通过 | 4.3 与 4.2 逐项对应；去重口径由同一份常量与策略类定义 |
| 并发重复检查修正 | 通过 | 内存写锁 + postgres 事务级咨询锁；12 路并发实测 1 行 |
| 报告保存与热力刷新可分别处理 | 通过 | 两接口独立，提交报告不触发热力刷新 |
