# A/B 路线契约与共享浏览器基线接入

日期：2026-10-22。仅使用 `HCXXWDG/SoftwareProject`，从A的PR #56提交 `545e0b1` 继续。B的PR #67提交 `fb53530` 在独立目录运行，不合入B/D提交，不更新 `develop`。

## 行为与边界

- 接收B的 `snapshotId`、`scoringVersion`、`travelMode=WALKING`、推荐详情、单路线评分状态，以及 `UNKNOWN/MIXED` 来源。不把旧 `comparisonId` 推断成可写快照。
- Jackson `NON_NULL` 省略的评分规范为 `null`，真实零分保留。没有有效评分时允许省略舒适路线ID；无候选时允许省略最快路线ID。声明 `VALID` 仍要求完整有界评分、置信度和有效路线引用，矛盾状态和非法元数据继续拒绝。
- 合法Demo响应可预览并进入地图；空评分不显示舒适结论。父层统一隐藏无效舒适标记，展示组件不将空评分渲染成零。
- `503 + route_provider_unavailable` 保留HTTP失败、错误码和明确提示，不转换为无路线或自动演示成功。
- 共享Mock/PWA场景适配当前选点UI的“查看路线”和“路线预览”。保留反馈失败草稿、位置、选择、重试和无成功动画检查；通勤场景验证禁用原因和不发POST，不计为通勤写入验收。
- PWA实际验证Service Worker接管、同URL新API数据、API不缓存、图标资源及离线重载。

## 本轮实际验证

| 检查 | 结果 |
| --- | --- |
| 构建 | TypeScript、Vite、PWA通过 |
| 全量Vitest | 311项，308通过、3项既有地图测试失败、0跳过 |
| 新增B响应契约 | 32/32通过，含空/省略评分、有效零分、来源、快照、无路线、矛盾VALID和503 |
| 共享Mock浏览器 | 26/26通过，Chrome，单worker、0重试 |
| A导航与历史浏览器 | 7/7通过，含390和320像素、0重试 |
| PWA浏览器 | 5/5通过，0重试 |
| 实际B后端到浏览器 | 1/1通过，未Mock API；200、DEMO、空评分、省略舒适ID、snapshotId，进入地图且无通勤POST |
| diff空白检查 | 通过 |

剩余3项与原记录一致：`MapSurface.test.tsx` 两处旧热力点可访问名称，`viewport.test.ts` 蓝到红规格与现有配色不一致。C需核对展示契约后统一，未删除或跳过测试，不能宣称全量绿色。

B后端本轮离线打包成功，仅为前端联调跳过后端测试。运行内存demo与离线底图、仅绑定回环地址。本轮未重新执行B的208项CI，不将其计为A的执行结果；浏览器读流程也不代表真实高德、PostGIS、完整通勤或生产验收。

## 复跑B联调

在B的独立检出中构建 `fb53530`，启动对应JAR，不能使用A的旧后端：

```powershell
java -jar target/commute-mood-api-1.0.0.jar --spring.profiles.active=demo --server.address=127.0.0.1 --server.port=18082 --app.amap.web-key= --app.cors-origins=http://127.0.0.1:5182
```

在A前端目录运行：

```powershell
$env:PLAYWRIGHT_CHANNEL='chrome'
$env:MEMBER_A_B_API_URL='http://127.0.0.1:18082'
npx playwright test --config playwright.member-a-b.config.ts
```

配置要求显式B地址，自动管理5182前端服务，不替换后端响应。无Chrome时安装Playwright Chromium并省略channel变量。共享回归分别使用 `npm run test:e2e` 和 `npm run test:pwa`。D维护的 `app.integration.e2e.ts` 本轮未修改。

## 尚未完成

#68不能关闭：A的共享入口已对齐，但C的3项测试、D共享全链路和最终组合仍待验证。B已返回快照，不再描述为“没有snapshotId”；D当前Demo通勤仍422，可空评分存储、迁移、JDBC回读和趋势判空仍需D完成。

页面继续禁用完成通勤，不能仅凭快照ID放行。稳定操作上下文、归属/过期、响应丢失重试、演示记录排除真实统计须待D放行后联合验证。PR #56保持草稿，基础仍为PR #55上传分支；未批量合并、发布、改变保护规则或代其他成员签收。

此前记录见[上一轮D联调](member-a-contract-integration.md)；其中等待B快照的历史状态由本文更新。依据：[契约#66](https://github.com/HCXXWDG/SoftwareProject/issues/66)、[阻塞#68](https://github.com/HCXXWDG/SoftwareProject/issues/68)。
