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

访问 `http://localhost:5173`。后端 Swagger UI 位于 `http://localhost:8080/swagger-ui.html`。

## 生产式启动

1. 安装 Docker Desktop。
2. 复制 `.env.example` 为 `.env` 并填写高德 Key 和随机盐。
3. 执行：

```powershell
docker compose -f infra/compose.yml --env-file .env up --build
```

访问 `http://localhost:5173`。

## Profile

- 默认 `demo`：内存数据、模拟候选路线，适合开发与答辩。
- `postgres`：PostGIS、Flyway、高德 Web Service；未配置高德 Key 时仍回退模拟路线。

## 仓库协作

- `main`：可发布版本
- `develop`：日常集成
- `feature/*`、`fix/*`、`docs/*`、`release/*`：短生命周期分支
- 所有修改通过 Issue、PR、CI 和至少一名成员评审进入保护分支

详细说明见 [docs/工程实施手册.md](docs/工程实施手册.md)。

