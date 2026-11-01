# Foliette 私有照片接入阿里云 OSS

已为本项目准备：Bucket `foliette-photos-prod`，地域 `oss-cn-shenzhen`（华南1，深圳），公网 Endpoint `https://oss-cn-shenzhen.aliyuncs.com`。网站后端可部署在腾讯云，使用公网 HTTPS 访问 OSS。

## 1. 创建专用 RAM 用户和 AccessKey

1. 使用有 RAM 管理权限的账号进入 [RAM 控制台](https://ram.console.aliyun.com/)。
2. 在“身份管理 → 用户”创建用户，名称可填 `foliette-oss`，用于程序调用，无需开启控制台访问。
3. 当前控制台可勾选“使用永久 AccessKey 访问”生成密钥；已有用户也可在用户详情的认证管理中创建 AccessKey。如控制台要求选择用途，选择本地开发或阿里云外部应用对应的用途。
4. 立即保存 AccessKey ID 和 AccessKey Secret。Secret 只在创建时显示。真实密钥只填写到本地/服务器配置，不能提交代码仓库，也不用发送到聊天。

官方说明：[创建 RAM 用户](https://help.aliyun.com/zh/ram/user-guide/create-a-ram-user)、[创建 AccessKey](https://help.aliyun.com/zh/ram/user-guide/create-an-accesskey-pair)。

## 2. 为用户绑定专用权限

在 RAM 的权限策略页面创建自定义策略，切换为脚本编辑，复制本目录的 [oss-ram-policy.json](oss-ram-policy.json)。名称可填 `FoliettePhotosAccess`，再把该自定义策略授权给 `foliette-oss` 用户。

此策略只允许 `foliette-photos-prod/photos/*` 下对象的 `PutObject`、`GetObject` 和 `DeleteObject`。不需要管理其他 Bucket，也不需要授予 `AliyunOSSFullAccess` 或管理员权限。连接检查、上传、读取、删除及迁移均使用这三个对象操作；迁移中的 HeadObject 使用 GetObject 授权。

Bucket 保持私有与“阻止公共访问”开启。已选择 OSS 完全托管加密时，不需要额外 KMS 权限。当前设计不直接从浏览器调用 OSS，所以无需配置 OSS 的 CORS。

## 3. 本机填写凭证并检查

项目已准备忽略提交的 `.env.oss`，Bucket 参数已填入。只在自己的编辑器中填写：

```dotenv
OSS_ACCESS_KEY_ID=你的RAM用户AccessKeyID
OSS_ACCESS_KEY_SECRET=你的RAM用户AccessKeySecret
```

使用永久 AccessKey 时，`OSS_SECURITY_TOKEN` 留空。使用 STS 时需同时配置临时凭证的三项内容并自行刷新，当前长期运行部署建议使用专用 RAM 用户凭证并定期轮转。

在项目根目录执行：

```sh
npm run oss:check
```

检查会在 `photos/_connection-check/` 创建一个随机文本对象，验证读回内容，然后删除这个测试对象。不会读取、覆盖或删除已有用户照片。成功输出“OSS 连接成功……上传、读取、删除验证通过”。失败时检查 RAM 授权、地域、Endpoint、凭证及网络；若网络导致探针清理失败，可在控制台删除该目录中本次产生的随机测试文件。

凭证未填时，检查明确报告缺少的变量，不会假装连接成功。

## 4. 启用 OSS

检查通过后，停止当前运行的本地网站，再执行：

```sh
npm run start:oss
```

此命令读取 `.env.oss`，默认端口8787。普通 `npm start` 沿用当前进程环境；未设置 `PHOTO_STORAGE` 时仍为本地模式，不会自动读取 `.env.oss`。OSS 模式缺少必填配置时会拒绝启动，不会悄悄把新照片写回本地。

配置中 `OSS_REGION` 使用 `oss-cn-shenzhen`；不带 `oss-` 前缀的 `cn-shenzhen` 也会规范化。Endpoint 使用外网 HTTPS 地址，腾讯云服务器和本地电脑不能直接使用阿里云内网 Endpoint。

若实际 Bucket 要使用已绑定的自定义域名，把 `OSS_ENDPOINT` 设置为该 HTTPS 域名，并设置 `OSS_CNAME=1`。不要把 Bucket 的完整域名误当成普通区域 Endpoint；普通区域 Endpoint 保持本项目示例的形式。

## 5. 腾讯云 Docker 部署

使用 `.env.example` 准备服务器 `.env`，保留原有生产环境随机 `JWT_SECRET`、数据库目录、管理员 ID 等配置。将 OSS 部分设置为：

```dotenv
PHOTO_STORAGE=oss
OSS_BUCKET=foliette-photos-prod
OSS_REGION=oss-cn-shenzhen
OSS_ENDPOINT=https://oss-cn-shenzhen.aliyuncs.com
OSS_CNAME=0
OSS_ACCESS_KEY_ID=你的RAM用户AccessKeyID
OSS_ACCESS_KEY_SECRET=你的RAM用户AccessKeySecret
OSS_SECURITY_TOKEN=
```

然后构建并启动，检查容器内实际配置：

```sh
docker compose up -d --build
docker compose exec foliette node src/oss-check.js
```

Compose 通过环境变量传入凭证，镜像不包含 `.env` 和 `.env.oss`。不要把开发用默认 JWT 密钥带入生产。已有 `foliette-data` 数据卷继续保存 SQLite、用户信息、统计和兼容的本地照片。

## 6. 旧照片和迁移

切换后，新上传的照片写入 OSS；旧上传记录默认为 local，仍从原上传目录读取。照片地址保持 `/api/files/用户ID/文件名`，前端作品不需要重写。

若要迁移已登记在 uploads 表中的本地照片，先备份数据库和上传目录，并暂停网站写入。默认命令只预览，不访问云端：

```sh
npm run oss:migrate
```

确认后执行：

```sh
npm run oss:migrate -- --apply
```

迁移先复制文件到 OSS，检查远端大小，然后更新该条记录；本地原件保留，重跑时跳过已迁移记录。缺少本地文件的记录会计入缺失数。未登记在 uploads 表的极早期照片继续本地兼容读取，不会自动推断归属并迁移。迁移后不要移除 OSS 凭证，也不要直接更换 Bucket，否则已有 OSS 记录将无法读取；切换回 local 只影响后续新上传。

同一上传目录同时只允许一个正式迁移任务，防止重复运行相互覆盖。正常结束会自动移除 `.oss-migration.lock`；如果上次执行遭到硬中断，必须先确认迁移进程已结束，再手动移除该锁文件后重试。

## 访问与删除口径

- 服务器在取得照片前验证登录和所属用户；不能通过复制照片地址查看其他人的内容。
- 图片由网站后端流式返回，不暴露永久密钥、OSS 原始地址或签名 URL。用户无需更改编辑与导出流程。
- 删除照片或作品时，在 SQLite 事务中撤销引用并持久记录清理任务；即使 OSS 暂时不可用，删除后的 API 访问会立即被拒绝。物理删除失败时，在服务启动和每分钟自动重试。
- 当前迁移/正常上传的临时文件处理不代表系统能清理硬中断时所有未登记远端对象；仍需定期核对存储与备份。
- 此方案使用腾讯云与阿里云之间的公网链路，仍会产生 OSS 相应请求/存储/公网流出计费及网站服务器带宽消耗。它扩展了存储容量，不会自动消除图片的服务器转发流量。
