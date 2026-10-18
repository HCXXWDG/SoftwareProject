# PR #56 审核报告 - 成员 C 视角

**审核人：** 成员 C（地图交互与可视化负责人）
**审核日期：** 2026-10-18
**PR 标题：** 成员 A 前端请求与通勤页面可靠性改进
**PR 状态：** Draft

---

## 一、审核范围

本次审核聚焦 PR #56 中与成员 C 职责相关的地图组件改动：

- `frontend/src/features/map/MapSurface.tsx`
- `frontend/src/features/map/FeedbackPanel.tsx`
- `frontend/src/features/map/MapSurface.css`
- `frontend/src/features/map/MapSurface.feedback.test.tsx`

---

## 二、审核结论

### 通过的改动

| 文件 | 改动内容 | 审核意见 |
|------|----------|----------|
| `MapSurface.tsx` | 新增 `feedbackEnabled` 和 `onModeChange` props | 合理，符合 S00 契约中"底图与后端状态独立管理"的要求 |
| `MapSurface.tsx` | `onFeedbackSubmit` 返回类型扩展为 `Promise<void \| { status: "created" \| "duplicate" }>` | 合理，支持 C02 区分新增与重复结果 |
| `MapSurface.tsx` | 长按处理增加 `feedbackEnabled` 和 `submitting` 检查 | 正确，防止提交中更换位置 |
| `MapSurface.tsx` | 新增 `feedbackError` 状态和错误展示 | 符合 C02 失败恢复要求 |
| `MapSurface.tsx` | 重复反馈不播放新增动画 | 正确，符合 C02 验收标准 |
| `FeedbackPanel.tsx` | 新增 `submissionEnabled` prop | 合理，支持后端不可用时禁用提交 |
| `FeedbackPanel.tsx` | 禁用时显示提示信息 | 符合 C02 可见错误要求 |
| `MapSurface.css` | 新增 `.map-surface__feedback-error` 样式 | 样式合理，位置适中 |
| `MapSurface.feedback.test.tsx` | 新增 212 行反馈测试 | 覆盖提交中长按、失败恢复、重复结果等场景 |

### 需要注意的改动

| 文件 | 改动内容 | 建议 |
|------|----------|------|
| `MapSurface.tsx` | `handleLongPress` 依赖数组新增 `feedbackEnabled`, `submitting`, `feedbackPosition` | 确认不会导致不必要的重渲染 |
| `MapSurface.tsx` | 错误提示使用内联样式类名 | 建议后续由 C 统一样式规范 |

### 未包含但 C 需要的改动

以下 C01-C05 任务所需改动**不在本 PR 范围内**，需后续 PR 补充：

1. **C01 路线状态展示**：地图卡片联动、环境指数与预计耗时分别显示、无有效评分时不显示占位零分
2. **C03 正向标签**：安静、树荫、开阔等新标签选项
3. **C04 移动端优化**：弹层位置、键盘焦点、390×844 视口适配
4. **C05 趋势图**：七日折线图、空日期处理

---

## 三、与 S00 契约的一致性

| 契约项 | PR #56 实现情况 | 一致性 |
|--------|----------------|--------|
| 底图模式与后端状态独立管理 | `feedbackEnabled` 独立于底图模式 | 一致 |
| 反馈失败保留草稿 | `feedbackError` 状态 + 面板保持 | 一致 |
| 重复反馈不重复计数 | `duplicate` 状态 + 不播放动画 | 一致 |
| 提交中阻止更换位置 | `submitting` 检查 | 一致 |

---

## 四、建议与后续工作

### 本 PR 可合并条件

1. 地图组件改动与 S00 契约一致
2. 测试覆盖关键场景
3. 等待 B/D 确认 `routeSource`、`feedbackSource`、`scoringStatus` 等字段
4. 等待 D02 幂等接口完成后联调 A04

### 成员 C 后续工作

1. **C01**：基于 A 的 `feedbackEnabled` 和 `onModeChange` 完成路线状态联动展示
2. **C02**：基于 `submissionEnabled` 和 `feedbackError` 完善失败恢复交互
3. **C03**：等待 D03 枚举确认后接入新标签
4. **C04**：独立 PR 处理移动端弹层优化
5. **C05**：独立 PR 处理趋势图组件

---

## 五、审核结论

**建议：** 本 PR 的地图组件改动**可以合并**，为成员 C 的 C01/C02 任务提供了必要的基础设施。

**理由：**
- Props 扩展合理，符合 S00 契约
- 测试覆盖充分（212 行新测试）
- 未破坏现有地图展示逻辑
- 为后续 C 任务预留了接入点

**风险：**
- 3 个既有地图测试失败（`MapSurface.test.tsx` 2 项、`viewport.test.ts` 1 项）需 C 后续统一修复
- `submissionEnabled` 默认值为 `true`，需确认 A 在 App 层正确传递
