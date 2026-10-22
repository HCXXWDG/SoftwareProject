# 成员 A：共享全栈验收入口与 D07 对接

日期：2026-10-22。继续草稿 PR #56，以 A 已发布 `9758001` 的相同文件树为基线。核对整合候选 #72 固定头 `5f6f242`、D07 固定头 `5b0964bfab666ec63ac41a681ce79eb8b9276696`。未更新其他成员分支、PR 目标或 develop。

## 实际失败与修复范围

#72 的 Full-stack E2E [运行 39766707674](https://github.com/HCXXWDG/SoftwareProject/actions/runs/39766707674) 原配置收集全部 `*.integration.e2e.ts`，共 15 项、7 失败、8 通过。不同规格依赖的后端版本、端口与开关不一致：D07 通勤需要启用写入，D01–D05 旧夹具断言 compare 没有 snapshotId，生产 PWA 需要 build/preview 和实际 Service Worker，不能由同一个 Vite dev 配置混跑。

共享配置现在明确收集 `app.integration.e2e.ts` 与 `member-a.commute.integration.e2e.ts`，共 4 项。前者仍覆盖真实地图、路线、趋势、反馈和通勤；后三项复用 D07 的 390/320px 与丢回执恢复验收，不重复计为新增功能。统一页面为 `http://127.0.0.1:5173`，API 默认为 `http://127.0.0.1:8080`，可用 `INTEGRATION_API_URL` 覆盖；严格端口、明确空地图 key 和 D07 写入开关只影响验收进程。

共享场景保留非空热力图、地图显示、路线选择、真实报告 201 和关闭反馈面板等覆盖。适配 A 当前“查看路线”、无评分路线选择区和五档感受按钮；首次通勤严格校验 201、五个白名单请求字段、实际快照及操作号、DEMO 无评分回执。DEMO 不增加真实 totalCommutes，excludedDemoCommutes 恰增 1，并用同设备查询通勤历史证明该记录被排除，不用“最近路线查询”替代通勤历史。

本轮对 D 主改共享规格的调整仅对接 A 的页面与 D07 已确认契约，未修改 D 生产代码。#69 已有的入口文案/201修订与此方向一致，但其旧卡片、感受按钮和真实次数递增断言仍需当前适配。旧用例没有删除或跳过，保留在各自专用入口。

原 tsconfig 仅检查 src，遗漏了共享用例中误用 APIResponse 的类型问题。本轮改用页面网络 Response，并新增 tsconfig.integration.json，覆盖所有 integration 规格及 Playwright 配置；共享 npm 命令先类型检查再运行浏览器。

## 入口边界

| 命令/配置 | 后端与用途 |
| --- | --- |
| `npm run test:e2e:integration` | 当前 D07 共享流程，4项、5173页面；API默认8080 |
| `npm run test:e2e:member-a` | 历史 A 隔离场景，按其固定后端与5181/18081配置复跑 |
| `npm run test:e2e:member-a-contracts` | 历史 D01–D05 专用契约，要求 MEMBER_A_BACKEND_DIR |
| `playwright.member-a-b.config.ts` | B 固定头只读比较/地图，要求 MEMBER_A_B_API_URL，不启用通勤写入 |
| `npm run test:e2e:member-a-commute` | D07 专用开发模式，5403页面，要求 MEMBER_A_D07_API_URL |
| `npm run test:e2e:member-a-commute-pwa` | D07生产PWA，5404页面，build/preview及实际SW |
| `npm run test:e2e:member-a-restart` | 独立D07内存服务重启，5405/18085；要求已打包的MEMBER_A_D07_BACKEND_DIR |
| `npm run test:pwa` | 原PWA缓存/壳验收，4173页面 |

收集范围可用 `npm run test:e2e:integration -- --list` 核对；当前为 **4 tests in 2 files**，不会混收上述历史契约或生产 PWA。各版本的专用规格仍保留，不能用当前 D07 后端强行满足相反的旧契约。

## 云端工作流

现有 `fullstack-e2e.yml` 正常 PR/push 使用本分支自身 backend；集成分支纳入 D07 后可直接运行。启动明确使用 demo profile、空高德 key、允许演示和5173 CORS，日志固定写入工作区根目录以供失败上传。

前端堆叠分支尚未纳入 D07 生产源码时，可手动传可选 `backend_ref`。只接受本仓库完整40位提交SHA，使用独立 `.tmp/fullstack-backend` checkout，主前端checkout保持本轮提交。该功能只选择验收后端，不合并、覆盖或更新任何原分支。当前固定版本复跑：

```powershell
gh workflow run fullstack-e2e.yml --repo HCXXWDG/SoftwareProject `
  --ref codex/member-a-frontend `
  -f backend_ref=5b0964bfab666ec63ac41a681ce79eb8b9276696
```

A 分支自身 backend 仍为上传基线，省略 fixture 不能证明已组合 D07。集成候选 #72 后续纳入本轮增量后，应继续使用默认自身后端验收，不用手动固定头代替正常 required check。

## 本机验证

- 共享入口列表：4项/2文件；全部 integration 及配置的 TypeScript 检查通过。
- 生产构建：TypeScript/Vite/PWA 通过。
- 固定 D07 JAR，JDK21，隔离 demo 8080、5173 CORS：共享浏览器 **4/4通过**，本机Chrome、1worker、0重试，无API fixture替换。完整流程实际报告201、通勤201、演示排除和恢复200duplicate均通过。
- 前端业务源码未变，沿用先前单测455/458（原3项地图失败）、受控浏览器33/33及PWA记录，本轮未重跑这些套件。

本轮云端组合结果另记于 PR #56 的最新运行链接，必须同时标明 A 前端头和 backend_ref；不能把 D07 单独 Backend CI 或历史候选运行计为本轮共享全栈通过。

## 继续交接

本轮前端/工作流增量仍需整合候选作者纳入 #72，再运行其默认 Full-stack E2E。D06旧库升级与并发、完整 C 分支及原3项地图测试、真实高德/设备/生产部署仍待各自验收。正式写入开关默认 false，未关闭 #68/#70，也未合并或发布。
