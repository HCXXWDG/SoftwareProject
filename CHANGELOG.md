# Changelog

All notable changes follow Semantic Versioning and Keep a Changelog.

## [Unreleased]

## [1.1.0] - 2026-06-30

### Added — 校园版改造
- 固定三阶段页面流程：欢迎页 → 预设路线展示 → 校园地图（#23, Closes #20）
- 欢迎页零 API 请求，只显示项目说明、固定端点和"查看预设路线"入口
- 路线预览页只调用 `compareRoutes`，请求体固定为校园 GCJ-02 端点
- 进入地图后才请求热力图与趋势，用户只能选择最快/少心累路线
- 校园预设配置 `config/campus.ts`：江南大学蠡湖校区 GCJ-02 坐标（#26）
- `MapSurface` 可选 `origin`/`destination`/`viewportConstraint` Props（#26）
- 高德模式 `limitBounds` + `zooms=[15,18]`，拖出校园自动回弹
- 离线模式 `clampCenter`/`clampZoom` 统一限制到校园边界
- `EndpointMarkers` 组件：固定起点（绿）/终点（红）标记
- 长按反馈坐标位于校园边界内才有效
- 移动端 E2E 测试：390×844（iPhone 14 Pro）和 412×915（Pixel 7）全流程（#28）
- 欢迎流程 E2E 测试：三阶段导航、反馈提交、路线选择持久化（#28）
- 校园边界 E2E 测试：边界长按拦截、端点标记、缩放控制（#28）

### Added — 跨平台支持
- Capacitor 8 Android 工程：appId `com.jiangnan.course.commutemoodmap`，minSdk 24（#24, Closes #21）
- Windows 可安装 PWA：`vite-plugin-pwa`，standalone 模式，192/512/maskable 图标
- PWA Service Worker：`/api/**`、高德脚本、地图瓦片使用 NetworkOnly
- `build:android`/`cap:sync`/`cap:open` npm 脚本
- `.env.android.example` 和 `.env.production.example` 环境变量模板
- Capacitor 生命周期插件：`@capacitor/app`、`@capacitor/status-bar`、`@capacitor/splash-screen`（#40）
- `capacitor.config.ts` Android 专有配置：SplashScreen、StatusBar、`allowMixedContent: false`（#40）

### Added — CI
- Android Build CI workflow：debug + release APK 构建、签名、上传（#28, #32）
- Android APK Verification CI：aapt2 静态验证 APK manifest、包名、MainActivity、web assets（#43）
- 版本号校验步骤：构建前检查 versionCode/versionName（#39）

### Added — 数据与文档
- Demo 热力点迁移到江南大学蠡湖校区（#25, Closes #22）
- `V3__campus_demo_seed.sql` Flyway migration
- `MockRouteProvider` 改为基于 origin/destination 比例插值生成候选路线
- 生产环境 HTTPS 部署指南：Nginx/Caddy 配置、SSL 证书、高德 Key 轮换（#42）
- 跨平台发布检查清单文档（#39）

### Changed
- CORS 精确允许来源（无 `*`）：含本地 Vite + Capacitor localhost + `APP_CORS_ORIGINS` 环境变量
- `App.tsx` 向 `MapSurface` 传入校园 `origin`/`destination`/`viewportConstraint`（#29）
- 删除 `selectedOrigin`/`selectedDestination` 状态，用户不可编辑端点
- `vite.config.ts` 添加 `base: "./"` 配置（#40）
- `gradle.properties` 启用 `org.gradle.parallel` 和 `org.gradle.caching`，JVM 升至 2048m（#40）
- `cordovaAndroidVersion` 升至 `15.0.0`（Capacitor 8 兼容）（#40）
- GitHub Actions 升级：`actions/checkout@v7`、`android-actions/setup-android@v4`（#41）
- `minifyEnabled true` + `shrinkResources true`（#32）
- proguard-rules.pro 补充 Capacitor bridge、AndroidX、JavascriptInterface 等保留规则（#32）

### Fixed
- 根目录及 `docs/测试/` 中文文件名损坏修复（#23）
- `AndroidManifest.xml` 内容重复修复（#24）
- `android:allowBackup` 改为 `false`（#40）
- `file_paths.xml` 路径限制为 `Pictures/`、`Download/`（#40）
- `network_security_config.xml` 生产域名强制系统证书，防止 MITM（#42）
- `.env.android.example` 补充高德 Key 变量（#40）
- CI lint 步骤移除 `|| true`，错误不再被吞并（#41）
- CI 移除 `--channel=3`（Canary 频道），改用稳定频道（#41）
- `.gitignore` 明确排除 `google-services.json` 和 `*.keystore`（#40）

## [1.0.0] - 2026-06-14

### Added
- PostGIS dev startup script at `scripts/start-postgis-dev.ps1`.
- Integration smoke script for validating the frontend-to-backend API chain locally.
- Testcontainers PostGIS integration tests for Flyway seed, spatial reports and commute trends.
- React/TypeScript map dashboard with AMap and offline demo modes.
- Spring Boot API for reports, heatmap, route comparison and commute trends.
- Backend Docker image for running the Spring Boot API in containers.
- PostGIS Docker Compose stack for local PostgreSQL/PostGIS deployment.
- PostgreSQL demo seed migration for heatmap reports, commute trends and a sample route query.
- Optional Maven mirror settings for environments where Maven Central is unstable.
- Route-query persistence for storing route comparison inputs and JSON results in PostGIS.
- Route history API for reading recent route comparisons by device.
- Heatmap refresh API for persisting computed cells into the PostGIS `emotion_cell` cache.
- Backend CI workflow for running Java 17 Maven tests on pushes and pull requests.
- Structured commute trend summary with average stress, stress delta and trend direction.
- OpenAPI metadata and controller tags for clearer Swagger API documentation.

### Changed
- Merged `develop` frontend shell for local integration debugging.
- Extended the postgres profile to pass `DEVICE_HASH_SALT` into Flyway migrations.
- Updated `.env.example` with backend, CORS and PostGIS runtime variables.
- Clarified production startup documentation for the current backend/PostGIS Compose stack.
- Documented backend API endpoints in `README.md`.
- Backend CI now runs Maven verify and uploads the API jar plus Surefire test report artifacts.
- Expanded JDBC repository test coverage for PostGIS heatmap cache writes.
- Expanded API smoke coverage for mood report submission and commute completion.
- Actuator info now exposes backend name, version, mode and description.
- Ignored Maven wrapper cache downloads to keep local build artifacts out of commits.

### Fixed
- PostGIS Testcontainers integration tests now declare the PostGIS image as a compatible PostgreSQL substitute for Testcontainers 1.21+.
- Mock route comparison now returns distinct fastest and least-stressful route IDs for the standard Beijing demo coordinates.
- PostgreSQL commute trend queries now read nullable numeric columns without failing on JDBC row mapping.
- Root URL now redirects to Swagger UI instead of returning a 500 error page.
- Missing required request headers now return a structured 400 response.
- Commute and route-query writes now refresh PostGIS `device_profile` activity timestamps.
- Non-finite coordinates, invalid heatmap bounds and invalid trend timezones now return 400 responses.
- Missing query parameters, type mismatches and malformed JSON now return structured 400 responses.

## [0.1.0] - 2026-06-10

### Added
- Architecture baseline and executable project skeleton.

