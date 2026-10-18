# CI 与分支保护说明

仓库：https://github.com/xlm-xlm/xintu-campus-commute

## 核心检查

- Frontend CI：Vitest 和前端生产构建。
- Backend CI：Java 17 下 Maven verify 和 JaCoCo 报告。
- E2E CI：API Mock 的浏览器回归。
- Full-stack E2E：启动 demo 后端并运行实际 API 联调。

Android 构建与模拟器检查暂不列为必需检查。数据库集成是否实际执行以日志为准，环境导致的跳过不能作为通过证据。

## 协作约定

develop 为默认集成分支，main 为稳定分支。功能经 PR 合入 develop，发布经 PR 进入 main。至少一名其他成员复核，解决评审对话，核心检查通过后合并。禁止强制覆盖和删除共享分支。

拟设置 main/develop 强制要求 PR、一名批准者、过期批准失效、四项核心检查与对话解决，并禁止强制推送和删除。私有仓库的强制保护取决于 GitHub 账户权限，不能以文档约定替代实际规则。

## 本次配置状态

2026 年 10 月 18 日：新仓库已创建，分支推送后将调用 GitHub API 配置并核实；本节将在核实后更新。旧 HCXXWDG/SoftwareProject 仓库的保护状态不代表新仓库状态。

## 本地检查

前端在 frontend 执行 npm test、npm run build、npm run test:e2e。后端在 backend 执行 mvnw.cmd verify。启动 demo 后端后，在 frontend 执行 npm run test:e2e:integration。
