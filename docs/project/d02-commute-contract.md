# D02 完成通勤接口契约与同步点（成员 D 汇总）

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
| `completedAt` | ISO-8601 | 否 | 完成时间，缺省取服务端当前时间 |

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
| 快照不存在 / 不属于该设备 / demo 重启后失效 | `404` | `snapshot_not_found` | 引导重新规划路线 |
| 快照已过期（超过 30 分钟） | `410` | `snapshot_expired` | 提示"结果已过期"，重新规划 |
| 快照来源为演示，拒绝计入真实统计 | `422` | `demo_result_not_allowed` | 提示演示结果不计入 |
| 参数非法（`routeId` 不在快照、`endStressLevel` 非法、缺字段等） | `400` | `invalid_request` | 修正后重试 |

错误体：`{ "timestamp", "status", "code", "message" }`。

---

## 四、快照过期策略（S00 第 2 项，D 定义）

- 阈值：**30 分钟**（`CommuteService.SNAPSHOT_MAX_AGE`）。超过则 `410 snapshot_expired`。
- "缺失"（404）与"过期"（410）分开，便于前端给出不同文案；两者都引导重新查询，不自动换身份继续写旧结果。

---

## 五、幂等与并发（已在真实 PG16 验证）

- 幂等键：`(device_hash, operation_id)`，由 V4 部分唯一索引 `uq_commute_device_operation ... WHERE operation_id IS NOT NULL` 保证。
- 写入用 `INSERT ... ON CONFLICT (device_hash, operation_id) WHERE operation_id IS NOT NULL DO NOTHING`；冲突时回读已存在记录，由服务层判定 `duplicate` 或 `conflict`。并发重复只落一条，且**首次内容不被覆盖**。
- 内存（demo）实现用 `ConcurrentHashMap` 做同键幂等，语义与 JDBC 一致；差异仅在持久化（demo 重启即清空）。
- 历史行 `operation_id` 为 NULL，不参与唯一约束，互不冲突。

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
