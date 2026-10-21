# 成员 B B01–B05 验收记录

日期：2026-10-21。分支：`codex/member-b-route-correctness`。范围：[任务分工书](task-assignment.md) 的 B01–B05。

## 同步与实施记录

- 核对 GitHub `develop` 为 `d14ecbc`，最新任务分工在 PR #55 的 `codex/sync-latest-20261018` / `0d3da53`。
- 从最新 develop 新建独立分支，合入 D05 分支以消费 D01/D02/D03 的真实接口；依赖 PR 顺序为 #55 → #62 → #63 → #64 → #65 → B。本地同步不代表这些 PR 已合并。
- 沿用仓库现有 Java 17 编译目标、Spring Boot/JUnit/MockMvc/Mockito；本机运行时 Java 22.0.2。未增加生产依赖。
- 基线 `mvnw.cmd -o verify`：145 项，140 实际通过，5 项 PostGIS 因无 Docker 跳过，零失败。

| 任务 | 实施与证据 |
| --- | --- |
| B01 | walking 接口、3/5 秒超时、正整数和折线校验、端点吸附容差、单/无路线；AmapRouteProviderTest 20 项使用可控 HTTP 响应 |
| B02 | 来源与评分状态独立；真实报告默认过滤；空评分与有效 0 区分；HeatmapServiceTest 和 RouteComparisonServiceTest 覆盖真实/演示/混合/空数据 |
| B03 | 全路径累计采样；重复点、空路径、异常间隔、极值保护；GeoMathTest 8 项与评分测试，固定几何等价差值 ≤0.1 分 |
| B04 | 各原因分支、可解释差值、持久化成功后返回 snapshotId；RouteSnapshotFlowTest 由 compare 直接拿 ID，经 D02 完成/重放/归属校验 |
| B05 | clean verify、API 运行检查、OpenAPI、算法及接口说明；未运行项分列如下 |

## 本次实际运行

| 检查 | 结果 |
| --- | --- |
| `mvnw.cmd --batch-mode --no-transfer-progress clean verify` | 干净构建通过，193 项中 188 通过、5 跳过；JAR 与 JaCoCo 成功生成 |
| 补充 JDBC 链路后的 `mvnw.cmd -o --batch-mode --no-transfer-progress verify` | 最终 196 项，188 通过，0 失败，0 错误，8 项 PostGIS 因无 Docker 跳过 |
| [GitHub Backend CI](https://github.com/HCXXWDG/SoftwareProject/actions/runs/39563582970) | Java 17 + Docker：196/196 通过，0 失败、0 错误、0 跳过；PostgisIntegrationTest 5/5、PostgisRouteSnapshotFlowTest 3/3 |
| 提供器测试 | 20/20；单路线不补造、空 paths、坏耗时/折线、HTML/异常结构、传输超时、脱敏异常 |
| B 算法/服务测试 | 累计采样、0.1 分几何稳定、有效零分、无穷/NaN 热力数据、来源混入、全部推荐分支、保存失败与返回空 ID |
| B/D API 联调 | 3/3；真实受控路线 + 真实反馈 → compare ID → 30 秒通勤 201 → 同键重放 200 → 趋势只计 1；他设备 404；DEMO 422；无有效评分 400 |
| JSON 兼容 | 新快照来源/版本可序列化回读；旧快照缺来源读为 UNKNOWN，不冒充 REAL |
| `npm run build` | 成功，TypeScript、Vite 和 PWA 构建完成 |
| `npm test -- --reporter=dot` | 88 项，71 通过、17 失败；与 PR #55 记录一致，失败在原 WelcomePage、RoutePreviewPage、MapSurface、viewport、smoke，未跳过/删除断言 |

运行 JAR 于独立端口 18083，以 demo profile 且空高德 Key 验证：比较结果含 DEMO、UNAVAILABLE、DEMO_ONLY 和快照 ID；完成演示通勤返回 422；真实热力 0 单元、显式模拟热力 116 单元且全为 DEMO；OpenAPI 中可读 RouteComparison.snapshotId。验证后停止该测试进程。

## 明确未验证

- 本机未安装可用 Docker/本地 PostGIS，Testcontainers 跳过不计通过。已有 PostgisIntegrationTest 5 项，新增 PostgisRouteSnapshotFlowTest 复用 B/D 链路 3 项；真实库由 GitHub Backend CI 在有 Docker 的运行器验证，以实际日志为准。
- 没有使用真实高德凭据请求在线 walking 服务；官方文档核对和可控 HTTP 测试不等于真实服务权限、校园道路吸附验收。
- 没有把 A/C 尚未合并的分支混入本交付；共享 Mock/Full-stack/PWA/Android E2E 需由 D06 配合 A/C 在新契约下执行。本轮未宣称全项 CI 或整项目完成。

## PR 与跨成员检查

交付为 [PR #67](https://github.com/HCXXWDG/SoftwareProject/pull/67)，契约讨论为 [Issue #66](https://github.com/HCXXWDG/SoftwareProject/issues/66)。后端 CI 已确认真实 PostGIS 8 项均执行并通过，因此本机缺 Docker 不再阻塞 B/D 的存储联调证据；它仍不能代替真实高德在线权限验证。

其他检查保持独立记录：Frontend CI 仍为同步前已有的 17 个断言失败；Android APK Verification 在 `android-actions/setup-android@v3` 安装已移除的 `tools` SDK 包时失败，日志为 `Failed to find package 'tools'`。B 本轮不修改这些工作流或页面，PR 继续草稿，待 A/C 修复及 D06 联调后才能讨论发布。

## 风险、启动和回滚

服务启动沿用 `backend/mvnw.cmd spring-boot:run`。postgres 部署默认关闭模拟回退，配置 Web Service Key 后按真实步行服务工作；仅明确演示场景设置 ROUTE_DEMO_ENABLED=true。配置项详见[路线契约](member-b-route-contract.md)。不得把真实 Key 写入文档、提交或日志。

前端旧契约可能假设分数与 leastStressfulRouteId 必定存在，必须采用空值/状态分支；这也是保留草稿 PR、等待跨成员审查的原因。D02 已有的 legacy UNKNOWN 写入过渡被收紧为必须重新规划，旧记录读取仍兼容。

本轮不修改已执行的 V1–V5，不新增迁移、不改评分权重、不整理用户环境文件。回滚应关闭草稿 PR，合并后通过 revert 回滚 B 提交，保留 D 的先行快照和幂等功能。
