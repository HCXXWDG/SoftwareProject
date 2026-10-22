# CI 与分支保护

仓库：https://github.com/HCXXWDG/SoftwareProject

## 必需检查

所有合并到 `develop` 的 Pull Request 必须通过：

- `Frontend CI`：安装锁定依赖、运行 Vitest、构建生产包。
- `Backend CI`：使用 Java 17 执行 Maven `verify`，并上传 JaCoCo 报告。
- `E2E CI`：使用稳定 API Mock 验证地图、路线和反馈浏览器链路。
- `Full-stack E2E`：启动 Spring Boot demo Profile 和 Vite，验证浏览器
  实际访问 `/api/v1`，不拦截或伪造接口响应。

工作流不读取高德 Key、数据库密码或其他 Secret。前端地图测试使用无 Key
离线回退，Full-stack E2E 使用默认 demo 配置。

## develop 与 main 保护规则

截至 2026-06-14，`develop` 与 `main` 已启用同等规则：

- 必须通过 Pull Request 合并。
- 至少需要 1 名批准者。
- 新提交到来时撤销过期批准。
- 最后一次推送必须由其他成员批准。
- 必须通过 `Frontend CI`、`Backend CI`、`E2E CI` 和
  `Full-stack E2E`。
- 合并前分支必须与 `develop` 保持最新。
- 必须解决全部评审对话。
- 管理员也遵守上述规则。
- 禁止强制推送和删除分支。

四个工作流同时监听 `develop` 和 `main`，发布 PR 必须经过同等质量门禁。

## 2026 年 10 月 18 日同步核实

本次同步使用原仓库 `HCXXWDG/SoftwareProject`，保留上述历史配置记录、
CODEOWNERS 和原有 CI 管理安排。仓库默认分支为 `main`，GitHub 分支列表
显示 `develop` 与 `main` 均受保护。

当前账号具有 WRITE 权限，保护详情 API 不可读，因而未重新确认上述每项
规则的当前取值；这些细项仍是 2026-06-14 的历史记录。本次未修改默认
分支、分支保护或成员权限。继续按 PR、成员复核和核心 CI 检查流程协作，
合并操作以 GitHub 当前实际规则为准。

## 本地验证

前端：

```powershell
cd frontend
npm ci
npm test
npm run build
npm run test:e2e
```

后端：

```powershell
cd backend
.\mvnw.cmd --batch-mode --no-transfer-progress verify
```

Full-stack E2E 需要先启动后端：

```powershell
cd backend
.\mvnw.cmd --batch-mode --no-transfer-progress spring-boot:run

# 另一个终端
cd frontend
npm run test:e2e:integration
```
