# 心途——通勤情绪地图

面向无锡梁溪区日常步行通勤的情绪地图。你可以在地图上自由选择起终点，查看高德步行路线，记录沿途对噪音、拥挤、暴晒等环境的感受。项目从校园场景扩展到城市街区，不再仅为校园服务；当前提供步行规划，不提供公交或驾车导航。

团队协作仓库：[HCXXWDG/SoftwareProject](https://github.com/HCXXWDG/SoftwareProject)。日常协作使用 `develop`，稳定版本使用 `main`；GitHub 默认分支为 `main`。

- [贡献与协作指南](CONTRIBUTING.md)
- [代码与功能优化启动书](docs/project/project-charter.md)
- [三至四人任务分工](docs/project/task-assignment.md)
- [成员工作量量化](docs/project/workload.md)
- [初始检查结果与已知问题](docs/project/initial-baseline.md)
- [成员 A 开发准备书](docs/project/member-a-preparation.md)
- [成员 A 实施记录与剩余依赖](docs/project/member-a-worklog.md)
- [成员 A 真实接口验收与修复](docs/project/member-a-acceptance.md)
- [成员 A 对 D 新契约的接入与验收](docs/project/member-a-contract-integration.md)
- [成员 A 对 B/C/D 的接口交接清单](docs/project/member-a-handoff-checklist.md)
- [开发任务入口](https://github.com/HCXXWDG/SoftwareProject/issues)（结合任务分工书确认任务与认领状态）

## 核心能力

- **自由选点**：在梁溪区地图范围内拖动选点并确认起终点；常用地点只是快捷入口，不限制为预设地点。
- **真实步行路线**：由项目后端调用高德 Web 服务，展示返回的路线、距离和预计用时。可用路线数量由高德结果决定；只有真实反馈和评分证据充分时，才显示“少心累”比较。
- **来源明确的情绪热力图**：默认查询真实反馈；暂无真实反馈时显示空状态，可主动切换“演示热力图”。模拟热力仅展示效果，不参与真实路线评分、真实趋势或通勤统计。
- **清晰的地图交互**：点击热力点有按下与选中反馈，详情卡对应所选位置；从热力点拖动仍可移动地图。通过“记录此处感受”确认地图中心位置并提交情绪及环境标签反馈。
- **七日趋势**：按日期展示有效通勤数据；缺少记录或有效评分时保留空缺、提示数据不足，不用 0 分补齐，也不将演示数据当作真实感受。
- **可区分的演示模式**：缺少 Key 时可明确启用演示路线或查看匹配的本地演示路线。演示不代表真实地图、真实道路规划或真实反馈覆盖。

## 地图范围

地图使用高德 GCJ-02 坐标，以梁溪区行政区数据的外接矩形作为浏览与选点范围，并非精确的行政边界围栏；矩形内可能包含相邻行政区的位置。边界来源与原始坐标保存在 [梁溪区行政区数据](data/geography/liangxi-amap-20261023.json)，常用地点核验数据保存在 [梁溪区地点数据](data/geography/liangxi-places-20261023.json)。扩大地图范围不代表整个区域已有真实反馈覆盖。

## 技术栈

- 前端：React 19、TypeScript、Vite、高德 JS API 2.0
- 后端：Spring Boot 3.5、Java 17（`backend/pom.xml` 编译目标及 Backend CI）、JDBC、Flyway
- 数据：PostgreSQL 16、PostGIS 3.4
- 测试：JUnit、Mockito、Vitest、Playwright

## 本地启动与高德配置

后端需要 JDK 17 或兼容的 JDK 21；本地也可使用 JDK 21 运行 Maven。Android 构建使用 JDK 21，不能据此将后端编译目标误改为 21。前端需要 Node.js 与 npm。

高德配置分为两组，分别用于底图与真实步行规划：

| 配置 | 位置 | 用途 |
| --- | --- | --- |
| `VITE_AMAP_JS_KEY` | `frontend/.env.local` | 高德 Web 端（JS API）Key，加载真实底图 |
| `VITE_AMAP_SECURITY_CODE` | `frontend/.env.local` | 上述 JS API Key 对应的安全密钥 |
| `AMAP_WEB_KEY` | 后端进程环境变量，或部署用根目录 `.env` | 高德 Web 服务 Key，由后端调用真实步行接口 |
| `VITE_API_BASE_URL` | `frontend/.env.local` | 可选 API 地址；本地留空时使用 Vite `/api` 代理 |

仓库根目录 `.env.example` 是配置模板。Vite 从 `frontend/` 读取环境文件；Spring Boot 本地启动读取进程环境变量，不会自动加载根目录 `.env`。不要把后端 Web 服务 Key 放入 `VITE_*` 变量。不要提交真实密钥或环境文件。

先在 `frontend/.env.local` 中填写：

```dotenv
VITE_AMAP_JS_KEY=你的Web端JSAPIKey
VITE_AMAP_SECURITY_CODE=对应安全密钥
VITE_API_BASE_URL=
VITE_COMMUTE_RECORDING_ENABLED=false
```

真实路线联调使用以下两个终端：

```powershell
# 终端 1：内存存储 + 真实高德步行，不允许演示回退
$env:SPRING_PROFILES_ACTIVE="demo"
$env:ROUTE_DEMO_ENABLED="false"
$env:AMAP_WEB_KEY="你的Web服务Key"
cd backend
.\mvnw.cmd spring-boot:run

# 终端 2
cd frontend
npm ci
npm run dev
```

访问 `http://localhost:5173`。前端默认通过 Vite 代理把 `/api` 转发到 `http://localhost:8080`。若直接设置 API 地址，需要将网页来源加入后端 `APP_CORS_ORIGINS`。修改前端环境变量后重启 Vite；Android 包需重新构建。

后端 Swagger UI：`http://localhost:8080/swagger-ui.html`；健康检查：`GET http://localhost:8080/actuator/health`。

若 Maven Central 连接不稳定，可临时使用仓库内的镜像配置：

```powershell
cd backend
.\mvnw.cmd -s .mvn/settings-cn.xml spring-boot:run
```

### 无 Key 演示

无需 Docker 或外部数据库即可运行内存演示。明确启用后端演示模式：

```powershell
$env:SPRING_PROFILES_ACTIVE="demo"
$env:ROUTE_DEMO_ENABLED="true"
$env:AMAP_WEB_KEY=""
cd backend
.\mvnw.cmd spring-boot:run
```

前端启动命令同上。没有 JS API Key 时使用离线示意底图；没有后端 Web 服务 Key 时不能取得真实高德步行路线。`demo` profile 默认允许演示，缺 Web Key 时会返回明确标记为 `DEMO` 的路线；前端离线演示路线只适用于匹配的端点组合，不保证任意自选端点都有演示数据。真实高德调用失败不会伪装为真实成功。

默认热力图只看真实反馈。内存演示种子属于模拟反馈，需点击“演示热力图”查看。初始真实反馈为空是正常状态，不意味着区域已有真实情绪覆盖。

## 集成验收

联调验收链路：

1. 在地图上自由选择梁溪区地图范围内的起终点，查看路线并进入地图；确认真实、演示及不可用状态标记准确。
2. 真实反馈为空时显示空状态；切换“演示热力图”后确认模拟来源标记，点击热力点可查看详情，拖动不会误开详情。
3. 移动地图并点击“记录此处感受”，确认位置、选择感受与环境标签后提交；网络错误时保留草稿并可重试。
4. 真实反馈足够时查看路线评分；没有有效评分时显示数据不足，不能把缺失值当成 0 或显示“少心累”结论。
5. 正式通勤写入默认关闭。只有目标后端通过 D07 与数据库迁移验收后，才设置 `VITE_COMMUTE_RECORDING_ENABLED=true`；完成通勤后核对历史与七日趋势，演示通勤不计入真实统计。

接口契约见 [docs/团队协作与接口约定.md](docs/团队协作与接口约定.md)。

自动化验证使用当前前端脚本：

```powershell
cd frontend
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

浏览器测试会自行启动 Vite，请先停止占用 5173 端口的开发服务。普通浏览器测试使用测试接口数据，不能代替高德联网与真机验收。运行完整前后端联调测试时，先按“无 Key 演示”示例在独立终端启动测试后端，再从 `frontend/` 执行 `npm run test:e2e:integration`；后端地址默认 `http://127.0.0.1:8080`，可通过 `INTEGRATION_API_URL` 指定。后端 Maven 检查在 `backend/` 执行 `.\mvnw.cmd verify`，完整数据库验收需可用的 Docker/PostGIS 测试环境。

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
2. 复制根目录 `.env.example` 为 `.env`，填写后端 `AMAP_WEB_KEY`、数据库凭据、`DEVICE_HASH_SALT` 与允许的网页来源。
3. 执行：

```powershell
docker compose -f infra/compose.yml --env-file .env up --build
```

Compose 启动数据库与后端；前端需单独构建、托管。构建前在 `frontend/.env.production` 配置 JS API Key、安全密钥及 `VITE_API_BASE_URL`。Android 独立使用需可访问的 HTTPS 后端；USB 反向端口连接仅供本地联调，断开 USB 后不会继续提供服务。后端 Swagger UI 位于 `http://localhost:8080/swagger-ui.html`。

## Profile

- 默认 `demo`：内存存储与模拟反馈种子，`ROUTE_DEMO_ENABLED` 默认 `true`；配置 Web 服务 Key 后仍可调用真实高德路线。前端显式查询 `REAL_ONLY`，不会因为后端为 demo 就混入模拟反馈。
- `postgres`：PostGIS 与 Flyway，`ROUTE_DEMO_ENABLED` 默认 `false`；缺 Key 或真实路线服务失败时返回不可用，不自动提供模拟路线。
- 如需允许后端演示，显式设置 `ROUTE_DEMO_ENABLED=true`。后端热力接口省略 `scope` 时，demo 默认 `ALL`，其他模式默认 `REAL_ONLY`；产品前端始终明确传入 `REAL_ONLY` 或 `SIMULATED_ONLY`。

历史启动书与分工文档保留原阶段的校园场景，当前产品定位及运行方法以本 README 和当前代码为准。

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
