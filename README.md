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

## 集成联调

前后端本地联调时，按以下顺序启动：

```powershell
# 终端 1：后端 demo 模式
cd backend
.\mvnw.cmd -s .mvn/settings-cn.xml spring-boot:run

# 终端 2：前端
cd frontend
npm install
npm run dev
```

前端默认通过 Vite 代理把 `/api` 转发到 `http://localhost:8080`，无需额外配置 CORS。若直接指定 API 地址，可在项目根目录复制 `.env.example` 为 `.env` 并设置 `VITE_API_BASE_URL=http://localhost:8080`。

联调验收链路：

1. 打开 `http://localhost:5173`，地图加载热力图。
2. 长按地图提交 emoji 反馈，后端返回 `201`。
3. 选择起终点，触发路线对比，返回双路线结果。
4. 完成通勤后，趋势面板显示七日数据和次日建议。

后端健康检查：`GET http://localhost:8080/actuator/health`。接口契约见 [docs/团队协作与接口约定.md](docs/团队协作与接口约定.md)。

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

后端 Swagger UI 位于 `http://localhost:8080/swagger-ui.html`。前端通过 `VITE_API_BASE_URL` 或 Vite 代理访问 API。

## Profile

- 默认 `demo`：内存数据、模拟候选路线，适合开发与答辩。
- `postgres`：PostGIS、Flyway、高德 Web Service；未配置高德 Key 时仍回退模拟路线。

## 团队协作与文件同步

### 分支用途

- `main`：保存经过验收的发布版本，不直接开发。
- `develop`：团队日常集成分支。
- `feature/*`：功能开发，例如 `feature/amap-layer`。
- `fix/*`：缺陷修复。
- `docs/*`：独立文档修改。
- `test/*`、`ci/*`：测试和持续集成。

所有修改通过 Pull Request 合并到 `develop`，至少由一名非作者成员评审。阶段版本测试通过后，再由 `develop` 合并到 `main`。后端 PR 会通过 Backend CI 自动运行 Java 17 Maven verify，并上传 jar 与测试报告。

### 第一次获取项目

```powershell
git clone git@github.com:HCXXWDG/SoftwareProject.git
cd SoftwareProject
git switch develop
git pull --ff-only origin develop
```

如果本机尚未配置 GitHub SSH，可临时使用 HTTPS：

```powershell
git clone https://github.com/HCXXWDG/SoftwareProject.git
```

### 每次开始开发

先确保自己的工作已经提交，再同步 `develop`：

```powershell
git status
git switch develop
git pull --ff-only origin develop
git switch -c feature/具体任务
```

一个分支只完成一个明确任务，不要直接在 `main` 或 `develop` 上编写功能。

### 提交和上传

```powershell
git status
git add 要提交的文件或目录
git commit -m "feat: describe the completed feature"
git push -u origin 当前分支名
```

提交信息采用 Conventional Commits：

```text
feat: 新功能
fix: 缺陷修复
docs: 文档
test: 测试
refactor: 重构
ci: 持续集成
chore: 工程维护
```

推送后，在 GitHub 创建 `当前分支 → develop` 的 Pull Request。PR 必须写明修改内容、验证结果、接口变化、风险和界面截图（如适用）。

### 获取队友最新内容

队友的 PR 合并到 `develop` 后：

```powershell
git switch develop
git pull --ff-only origin develop
```

然后让自己的功能分支跟上最新集成内容：

```powershell
git switch feature/你的分支
git merge develop
```

若出现冲突，只修改冲突文件并确认程序仍能运行：

```powershell
git status
git add 已解决的文件
git commit
git push
```

不要使用 `git reset --hard`、强制推送或覆盖队友分支来解决冲突。

### 推送失败排查

提交保存在本地，`git push` 失败不会丢失代码。先确认：

```powershell
git log -1 --oneline
git status
```

网络或代理偶发断开时，重启代理或更换节点后重试：

```powershell
1..5 | ForEach-Object {
    git push
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep 3
}
```

禁止通过 `git config http.sslVerify false` 绕过证书校验。

更详细的职责边界、组件 Props 和 API 数据格式见 [团队协作与接口约定](docs/团队协作与接口约定.md)。
