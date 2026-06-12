# CI 与 develop 分支保护

## 必需检查

所有合并到 `develop` 的 Pull Request 必须通过：

- `Frontend CI`：安装锁定依赖、运行 Vitest、构建生产包。
- `Backend CI`：使用 Java 17 执行 Maven `verify`，并上传 JaCoCo 报告。

工作流不读取高德 Key、数据库密码或其他 Secret。前端地图测试使用无 Key
离线回退，后端测试使用默认 demo 配置。

## develop 保护规则

仓库管理员应为 `develop` 启用以下规则：

- 必须通过 Pull Request 合并。
- 至少需要 1 名批准者。
- 新提交到来时撤销过期批准。
- 最后一次推送必须由其他成员批准。
- 必须通过 `Frontend CI` 和 `Backend CI`。
- 合并前分支必须与 `develop` 保持最新。
- 必须解决全部评审对话。
- 管理员也遵守上述规则。
- 禁止强制推送和删除分支。

首次添加 CI 的 Pull Request 运行成功后，再将两个检查设置为必需检查，避免
GitHub 尚未识别检查名称时无法选择。

## 本地验证

前端：

```powershell
cd frontend
npm ci
npm test
npm run build
```

后端：

```powershell
cd backend
.\mvnw.cmd --batch-mode --no-transfer-progress verify
```
