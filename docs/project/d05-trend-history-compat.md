# D05 趋势与历史数据兼容（成员 D）

对应任务书 D05。目标：核对日期时区、空日期、预计时长与来源筛选口径，调整 DTO 与历史查询结构；历史记录缺新字段时明确标记，确保旧记录不会让趋势和前端历史页面解析失败。

## 1. 发现的问题

| # | 问题 | 影响 |
| --- | --- | --- |
| 1 | 查询下界是滚动窗口 `now - days×24h`，分桶下界却是自然日 `today-(days-1)` 的 00:00 | 两个边界不一致：落在"滚动下界之后、首日 00:00 之前"的记录会被 `computeIfAbsent` 追加成一个额外桶，排在 `points` 末尾，日期不再升序，前端折线图错位 |
| 2 | 同一条记录的重复写入会让趋势多计一次 | 写侧幂等只覆盖带 `operationId` 的新契约；历史记录与 `operationId` 为 null 的路径（`save`）会真的写两行，趋势就变成 2 次 |
| 3 | `totalCommutes` 取 `records.size()`，与各日 `commuteCount` 之和不一定相等 | 出现"图上 6 根柱子、标题写 7 次"的自相矛盾 |
| 4 | 趋势不区分来源，`routeSource=DEMO` 的记录也会进统计 | 与 D03 的"演示数据不进真实统计"口径相反 |
| 5 | 没有历史明细接口 | 前端历史页无数据可用；旧记录缺字段时前端只能靠 `null` 猜测，容易把缺失当 0 |
| 6 | 前端提交的未来 `completedAt` 没有任何拦截 | 未来时间的记录会被塞进一个不属于窗口的桶，同样破坏升序 |
| 7 | 预计时长口径缺失 | 只有兼容字段 `durationMinutes`（历史数据里是前端提交的分钟数），没有服务端权威的 `estimatedSeconds` 统计口径 |

问题 1/3/6 在本次真实库验证中都有实证：库里存在一条 `completed_at = 2026-10-12 23:21:30+08` 的记录，今天（10-19）请求 `days=7` 时它落在自然日窗口之外，但在旧的滚动窗口（下界 10-12 15:2x）之内——这正是会多出第 8 个桶、并把 `totalCommutes` 撑到 7 的那类记录。

## 2. 改动

| 文件 | 改动 |
| --- | --- |
| `application/TrendService.java` | 窗口下界改为 `today.minusDays(days-1).atStartOfDay(zone)`，与分桶边界同源；先建满 `days` 个日桶再落记录，窗口外日期不进桶；读侧去重；`DEMO` 来源剔除、`UNKNOWN` 计入并单独计数；`totalCommutes` 改为"被计入的记录数"（= 各日 `commuteCount` 之和）；`TrendPoint` 追加 `averageEstimatedSeconds`/`estimatedSampleCount`；`TrendResult` 追加 `days`/`timezone`/`unknownSourceCommutes`/`excludedDemoCommutes`/`deduplicatedCommutes`/`outOfWindowCommutes` |
| `application/CommuteRecordDeduplication.java`（新增） | "同一次通勤"判定单点定义：先按 `completedAt` 升序稳定排序（不依赖仓储顺序），再按键折叠。键优先级：`operationId` → `snapshotId + routeId + 分钟` → `routeId + 分钟 + 压力值`（历史记录） |
| `application/CommuteHistoryService.java`（新增） | 历史明细查询：与趋势同时区、同自然日窗口、同去重口径；剔除 `DEMO`；按 `completedAt` 倒序截断 `limit` |
| `api/dto/CommuteHistoryItem.java`（新增） | 历史项 DTO：可空字段一律 `null` 不补 0；`legacyRecord` + `missingFields` 显式标记旧记录；`completedDate`/`timezone` 由后端按请求时区算好 |
| `api/CommuteController.java` | 新增 `GET /api/v1/commutes/history?limit&days&timezone` |
| `docs/团队协作与接口约定.md` | 趋势四条口径表、完整响应示例、`non_null` 序列化提醒、历史明细口径与旧记录标记规则 |

`CommuteService`、仓储接口、迁移文件均未改动：D05 是读侧口径修正，不需要新的数据库变更（旧记录缺的列在 V4 已经是可空列，`route_source` 为 NULL 时 JDBC 映射为 `UNKNOWN`）。

## 3. 为什么这样定口径

**自然日而不是滚动 24 小时**：C05 要画"七日折线图"，横轴是日期。滚动窗口会让最早那天只有半天数据，均值和次数都偏低，且和图上其他 6 天不可比。改成自然日后，`days=7` 恒等于"今天在内的最近 7 个自然日"，趋势与历史两个接口覆盖完全相同的时间集合，不会出现"趋势 6 次、历史 7 条"。

**空日期给 `null` 而不是 0**：任务书 C05 明确要求"空日期不补零、不跨缺失段误连"。0 是一个真实的压力值，用 0 填空日会让用户以为那天通勤很轻松。后端保持 `null`，C05 现有的 `p.averageStress != null` 过滤逻辑无需修改即可断开折线。

**读侧还要去重**：写侧幂等（D02）依赖 `operationId`，而历史数据和 `operationId` 为 null 的路径根本没有这个键。与其为旧数据补写幂等键（需要改迁移、回填数据、还可能猜错），不如在读取时按"同一次通勤"折叠一次：折叠规则集中在一处、可单测、对两种 profile 一致，而且响应里用 `deduplicatedCommutes` 把折叠条数暴露出来，不隐藏行为。分钟级窗口是刻意的保守选择——真实通勤不可能在同一分钟内完成两次，而重放写入几乎总是落在同一分钟。

**`UNKNOWN` 不算旧记录**：`CommuteService.resolveRouteSource` 在 B04 交付前统一返回 `UNKNOWN`，所以此刻**所有**新记录的来源都是 `UNKNOWN`。若把它算进 `missingFields`，刚完成的通勤也会被标成"旧记录"，标记就失去意义。因此 `missingFields` 只包含真正缺失的可空字段（`operationId`/`snapshotId`/`estimatedSeconds`），来源未知由 `routeSource` 字段本身表达。B04 交付后无需改这里的代码。

**预计时长只统计 `estimatedSeconds`**：`durationMinutes` 在历史数据里是前端提交的分钟数、在新数据里是 `estimatedSeconds` 向下取整的兼容值，两者语义不同，混在一个均值里无法解释。因此均值只取快照给出的 `estimatedSeconds`，并用 `estimatedSampleCount` 告诉前端这个均值有几条样本支撑；样本为 0 时均值为 `null`，前端不展示，而不是展示"0 秒"。

## 4. 验证

### 4.1 单元测试（离线，`./mvnw -o -Djacoco.skip=true test`）

`Tests run: 145, Failures: 0, Errors: 0, Skipped: 5`。跳过的 5 项是 `PostgisIntegrationTest`（Testcontainers 需要 Docker，本机没有 Docker），**记为未运行，不计为通过**。

D05 新增/改动的用例：

| 测试类 | 数量 | 覆盖 |
| --- | --- | --- |
| `application/CommuteRecordDeduplicationTest`（新增） | 10 | 同 `operationId` 折叠、历史记录同分钟折叠、不同分钟/不同路线/不同压力不折叠、同快照折叠、不同快照不折叠、空白 `operationId` 退回历史口径、任意输入顺序都输出升序、null 入参、折叠计数 |
| `application/TrendServiceTest`（2 → 14） | 14 | 既有摘要用例保留；空设备也给满 7 天且压力为 `null`；查询下界等于首日 00:00（`ArgumentCaptor` 断言）；`points` 逐日升序无缺口且 `totalCommutes` 等于各日之和；重复 `operationId` 只计一次；历史重复写入只计一次；真正不同的历史记录不误折叠；`DEMO` 剔除；`UNKNOWN` 单独计数；`estimatedSeconds` 只对有样本的记录求均值；纯历史数据时均值为 `null`；未来时间不进桶；回显 `days`/`timezone`；`days` 越界与时区为 null 报错 |
| `application/CommuteHistoryServiceTest`（新增） | 11 | 倒序、旧记录标记与 `missingFields`、新记录无缺失、`UNKNOWN` 来源不标旧、剔除 `DEMO`、重复写入折叠、`limit` 生效、跨日日期随请求时区变化、查询下界为自然日、空设备返回空数组、参数越界 |
| `api/ApiSmokeTest`（23 → 30） | +7 | 空设备趋势满窗口且空日不补零、demo 历史数据在趋势里标为来源未知、历史明细旧记录标记、快照契约记录在历史里非 legacy、重放后历史与趋势计数一致、缺 `X-Device-Id` 返回 400、`limit`/`days`/`timezone` 非法返回 400 |

### 4.2 真实 PostgreSQL 16 + PostGIS（`postgres` profile，本机无 Docker）

库里原本有 7 条历史形态的通勤记录（`operation_id`/`snapshot_id`/`estimated_seconds` 均为 NULL，`route_source` 为 NULL，`completed_at` 从 2026-10-12 到 2026-10-18），正好是旧数据兼容的真实样本。

1. **自然日窗口 + 空日期**：`GET /trends?days=7&timezone=Asia/Shanghai`（设备 `demo-browser`）返回 `points` 7 个、日期 `2026-10-13 … 2026-10-19` 严格升序；`totalCommutes=6`、`unknownSourceCommutes=6`、`excludedDemoCommutes=0`、`outOfWindowCommutes=0`。10-12 那条落在窗口外未被计入（旧的滚动窗口会把它算进来并多出一个末尾桶）；10-19 无记录，响应里该点只有 `commuteCount:0` 与 `estimatedSampleCount:0`，**没有 `averageStress` 键**（项目 Jackson 为 `non_null`，null 字段整个键不出现），也没有补 0。
2. **旧记录历史兼容**：`GET /history?limit=3&days=30` 返回倒序 3 条，每条 `legacyRecord=true`、`missingFields=["operationId","snapshotId","estimatedSeconds"]`、`routeSource="UNKNOWN"`、`estimatedSeconds` 键不存在，而兼容字段 `durationMinutes` 与后端算好的 `completedDate`/`timezone` 都在——旧数据没有让解析失败。
3. **重复写入不增加趋势次数**：用 SQL 复制一条同设备、同路线、同压力、同分钟（`2026-10-16 23:21:45+08`，原记录 `23:21:30`）的历史记录后，`GET /trends?days=7` 仍是 `totalCommutes=6`、`deduplicatedCommutes=1`，`2026-10-16` 那天仍是 `commuteCount=1`；`GET /history?days=7` 仍返回 6 条、日期与趋势完全一致。验证后已删除该行（`commute_record` 回到 7 行）。
4. **新契约端到端 + 重放**：`POST /routes/compare` 取快照后 `POST /commutes/complete` 返回 `201`（`estimatedSeconds=39722` 取自快照）；`GET /history?days=7` 返回该条 `legacyRecord=false`、`missingFields=[]`、`snapshotId`/`operationId` 完整。用同一 `operationId` 重放得到 `200 duplicate`，`GET /trends?days=7` 为 `totalCommutes=1`、`deduplicatedCommutes=0`（写侧幂等已挡住，读侧无需折叠），当天点位 `averageEstimatedSeconds=39722.0`、`estimatedSampleCount=1`。验证数据已全部删除（`commute_record` 7 行、`route_query` 恢复为验证前的 1 行、`device_profile` 删除测试设备），验证用的应用进程已停止，8080 端口已释放。

### 4.3 demo 模式

`ApiSmokeTest` 在默认（内存）profile 下运行，其中趋势满窗口、空日不补零、旧记录标记、重放一致性四项与 4.2 的 postgres 结果逐项对应；`DemoDataInitializer` 的 7 条种子记录走的正是历史构造器（无幂等键、无快照、来源未知、无预计秒数），因此 demo 模式天然覆盖旧数据兼容路径。两种模式的差异只剩持久化本身。

## 5. 需要同步的点

1. **C（C05 趋势图）**：`points` 现在恒为 `days` 个、日期升序、空日期无 `averageStress` 键。C05 现有的 `p.averageStress != null` 过滤已能正确断开折线，无需改动；若要展示时长，请用 `averageEstimatedSeconds` 并检查 `estimatedSampleCount > 0`，样本为 0 时不要显示 0。
2. **A（A04/A05 联调）**：`TrendPoint` 与 `TrendResult` 只做追加，`frontend/src/types/index.ts` 现有定义仍然有效，可按需补 `averageEstimatedSeconds?: number | null`、`estimatedSampleCount?: number` 与 `TrendResult` 的 6 个新字段。新增 `GET /api/v1/commutes/history`（返回数组）尚无前端调用方，字段已写进接口约定，A 建历史页时直接用即可。**注意全项目 Jackson 是 `non_null`，判空要写 `value == null`，不要用 `"key" in obj`。**
3. **B（B04 快照来源）**：`routeSource` 目前恒为 `UNKNOWN`，趋势把它们计入统计但用 `unknownSourceCommutes` 显式计数。B04 交付后 `CommuteService.resolveRouteSource` 一处对接即可，趋势与历史无需改动，`DEMO` 会被自动剔除。另外 `GET /routes/compare` 的响应里还没有快照 ID，前端拿不到 `snapshotId` 就无法调 `/complete`——这一项在 D02 已提出，仍待 B 处理。
4. **前端提交的 `completedAt`**：`CommuteService` 未对客户端时间做钳制，未来时间会被 `outOfWindowCommutes` 挡住而不进桶（不会破坏图），但也不会入库纠正。若要彻底避免，应在 `CommuteService` 增加"晚于服务端当前时间则取当前时间"的规则，属 D02 范围，本次未改以免影响已交付契约。

## 6. 验收对照

| D05 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 同一次通勤重复写入不增加趋势次数 | 通过 | 4.2 第 3 项：真实库复制一条历史记录后 `totalCommutes` 仍为 6、当天 `commuteCount` 仍为 1、`deduplicatedCommutes=1`；4.2 第 4 项：新契约重放 `200 duplicate` 后仍为 1 次；单测 10 + 3 项覆盖三种折叠键 |
| 跨日和空日期正确 | 通过 | 4.2 第 1 项：7 个自然日严格升序、10-12 记录正确排除、10-19 空日不补零；单测断言查询下界等于首日 00:00、`points` 逐日无缺口；历史接口单测覆盖"上海今天 00:30 == UTC 昨天 16:30"的跨日归属 |
| 历史数据兼容 | 通过 | 4.2 第 2 项：NULL 字段的真实旧记录返回 `legacyRecord=true` 与明确 `missingFields`，未导致解析失败；4.2 第 4 项：新契约记录 `legacyRecord=false`；`route_source` 为 NULL 映射为 `UNKNOWN` 而非报错 |
| A、C 使用同一字段与口径 | 通过 | 口径由 `TrendService`/`CommuteHistoryService` 单点定义，趋势与历史同时区、同自然日窗口、同去重规则（4.2 第 3 项两接口计数一致）；字段全部追加式扩展，已写入 `docs/团队协作与接口约定.md` 并在第 5 节逐人说明 |
| 环境缺失导致跳过的检查不计为通过 | 遵守 | `PostgisIntegrationTest` 5 项因无 Docker 跳过，记为未运行；改以 4.2 的本机真实 PostgreSQL 验证补足 |
