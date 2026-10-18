# 团队协作指南

项目仓库：https://github.com/HCXXWDG/SoftwareProject

## 获取项目

```powershell
git clone https://github.com/HCXXWDG/SoftwareProject.git
cd SoftwareProject
git switch develop
```

复制 `.env.example` 为 `.env` 后按本地环境填写。不要上传实际密钥、密码、签名文件或个人工具配置。前后端启动步骤见 README。

## 认领任务

先查看 [任务分工书](docs/project/task-assignment.md)，按能力确定 A、B、C、D 角色，再由负责人把账号分配到对应任务。三人合并方案和验收标准见分工书；[工作量量化表](docs/project/workload.md)给出各任务估算。

Issue 标注负责人、前置依赖和验收结果。未解决依赖时可以依照契约样例开发，最终必须完成真实接口联调。

## 分支与提交

- `main` 保存稳定版本。
- `develop` 负责日常集成；GitHub 默认分支为 `main`。
- 任务分支使用 `codex/a-任务名`、`codex/b-任务名` 等形式，从最新 `develop` 创建。
- 功能 PR 合并到 `develop`；稳定后通过发布 PR 从 `develop` 合并到 `main`。

```powershell
git switch develop
git pull --ff-only origin develop
git switch -c codex/a-api-errors
# 完成改动和相关检查后，仅添加本次任务文件
git add frontend/src/services/api.ts
git commit -m "fix(frontend): handle API timeouts"
git push -u origin codex/a-api-errors
```

PR 使用模板关联任务，例如 `Closes #任务编号`，说明修改、验证和风险；至少请另一名成员复核后合并。公共类型由 A 主改，路线服务由 B 主改，地图和展示由 C 主改，仓储与 Flyway 迁移由 D 主改。不要同时各自修改公共字段或使用相同迁移版本号。

保留 MIT 许可证和原有贡献记录。不要强制覆盖共享分支；同步任务分支时优先合并最新 `develop`，先处理冲突并重新运行受影响检查。

## 验证要求

前端运行 `npm test` 和 `npm run build`，交互变化运行 `npm run test:e2e`。后端运行 `mvnw.cmd verify`，数据库变化验证全新初始化与旧库迁移。启动 demo 后端后，运行 `npm run test:e2e:integration` 验证全链路。

Android 构建保留为补充检查，不作为网页和后端任务的默认合并门禁。各成员负责本模块必要测试；C 协助浏览器和移动端验收，D 汇总集成结果。跳过的检查注明环境和原因，不计为通过。

## GitHub 权限和规则

本次同步继续使用原仓库 `HCXXWDG/SoftwareProject`，保留既有 CODEOWNERS 和成员管理安排；推送和合并以账号实际权限及仓库规则为准。

2026 年 10 月 18 日，GitHub 显示 `main` 和 `develop` 均受保护。当前账号具有 WRITE 权限，保护详情 API 不可读，未重新确认每项保护规则。既有规则与本次核实范围见 [CI 与分支保护说明](docs/测试/CI与分支保护说明.md)。继续遵守 PR、另一成员复核和四项核心 CI 检查的协作流程。
