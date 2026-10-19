# 成员 A：S00 接口核对与联调边界

2026 年 10 月 19 日更新：[D 新契约与实际联调记录](member-a-contract-integration.md) 已核对待合并 PR #62–#65。D02 实际请求使用 `snapshotId`；D04 重复报告改为 200 并带 `code/counted`；D03 增加正向标签；D05 修订自然日口径。A 已做兼容接入。下文保留 10 月 18 日基线与首批草案，不能作为 D 新分支尚未实现上述能力的结论。

记录日期：2026 年 10 月 18 日。核对对象为本地 `SoftwareProject` 后端源码及成员 A 开发准备书，开工基线为 `0d3da53`。本文中的 JSON 是按当前 DTO 编写的结构样例，不是一次真实请求的抓包结果。本文由 A 提供核对记录，尚不代表 B、C、D 已完成共同确认。

本文明确区分三类内容：第 1 至 5 节是已从源码确认的现状；第 6 节是 A 本轮采取的前端保守边界；第 7 至 8 节是待相关成员确认和实现的建议。新字段、幂等与快照能力不能因为出现在前端类型或样例中就记为后端已支持。

## 1. 基线与失败归属

上轮实跑前端 88 项测试：71 通过、17 失败，分布在 5 个文件；本轮源码核对不重复计作一次实跑。以下数量来自开工实跑结果，原因另经源码核对。

| 文件 | 失败数 | 源码核对结果与处理归属 |
| --- | ---: | --- |
| `frontend/src/pages/WelcomePage.test.tsx` | 2 | 旧断言仍找“起点 / 终点 / 留学生公寓 / 查看预设路线”；当前页面是可选点位、“选择起点 / 选择终点 / 学生公寓区 / 查看路线”。A 更新为点位选择、端点参数和禁用同点位的行为测试。 |
| `frontend/src/pages/RoutePreviewPage.test.tsx` | 1 | 异步请求未结束即同步查找“进入地图”；旧自动演示断言同时与 A02 明确进入演示的目标冲突。A 用等待结果、明确演示、重试和竞态测试替代过时假设。 |
| `frontend/src/test/smoke.test.tsx` | 11 | 多数场景共用旧 CTA“查看预设路线”，在进入流程前就失败，不能据此判断通勤 API 自身失败。A 先修入口选择器，再按实际受限能力验收。 |
| `frontend/src/features/map/MapSurface.test.tsx` | 2 | 热点旧名称“查看热力点 cell-1”和纯色样式断言与当前“热力点 压力100 NOISE”、渐变热点实现不一致。C 核对地图展示与可访问名称契约。 |
| `frontend/src/features/map/viewport.test.ts` | 1 | 旧蓝到红颜色断言与当前绿、黄、红映射不一致。C 确定展示口径并更新有意义的颜色边界断言。 |

不得通过删除断言、跳过测试或恢复过时文案来掩盖流程错误。当前后端记录为 39 项通过、5 项 PostGIS 测试因 Docker 环境不可用而跳过；本次接口源码核对不改变该验证结论。

## 2. 当前路线与来源接口

`POST /api/v1/routes/compare` 接收：

```json
{
  "origin": { "longitude": 120.27351, "latitude": 31.475328 },
  "destination": { "longitude": 120.274319, "latitude": 31.483275 }
}
```

比较入口的 `X-Device-Id` 目前可选；A 的请求层始终提供设备标识，便于读取同设备历史。响应当前只有以下字段：

```json
{
  "routes": [
    {
      "id": "route-fast",
      "label": "最快路线 A",
      "distanceMeters": 850,
      "durationSeconds": 600,
      "stressExposure": 68,
      "stressScore": 51,
      "confidence": 0.72,
      "fastest": true,
      "leastStressful": true,
      "polyline": [
        { "longitude": 120.27351, "latitude": 31.475328 },
        { "longitude": 120.274319, "latitude": 31.483275 }
      ]
    }
  ],
  "fastestRouteId": "route-fast",
  "leastStressfulRouteId": "route-fast",
  "recommendation": "当前样本不足以稳定推荐绕行，建议先选择最快路线并继续反馈。",
  "recommendAlternative": false
}
```

此样例只说明一条路线的数据形状，不表示当前提供器稳定产出该样例。`RouteComparison` 没有 `comparisonId`、来源、评分状态、快照有效期或评分版本字段。`ScoredRoute` 的评分字段当前都是数值，后端没有以 `null` 或状态区分无评分和有效零分。

`RouteComparisonService.getCandidates` 在高德 Key 未配置或高德调用抛异常时，静默使用 `MockRouteProvider`。其中两条模拟路线携带固定演示暴露值，评分器给出 `confidence = 0.72`。因此 HTTP 成功、正数置信度、路线 ID、推荐文案和存在折线均不能证明路线或评分真实；前端不能凭这些值猜测来源。

当前空候选还会在最短耗时计算处抛异常，不能把“后端暂未正确支持空路线”误写为“前端已联调空路线”。A 可通过受控响应测试零条、单条、多条和异常结构；B01/B02 提供真实响应后补联调。

核对依据：`RouteComparison.java`、`ScoredRoute.java`、`RouteComparisonService.java`、`MockRouteProvider.java`、`WeightedStressRouteScoringStrategy.java`。

## 3. 当前通勤接口：无快照和幂等支持

`POST /api/v1/commutes/complete` 要求 `X-Device-Id`。当前 `CommuteCompleteRequest` 仍为旧版客户端评分模型：

| 字段 | 当前约束与含义 |
| --- | --- |
| `routeId`, `routeLabel` | 必填非空字符串，由客户端提交 |
| `endStressLevel` | 必填；业务层只接受 0、25、50、75、100 |
| `durationMinutes` | 必填整数，1 至 600；不是服务端预计秒数 |
| `selectedScore`, `fastestScore` | 必填，0 至 100，由客户端提交 |
| `alternativeLabel` | 可空字符串 |
| `alternativeScore` | 可空，存在时为 0 至 100 |
| `alternativeDurationRatio` | 可空，存在时至少为 1 |
| `confidence` | 必填，0 至 1，由客户端提交 |
| `completedAt` | 可空时间；省略时使用服务端当前时间 |

响应 `CommuteRecord` 包含 `id`、`deviceHash` 和上述业务字段；可选替代路线字段返回 `null`，`completedAt` 为时间字符串。

**当前请求与响应均无 `comparisonId` 或 `operationId`。** `CommuteService.complete` 每次生成新的 `UUID` 并直接调用 `repository.save`。内存仓储追加记录，JDBC 仓储插入记录；没有按设备与操作 ID 查重、并发幂等约束、同 ID 不同内容冲突、快照读取、设备归属或过期校验。

客户端单击锁、禁用按钮、本地保存操作 ID 或把新字段加入 JSON，均不能让该接口获得幂等语义。响应超时可能发生在服务端已保存之后，重新 POST 可能增加第二条记录。历史条目的 `id` 也不是已约定可用于完成通勤的 `comparisonId`。

原前端把 `durationSeconds / 60` 四舍五入为分钟，少于 30 秒可得到 0，现接口会拒绝；D02 的预计秒数方案完成后才能验收不足一分钟的真实通勤。

核对依据：`CommuteCompleteRequest.java`、`CommuteController.java`、`CommuteRecord.java`、`CommuteService.java`、`MemoryCommuteRecordRepository.java`、`JdbcCommuteRecordRepository.java`。

## 4. 当前报告、热力与错误结构

`POST /api/v1/reports` 要求 `X-Device-Id`，请求示例：

```json
{
  "location": { "longitude": 120.27351, "latitude": 31.475328 },
  "stressLevel": 50,
  "tag": "NOISE",
  "reportedAt": "2026-10-18T07:00:00Z"
}
```

`stressLevel` 只接受五档压力值；当前标签仅 `NOISE`、`CROWD`、`SUN`、`ODOR`、`OTHER`。`reportedAt` 可省略，存在时限制在服务端当前时间前 24 小时至后 5 分钟。安静、树荫等新标签尚未进入当前 Java 枚举，不能仅在前端加选项后直接提交。

| HTTP | 当前 JSON | A 的处理语义 |
| --- | --- | --- |
| 201 | `{"status":"created","message":"情绪反馈已加入热力图。"}` | 已新增，写入完成后刷新最近有效视口；刷新失败单独提示。 |
| 409 | `{"status":"duplicate","message":"五分钟内已提交过附近路段。"}` | 已有附近报告，本次不是新增；展示重复结果，不自动重发报告。 |
| 429 | `{"timestamp":"...","status":429,"code":"rate_limited","message":"..."}` | 达到限制，保留草稿并显示原因，不自动重试写入。 |
| 400 | `{"timestamp":"...","status":400,"code":"invalid_request","message":"..."}` | 参数或业务校验失败，保留草稿并显示原因。 |
| 500 | `{"timestamp":"...","status":500,"code":"internal_error","message":"服务暂时不可用，请稍后重试。"}` | 服务错误，写入不自动重试。 |

409 报告重复体没有 `code`，字符串 `status` 也不同于异常体中的数值 `status`。仅识别已验证为报告重复的 `409 + status=duplicate`；不能把所有 409 都当报告重复成功。当前限频为每设备一分钟 10 次尝试，重复报告也先经过限频；没有约定 `Retry-After`。

网络失败、超时与调用方主动取消没有服务器 JSON。A01 在客户端分类；页面主动取消不显示失败提示。HTTP 失败、业务失败、格式错误要保留区别。HTML、畸形 JSON、缺必要字段及非有限数字由前端响应检查拒绝；POST 均不自动重试。

热力读取为 `GET /api/v1/heatmap?bbox=west,south,east,north&zoom=16&hours=168`，返回 `HeatmapCell[]`，字段为 `cellId`、`center`、`score`、`confidence`、`count`、`dominantTag`。A 在报告后刷新此 GET；`POST /api/v1/heatmap/refresh` 是独立的持久缓存刷新入口，本轮不将其混入每次报告写入流程。

当前报告时间空间去重不等于通勤操作幂等；memory 与 JDBC 去重边界、并发结果仍由 D04 对齐。

核对依据：`ReportRequest.java`、`ReportController.java`、`ReportService.java`、`ReportRateLimiter.java`、`ApiExceptionHandler.java`、`HeatmapController.java`。

## 5. 当前趋势与历史接口

`GET /api/v1/commutes/trends?days=7&timezone=Asia%2FShanghai` 要求 `X-Device-Id`；`days` 允许 1 至 30，默认 7，时区默认 `Asia/Shanghai`。当前完整响应含 `summary`，旧前端类型尚未表达该字段：

```json
{
  "points": [
    { "date": "2026-10-17", "averageStress": null, "commuteCount": 0 },
    { "date": "2026-10-18", "averageStress": 50, "commuteCount": 1 }
  ],
  "recommendation": "继续积累沿途反馈，当前优先选择最快路线。",
  "totalCommutes": 1,
  "summary": {
    "averageStress": 50,
    "stressDelta": null,
    "direction": "unknown",
    "sampleSufficient": false
  }
}
```

这里省略了其余日期；正常默认窗口预置 7 天。空日期的均值为 `null`，不是 0；总记录为空时 `summary.averageStress`、`stressDelta` 都为 `null`。方向字符串为 `unknown / improving / worsening / stable`；至少 3 条记录才令 `sampleSufficient=true`。旧响应没有 `summary` 时按缺失处理，不能虚构均值或趋势。

当前仓储按 `Instant.now() - days` 读取滚动时间窗，服务再按所选时区归日并 `computeIfAbsent` 添加日期；这与严格的本地自然日窗口不完全等价，可能产生窗口外的额外日期。D05 需确认自然日范围、时区与未来时间限制，A 不擅自裁掉记录后宣称已修后端口径。

`GET /api/v1/routes/history?limit=10` 要求同一设备标识，`limit` 为 1 至 50。结构样例：

```json
[
  {
    "id": "c94c5930-44cd-4a6b-bbf9-f7d9a4fa3df9",
    "origin": { "longitude": 120.27351, "latitude": 31.475328 },
    "destination": { "longitude": 120.274319, "latitude": 31.483275 },
    "result": {
      "routes": [],
      "fastestRouteId": "",
      "leastStressfulRouteId": "",
      "recommendation": "",
      "recommendAlternative": false
    },
    "createdAt": "2026-10-18T07:00:00Z"
  }
]
```

示例 `result` 为空结构仅用于说明字段，不代表当前后端已能生成空路线历史。实际 `result` 是当时保存的完整 `RouteComparison`。JDBC 按 `createdAt` 倒序读取；非 postgres 的 `MemoryRouteQueryRepository.save` 当前为空实现，`findRecent` 恒返回 `[]`。所以 demo 模式空历史是当前实现限制，不能显示成网络失败。

历史项只恢复起终点后重新比较；历史内的评分、推荐、路线 ID 和条目 `id` 不直接成为当前可写通勤凭据。

核对依据：`TrendService.java`、`CommuteController.java`、`RouteController.java`、`RouteQueryHistory.java`、`JdbcRouteQueryRepository.java`、`MemoryRouteQueryRepository.java`。

## 6. A 本轮前端决定的保守边界

这些是 A 当前可以实现的前端行为，不表示后端共同契约已确认：

1. 缺少可信来源与评分状态的旧路线响应按“来源未确认”处理，允许查看几何与预计耗时，不把数值 0、旧布尔标签或正数置信度当有效真实评分。底图离线与后端失联独立管理。
2. 请求失败后先显示错误与重试，由用户明确进入匹配端点的演示；没有匹配演示数据就显示无演示路线。取消和旧响应不得触发演示回退。
3. **本轮关闭旧客户端评分通勤写入，显示等待服务端快照与幂等接口对接的原因。** 不构造假的 `comparisonId`、`operationId`，不把发送未实现字段当幂等接入，也不宣称 A04 完整验收完成。
4. 反馈能力由后端可用性和报告接口状态独立判断。离线底图不自动禁止真实报告；明确演示场景和后端不可用场景需要一致的禁用与解释，不能只禁一个按钮而保留另一个可写入口。
5. 报告新增、报告重复、写入失败、写入成功后刷新失败分别表达。保存成功后的重试按钮只重新查询热力图；报告写入不因刷新失败而再发。
6. 趋势和历史独立保存 `idle / loading / success / error`，其中成功再按数据区分空与非空；有旧数据刷新失败时保留旧数据并显示刷新警告。重试使用原查询参数；历史只恢复端点后重查。
7. 设备标识持久化失败时使用受控页面会话回退，提示刷新后归属可能丢失；身份变化后不恢复旧写入状态。可恢复的端点配置须带版本并校验。

## 7. 待 B、D 确认和实现的协议建议

前端临时可选字段名称 `routeSource`、`feedbackSource`、`scoringStatus` 只是 A 的兼容草案，**枚举、所在层级、缺失语义和服务端输出均未获 B/D 确认**。前端为展示样例预留可选类型，不视为生产接口已落实；未知或缺失值采用保守状态，最终以 B/D 实现和共同契约文档为准。

| 依赖任务 | 需要对方明确交付 | A 可提前完成 / 最终联调证据 |
| --- | --- | --- |
| B01 / B02 | 步行候选校验；零条、单条、异常来源响应；独立路线来源、反馈来源、评分状态，缺失与有效零分的语义 | A 提供取消、竞态、格式与空状态测试；真实与演示响应均须验证。 |
| B04 + D01 | 设备归属的比较快照；保存后返回有效标识、预计秒数、来源与评分版本；保存失败无有效标识；过期规则 | A 预留重新规划入口；最终验证快照缺失、过期、设备不符、demo 重启。 |
| D02 | 按设备与稳定操作 ID 原子幂等；同内容重复返回同结果，同 ID 不同内容明确冲突；拒绝演示通勤；从快照读取评分与预计秒数 | 完成后 A 才接入正式请求并复用操作 ID；必须实测并发重复和“已保存但响应丢失后重试”只增加一次。 |
| D03 | 真实统计来源过滤、正向新标签枚举与迁移、历史未知来源口径 | A 根据确认后的枚举接入选项；不得提前向旧后端发送新标签。 |
| D04 + C02 | 报告新增、重复、限频和失败的稳定结果；内存/JDBC 并发去重一致；草稿恢复与动画规则 | A 分开写入与 GET 刷新；C 保留失败草稿，重复结果不播放新增成功动画。 |
| D05 + C05 | 自然日与时区、空日期、旧记录兼容、来源筛选、预计时长与实际时长区别 | A 独立管理查询状态；C 图表保留缺口，不能以零填补未知日期。 |

D02 建议请求只包含服务端比较标识、选中路线 ID、五档用户感受、稳定操作 ID；客户端不提交可覆盖服务端评分的字段。具体命名、版本路径、状态码、重复响应与冲突错误码需 D 确认。操作 ID 在首次提交时建立，同一业务内容网络重试复用，新通勤新建；同 ID 的业务内容不能被静默更改。该段是待实现建议，不是当前 API 示例。

## 8. 与 C 最小 Props / 事件对接要求

以下为 A/C 并行开发要求，具体 TypeScript 签名由 A 维护公共类型并与 C 共同确认；不把建议签名写成 C 已实现能力。

| 对接位置 | A 提供 / C 回传 | 必须维持的行为 |
| --- | --- | --- |
| MapSurface 底图模式 | C 通过事件回传 `loading / amap / offline`；A 独立保存后端状态 | 离线底图不被当作后端离线；地图模式切换不重新创建通勤操作。 |
| 写入能力 | A 给出反馈 / 通勤各自的允许状态与原因，回调入口再检查同一规则 | 禁用状态与原因对用户可见；长按、显式按钮、通勤按钮不能绕过限制。 |
| 路线和评分展示 | A 提供选择 ID、来源 / 评分展示状态、端点与路线列表；C 回传所选 ID | 未确认来源、演示和缺评分不显示真实“最少心累”标签或占位零分；空/单路线正常。 |
| 反馈提交 | A 回调明确返回新增或重复结果；写入失败抛出可解释错误；刷新状态单独提供 | C 管草稿与坐标；失败保留面板；新增成功才显示新增动画；重复不能冒充新增。 |
| 地图视口 | C 保持有效 `bbox, zoom` 事件，A 保存最近有效值并负责查询 | 报告成功刷新最近视口；改变视口后的迟到结果不能覆盖当前显示。 |
| 趋势 / 历史 | A 提供数据、查询状态、错误、旧数据刷新警告和重试回调 | C 只显示不新增 API 请求；无记录、未查询、失败分别可见。 |
| 导航 | A 提供返回、修改端点、重新规划回调 | 更换端点后选中路线与旧结果清理；浏览器返回与页面返回一致。 |

上述是基线检查时的对接需求。成员 A 首批实现现已增加 `onModeChange`、`feedbackEnabled` 和 `Promise<void | { status: "created" | "duplicate" }>` 兼容回调；失败时保留草稿并显示错误，重复反馈不播放新增动画，能力失效时保留草稿并禁用提交。当前实现及其真实页面验收仍需 C 复核，不能把 A 的代码检查写为跨成员协议已确认。旧 `void` 返回仅作兼容，默认按创建成功处理，新接入应明确返回状态。

现有 `TrendPanel` 已有 `disabled`、`completing`、`error`、`trendRefreshWarning` 与用户压力 Props；仍需与 C 补齐禁用原因、查询状态和重试展示。完成通勤幂等、服务端评分与数据库校验必须由 D 的接口完成后联合验收。
