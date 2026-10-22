# 2026-10-22 组合候选与 C 后续交接

> 历史状态更新（2026-10-23）：本文保留上一轮组合与静态审计的原始记录，其中“待发布”“待验证”和 C 后续待办均是当时状态。该候选现已通过 [PR #76](https://github.com/HCXXWDG/SoftwareProject/pull/76) 由外部合入 `develop`（`3d83c3a7aa1dd8cc68f0ae44ff275d5e63b36633`）。C01–C05 的本轮实际整合与验证进度见[新记录](member-c-integration-20261023.md)；新增改动将另建独立草稿 PR，不再更新已合并的 #76。

日期：2026-10-22（Asia/Shanghai）。本文记录本轮独立草稿候选的组装范围，以及尚未纳入的 C 完整功能分支的静态审计结果。

## 本轮组合范围

以 [整合 PR #72](https://github.com/HCXXWDG/SoftwareProject/pull/72) 的固定树 `5f6f24217b95f282ee61f9c527706463e7f182de` 为基线，在独立目录组装以下增量：

| 来源 | 固定提交 | 本轮用途 |
| --- | --- | --- |
| A [#56](https://github.com/HCXXWDG/SoftwareProject/pull/56) | `d3ab44f` | 相对 #72 所含 A 旧提交的最新增量，包含共享全栈入口、通勤操作恢复及真实后端重启验收 |
| C [#73](https://github.com/HCXXWDG/SoftwareProject/pull/73) | `7849d2608f91af99927e199aadc16bd7376baf8f` | 两个地图测试文件的现行热点名称、渐变与配色断言 |
| D [#74](https://github.com/HCXXWDG/SoftwareProject/pull/74) | `eaecf4d` | 该 PR 的三文件增量，补充 V6 迁移、旧数据保留与重启验收相关内容 |
| 组合环境修复 | 以最终候选 diff 为准 | Android SDK / CI 入口修复，解决旧 SDK `tools` 包造成的环境失败；实际运行结果另列 |

#72 已含 B #67 `fb53530`、D07 #71 `5b0964b`，以及 A 旧提交 `6c2ca7c`。本轮不以完整成员分支覆盖这些现行契约，也不把 C73 的测试修复视作 C01–C05 全功能已整合。

正式通勤写入开关 `VITE_COMMUTE_RECORDING_ENABLED` 默认保持 `false`，仅隔离验收按测试配置显式开启。原成员分支和 `develop` 不在本轮修改范围；候选保持独立草稿，不自动合并、关闭原 PR，不绕过 required checks 或非作者评审。

远端组合提交计划保留 #72 与各来源的固定提交作为 parents，使原作者提交在历史中可追溯。组装树与来源需在发布前核对；本文不将提交计划写成已经完成的发布结果。

## C 完整分支后续待办

**下述问题来自尚未整体纳入的固定 C 分支源码，不表示本轮组合版本具有这些问题。** A 已实现部分 C01/C02 状态桥接和失败恢复，后续整合必须保留现行安全逻辑。C 的功能增量应独立修复、验证后再纳入；C73 只修复当前地图测试断言。

### C01：保留 A 的来源与可空评分检查

固定来源：[C01 #57，`b7bce14`](https://github.com/HCXXWDG/SoftwareProject/pull/57)。[RoutePanel.tsx 第 36 行](https://github.com/HCXXWDG/SoftwareProject/blob/b7bce14b4c6f7db209fd878822a142cd2db3c2bf/frontend/src/features/routes/RoutePanel.tsx#L36) 仅以 `scoringStatus === "valid"` 决定显示，第 89/95 行直接对 `stressExposure/stressScore` 调用 `Math.round`。接入当前 nullable 类型时需要窄化；不能通过补 0 或强制类型转换处理缺值。

后续处理：保留 A 的 `routePanelPresentation` 来源适配，以及真实来源、两项评分非空且有界的检查。合法真实 0 应显示；缺失评分、演示来源和未知来源不得显示舒适标签。C 的环境指数展示可作为单独增量接入，共用上述可信评分条件。不要整体采用旧 RoutePanel 覆盖 A 的保护。

### C02：合并恢复提示时保留现有草稿保护

固定来源：[C02 #58，`6de82d6`](https://github.com/HCXXWDG/SoftwareProject/pull/58)。A 已具备失败保留草稿、禁用提交、重复结果不播放新增动画等逻辑，C02 剩余主要是反馈面板内嵌错误和重复提示。

后续处理：保留 A 的反馈状态隔离、提交期间保护和禁止长按覆盖现有草稿；合并 `submissionEnabled/error/isDuplicate` 时统一提示位置，避免重复提示。取消或重新打开面板时清除上一轮错误/重复标记；不能把 C01 的 finally 清草稿路径覆盖回来。

### C03：显式反馈入口需修正地图中心读取

固定来源：[C03 #59，`4653727`](https://github.com/HCXXWDG/SoftwareProject/pull/59)。[MapSurface.tsx 第 334–338 行](https://github.com/HCXXWDG/SoftwareProject/blob/46537275734ef17b9d9edf88f4683e4f27c3db71/frontend/src/features/map/MapSurface.tsx#L334) 读取 `adapter.getViewport().bounds`，但该固定分支的 [MapViewport](https://github.com/HCXXWDG/SoftwareProject/blob/46537275734ef17b9d9edf88f4683e4f27c3db71/frontend/src/features/map/viewport.ts#L15) 只有 `bbox/zoom`，因此这一入口与类型不兼容。分支还解构了其 Props 未声明的 `feedbackEnabled/onModeChange`，需要承接 C01/A 的现行接口。

后续处理：使用地图容器中心像素经已有 `unprojector` 得到坐标，检查校园范围和反馈可用状态，不访问不存在的 `bounds`，不以硬编码坐标代替当前地图中心。默认离线底图场景的显式入口也应明确验收。QUIET/SHADE/OPEN 的后端枚举与 V5 迁移依赖已在 #72 中具备；前端按钮应保留中文与完整 emoji，避免引入 #59 中损坏的部分 emoji。

### C04：动态可聚焦元素与实际弹层边界

固定来源：[C04 #60，`fa39476`](https://github.com/HCXXWDG/SoftwareProject/pull/60)。[FeedbackPanel.tsx 第 66–92 行](https://github.com/HCXXWDG/SoftwareProject/blob/fa3947619b927ba7c95e90e5bb6ef67b221817a2/frontend/src/features/map/FeedbackPanel.tsx#L66) 仅挂载时读取可聚焦元素。提交按钮最初 disabled，选完档位与标签后虽变为 enabled，旧循环仍从最后原因按钮绕回关闭按钮，键盘无法正常到达提交按钮。

后续处理：每次 Tab 时重新查询实际可用元素，处理无元素情况，并在关闭后恢复入口焦点。保留 `submissionEnabled` 和提交中不可取消的约束；验证键盘选值后可到达提交按钮、Shift+Tab 正常循环，以及忙碌状态。

另有 [MapSurface.tsx 第 241 行](https://github.com/HCXXWDG/SoftwareProject/blob/fa3947619b927ba7c95e90e5bb6ef67b221817a2/frontend/src/features/map/MapSurface.tsx#L241) 使用固定 240×280 估计弹层尺寸。新增 8 标签、错误提示和换行后尺寸会变化，简单向左翻转也可能越过左边界。应测量实际弹层并夹紧到容器范围，验证 390/320px、四角、错误文案及完整标签场景。

### C05：缺失日期断线与 A 查询状态接入

固定来源：[C05 #61，`1431b15`](https://github.com/HCXXWDG/SoftwareProject/pull/61)。[TrendPanel.tsx 第 57–69 行](https://github.com/HCXXWDG/SoftwareProject/blob/1431b1548fc4572a776b9dad308b460009f57373/frontend/src/features/trends/TrendPanel.tsx#L57) 先过滤 `averageStress === null` 的点，再按有效点数量计算 X 间隔并整体连线。`有效/null/有效` 会跨缺失日连接并压缩时间轴，与 PR 所写“不跨缺失段误连”不符。

后续处理：保留完整日期在 X 轴的位置，遇 null 重置线段，下一个有效点使用 `M`；添加缺失段、全空、单点、真实 0 的路径断言，保持图表与表格口径一致。七日趋势数据不得因画图补 0。

C05 的可选 `onRefresh/loading` Props 与 A 类型兼容，但当前 App 已有独立刷新、首次加载、错误和保留旧值状态。若采用 C 的刷新按钮，接入 `() => { void reloadTrends(); }`，加载条件使用 `trends.status === "loading" || trends.refreshing`，确定唯一刷新入口，避免双按钮。首次失败且无 trend 时仍需保留 A 的恢复入口。通勤写入继续由 A 的独立完成面板负责，不重新接回 TrendPanel 中的旧写入按钮。

## 本轮候选验证结果

10月22日开始组装，10月23日完成下列本机验证。组装前各原 PR 的通过记录不计为本候选通过；云端结果在独立草稿 PR 中按固定被测提交记录：

| 检查 | 当前结果 |
| --- | --- |
| 固定来源、组合树与作者历史核对 | 本机基线树严格等于#72 `e90f580`；应用A/C73/D74及D的SDK单提交`95001cf`；发布将逐项核对测试树并保留来源parents |
| 前端全量单测及 TypeScript / Vite / PWA 构建 | 464/464、零跳过；生产构建和全部integration/config类型检查通过 |
| 受控浏览器与PWA | Chrome 33/33、PWA 5/5，均1worker、0重试；实际SW控制与离线壳，不缓存API |
| 后端测试、迁移与实际执行/跳过统计 | 本机JDK21离线verify成功：218项，200通过、18项因无数据库/Docker跳过；不把跳过记为通过，云端守门要求全部实际执行 |
| 共享全栈浏览器与实际后端重启恢复 | 共享收集范围4项/2文件，组合后端完整流程待云端；本机使用组合版自身JAR的实际服务重启1/1通过，两次原请求404且不换号 |
| 云端 required checks 与 Android APK 验证 | 待执行 |
| 独立草稿 PR 与固定被测提交 | 待发布后补充 |

数据库“重启”用例关闭连接后重建连接与仓储，不等价于真实Spring或PostgreSQL进程重启；独立浏览器重启用例真实停止并重启内存demo Java服务，不等价于Postgres持久化重启。真实高德、Android真机、完整C功能分支、实际30分钟TTL与生产部署仍待验收。

本机命令：前端`npm test -- --reporter=json --outputFile=../.tmp/integration-unit-results.json`、`npm run build`、`npm run test:e2e:integration -- --list`、Chrome下`npm run test:e2e -- --workers=1`、`npm run test:pwa -- --workers=1`、`npm run test:e2e:member-a-restart`（MEMBER_A_D07_BACKEND_DIR明确指向本组合版backend）；后端`mvnw.cmd -o -f backend/pom.xml verify`。产物和真实环境配置保持忽略，不提交。
