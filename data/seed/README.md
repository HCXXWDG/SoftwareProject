# Simulated Seed Data

本目录保存课程演示所需的模拟数据说明、固定种子规格与可复用的 API 响应快照。

## 约定

- 至少 500 条情绪反馈记录（`simulated=true`）。
- 坐标统一使用 GCJ-02。
- 不放置姓名、手机号、真实设备标识或连续定位轨迹。
- 随机生成器使用固定种子 `20260610`，保证三名成员得到相同测试结果。

## 文件说明

| 文件 | 用途 |
|------|------|
| `manifest.json` | 种子规格：聚类中心、设备哈希模式、联调 bbox 与路线 fixture |
| `route-comparison.demo.json` | 标准北京 demo 起终点下的路线对比响应（成员 C 离线参考） |
| `trend.demo.json` | `demo-browser` 设备的 7 日趋势示例（成员 A 面板参考） |

## 数据来源

- **demo Profile**：`backend/.../DemoDataInitializer.java`（H2 内存，启动时写入）
- **postgres Profile**：Flyway `V2__seed_simulated_data.sql`（PostGIS 持久化）

两者使用相同的 5 个聚类中心与 500 条报告规则，详见 `manifest.json`。

## 演示设备 ID

后端种子通勤趋势与路线历史绑定请求头：

```http
X-Device-Id: demo-browser
```

前端默认在 `localStorage` 生成随机 UUID，因此直接打开页面时趋势可能为空。联调验收请：

- 使用 `scripts/integration-smoke.ps1` / `scripts/verify-seed-data.ps1`（内含 `demo-browser` 检查），或
- 手动指定 `X-Device-Id: demo-browser` 调用趋势 API，或
- 先 `POST /api/v1/commutes/complete` 写入当前设备的通勤记录。

## 验证

后端启动后运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-seed-data.ps1
```

完整 API 链路验收：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/integration-smoke.ps1
```

OpenAPI 契约见 `docs/openapi.json`；在线文档：`http://localhost:8080/swagger-ui.html`。

成员 B 负责数据生成与导入脚本，成员 C 负责验证热力图和路线展示效果。
