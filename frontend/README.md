# Frontend

城市通勤情绪地图前端，计划使用 React、TypeScript 和 Vite。

## 成员边界

- 成员 A：应用入口、页面、通用组件、API Client、匿名设备 ID 和趋势图。
- 成员 C：地图图层、长按反馈、emoji 动画、路线绘制及前端自动化测试。

建议目录：

```text
src/
  app/                 # 成员 A：应用初始化和路由
  pages/               # 成员 A：页面编排
  components/          # 成员 A：非地图通用组件
  services/            # 成员 A：API Client 和设备身份
  features/
    map/               # 成员 C：地图、热力图和长按交互
    routes/            # 成员 C：双路线绘制与动画
  shared/              # 三方确认后放置共享类型
e2e/                   # 成员 C：Playwright 测试
```

地图组件不得直接调用后端；网络请求由成员 A 的 API Client 完成。

## 环境变量

使用仓库根目录的 `.env.example` 作为模板。不要提交真实高德 Key 或 `.env` 文件。

