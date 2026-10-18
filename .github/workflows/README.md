# GitHub Actions

核心检查为 Frontend CI、Backend CI、E2E CI、Full-stack E2E，在指向 main/develop 的 PR、两分支推送及手动触发时运行。Android Build CI 是补充检查，包含构建与允许失败的模拟器 smoke，不作为核心门禁。

工作流按仓库根目录下的 frontend/backend 布局运行，不依赖旧仓库路径。测试使用 demo 模式和离线地图，不需要配置生产密钥。不得在日志中打印实际密钥、密码或令牌。

分支保护属于 GitHub 仓库设置，不会随 Git 历史自动迁移。新仓库实际配置见 docs/测试/CI与分支保护说明.md，不以旧仓库历史配置作为已生效证明。
