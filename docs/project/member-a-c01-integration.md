# 成员 A：C01 路线卡片状态对接

日期：2026-10-22。本轮继续PR #56，在上一轮 `1ae7f2e` 的相同文件树上推进；C01核对提交为PR #57的 `b7bce14b`。未合并C分支、改变PR目标或更新develop。

## 修复

C01 `RoutePanel` 接收小写 `routeSource=real/mock/unknown` 与 `scoringStatus=valid/insufficient/none`。B返回大写公共枚举；A原先未传这两个Props，合入C01后有效真实评分也会隐藏。

新增 `routePanelPresentation` 并由App传入：REAL→real、DEMO→mock、其余→unknown。只有REAL路线、REAL反馈、顶层VALID、非空路线以及完整有界评分、置信度和一致的路线状态才产生valid；不直接小写转换VALID。缺失或混合来源不能获得有效评分展示权限。

当前路线卡片支持C01同名Props并保持现有三列布局。默认无Props不显示评分；真实零分可以显示。行评分缺失、NaN、无穷或越界显示“评分待确认”，不补零或显示少心累标签。综合评分明确命名，避免解释成单纯环境指数；C01完整双指数展示仍由C后续实现。

来源提示与评分门槛共用同一判断。底图离线不自动隐藏已有可信评分，也不会因此开放通勤。新增App层测试验证进入地图后的0分、另一条路线分数、舒适标记、选择同步与通勤继续禁用。

## 本轮验证

| 检查 | 结果 |
| --- | --- |
| 构建 | TypeScript、Vite、PWA生成通过 |
| 全量Vitest | 353项，350通过、3项既有地图测试失败、0跳过 |
| A展示状态、预览和App定向测试 | 53/53通过 |
| 路线卡片测试 | 27/27通过 |
| 全量Mock浏览器 | 33/33通过，本机Chrome，1 worker、0重试，含390/412px及A的320px导航 |

前两组定向测试包含于全量353项中，不重复计数。失败仍为MapSurface两个旧热点名称，以及viewport原蓝红规格与当前配色不一致，未新增失败，也未删除或跳过。PWA独立5项及实际B后端浏览器1项沿用上一轮记录，本轮没有重跑；没有重新运行后端或数据库检查。

## 交接与剩余边界

- MapSurface的 `feedbackEnabled/onModeChange` 和反馈结果回调已与C01同名，不需额外大小写转换；RouteLegend没有来源Props。未修改地图渲染、事件、动画和配色。
- C01的旧RoutePanel内部 `Math.round` 未处理nullable公共类型，合入时须保留本轮空值窄化。C01旧MapSurface反馈结束即清草稿的路径也不能覆盖A已有失败保留逻辑；状态Props一致不等于整个C分支已联合验收。
- 本轮核对D #69固定头 `cc0efc27`：评分仍primitive double、存储列仍NOT NULL，来源解析仍TODO/UNKNOWN。D已经接下D07，但尚不能把计划当作Demo与无反馈通勤放行。
- D当前先检查快照再执行幂等保存。已写入但响应丢失的操作，过期后重试可能410；未来A不得将410解释为从未保存并自动换操作ID重新提交。稳定操作恢复仍需与D联合验收。
- #68仍开放，PR #56仍草稿。等待C统一地图测试、D完成可空存储与通勤放行，再完成联合验收；未批量合并或发布。

前一轮B契约与复跑方式见[A/B接入记录](member-a-b-contract-integration.md)。
