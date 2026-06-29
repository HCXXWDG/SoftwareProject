# GitHub Actions

成员 C 负责本目录中的 CI 工作流。

当前工作流：

- `frontend-ci.yml`：Node.js 22、`npm ci`、Vitest 和生产构建。
- `backend-ci.yml`：Java 17、Maven `verify` 和 JaCoCo 报告。
- `e2e.yml`：使用 API Mock 的 Playwright 浏览器回归测试。
- `fullstack-e2e.yml`：启动 Spring Boot demo Profile 和 Vite，运行不
  Mock API 的浏览器到后端全链路测试。

四个工作流在指向 `develop` 或 `main` 的 Pull Request、两个分支的推送
以及手工触发时运行。

`develop` 与 `main` 当前均要求 `Frontend CI`、`Backend CI`、`E2E CI`
和 `Full-stack E2E`。两条分支还要求至少一名非作者批准、最后一次推送由
其他成员批准，并在合并前解决全部评审对话。

工作流不得打印高德 Key、数据库密码或其他 Secret。

