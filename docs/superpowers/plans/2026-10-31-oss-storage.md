# OSS Storage Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans, implement inline in the current workspace.

**Goal:** 在腾讯云部署的现有后端中接入用户创建的私有 OSS Bucket，保留本地旧照片。
**Architecture:** 本地/OSS 适配器，上传位置元数据，事务化持久删除队列，同源鉴权流式图片接口。
**Tech Stack:** Express、SQLite、ali-oss 6.x；前端保持现有 API。
**Spec:** `docs/superpowers/specs/2026-10-31-oss-storage-design.md`

## Global Constraints
- Bucket `foliette-photos-prod`；region `oss-cn-shenzhen`；HTTPS Endpoint `oss-cn-shenzhen.aliyuncs.com`。
- 默认 local；OSS 未配置凭证不能切换；不迁移或删除现有用户文件。
- 无 Git 仓库，在现有目录执行，无提交和 worktree。

## Review Focus
- 保存时不能跨用户/作品复用原图，远端错误不能降级读取残留本地文件。
- 批量上传失败不能留下半批元数据；删除失败可恢复重试。
- 旧 SQLite 上传表自动升级，原照片 URL 不变。
- 密钥和签名 URL 不进入日志或客户端响应。
- 非法/超限图片不能上传云端；暂存文件必须清理。

### Task 1: Storage and schema
- [x] 写 `tests/photoStorage.test.mjs` 并确认失败。
- [x] 新增 `server/src/photoStorage.js`，提供 `getPhotoStorageConfig(env)`、`createPhotoStorage({config,uploadDir,clientFactory})`、`putFile`、`open`、`remove`；仅远端对象可触发 OSS 操作。
- [x] 升级 uploads 元数据与删除队列，新增 `server/src/photoFiles.js` 编排回滚/清理。
- [x] 验证上传下载、配置、路径与云端错误测试。

### Task 2: Existing API integration
- [x] 写 `tests/ossRoutes.test.mjs` 并确认失败，注入可控客户端，使用临时数据库。
- [x] 修改 `routes/walls.js`，新增上传位置记录、同源流式读取、保存校验及事务删除；不改变前端返回结构。
- [x] 启动时与每分钟重试删除队列，保留失败任务。
- [x] 跑 HTTP 测试并覆盖无凭证的本地模式。

### Task 3: Connection tools and delivery
- [x] 添加 `.env.oss.example`、`start:oss`、`oss:check`、只读默认的 `oss:migrate`，透传 Compose 环境变量，文档提供 scoped RAM Policy。
- [x] 检查命令在缺凭证时只报告变量名；真实连接测试留待用户本地配置。
- [x] 跑全套测试、check、build，并做独立代码复查；修复重要问题。

## Ledger
- 2026-10-31：用户通过会话选定后端代理私有 OSS 方案并提供 Bucket 参数；延续此前授权直接实施，不重复请求批准。凭证由用户自行填写，当前在运行的用户端保持 local。

- 完成：新增14项相关测试（含HTTP子测试）后，全套28项测试通过；类型检查与生产构建成功。SDK固定在6.x版本范围并更新锁文件。
- 独立审查发现并修复两个迁移进程可能删除对方已发布对象的问题；增加跨进程文件锁，验证回归先失败后通过，复查无剩余重要问题。
- 已提供RAM策略JSON、已填Bucket但未填凭证的本地配置、连接检查和默认dry-run迁移命令。已验证缺凭证时友好报告变量名，不发云请求、不输出SDK敏感数据。
- 实际云连接仍未验证：用户尚在创建RAM凭证。没有修改Bucket权限，没有迁移真实照片，没有把当前8787服务切换至OSS。当前用户端健康接口200。
