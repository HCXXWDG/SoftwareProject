# E2E 测试说明

## 覆盖范围

Playwright 测试位于 `frontend/e2e`，分为两层。

Mock E2E 使用浏览器级 API Mock 验证：

- 地图启动和热力点渲染。
- 热力点详情浮层。
- 双路线覆盖层、图例和对比面板。
- 路线选择联动。
- 地图长按、反馈选择和提交。

Full-stack E2E 不拦截 `/api/v1`，验证：

- 热力图、路线对比和趋势请求真实到达 Spring Boot demo Profile。
- 返回数据驱动地图热力点、路线面板和路线选择状态。
- 长按反馈真实提交并返回 `201 created`。
- 用户选择结束压力后真实提交完成通勤，首次记录返回 `201 created`；同一
  `operationId` 重放返回 `200 duplicate`（趋势不重复计数），同一 `operationId`
  但业务内容不同返回 `409 conflict`。
- 完成通勤后再次请求趋势，并在页面显示更新后的通勤次数。

其中「热力图非空」和「完成通勤返回 201」两条断言是后端契约的守门人，注释里写明了
它们各自防的是哪个回归，请勿在没有对应后端改动的情况下放宽。

两层测试默认不读取高德 Key，地图使用离线模式。Mock E2E 用于快速定位
前端回归，Full-stack E2E 用于发现代理、CORS、请求头和接口契约问题。
两份 Playwright 配置会为测试启动的 Vite 显式清空高德环境变量，避免本地
`.env.local` 影响测试可复现性。

## 本地运行

```powershell
cd frontend
npm ci
npx playwright install chromium
npm run test:e2e
```

Full-stack E2E 使用项目文档约定的 `http://localhost:5173`，需先启动
`http://localhost:8080` 的 demo 后端：

```powershell
cd backend
.\mvnw.cmd spring-boot:run

# 另一个终端
cd frontend
npm run test:e2e:integration
```

单元测试与 E2E 使用不同文件命名：

- Vitest：`*.test.ts`、`*.test.tsx`。
- Mock Playwright：普通 `*.e2e.ts`。
- Full-stack Playwright：`*.integration.e2e.ts`。

## CI

`.github/workflows/e2e.yml` 在指向 `develop` 或 `main` 的 Pull Request
和两条分支推送时运行，检查名称固定为 `E2E CI`。

`.github/workflows/fullstack-e2e.yml` 启动后端并运行真实链路，检查名称固定
为 `Full-stack E2E`。失败时上传 Playwright HTML 报告、截图、首次重试
trace 和后端日志。

`E2E CI` 与 `Full-stack E2E` 均为 `develop` 和 `main` 的 required
checks。

## 后端数据库验收集成测试（D06）

Playwright 覆盖的是浏览器到接口这一段；「全新建库、旧库迁移、并发幂等、归属校验」
四类需要真实 PostgreSQL + PostGIS 的检查放在后端，位于
`backend/src/test/java/com/example/commutemood/integration/`：

| 类 | 覆盖内容 |
| --- | --- |
| `DatabaseMigrationAcceptanceTest` | 空 schema 一次迁移到 V5、停在 V3 的老库升级后历史行不丢、重复迁移是空操作 |
| `CommutePersistenceAcceptanceTest` | 12 线程并发重放同一 `operationId` 只落一条、跨设备用同一 `snapshotId` 一律 404、快照过期返回 410、同 `operationId` 换路线返回 409 |
| `PostgisIntegrationTest` | 热力图、路线对比、趋势、反馈去重在真实库上的基本链路 |

这些测试的取库顺序由 `IntegrationDatabase` 决定：

1. 若设置了 `COMMUTE_TEST_JDBC_URL`（或 `-Dcommute.test.jdbc.url`），用它；
2. 否则若本机有 Docker，启动 `postgis/postgis:16-3.4` 容器（CI 走这条路）；
3. 两者都没有时整类**跳过**。

**跳过不等于通过。** 按任务书 D06 的口径，环境缺失导致跳过的检查在验收记录里只能
写「未运行」，不能写「通过」。

隔离方式是 schema 而不是 database：项目约定的 `commute` 角色没有 CREATEDB 权限，
所以每个测试类用一个一次性 schema（通过 JDBC 的 `currentSchema` 参数排在 `public`
之前），测试结束后整体 `DROP SCHEMA ... CASCADE`。这样既能验证「从空库开始建表」，
又不会碰到 `public` 里开发者自己的真实数据。

本机已有 PostgreSQL + PostGIS、但没有 Docker 时这样跑：

```bash
cd backend
COMMUTE_TEST_JDBC_URL="jdbc:postgresql://localhost:5432/commute_mood" \
COMMUTE_TEST_JDBC_USERNAME=commute \
COMMUTE_TEST_JDBC_PASSWORD=commute_dev_password \
  ./mvnw -o -Djacoco.skip=true \
  -Dtest='DatabaseMigrationAcceptanceTest,CommutePersistenceAcceptanceTest' test
```

PowerShell 下改用 `$env:COMMUTE_TEST_JDBC_URL="..."; .\mvnw.cmd ...`。
`-Djacoco.skip=true` 是必需的：JaCoCo 0.8.13 读不懂 JDK 26 编译出的 class 文件。

