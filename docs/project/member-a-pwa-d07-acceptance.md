# 成员 A：生产 PWA 通勤恢复与 D07 云端数据库验收

日期：2026-10-22。前端以已发布 A 提交 `6c2ca7c` 为基线，后端固定 D07 `5b0964bfab666ec63ac41a681ce79eb8b9276696`。本轮新增生产 PWA 的独立验收配置、三个真实后端浏览器场景与 npm 入口，继续草稿 PR #56。

## 生产 PWA 验收

新增 `npm run test:e2e:member-a-commute-pwa`，执行 TypeScript 检查、Vite/PWA 生产构建，再于 5404 启动 preview。D07 写入开关只在该验收构建中开启，常规部署默认值仍为 false。测试先确认 Service Worker 已控制页面；离线 reload 直接检查响应 `fromServiceWorker()`，验证实际壳来源。

本机 Chrome 390px、1 worker、0 重试，**3/3 通过**：

1. SW 接管后的真实 DEMO 快照可以完成通勤，返回 201，省略评分显示“暂无路线评分”，真实 0 档感受保持；真实趋势排除该记录，API 未进入 Cache Storage。
2. 断网时首次提交失败，原操作仍存于当前标签页。离线重载由 SW 提供应用壳，保留原快照、路线、感受、操作号与时间；联网后观察 1 秒没有通勤 POST，再显式重试得到首次 201，两个请求体相同。
3. 真实后端先保存 201，再仅丢弃网络回执。离线重载保持待确认操作，联网观察 1 秒无自动补发，显式重试返回 200 duplicate 和同 commuteId；恢复信息确认后清理，API 没有进入缓存。

第二、三项分别区分“未送达服务端”和“已保存但未收到回执”，使用真实后端响应；没有用 API fixture 替换结果。所有内存写入只属于本次隔离 demo 服务。

复跑前先启动固定 D07 demo 服务，并放行 `http://127.0.0.1:5404` CORS。前端执行：

```powershell
$env:MEMBER_A_D07_API_URL='http://127.0.0.1:18083'
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run test:e2e:member-a-commute-pwa
```

结果目录为仓库忽略的 `.tmp/member-a-commute-pwa-browser`。该套件会重新构建 frontend/dist，应与其他依赖该目录的 preview/PWA 套件顺序执行。

## D07 云端 Backend CI

本机检查未发现 PostgreSQL 安装、服务或 5432 监听，也没有可用 Docker。D 文档中历史 PostgreSQL 16.15/PostGIS 3.6 的环境不代表当前机器。

仓库现有 `backend-ci.yml` 支持 workflow_dispatch。PR base 不在 develop/main 会阻止自动 PR 触发，但不妨碍对固定 D07 分支手动运行现有工作流。本轮未修改 D 的提交或 PR 目标。

[云端运行 39765856057](https://github.com/HCXXWDG/SoftwareProject/actions/runs/39765856057) 对应固定 `5b0964bf`，Maven verify / JaCoCo / package 成功，实际日志为：

```text
Tests run: 208, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

此前本机未运行的两组现已在云端真实执行：PostgisRouteSnapshotFlowTest **4/4**，PostgisIntegrationTest **5/5**，均 0 跳过。前者继承 D07 的 REAL 无反馈、REAL 有评分、DEMO 快照通勤场景并使用 JDBC，另测反馈来源隔离；后者覆盖 Flyway 种子、无配置 503、趋势、报告去重和热力缓存。

本次是固定头的手动运行证据。PR #71 的 statusCheckRollup 查询仍为空，不能据此称该 PR 的全部 required checks 已齐备。

复跑使用现有工作流：

```powershell
gh workflow run backend-ci.yml --repo HCXXWDG/SoftwareProject --ref feature/member-d-d07-commute-integration
```

须再次核对运行的 headSha，不能把未来变化的同名分支自动等同于本次固定头。

## 剩余边界

- 生产 PWA 浏览器本轮连接的是内存 demo；云端 PostGIS 是另一套后端测试，不能合称为“浏览器到真实数据库全链路通过”。
- D06 #69 的迁移/并发验收类不包含在上述 208 项中：旧迁移断言仍止于 V5，持久化夹具仍使用 UNKNOWN/UNAVAILABLE 的旧构造器，不能原样作为 D07 的 REAL/DEMO 组合验收。V3 升级到 V6、旧行保留、V6 范围约束、跨进程重放及并发仍待专项验证。
- 本轮前端业务实现与 `6c2ca7c` 相同，沿用上一轮全量单测 455/458（原 3 项地图失败）、受控浏览器 33/33、原 PWA 5/5 和实际后端开发模式浏览器 3/3；没有把这些计作本轮重跑。
- 真实高德、Android、生产部署和 30 分钟实际过期仍待验收。正式通勤开关默认关闭，未更新 develop、合并或发布。

此前用户链路、固定操作及复跑说明见 [D07 通勤用户链路验收](member-a-d07-user-flow.md)。
