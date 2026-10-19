# 成员 A：B / C / D 接口复核与交接清单

2026 年 10 月 19 日更新：D 已提交待合并 PR #62–#65，A 的服务适配与隔离联调见 [新契约验收记录](member-a-contract-integration.md)。其中 D02 字段已收敛为 `snapshotId`，D04 重复为 200，D03 标签及 D05 自然日口径已有源码与 HTTP 证据；下文是 10 月 18 日交接基线，待确认栏继续保留，不能据此否认新分支的实现，也不代替 B/C/D 签收。

日期：2026 年 10 月 18 日。本文按本地当前源码复核，供 B、C、D 逐项填写结论；**全部跨成员确认栏均待确认，没有代替其他成员签收，也没有向其他成员发送消息。** 本文记录源码事实和验收要求，不新增后端能力，不替代真实 HTTP、数据库或浏览器验收记录。

关联材料：[准备书](member-a-preparation.md)、[接口核对](member-a-contracts.md)、[首批实施记录](member-a-worklog.md)、[分工书](task-assignment.md)。

## 1. A 已核对的事实

| 编号 | 当前实现事实 | 复核依据 |
| --- | --- | --- |
| F01 | 比较接口仍只返回 `routes`、`fastestRouteId`、`leastStressfulRouteId`、`recommendation`、`recommendAlternative`；Java DTO 无来源、评分状态、`comparisonId`、有效期或评分版本。 | `RouteComparison.java` |
| F02 | 高德未配置或调用异常时，服务仍自动返回 Mock 候选；正数置信度和 HTTP 200 不能证明真实来源。空候选在取最短耗时时抛异常。 | `RouteComparisonService.java` |
| F03 | 通勤请求仍由客户端提交评分和分钟数；每次完成都新建 UUID 保存，无快照归属、过期或操作 ID 去重。 | `CommuteCompleteRequest.java`、`CommuteService.java` |
| F04 | 前端 `tripCapabilities.canComplete` 固定为 `false`。仅在响应加 `comparisonId` 或解除按钮禁用，均不足以完成 A04。 | `frontend/src/config/capabilities.ts`、`App.tsx` |
| F05 | 前端来源和评分状态是可选兼容草案。缺失时可读取旧响应并保守展示；出现草案范围外枚举会被运行时验证器判为格式错误。当前评分字段仍必须为数值，不能直接改成 `null`。 | `types/index.ts`、`services/responseValidators.ts` |
| F06 | 反馈有两种写入结果：201 `created`、409 `duplicate`。其他 409 不能推定为重复成功。旧标签仅五种；通勤操作幂等与报告时空去重是不同能力。 | `ReportController.java`、`EmotionTag.java`、`services/report.ts` |
| F07 | MapSurface 已有 `onModeChange`、`feedbackEnabled`，反馈失败保留草稿，重复结果不播放新增动画；本轮还锁定已打开及提交中的草稿位置。接口核对文档第 8 节已同步当前适配状态。 | `features/map/MapSurface.tsx` |
| F08 | 当前趋势响应有 `summary`；公共 `TrendResult` 尚未声明它，服务层及验证器已兼容。内存路线历史保存为空实现，demo 历史恒为空；历史 ID 不是已确认的可写快照凭据。 | `TrendService.java`、`services/commute.ts`、`responseValidators.ts`、`MemoryRouteQueryRepository.java` |

F01—F08 是 A 的源码核对结果；本文未将既有测试数量记作本次重新运行结果。

## 2. 交给 B：路线、来源、评分与比较快照

当前 `POST /api/v1/routes/compare` 请求为 `{ origin: GeoPoint, destination: GeoPoint }`；`GeoPoint` 为 `{ longitude: number, latitude: number }`。比较接口的 `X-Device-Id` 当前可选，A 请求层始终携带。若生成设备专属快照，B/D 需确认缺头请求只能浏览还是直接拒绝。

当前 `ScoredRoute` 必需字段：`id: string`、`label: string`、`distanceMeters: int`、`durationSeconds: int`、`stressExposure: double`、`stressScore: double`、`confidence: double`、`fastest: boolean`、`leastStressful: boolean`、`polyline: GeoPoint[]`。前端要求数值有限、距离/秒数/暴露非负、评分 0—100、置信度 0—1、路线 ID 唯一；非空候选时两种选中 ID 必须指向现有候选。这是现有消费者约束，B01 对正数耗时、折线有效性的更严格校验仍由 B 落实。

以下字段名和枚举是**A 现有兼容草案或待定方案**，尚未成为共同契约：

| 复核项 | 字段 / 类型 / 草案值 | 主责与需确认的结论 | 验收条件 | 确认状态 |
| --- | --- | --- | --- | --- |
| B-01 路线来源 | 比较顶层 `routeSource?: "REAL" \| "DEMO" \| "UNAVAILABLE"` | B 主责；是否比较级即可表达混合候选；外部失败与无路线如何区别 | 高德异常不会冒充真实成功；默认端点外不套用无关演示折线 | 待 B |
| B-02 反馈来源 | 顶层 `feedbackSource?: "REAL" \| "DEMO" \| "NONE"` | B/D；混合、未知历史来源如何处理；统计过滤先在 D 实现 | 真实路线配模拟反馈不能展示真实有效评分或混入真实统计 | 待 B/D |
| B-03 评分状态 | 顶层 `scoringStatus?: "VALID" \| "INSUFFICIENT_DATA" \| "UNAVAILABLE"` | B；是否逐路线不同；有效零分、无评分的数值和状态组合 | 有效 0 与无评分可区分；无数据不显示舒适标签；变更 nullable 同步 A 验证器 | 待 B |
| B-04 推荐原因 | 前端仅预留 `recommendationReason?: string`，无已约定枚举 | B；原因代码、中文文案责任、无替代/差异不足/绕行过长/数据不足等分支 | 原因对应实际判定；“本次出行”不显示次日推荐文案 | 待 B |
| B-05 可用快照 | 顶层 `comparisonId?: string` 已在前端预留；标识格式、必需条件待定 | B04 生产，D01 保存与读取；保存失败、来源受限时是否省略 ID | 返回的可写 ID 已保存、与当前设备及结果对应；保存失败不得返回可写凭据 | 待 B/D |
| B-06 时效与版本 | `expiresAt: string`（ISO 8601）/ `scoringVersion: string` 为建议，名称和层级待定 | B/D；TTL、时钟口径、缺失语义；预计秒数保留在每条候选快照 | 版本与评分一致；客户端不会以历史结果或未知有效期替代当前快照 | 待 B/D |
| B-07 候选边界 | `routes: ScoredRoute[]`；空结果时 ID/原因/状态组合待定 | B01；零条、单条、重复 ID、异常折线的响应方案 | 零条正常表达或返回明确业务错误；单条不补假路线；异常数值不出接口 | 待 B |

交付样例要求：B 提供真实响应或可控服务响应，分别覆盖真实有效评分、真实但无有效评分、显式演示、零条、单条、外部超时、快照保存失败。每份标明运行配置与来源，示例数据不能计为真实外部服务联调成功。

## 3. 交给 D：通勤写入协议与恢复门槛

### 3.1 当前协议，只用于识别旧接口

`POST /api/v1/commutes/complete` 要求 `X-Device-Id`。当前请求约束：

| 字段 | 当前 Java 类型与约束 |
| --- | --- |
| `routeId`, `routeLabel` | `String`，非空白 |
| `endStressLevel` | `Integer`，必填；业务层仅接受 `0 / 25 / 50 / 75 / 100` |
| `durationMinutes` | `Integer`，必填，1—600 |
| `selectedScore`, `fastestScore` | `Double`，必填，0—100 |
| `alternativeLabel` | `String`，可空 |
| `alternativeScore` | `Double`，可空，存在时 0—100 |
| `alternativeDurationRatio` | `Double`，可空，存在时至少 1 |
| `confidence` | `Double`，必填，0—1 |
| `completedAt` | `Instant`，可空；省略时服务端取当前时间 |

当前响应是 `CommuteRecord`：新增 `id: UUID`、`deviceHash: string`，其余对应请求业务字段；可空字段可能因 Jackson NON_NULL 被省略。A 旧响应适配器将可空替代字段归一化为 `null`。此接口不能承担新通勤写入验收。

### 3.2 待 D 决定的新协议

| 复核项 | A 建议 / 必须明确的字段 | D 交付与验收条件 | 确认状态 |
| --- | --- | --- | --- |
| D-01 路径与版本 | 沿用或升级 `/api/v1/commutes/complete` 待定；旧客户端处置和切换窗口待定 | 旧请求不能绕过新快照验证继续写入可篡改评分；提供版本不匹配结果 | 待 D |
| D-02 最小请求 | `comparisonId: string`、`routeId: string`、`endStressLevel: 0\|25\|50\|75\|100`、`operationId: string` 为提议 | 明确是否还接收时间字段；评分、标签、来源、预计秒数从快照读取，客户端不能覆盖 | 待 D/B |
| D-03 幂等键 | 建议按设备身份 + `operationId` 唯一；格式、长度、保留期待定 | 首次、同内容重复、并发重复都返回同一记录；同键不同业务内容明确冲突；数据库原子约束与内存语义一致 | 待 D |
| D-04 操作生命周期 | A 首次明确提交时创建键，响应未知时保留键和原业务内容；新通勤新键 | 响应丢失后重试仅保存一次；身份改变不能沿用旧键；允许修改感受/路线的时机与重试方式明确 | 待 D/A |
| D-05 快照校验 | 归属、存在性、TTL、路线成员、真实来源与评分状态条件 | 设备不符、过期、重启后丢失、非候选 ID、演示来源均不能保存；未知评分的通勤是否允许须明确 | 待 D/B |
| D-06 预计秒数 | 建议 `durationSeconds: integer`，最终记录字段名待定 | 服务端取快照秒数；1—59 秒可保存；兼容历史分钟字段但不推断实际时长 | 待 D |
| D-07 成功响应 | 稳定记录 `id`；是否回显 `comparisonId`、`operationId`、来源和版本待定 | 明确首次/重复的 HTTP 状态和 JSON；A 新验证器可判断保存成功与记录一致 | 待 D |
| D-08 统计更新 | 同一写入只计一次；趋势/历史失败不影响已保存结论 | 写入成功后刷新失败只重试 GET；并发和丢响应重试后计数均只增 1 | 待 D/A |

待确认请求结构示意，**当前后端不支持，不应直接发送**：

```json
{
  "comparisonId": "服务端实际保存并返回的标识",
  "routeId": "该快照中的候选路线标识",
  "endStressLevel": 50,
  "operationId": "首次提交时生成并在同次重试中复用的标识"
}
```

D 需补齐以下**实际响应样例**，HTTP 与 `code` 目前均未约定，不以此表推断已实现：

| 样例场景 | D 应填写内容 | A 预期动作 |
| --- | --- | --- |
| 首次成功 / 同键同内容重复成功 | HTTP、完整记录字段与类型、是否区分重复 | 确认保存并刷新趋势；重复不新增计数 |
| 同键不同内容冲突 | HTTP、稳定业务 `code`、是否返回原记录 | 保留待解决内容；不自动新建键绕过冲突 |
| 快照缺失 / 过期 / 服务重启后失效 | 各场景 HTTP、稳定 `code`、可重试性 | 清理不可用写入上下文，提示重新规划 |
| 非归属 / 非候选 / 演示来源 / 无有效评分 | 各场景 HTTP、`code`，避免泄露其他设备记录 | 明确拒绝；不转换为旧接口写入 |
| 请求非法 / 内部错误 | HTTP 与统一异常结构；日志关联方式若已有则填写 | 保留用户感受；写入结果不明时保留原操作 ID |

### 3.3 恢复“完成本次通勤”的共同门槛

以下均须有证据后由 A 接入正式 DTO 和能力判断；当前全部仍待完成或联合复核：

- [ ] B/D 明确并产出可写快照：来源可信、设备归属、路线成员、预计秒数、版本和时效规则可验证。
- [ ] D 的内存及 JDBC 均能按设备 + 操作 ID 原子去重；并发重复、响应丢失重试只产生一条；同键异内容冲突可识别。
- [ ] 服务端读取评分与预计秒数并拒绝篡改、演示及无权快照；历史无来源数据有明确统计规则。
- [ ] D 提供正式请求/响应/错误样例；A 同步公共类型、运行时验证器、稳定操作上下文和取消/重试行为。
- [ ] C 复核禁用原因、提交状态、成功提示及感受保留；写入成功后查询失败只展示独立刷新警告。
- [ ] A/D 联调不足一分钟、重复点击、并发、服务已保存但响应丢失、快照过期、设备变化、写入成功但趋势失败；共享 E2E 由 D 汇总。

仅按钮锁、客户端随机 ID、HTTP 200、前端测试桩或一个可选 `comparisonId` 均不能满足恢复门槛。

## 4. 交给 C：现有 Props 与待复核交互

| 对接面 | 当前签名 / 行为 | C 需复核与验收 | 状态 |
| --- | --- | --- | --- |
| 底图模式 | `onModeChange?: (mode: "loading" \| "amap" \| "offline") => void` | A 独立存储 API 可用性；底图 offline 不等于后端离线；切换底图不创建通勤操作 | A 已核对；待 C |
| 反馈能力 | `feedbackEnabled?: boolean`，组件默认 `true`，App 显式传入 | 所有反馈入口使用同一能力；能力变为 false 后已打开草稿不能提交；恢复后可继续原草稿 | A 已核对；待 C |
| 反馈返回 | `onFeedbackSubmit(draft): Promise<void \| { status: "created" \| "duplicate" }>` | 当前 `void` 为旧回调兼容且会走新增动画；共同确认何时去掉 `void`。新增播放动画，重复不冒充新增，reject 保留坐标/输入/面板与错误 | A 已核对；待 C |
| 草稿类型 | `MapFeedbackDraft = { location: GeoPoint; stressLevel: 0\|25\|50\|75\|100; tag: EmotionTag }` | 显式按钮若新增应复用此草稿与提交入口；新标签须等 D 枚举和迁移 | 待 C/D |
| 视口 | `onViewportChange(bbox: string, zoom: number): void` | 持续回传有效范围；A 负责保存最近视口和 GET；旧请求结果不覆盖新视口 | A 已核对；待 C |
| 路线选择 | `selectedRouteId?: string`、`onRouteSelect(routeId): void` | 地图、卡片、预览的来源和无评分含义一致；空/单路线及返回重新规划不携带旧选择 | 待 C/A |
| 趋势状态 | hook 有 `idle/loading/success/empty/error`、`refreshing`、`refreshError`；TrendPanel 尚无独立查询状态/重试 Props | 共同确定由页面还是组件展示；无数据、未查、失败分开；旧数据刷新失败保留；缺失日期不补零 | 待 C/A |
| 通勤状态 | TrendPanel 有 `disabled`、`completing`、`error`、`trendRefreshWarning`、感受 Props；禁用原因现由 App 展示 | 原因可见且与能力一致；不会因失败刷新再次提交写入 | 待 C/A |
| 既有地图测试 | 上批记录剩余 3 项断言差异，涉及热点可访问名称、渐变和颜色 | C 决定产品语义再统一断言；不得删除/跳过掩盖失败；数量须以本轮实跑为准 | 待 C |

当前 `MapSurfaceProps` 没有单独的反馈禁用原因字段，App 负责显示原因；这不是已经确认的最终组件设计。C 若更改回调或展示边界，应由 A 同步公共类型与页面调用。

## 5. D 的报告、趋势与历史复核

| 编号 | 当前已核对的协议 | 待 D/C 复核的验收条件 |
| --- | --- | --- |
| D-09 报告结果 | 201 `{"status":"created","message":"情绪反馈已加入热力图。"}`；409 `{"status":"duplicate","message":"五分钟内已提交过附近路段。"}`。此两例来自当前控制器结构，不是本轮抓包。 | 内存/JDBC 并发去重一致；限频、参数错误与重复结果互不混淆；重复不计新增；POST 不自动重试 |
| D-10 错误结构 | 当前 400/429/500 为 `{ timestamp: string, status: number, code: string, message: string }`，代码 `invalid_request/rate_limited/internal_error`；报告 409 没有 `code` | 若统一格式，先保留旧重复判定或明确版本；约定 `Retry-After` 是否提供，缺失不得虚构倒计时 |
| D-11 标签 | `EmotionTag = NOISE/CROWD/SUN/ODOR/OTHER`；压力五档；`reportedAt?: Instant` 在当前时间前 24 小时至后 5 分钟 | 正向标签名称/枚举待定；Java 枚举、数据库约束/种子、前端类型/验证器、中文显示同时升级 |
| D-12 趋势 | `days` 1—30 默认 7；时区默认 Asia/Shanghai；`points[].averageStress` 空时 null 或省略；summary direction 为 `unknown/improving/worsening/stable`，至少 3 条才 `sampleSufficient=true` | 自然日起止、跨日、未来时间限制、排序、模拟/未知来源过滤；当前滚动时窗可能追加窗口外日期，不能宣称已自然日对齐 |
| D-13 历史 | `GET /routes/history?limit=10`，1—50；条目含 `id/origin/destination/result/createdAt`；A 仅取端点，随后重新 compare | 新旧记录缺字段仍可读；来源未知保持未知；demo 历史为空是仓储现状；新快照读取与历史 ID 关系由 D 明确 |

## 6. 建议兼容与联调顺序

1. **B/D 先填协议，C 复核 Props。** 确定来源/评分枚举、nullable 语义、快照与通勤版本、错误表；提供标注来源的 JSON 样例。跨成员结论写入 D 汇总契约，A 同步本清单状态。
2. **D 交付仓储和迁移基础。** 新增迁移，兼容历史未知字段，先有设备快照读取和来源过滤；B 通过仓储接口生产快照。内存和 JDBC 共享业务语义。
3. **B/D 交付可运行接口。** B 来源和快照输出与 D 幂等通勤连通；先验服务端归属、并发及超短路线，不能依赖前端按钮保护。
4. **A 适配类型和运行时检查。** 新枚举、null 评分、错误或新记录形状都必须同步消费者；旧响应继续按来源未知受限展示。未知枚举不会被当前验证器自动吞掉，需要明确升级策略。
5. **A/C 联调用户流程。** 保留感受与操作上下文，复用重试键；反馈/通勤保存与 GET 刷新分离；先受控失败，再真实 HTTP；最后按门槛恢复按钮。
6. **D 汇总集成证据。** 记录分支/提交、环境、真实与受控数据区别、通过/失败/未运行；PostGIS、真实地图来源或迁移未运行不可记为已通过。

## 7. 复核回填模板

由各负责人填写即可；空白表示尚未确认。

| 负责人 | 复核编号 | 结论：接受 / 调整 / 阻塞 | 最终字段、枚举、状态码或 Props | 代码提交 / 响应样例 / 验收证据 | 日期 |
| --- | --- | --- | --- | --- | --- |
| B | B-01—B-07、D-05 | 待填写 | 待填写 | 待填写 | 待填写 |
| D | D-01—D-13、B-02/B-05/B-06 | 待填写 | 待填写 | 待填写 | 待填写 |
| C | 第 4 节、D-09/D-11/D-12 展示 | 待填写 | 待填写 | 待填写 | 待填写 |
| A | 确认后的公共类型、验证器与页面接入 | 待填写 | 待填写 | 待填写 | 待填写 |

本次只形成可复核交接资料。新增功能、后端依赖完成状态与最终合并状态以实际代码、响应及共同验收记录为准。
