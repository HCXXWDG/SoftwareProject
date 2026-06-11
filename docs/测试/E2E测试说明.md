# E2E 测试说明

## 覆盖范围

Playwright 核心链路位于 `frontend/e2e`，使用浏览器级 API Mock 验证：

- 地图启动和热力点渲染。
- 热力点详情浮层。
- 双路线覆盖层、图例和对比面板。
- 路线选择联动。
- 地图长按、反馈选择和提交。

测试默认不读取高德 Key，也不依赖本地后端或数据库，因此在 CI 中稳定使用离线地图。

## 本地运行

```powershell
cd frontend
npm ci
npx playwright install chromium
npm run test:e2e
```

单元测试与 E2E 使用不同文件命名：

- Vitest：`*.test.ts`、`*.test.tsx`。
- Playwright：`*.e2e.ts`。

## CI

`.github/workflows/e2e.yml` 在指向 `develop` 的 Pull Request 和 `develop`
推送时运行。检查名称固定为 `E2E CI`；失败时上传 Playwright HTML 报告、
截图和首次重试 trace。
