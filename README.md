# 城市通勤情绪地图

一个把“通勤是否心累”加入路线决策的课程软件工程项目。系统聚合用户对噪音、拥挤、暴晒和异味的反馈，生成情绪热力图，并对高德候选路线重新计算“心累指数”。

## 核心能力

- 冷静蓝到焦躁红的情绪热力图
- 地图长按 600ms 的 emoji 反馈
- “最快”与“少心累”双路线对比
- 七日通勤情绪趋势与次日路线建议
- 预设 Demo 起终点（北京西直门），无需手动选择
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

PostGIS/API 容器 + 前端本地启动。

1. 安装 Docker Desktop。
2. 复制 `.env.example` 为 `.env` 并填写高德 Key 和随机盐。
3. 启动 PostGIS 和后端 API 容器：

```powershell
docker compose -f infra/compose.yml --env-file .env up --build
```

4. 另开终端，启动前端开发服务器：

```powershell
cd frontend
npm install
npm run dev
```

访问 `http://localhost:5173`。

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

所有修改通过 Pull Request 合并到 `develop`，至少由一名非作者成员评审。阶段版本测试通过后，再由 `develop` 合并到 `main`。

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
