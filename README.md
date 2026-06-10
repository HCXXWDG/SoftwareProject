# 城市通勤情绪地图

一个把“通勤是否心累”加入路线决策的课程软件工程项目。系统聚合用户对噪音、拥挤、暴晒和异味的反馈，生成情绪热力图，并对高德候选路线重新计算“心累指数”。

## 核心能力

- 冷静蓝到焦躁红的情绪热力图
- 地图长按 600ms 的 emoji 反馈
- “最快”与“少心累”双路线对比
- 七日通勤情绪趋势与次日路线建议
- 无 Key、无数据库时仍可完成课堂演示

## 技术栈

- 前端：React 19、TypeScript、Vite、高德 JS API 2.0
- 后端：Spring Boot 3.5、Java 17、JDBC、Flyway
- 数据：PostgreSQL 16、PostGIS 3.4
- 测试：JUnit、Mockito、Vitest、Playwright

## 快速启动：演示模式

演示模式不依赖 Docker、高德 Key 或数据库。

```powershell
# 终端 1
cd backend
.\mvnw.cmd spring-boot:run

# 终端 2
cd frontend
npm install
npm run dev
```

如果 Maven Central 连接不稳定，可临时使用仓库内的国内镜像配置：

```powershell
cd backend
.\mvnw.cmd -s .mvn/settings-cn.xml spring-boot:run
```

访问 `http://localhost:5173`。后端 Swagger UI 位于 `http://localhost:8080/swagger-ui.html`。

## 后端 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/v1/reports` | 提交通勤情绪反馈，需要 `X-Device-Id` |
| `GET` | `/api/v1/heatmap` | 查询指定 `bbox` 内的热力图格网 |
| `POST` | `/api/v1/heatmap/refresh` | 重新计算热力图，并在 postgres 模式写入 `emotion_cell` |
| `POST` | `/api/v1/routes/compare` | 对比候选路线，带 `X-Device-Id` 时记录查询历史 |
| `GET` | `/api/v1/routes/history` | 查询设备最近路线对比历史，需要 `X-Device-Id` |
| `POST` | `/api/v1/commutes/complete` | 记录一次完成的通勤，需要 `X-Device-Id` |
| `GET` | `/api/v1/commutes/trends` | 查询七日通勤趋势和次日建议，需要 `X-Device-Id` |

## 生产式启动

1. 安装 Docker Desktop。
2. 复制 `.env.example` 为 `.env` 并填写高德 Key 和随机盐。
3. 执行：

```powershell
docker compose -f infra/compose.yml --env-file .env up --build
```

后端 Swagger UI 位于 `http://localhost:8080/swagger-ui.html`。前端目录合入后，再由前端服务访问 API。

## Profile

- 默认 `demo`：内存数据、模拟候选路线，适合开发与答辩。
- `postgres`：PostGIS、Flyway、高德 Web Service；未配置高德 Key 时仍回退模拟路线。

## 仓库协作

- `main`：可发布版本
- `develop`：日常集成
- `feature/*`、`fix/*`、`docs/*`、`release/*`：短生命周期分支
- 所有修改通过 Issue、PR、CI 和至少一名成员评审进入保护分支
- 后端 PR 会通过 Backend CI 自动运行 Java 17 Maven verify，并上传 jar 与测试报告

详细说明见 [docs/工程实施手册.md](docs/工程实施手册.md)。

