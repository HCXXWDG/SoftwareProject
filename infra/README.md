# Infrastructure

成员 B 负责本目录。

计划包含：

- PostgreSQL/PostGIS 容器
- Spring Boot 后端容器
- React 前端构建与静态服务容器
- Docker Compose 开发编排
- 健康检查、端口和环境变量说明

生产密钥和数据库密码只通过环境变量提供，不得写入 Compose 文件或提交到 Git。

