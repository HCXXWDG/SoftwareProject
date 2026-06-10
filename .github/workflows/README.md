# GitHub Actions

成员 C 负责本目录中的 CI 工作流。

计划拆分为：

- `frontend-ci.yml`：安装依赖、lint、Vitest 和生产构建。
- `backend-ci.yml`：Maven 测试、打包和 JaCoCo 报告。
- `e2e.yml`：启动演示环境并执行 Playwright 核心链路。

工作流不得打印高德 Key、数据库密码或其他 Secret。CI 文件完成前保留本说明，确保目录能被 Git 跟踪。

