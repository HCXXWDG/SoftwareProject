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

两层测试默认不读取高德 Key，地图使用离线模式。Mock E2E 用于快速定位
前端回归，Full-stack E2E 用于发现代理、CORS、请求头和接口契约问题。

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

`.github/workflows/e2e.yml` 在指向 `develop` 的 Pull Request 和 `develop`
推送时运行，检查名称固定为 `E2E CI`。

`.github/workflows/fullstack-e2e.yml` 启动后端并运行真实链路，检查名称固定
为 `Full-stack E2E`。失败时上传 Playwright HTML 报告、截图、首次重试
trace 和后端日志。

两个工作流也在 `main` 的 Pull Request 和推送时运行。
