# GitHub Actions

成员 C 负责本目录中的 CI 工作流。

当前工作流：

- `frontend-ci.yml`：Node.js 22、`npm ci`、Vitest 和生产构建。
- `backend-ci.yml`：Java 17、Maven `verify` 和 JaCoCo 报告。

两个工作流在指向 `develop` 的 Pull Request、`develop` 推送和手工触发时运行。
分支保护要求的检查名称固定为 `Frontend CI` 和 `Backend CI`。

后续加入 Playwright 依赖与稳定演示环境后，再新增 `e2e.yml` 覆盖核心链路。

工作流不得打印高德 Key、数据库密码或其他 Secret。

