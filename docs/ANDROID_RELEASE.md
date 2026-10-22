# Android 发布配置指南

## 1. 生成签名密钥（Release Keystore）

```bash
keytool -genkeypair \
  -v \
  -storetype PKCS12 \
  -keystore release.keystore \
  -alias commute-mood-release \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

> 请牢记密码，丢失后无法更新已上架的 APK。

## 2. 配置本地签名

在 `frontend/android/` 下创建 `keystore.properties`（已在 .gitignore 中排除）：

```properties
storeFile=release.keystore
storePassword=***
keyAlias=commute-mood-release
keyPassword=***
```

将 `release.keystore` 放在 `frontend/android/` 目录下。

## 3. 获取签名 SHA1（高德 Key 配置用）

```bash
keytool -list -v -keystore release.keystore -alias commute-mood-release
```

## 4. 高德控制台配置

登录 [高德开放平台](https://console.amap.com/)，在「应用管理 → 我的应用」中：

1. 选择对应应用
2. 添加 Android 平台 Key
3. 填写：
   - **包名**: `com.jiangnan.course.commutemoodmap`
   - **SHA1**: 上一步获取的签名指纹
4. 将生成的 Key 填入 `.env.production` 的 `VITE_AMAP_JS_KEY`

## 5. 构建 Release APK

### 本地构建

```bash
cd frontend
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```

APK 输出路径: `app/build/outputs/apk/release/app-release.apk`

### CI 构建（GitHub Actions）

在仓库 Settings → Secrets 中添加：

| Secret 名称 | 说明 |
|---|---|
| `RELEASE_STORE_FILE_BASE64` | `base64 release.keystore` 的输出 |
| `RELEASE_STORE_PASSWORD` | keystore 密码 |
| `RELEASE_KEY_ALIAS` | key alias（如 `commute-mood-release`） |
| `RELEASE_KEY_PASSWORD` | key 密码 |

CI 会自动生成签名 Release APK。

## 6. 后端部署（HTTPS）

Android 9+ (API 28+) **默认禁止明文 HTTP**。后端必须部署到 HTTPS 服务器：

1. 使用 Let's Encrypt 或其他 CA 获取 SSL 证书
2. 配置反向代理（Nginx/Caddy）启用 HTTPS
3. 前端构建时设置 `VITE_API_BASE_URL=https://your-domain.com`

> `network_security_config.xml` 仅对 `10.0.2.2`（模拟器）和 `localhost` 放行 HTTP。

## 7. 版本递增规范

每次发布前更新 `frontend/android/app/build.gradle`：

- `versionCode` — 整数，每次递增 1（应用市场用于判断新旧）
- `versionName` — 语义化版本号 `"MAJOR.MINOR.PATCH"`
