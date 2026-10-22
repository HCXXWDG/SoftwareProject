# 成员 A：D 新契约接入与视口竞态修复

日期：2026 年 10 月 19 日。前端基线 `3eb736b`，分支 `codex/member-a-frontend`，继续交付至 [PR #56](https://github.com/HCXXWDG/SoftwareProject/pull/56)。本轮只提交 A 的前端适配、回归和文档；D 的代码在隔离检出中运行，未合并其他成员的 PR。

## 1. 新依赖及核对范围

本轮获取原仓库实际分支，核对 [D01/D02 #62](https://github.com/HCXXWDG/SoftwareProject/pull/62)、[D03 #63](https://github.com/HCXXWDG/SoftwareProject/pull/63)、[D04 #64](https://github.com/HCXXWDG/SoftwareProject/pull/64)、[D05 #65](https://github.com/HCXXWDG/SoftwareProject/pull/65)。它们为顺序叠加的待合并 PR，实际联调后端为 D05 提交 `1d6005a46de4573c968a411dd6b017831937931c`。

隔离检出位于仓库上级 `artifacts/member-a-contract-integration/backend-worktree/`，使用内存 demo profile，Java 服务 18081、Vite 5181、本机 Chrome、离线底图。实际 HTTP 不等于生产或真实高德验收；本轮未运行 PostgreSQL/PostGIS。D 文档中的数据库实测是 D 的证据，未计作 A 本轮重新验证。

## 2. A 已接入的契约

| 对接面 | 当前前端行为 | 边界 |
| --- | --- | --- |
| D04 报告结果 | 接受新 201 `created/report_created/counted:true`、200 `duplicate/report_duplicate/counted:false`；保留旧 201 created / 409 duplicate | HTTP 与结果字段必须一致；部分新字段、矛盾 counted、未知结果及限频均不当作成功 |
| 通用请求验证 | 显式响应验证器接收实际 HTTP 状态；合法 2xx duplicate 正常返回；无验证器的旧 duplicate 和 `success:false` 仍为业务失败 | 不再把所有 200 duplicate 伪造为报告 409；GET/POST 都不自动重试 |
| D03 正向标签 | 公共类型与热力校验支持 `QUIET/SHADE/OPEN`；实际报告提交与热力读取通过 | 本轮只适配 A 的数据契约，正向标签选择入口仍由 C03 负责，未把 C 的其他 PR 合并进来 |
| D02 完成服务 | `completeCommute` 只发 `snapshotId/operationId/routeId/endStressLevel` 及可选 `completedAt`；客户端评分、标签、时长等额外属性被剔除 | 不再发送旧客户端评分请求；调用方仍须负责同次操作 ID 与业务内容的保留，当前页面尚未开放调用 |
| D02 写入结果 | 校验 201 created / 200 duplicate，并确认操作、快照、路线和感受与本次请求一致；409 保留既有记录引用；404/410/422 给出对应恢复文案 | 不自动换操作 ID 绕过冲突；服务层契约完成不表示通勤用户链路完成 |
| D05 趋势 | 兼容旧响应，保留新增自然日、时区、来源计数、预计秒数与样本数；NON_NULL 省略均值归一化为 null，不补零 | 声明 `days` 的响应检查连续日期、每日次数之和、空日/有记录日压力均值及预计样本一致性；旧响应不虚构新元数据 |
| 来源说明 | 趋势含未知来源通勤时显示计数与限制；有演示排除计数时明确显示 | 未知来源不展示成真实路线评分 |

实际 D02 字段为 **`snapshotId`**，不是 A 首批草案的 `comparisonId`。二者没有自动映射。B 的 compare 输出、来源与评分契约仍待落实，不从历史 ID 或前端生成 ID 推断可写资格。

## 3. 防抖窗口中的视口竞态

旧实现收到新 bbox 后先等 300ms，到实际发请求时才取消旧请求。旧请求若在等待期间完成，仍可覆盖热力图、更新连接状态，报告刷新也可能错误返回 success。

修复为有效且不同的视口到达时立即取消并失效旧请求，仍等 300ms 查询最新视口。旧结果返回 cancelled，不改写数据、错误或后端状态；相同有效 bbox/zoom 不取消或推迟请求；主动刷新仍立即使用最近视口。

新增 4 项回归先复现失败：窗口内旧成功、旧失败、报告刷新、数值等同视口。定向修复前 14/18 通过，修复后 18/18 通过。结果分别在 `viewport-before-fix.json` 与 `viewport-after-fix.json`。

## 4. 实际验收结果

本轮结果文件位于仓库上级 `artifacts/member-a-contract-integration/`。

| 检查 | 结果与证据 |
| --- | --- |
| 前端构建 | TypeScript / Vite / PWA 通过，`build-final.log` |
| 全量前端单测 | 275 项：272 通过、3 个既有失败、0 跳过，`unit-final.json` |
| D05 隔离后端构建与测试 | Maven 离线 package 成功；145 项中 140 通过、5 项因无 Docker 跳过，`d-backend-build.log` |
| D 新契约真实浏览器 | 10/10 通过、0 跳过、0 重试，`d-browser-final.json` |
| A 受控接口导航与历史 | 7/7 通过，`mock-browser-results.json` |
| 原后端兼容浏览器 | 7/7 通过、0 跳过、0 重试，`legacy-browser-final.json`，验证原有 201/409 和空内存历史 |
| 移动端人工复核 | D 环境下 390/320 像素截图已检查，无页面横向溢出，导航、反馈和历史入口可达 |

D 环境的 10 项由原有 7 项浏览器场景和 3 项新契约场景组成：

1. 初始查询、实际候选选路、修改端点、浏览器返回及刷新；D 内存历史实际保存后可重新规划。
2. 反馈 201 后刷新热力，重复请求实际 200 `report_duplicate/counted:false`，不播放新增动画。
3. 延迟反馈期间长按其他点、首次请求失败、保留原草稿并真实重试，两次 location 相同。
4. 反馈已保存但热力 GET 失败，仅重试 GET，不重复 POST。
5. 路线失败重试及明确进入匹配演示。
6. 390 像素导航与反馈交互。
7. 320 像素导航与反馈交互。
8. QUIET/SHADE/OPEN 三种标签实际提交，热力响应经 A 服务校验并包含对应标签。
9. D05 空窗口恰为 7 个连续自然日，压力和预计秒数均值为 null，来源计数与时区保留。
10. D02 服务层实际 201 新增、200 同键重复、409 异内容冲突、404 快照缺失；发送体无客户端分数/时长；重复后趋势只计一次且 UNKNOWN 被标出。

第 10 项的快照由**测试装配**从 D 保存的路线历史取得，以核验 D02 传输契约。页面没有采用这条绕行路径，compare 响应仍断言不含 snapshotId，通勤按钮仍禁用。该场景不能计为真实用户完成通勤、可信来源、过期拒绝或演示拒绝已联合验收；410/422 等分支另由前端受控单测覆盖。

首轮 D 浏览器 7/10 通过，3 个长按场景被尚未结束的热力加载遮罩阻挡；单独复核仍能复现。测试已改为等待实际页面退出阻挡加载状态，再执行手势，完整重跑 10/10 通过。没有删除或跳过失败场景，也没有增加自动重试掩盖结果。

3 个剩余单测与前两轮相同：`MapSurface.test.tsx` 两项旧热点名称断言、`viewport.test.ts` 一项旧颜色断言。未修改或跳过，仍交 C 核对。

## 5. 复跑 D 联调

使用已有隔离后端，先在其 `backend` 目录执行 `./mvnw.cmd package`；本轮依赖已缓存，实际使用 `-o package`。不要用旧基线 JAR 运行 D 专用套件。

在前端目录执行：

```powershell
$env:PLAYWRIGHT_CHANNEL='chrome'
$env:MEMBER_A_BACKEND_DIR=(Resolve-Path '../../artifacts/member-a-contract-integration/backend-worktree/backend').Path
$env:MEMBER_A_EVIDENCE_DIR='../../artifacts/member-a-contract-integration'
npm run test:e2e:member-a-contracts
```

新环境需先获取 D05 分支并在上面的目录创建隔离检出，或将 `MEMBER_A_BACKEND_DIR` 改为等价、已构建的 D 后端目录。配置拒绝在缺少该变量时运行 D 套件，避免误将旧服务当新协议验收。测试自动管理 5181/18081 服务；旧兼容套件仍为 `npm run test:e2e:member-a`，运行前清除 `MEMBER_A_BACKEND_DIR`，两套按顺序运行。

## 6. 仍待联合完成

B 需在 compare 返回已保存的快照标识、可信路线/反馈来源、评分状态与版本；D 需从 B 的快照读取来源，当前实际写入仍为 UNKNOWN。之后 A 才接入页面提交、稳定操作上下文与恢复路径，联合验证过期、身份变化、响应丢失重试、演示拒绝和统计刷新，再恢复“完成本次通勤”。

D PR 的实现进展与 A 本轮适配已记录，不代表其他成员签收或 PR 已合并。未向其他成员发送消息，未代签 [交接清单](member-a-handoff-checklist.md)，PR #56 保持草稿。
