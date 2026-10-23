# D02 完成通勤接口契约与同步点（成员 D 汇总）

当前契约修订：2026-10-23。第二至五节已同步城市通勤的快照有效期、优先重放既有操作及 D07 可空评分行为。下列草稿 v1 状态和第七、八节保留为 2026-10-19 的交接记录，不代表当前仍缺少来源字段或仍以 422 拒绝演示通勤；本轮没有重写当时的验收事实。

版本：草稿 v1（2026-10-19）
对应任务：D02 通勤幂等与服务端评分（启动书 T08）；契约口径对应 S00 第 2、3 项。
状态：D 侧实现已完成并通过单元测试（后端 61 项全绿）与本地 PostgreSQL16+PostGIS3.6 实测（V4 迁移与 `ON CONFLICT` 幂等已验证）。**待与 B、A 对齐下列 3 个同步点后联调。**

---

## 一、核心原则

完成通勤时，**评分与预计时长一律由服务端按快照重建，前端提交的分数不被采信**（验收：前端无法篡改评分、真实记录不携带演示评分）。前端只提交：本次依据的快照标识、幂等操作 ID、选中的路线 ID、用户主观感受。

---

## 二、`POST /api/v1/commutes/complete` 请求契约（新）

请求头：`X-Device-Id: <原始设备标识>`（服务端内部哈希后使用）。

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `snapshotId` | UUID | 是 | D01 返回的路线比较快照查询标识 |
| `operationId` | string | 是 | 幂等键。同一次通勤的网络重试**复用同一 ID**；新的一次通勤**换新 ID** |
| `routeId` | string | 是 | 用户在快照候选中选中的路线 ID，必须存在于该快照 |
| `endStressLevel` | int | 是 | 用户到达时主观感受，取值 `0/25/50/75/100` |
| `completedAt` | ISO-8601 | 否 | 可解析为 `Instant` 的完成时间，缺省或 null 取服务端当前时间；现有范围校验限制见下文 |

请求示例：

```json
{
  "snapshotId": "9f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40",
  "operationId": "6f9d0e6a-1c2b-4a77-9e10-3b8c5d2f0a11",
  "routeId": "route-fast",
  "endStressLevel": 25
}
```

> 旧契约（前端直接传 `selectedScore/fastestScore/durationMinutes/confidence/...`）已废弃。

`completedAt` 当前只受 JSON 时间格式解析约束，服务层尚未拒绝未来、过旧或早于路线快照的完成时间，也没有实测出发时间可用于核验。首次成功写入会保存客户端提供的时间，因而手机时钟错误可能使记录落在历史与趋势查询窗口之外。这是已知限制，本轮未增加未经约定的时间阈值。幂等内容仍按 `snapshotId + routeId + endStressLevel` 比较；重复提交不覆盖原记录的 `completedAt`。

---

## 三、响应契约

成功与重复均返回统一状态包；`status` 字段区分结果。

### 3.1 首次写入 —— `201 Created`，`status="created"`

```json
{
  "status": "created",
  "commuteId": "…",
  "operationId": "…",
  "snapshotId": "…",
  "routeId": "route-fast",
  "routeLabel": "最快路线 A",
  "routeSource": "UNKNOWN",
  "estimatedSeconds": 1080,
  "durationMinutes": 18,
  "selectedScore": 62.0,
  "endStressLevel": 25,
  "completedAt": "2026-10-19T01:02:03Z",
  "message": "通勤已记录。"
}
```

- `selectedScore`/`estimatedSeconds`/`routeLabel`/`confidence`/替代路线字段均来自快照中选中的 `ScoredRoute`。
- `durationMinutes` 为兼容历史保留字段，取值 `ceil(estimatedSeconds/60)`（不足一分钟记为 1），**不代表实测实际时长**；权威值是 `estimatedSeconds`。

### 3.2 幂等重复 —— `200 OK`，`status="duplicate"`

同一 `(设备, operationId)` 且业务内容（`snapshotId`+`routeId`+`endStressLevel`）一致时，返回**已存在的那条**（`commuteId` 与首次相同），趋势不重复计数。响应体结构同 3.1。

请求通过基本字段校验后，服务先以设备哈希和 `operationId` 查找既有记录，再读取快照。若原写入已经成功，即使响应丢失后快照过期或缺失，仍返回 `200 duplicate` 和原回执；相同操作号换成其他设备不会读到原设备的记录。

### 3.3 操作 ID 冲突 —— `409 Conflict`，`status="conflict"`

同一 `(设备, operationId)` 但业务内容不同：**不写入**，返回已存在记录的关键信息供前端核对。

```json
{
  "status": "conflict",
  "operationId": "…",
  "existingCommuteId": "…",
  "existingSnapshotId": "…",
  "existingRouteId": "route-fast",
  "message": "相同操作 ID 已用于不同内容的通勤提交，请核对后使用新的操作 ID 重试。"
}
```

### 3.4 错误响应（统一错误结构）

| 场景 | HTTP | `code` | 前端处理 |
| --- | --- | --- | --- |
| 未找到该设备的既有操作，且快照不存在 / 不属于该设备 / demo 重启后失效 | `404` | `snapshot_not_found` | 引导重新规划路线 |
| 未找到该设备的既有操作，且快照超过所选路线的有效窗口 | `410` | `snapshot_expired` | 提示"结果已过期"，重新规划 |
| 参数非法（`routeId` 不在快照、`endStressLevel` 非法、缺字段等） | `400` | `invalid_request` | 修正后重试 |

错误体：`{ "timestamp", "status", "code", "message" }`。

D07 当前实现允许 DEMO 快照和无有效评分的真实路线完成通勤。DEMO 记录在读侧排除于真实趋势和历史；不可验证的评分留空，不补 0。旧版 `422 demo_result_not_allowed` 不是当前写入门禁。

---

## 四、快照过期策略（S00 第 2 项，D 定义）

- 有效窗口为 **`max(30 分钟, 所选路线 durationSeconds + 15 分钟到达宽限)`**。例如 10 分钟路线仍为 30 分钟，60 分钟路线为 75 分钟；未选择的更慢候选不会延长当前路线的窗口。
- 从服务端快照的 `createdAt` 起算，以服务端当前时间判断；不以客户端 `completedAt` 延长有效期。超过窗口的首次提交返回 `410 snapshot_expired`。
- 内存与 JDBC 仓储没有提前按 30 分钟过滤或清除快照。只有尚未保存的操作需要经过快照归属、候选路线及有效期校验；已有同设备操作先返回重复成功或内容冲突。
- "缺失"（404）与"过期"（410）分开，便于前端给出不同文案；未保存操作遇到两者时引导重新查询，不自动换身份继续写旧结果。内存服务重启也会丢失已保存记录，不能据重启后的 404 推断原写入从未成功。

---

## 五、幂等与并发（已在真实 PG16 验证）

- 幂等键：`(device_hash, operation_id)`，由 V4 部分唯一索引 `uq_commute_device_operation ... WHERE operation_id IS NOT NULL` 保证。
- 基本参数校验与设备哈希后，优先查询该幂等键。已有记录的 `snapshotId`、`routeId`、`endStressLevel` 一致则返回原回执；不同则 `409 conflict`，都不再依赖快照是否仍有效。没有记录时才读取设备归属快照、校验所选路线和动态有效期，并从快照重建评分与预计时长。
- 写入用 `INSERT ... ON CONFLICT (device_hash, operation_id) WHERE operation_id IS NOT NULL DO NOTHING`；冲突时回读已存在记录，由服务层判定 `duplicate` 或 `conflict`。并发重复只落一条，且**首次内容不被覆盖**。
- 内存（demo）实现用 `ConcurrentHashMap` 做同键幂等，语义与 JDBC 一致；差异仅在持久化（demo 重启即清空）。
- 历史行 `operation_id` 为 NULL，不参与唯一约束，互不冲突。

本轮本地后端验证共 246 项，228 项通过、18 项因缺少 PostgreSQL/PostGIS 或可用 Docker 而跳过，0 失败；其中已保存操作跨快照过期/缺失的重放、内容冲突、设备隔离及长途窗口由服务测试覆盖。真实库的过期后重放/冲突场景已加入验收夹具，但本轮本地跳过，不能沿用下述早期真实库结果宣称新增场景已经在真库通过。

---

## 六、数据库迁移 V4（D 统一编号）

新增文件 `backend/src/main/resources/db/migration/V4__commute_idempotency.sql`，只新增不改写 V1~V3：

- `commute_record` 增加可空列：`operation_id VARCHAR(80)`、`snapshot_id UUID`、`route_source VARCHAR(16)`、`estimated_seconds INTEGER`（`>0` 约束，历史行为 NULL）。
- 部分唯一索引 `uq_commute_device_operation (device_hash, operation_id) WHERE operation_id IS NOT NULL`。
- 索引 `idx_commute_record_snapshot (snapshot_id)`。

> 说明：任务书把"幂等/来源/预计时长迁移"归在 D03；因迁移由 D 统一编号且 D02 的 JDBC 幂等依赖它，故在 D02 一并交付 V4。D03 将继续处理来源过滤口径与标签同步，不重复开相同版本。

---

## 七、⚠️ 需要与同伴对齐的 3 个同步点

### 同步点 1 —— B（B04）：快照必须携带"来源"与评分版本

现状：`RouteComparison`/`ScoredRoute` **没有来源字段**。`RouteComparisonService` 在高德未配置或调用失败时静默回退 `MockRouteProvider`，但快照里不记录结果来自真实高德还是演示 mock。

D02 的"拒绝演示结果进入真实统计"依赖它。需要 B 在快照中提供（建议）：

- 每条 `ScoredRoute` 或整个 `RouteComparison` 级别的 `source`：`REAL` / `DEMO`（或等价枚举）；
- 评分版本 `scoringVersion`（B04 要求快照含评分版本）。

对接点已预留：`CommuteService.resolveRouteSource(snapshot)` 目前统一返回 `UNKNOWN`，B 交付后**只需改这一个方法**从快照读取真实来源，其余流程不动。在来源可用前，`route_source` 存 `UNKNOWN`，是否计入真实统计由趋势侧（D05）按"未知口径"处理。

### 同步点 2 —— B（RouteController）：compare 响应要返回快照查询 ID

现状：`POST /api/v1/routes/compare` 返回 `RouteComparison`，**不含** D01 生成的快照查询 ID。A 拿不到 `snapshotId` 就无法调用新的 `/complete`。

需要：compare 响应体带上快照查询 ID（例如 `queryId`/`snapshotId` 字段）。该 ID 已由 `RouteQueryRepository.save(...)` 返回（D01），B 在 `RouteController`/响应模型里透出即可。

### 同步点 3 —— A（A04）：采纳新的完成请求契约

需要 A 按本文档第二、三节改造前端：

- `/complete` 只传 `snapshotId`+`operationId`+`routeId`+`endStressLevel`（不再传任何分数/时长）；
- `operationId` 生成与重试复用规则（见第二节）：一次通勤一个稳定 ID，网络失败重试复用，新通勤换新 ID；
- 处理 `201 created` / `200 duplicate` / `409 conflict` / `404` / `410` / `422` 各状态与文案；
- `snapshotId` 来自同步点 2 的 compare 响应。

---

## 八、D02 验收对照

| 验收项 | 状态 |
| --- | --- |
| 并发重复请求只保存一条 | ✅ 已实现并真实库验证（`ON CONFLICT DO NOTHING`） |
| 前端无法篡改评分 | ✅ 评分全部取自快照，请求不含分数字段 |
| 不足一分钟路线能够保存 | ✅ `durationMinutes=ceil(sec/60)`，45 秒→1 分钟，`estimatedSeconds=45` |
| 趋势只计一次 | ✅ 重复返回 `duplicate` 且不新增记录 |
| 真实记录不携带演示评分 | ⏳ 逻辑就位（`DEMO`→422 拒绝），**待同步点 1（B04 来源字段）生效** |
