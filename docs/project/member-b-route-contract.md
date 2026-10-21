# B01–B05 步行路线、评分与快照契约

日期：2026-10-21。任务依据：[任务分工书](task-assignment.md)，接口讨论：[Issue #66](https://github.com/HCXXWDG/SoftwareProject/issues/66)。
本说明是 B 的交付契约，A/C/D 尚须评审与接入；不代表整项目验收通过。

## 请求与服务策略

`POST /api/v1/routes/compare` 沿用 GCJ-02 的 `origin`、`destination`，新增可选 `demo`（默认 `false`）。起终点至少相距 1 米。带 `X-Device-Id` 才保存设备归属快照；匿名比较不返回可用于完成通勤的 ID。

高德请求遵循[官方步行规划文档](https://lbs.amap.com/api/webservice/guide/api/direction)：`GET /v3/direction/walking`，坐标按经度、纬度发送，保留 6 位小数；不带驾车的 `strategy` 或 `extensions`。连接超时 3 秒，读取超时 5 秒。异常不回传上游 URI、Key 或原始异常详情。

候选必须含正整数米数、秒数、至少两个非重合合法点。坏候选不进入评分；仍有合法候选时保留合法部分。端点道路吸附默认容许 150 米偏移，通过 `ROUTE_ENDPOINT_TOLERANCE_METERS` 调整（0–1000 米）。同 ID 去重，按预计耗时与 ID 稳定排序，最多保留 3 条。单条结果不会补造第二条。

`ROUTE_DEMO_ENABLED` 明确控制演示路线。默认 `demo` profile 开启，`postgres` 及其他部署关闭。无 Key 且策略允许时可返回标识完整的 DEMO；配置真实服务后调用失败返回 `SERVICE_UNAVAILABLE`，不静默替换为模拟成功。显式 `demo:true` 也必须获得服务端策略许可。演示曲线只是示意图，名称不含无依据的舒适结论，不能视作真实道路。

## 比较响应

原字段继续保留，增加下列状态。空数值遵守项目 Jackson `NON_NULL`：JSON 中键会缺失，前端应以 `value == null` 判空。

| 字段 | 取值/语义 |
| --- | --- |
| `routeSource` | `REAL` / `DEMO` / `UNAVAILABLE`；旧快照缺失时 `UNKNOWN` |
| `feedbackSource` | `REAL` / `DEMO` / `MIXED` / `NONE`；旧快照缺失时 `UNKNOWN` |
| `scoringStatus` | `VALID` / `INSUFFICIENT_DATA` / `UNAVAILABLE` |
| `recommendationReason` | 见下一节；供机器分支，不匹配中文文案 |
| `recommendationDetails` | 可用时包含 `extraDurationSeconds`、`durationRatio`、`environmentImprovement`、`compositeImprovement`、`dataCoverage` |
| `scoringVersion` | `walking-distance-v2` |
| `travelMode` | `WALKING` |
| `snapshotId` | D 仓储 `save` 返回的 UUID；保存抛错或返回空 ID 时请求失败，不伪造有效标识 |

每条路线也有 `scoringStatus`。`stressExposure` 是环境感受指数，`stressScore` 是含时间因素的综合心累指数，不能把二者都显示成压力。数据不足或演示结果的指数是空值，而非 0。有效零分仍为数字 0。

无路线时 `routes:[]`，选择 ID 缺失；评分无效时 `leastStressfulRouteId` 缺失，所有 `leastStressful` 为 `false`。有路线但数据不足仍可显示距离、预计时间和折线；不显示舒适标签。

示例：显式演示（快照 ID 为格式示例，实际须使用响应中的 UUID）：

```json
{
  "routes": [{
    "id": "route-fast", "label": "演示步行路线 A", "distanceMeters": 890,
    "durationSeconds": 660, "confidence": 0, "fastest": true,
    "leastStressful": false, "polyline": [
      {"longitude":120.2735103,"latitude":31.4753281},
      {"longitude":120.2743195,"latitude":31.4832753}
    ], "scoringStatus":"UNAVAILABLE"
  }],
  "fastestRouteId":"route-fast", "recommendAlternative":false,
  "routeSource":"DEMO", "feedbackSource":"DEMO", "scoringStatus":"UNAVAILABLE",
  "recommendationReason":"DEMO_ONLY", "scoringVersion":"walking-distance-v2",
  "travelMode":"WALKING", "snapshotId":"00000000-0000-0000-0000-000000000001"
}
```

真实但没有反馈时为 `REAL + NONE + INSUFFICIENT_DATA`；真实路线加演示/混合反馈也不能变成有效真实推荐。正常查询但无候选返回 HTTP 200 + `NO_ROUTE`；服务未配置且禁止演示、外部超时或失败返回 HTTP 503 + `route_provider_unavailable`。二者均无快照 ID，不伪装成模拟成功。

503 沿用项目错误格式（`timestamp/status/code/message`），不返回上游 URI、Key 或原始异常。A 应把它当作可重试的服务错误，而不是无路线：

```json
{
  "timestamp":"2026-10-21T00:00:00Z",
  "status":503,
  "code":"route_provider_unavailable",
  "message":"步行路线服务暂不可用，请重试或明确选择演示模式。"
}
```

`RouteComparisonService` 内部仍用 `SERVICE_UNAVAILABLE` 表示失败；由 `RouteController` 映射 HTTP 错误，不改变真实无路线的响应或成功比较字段。

## 算法与原因

沿整条路径累计距离每 50 米采样，包含起点和最终终点，跨原始线段连续累计；重复点不新增权重。空路径与单点采样安全返回，非正/非有限间隔拒绝。超过 100000 个样本拒绝，避免异常间隔造成无界循环。

每个样本匹配 80 米内最近热力单元，以 `cell.score × cell.confidence + 50 × (1-cell.confidence)` 估算环境感受；未覆盖处只作为内部中性先验，不将其当作有效评分。数据充分程度为样本 confidence 的均值，至少 0.35 才有可用指数；它不是推荐正确率。固定演示暴露值与 0.72 参考值不再作为有效评分输出。

综合指数为 `0.75 × 环境指数 + 0.25 × 时间惩罚`。时间惩罚为相对最快路线的延迟除以 20%，再映射至 0–100 并封顶。保持现有权重，本轮修正采样和状态，不引入偏好/分时段评分。

原因按以下顺序判定，说明针对本次通勤，不使用“明天试”：

| 原因 | 判定 |
| --- | --- |
| `DEMO_ONLY` | 演示来源 |
| `NO_ALTERNATIVE` | 仅一个有效候选，评分状态单独说明是否可用 |
| `INSUFFICIENT_DATA` | 至少一个候选无法根据真实反馈有效评分 |
| `SAME_ROUTE` | 最低综合指数路线就是最快路线 |
| `DETOUR_TOO_LONG` | 最低综合指数路线耗时超过最快的 1.20 倍 |
| `DIFFERENCE_TOO_SMALL` | 综合改善不足 10 分 |
| `RECOMMENDED` | 真实、有效、不同路线，改善至少 10 分且耗时不超过 1.20 倍 |

评分有相同时按耗时、ID 稳定打破平局。过长绕行不在解释前被删掉，以便返回真正的原因。

## 热力图来源与详情

`GET /api/v1/heatmap` 未带 `scope` 时使用 `app.heatmap.default-scope`：基础配置（含 postgres）为 `REAL_ONLY`，demo profile 为 `ALL`，可用 `HEATMAP_DEFAULT_SCOPE` 覆盖。这样现有前端不传 scope 的演示请求也能看到种子热力，不需 A 修改请求。显式 `scope=REAL_ONLY` / `SIMULATED_ONLY` / `ALL` 始终优先于配置；非法枚举返回 400。每个单元明确标记 `REAL`、`DEMO` 或 `MIXED`，混合展示不代表真实有效评分。

此配置只影响 HTTP 读取默认值。`HeatmapService` 三参数方法、真实路线评分和 `POST /heatmap/refresh` 仍固定 `REAL_ONLY`；演示路线评分显式查询 `SIMULATED_ONLY`。不能因为 demo 地图默认显示所有来源，就将模拟证据写进真实热力缓存或真实评分。

每个单元追加 `feedbackSource`、`updatedAt`（参与该单元聚合的最新反馈时间）、`windowHours`（本次查询窗口）。`count` 和 `dominantTag` 保持不变，中文标签由 C 显示。日期不由前端虚构。当前缓存表没有改 schema，读接口仍从报告计算。

## 快照与成员交接

只使用 `snapshotId`，不同时创造 `comparisonId`。通过 D 的现有接口保存来源、状态、版本、候选折线、评分和预计秒数；读取时使用外层 `RouteQueryHistory.id` 与设备归属。仓储不需要新增迁移。

**当前实现与未解决阻塞**：B 原先在 D 预留的 `CommuteService.resolveRouteSource` 接入点加入严格门禁，当前 DEMO 仍返回 `422 demo_result_not_allowed`，缺有效真实评分仍返回 `400 invalid_request`。D 的审阅指出这会阻断演示与首次通勤，B 已确认需要修正；本轮不将其标记为已解决。有效真实快照仍沿用 D 的 30 分钟有效期、404/410、幂等与冲突规则。

**待 D 实施的交接口径**（[PR 回复](https://github.com/HCXXWDG/SoftwareProject/pull/67#issuecomment-6318258809)）：demo 部署允许记录明确标记 DEMO 的通勤，由读侧排除并累计 `excludedDemoCommutes`；生产可通过独立配置拒绝 DEMO。真实路线但反馈不足时允许保存用户感受与预计秒数，缺少的算法分数保持 null，不补 0，也不宣称 VALID。评分是否有效与通勤是否发生分开处理；来源/缺失标记由 D 的记录契约承接。

不能只删除门禁或返回 UNKNOWN：当前 `CommuteRecord.selectedScore/fastestScore` 是 primitive double、V1 两列为 NOT NULL、JDBC 回读用 getDouble，趋势仍有分数减法。D 需一起完成可空模型/DTO、JDBC、null-safe 趋势与新增迁移（不改已执行版本），并补 demo 排除、首次通勤、幂等、空分数不变 0 的内存/PostGIS 测试。B 不并行修改 D 的这些文件，等待其联调提交后再复核。

- A：更新公共类型及响应校验，接受可空指数、可选选择 ID 和新状态；用 snapshotId 接入 D02；对 `503 route_provider_unavailable` 提供服务错误/重试提示。演示热力可不传 scope。
- C：分别展示环境指数与综合指数，空值不显示成零；热力详情可读来源、时间和样本数。
- D：按上述审阅交接完成通勤放行/可空分数，复核真实库快照回读；共享 E2E 区分 demo 排除与真实完成，不把趋势不增长误判为演示写入失败。已同步 D05 的 `08174e1`，非 REAL 来源不会被静默当作已验证来源。
- 所有人：契约审查完成前不合并本分支；本轮没有改 A/C 页面，也未改 D 的迁移编号、仓储或趋势算法。
