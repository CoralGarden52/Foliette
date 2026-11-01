# 🚢 部署与数据备份

## Docker 上线

1. 复制 `.env.example` 为 `.env`。
2. 使用下面的命令生成随机密钥，填入 `.env` 的 `JWT_SECRET`。至少 32 个字符；默认开发密钥和示例占位内容不能用于生产。

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 foliette
```

默认端口为 8080，打开 http://服务器地址:8080 。`GET /api/health` 是健康检查。镜像分阶段构建，使用非 root 用户、只读根文件系统，SQLite 和上传文件写入 `foliette-data` 命名卷；重启和重建镜像保留数据。仅在一个服务实例中使用该 SQLite 数据卷。

需要域名与 HTTPS 时，可将 Caddy 放在宿主机上，并转发到容器发布的 8080 端口：

```caddyfile
photos.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

启用 HTTPS 后设置 `COOKIE_SECURE=1`，反向代理只有一跳时设置 `TRUST_PROXY=1`，然后 `docker compose up -d`。可将 Compose 的端口绑定改为 `127.0.0.1:8080:8080`，只允许反向代理访问。使用 Nginx 时需将请求大小上限设置为至少 256 MB，容纳最多 20 张原始照片的一次上传。

| 变量 | 默认/用途 |
| --- | --- |
| `PORT` | 对外发布端口，默认 8080 |
| `JWT_SECRET` | 生产环境必填的随机登录签名密钥 |
| `JWT_EXPIRES_IN` | 登录有效期，默认 `30d` |
| `COOKIE_SECURE` | HTTPS 部署设置为 `1`，本地 HTTP 为 `0` |
| `TRUST_PROXY` | 默认 `0`；一层可信反向代理时为 `1` |
| `MAX_PHOTOS_PER_WALL` | 默认 20，不能超过 20 |
| `MAX_UPLOAD_BYTES` | 单图上传上限，默认 12582912 字节 |

容器内固定使用 `/app/data`、`/app/assets` 和 `/app/public`。如需更新内置素材，可额外挂载 `./assets:/app/assets:ro`。

备份时先停止服务，再完整备份命名卷，随后启动服务；需要同时保留 `foliette.db`、可能存在的 WAL 文件和 `uploads/`。恢复时保持相同目录结构。`docker compose down` 保留数据，带 `-v` 会删除数据卷。

## 阿里云 OSS

腾讯云服务器访问私有 OSS 的 RAM 授权、环境变量、连接检查和迁移方法见 [OSS 接入说明](oss.md)。Docker 使用服务器 `.env` 中的 OSS 配置，本机联调使用 `.env.oss`。已有本地照片和 SQLite 数据库需要一并保留或迁移。
