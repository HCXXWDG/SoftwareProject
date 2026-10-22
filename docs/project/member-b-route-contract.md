# B01–B05 步行路线、评分与快照契约

日期：2026-10-21，D07 集成修订：2026-10-22。任务依据：[任务分工书](task-assignment.md)，接口讨论：[Issue #66](https://github.com/HCXXWDG/SoftwareProject/issues/66)。
本说明是 B 的交付契约，A/C/D 尚须评审与接入；不代表整项目验收通过。

本集成候选已包含 D07 #71 的 `5b0964b` 及 A #56 的 `6c2ca7c`；通勤行为以下文 D07 口径为准，不再使用 #67 早期的 422/400 写入门禁。这不表示原 PR 或 develop 已合并。组合证据见[最小集成验收](member-b-integration-20261022.md)。

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

**本候选的 D07 实现**：DEMO 快照和无有效评分的真实路线允许记录，首次 201、相同内容/操作号重放 200 duplicate；DEMO 记录只增加 `excludedDemoCommutes`，不进入真实趋势和通勤历史。无真实反馈的真实路线仍记 `routeSource=REAL`，缺的是评分而非路线来源。现有 30 分钟快照有效期、404/410、幂等及冲突校验仍保留。

D07 将 `selectedScore/fastestScore/confidence` 改为可空，V6 放宽数据库三列的 NOT NULL 并增加范围约束，JDBC 按 SQL NULL 回读、趋势判空。评分不可验证时留空，不补 0；可信有效零分仍为数值 0。评分是否有效与通勤是否发生分开处理。`ROUTE_DEMO_ENABLED` 控制能否生成演示快照，D07 没有新增独立的“生产拒绝演示通勤”开关，不将旧提案写成已实现配置。

B 在原快照 API 测试中补强仓储回读断言：DEMO/REAL 无评分保持 null；演示重放不重复计数；受控真实零分在完成和历史中均保留 0。相同测试由 PostGIS 子类复用，覆盖 V6 + JDBC；本地无 Docker 的结果不算真实库通过，须看本候选 CI。

边界：服务仍先验证快照，再检查幂等保存；30 分钟后或快照丢失时的重试可能得到 404/410，不能据此断言原操作未保存。D06 升级/并发夹具与完整共享 E2E 尚未合入本候选，不将单条用户链路通过当作全部存储验收完成。

- A：本候选已接入可空指数、可选选择 ID、snapshotId 和 D07 回执；通勤开关默认关闭，仅在验收 D07/V6 的部署中显式启用。继续保留稳定操作 ID 和 503 服务错误，不因刷新失败重复写入。
- C：分别展示环境指数与综合指数，空值不显示成零；热力详情可读来源、时间和样本数。
- D：D07 放行与可空存储已纳入组合，待 D06 夹具升级及真库迁移/并发验收；共享 E2E 区分 demo 排除与真实完成，不把趋势不增长误判为演示写入失败。真实路线无评分仍为 REAL 的来源语义由 B 确认。
- 所有人：契约审查完成前不合并；本轮 B 手工编辑只涉及自身快照 API 测试和交接文档，A/D 的功能代码来自其原始提交，未代写 C 功能或改写迁移版本。
