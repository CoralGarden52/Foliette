# Admin Stats Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in the current session.

**Goal:** 在已有网站内增加无公开入口、由服务器授权的轻量统计后台。
**Architecture:** SQLite 日汇总及35天去重明细；同源匿名 Cookie 采集；服务器 ID 白名单保护 HTML 和 JSON，React 懒加载后台。
**Tech Stack:** 现有 Express 5、node:sqlite、React、TypeScript、SVG；不新增依赖。
**Spec:** `docs/superpowers/specs/2026-10-19-admin-stats-design.md`

## Global Constraints
- 北京时间分日；30天含今天；管理员默认关闭；普通页面无入口。
- 不修改已有用户数据；所有测试隔离数据库；采集失败不干扰主流程。

## Review Focus
- 午夜边界与30天缺失日期：固定时间测试及补零。
- 已登录普通用户伪造管理员字段：实际 HTTP 403 测试。
- StrictMode 重复请求、重复导出事件：事件 ID 幂等测试。
- 非本人作品、无会话、跨站导出：实际 HTTP 测试。
- 重启与明细清理：日汇总持久化测试，不丢历史总数。

### Task 1: 服务端统计、权限与测试
- [x] 先新增 `tests/analytics.test.mjs`，验证时区、汇总、去重、权限和采集，并运行确认失败。
- [x] 新增 `server/src/analytics.js`，接口 `dayKey(at)`、`createAnalytics(db, {secret, startedAt})`，返回 `recordEvent`、`recordActive`、`stats`；持久化采集起点。
- [x] 新增 `server/src/admin.js` 和 `server/src/routes/analytics.js`，提供 `GET /api/admin/stats`、`POST /api/analytics/events`，保护 `/admin` 路径。
- [x] 将 Express 应用从启动入口提取到 `server/src/app.js`，便于临时端口测试；启动行为不变。
- [x] 运行服务端测试，修复并记录结果。

### Task 2: 前端采集和隐藏后台
- [x] 新增 `web/src/lib/analytics.ts` 和 `usePageView.ts`，按已展示路由上报、事件幂等、可见心跳、导出后采集；编辑页等作品加载成功才记录。
- [x] 新增 `web/src/pages/AdminStatsPage.tsx` 及独立 CSS，读取统计成功后显示七项指标、30天 SVG 趋势、每日明细。
- [x] 修改 `App.tsx` 仅加路由和页面采集，不在菜单加入口；现有登录页仅允许固定后台返回地址。
- [x] 修改 `EditorPage.tsx` 的成功下载分支，上报带作品 ID 的导出事件。
- [x] 执行类型检查和构建，并用浏览器验证管理员、普通用户和手机布局。

### Task 3: 配置、运维和验收
- [x] 新增 `scripts/admin-user.mjs` 和运行镜像可用的 `server/src/admin-user.js`，从已注册邮箱查询 ID；更新 package、环境变量、Compose 和 README。
- [x] 运行全部测试、类型检查、生产构建及权限/采集验收；记录已完成工作和限制。

## Execution ledger
- 2026-10-19：现有目录不是 Git 仓库，直接在用户提供工作区执行，不创建分支或提交。用户已要求按照会话确认方案实现；不重复申请实施授权。管理员真实账号尚未指定，交付安全默认关闭的配置和操作方法。
- 实际新增14项测试中的8项统计相关测试（其余6项原有测试）；`npm test` 全14通过，`npm run check` 和 `npm run build` 成功。
- 独立代码审查发现并修复：HTTP 非安全上下文事件 ID 兼容、Vite 代理改写 Host 导致采集403、URL 编码后台路径绕过 HTML 门禁、仅管理员读数时去重明细未清理。对应回归测试通过，复查无剩余重要问题。
- 使用独立临时数据库、测试账号和18919端口完成真实 Chrome 验收：管理员登录返回后台、7张卡片、30行数据、趋势切换、刷新、普通账号403且不显示指标、作品页后台链接数0、390px无页面横向溢出、无页面脚本异常。
- 下载验收：预览事件数0、生成 PNG 并下载后仅1次导出事件且返回204；不存在作品的编辑页浏览事件数0。
- 用真实 Vite 配置启动独立代理18920，将测试目标替换为18919；保留浏览器 Origin 的采集请求返回204，未干扰已有8787服务。
- 限制：未部署到公网、未替用户选择实际管理员、未重新构建 Docker 镜像；镜像内查询入口沿用现有 COPY server 布局，已通过直接执行该入口测试。
