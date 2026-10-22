# Infrastructure

成员 B 负责本目录。

## 开发模式

```bash
docker compose -f compose.yml --env-file ../.env up -d
```

## 生产部署

详见 [docs/生产部署指南.md](../docs/生产部署指南.md)。

### 关键环境变量

| 变量 | 说明 |
|------|------|
| `POSTGRES_PASSWORD` | 数据库密码（生产必须为强随机值） |
| `DEVICE_HASH_SALT` | 设备 ID 哈希盐（生产必须更换） |
| `AMAP_WEB_KEY` | 高德 Web 服务 Key（后端用） |
| `APP_CORS_ORIGINS` | CORS 允许的前端域名（生产填入 PWA 域名） |

### 架构

```
compose.yml
├── postgres (PostGIS 16) — 5432
├── api (Spring Boot)     — 8080
```

生产环境需在 API 前增加 HTTPS 反向代理（Nginx/Caddy），详见部署指南。

