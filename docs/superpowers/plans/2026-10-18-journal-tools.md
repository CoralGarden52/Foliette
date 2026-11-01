# Foliette 手账工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user selects delegated execution. Steps use checkbox syntax for tracking.

**Goal:** 新增独立手账工具入口，提供胶带铺贴、胶带专属裁剪和花边、三种画笔及局部笔迹擦除，兼容历史、持久化、导出和手机触控。

**Architecture:** 胶带和笔迹作为现有文档中的新元素类型，以自包含 SVG 渲染。独立几何模块处理变换与命中，独立指针交互模块维护临时预览；编辑器仅负责一次性提交文档、历史和保存，后端校验结构化数据而不接受 SVG 字符串。

**Tech Stack:** 现有 React、TypeScript、SVG、Pointer Events、Express、SQLite；不增加依赖或数据库表。

**Spec:** `docs/superpowers/specs/2026-10-18-journal-tools-design.md`，包含用户确认的两种剪刀独立使用规则。

## Global Constraints

- 任何剪刀都不裁剪照片、图片贴纸、文字或画布底纸；橡皮擦仅擦除笔迹，不擦胶带。
- 纯色、条纹、格纹、波点、花卉五种胶带；波浪边、锯齿边、邮票边、撕纸边四种花边。
- 钢笔默认灰绿、粗细 6，粗细范围 1–60；橡皮擦直径默认 32，范围 8–120，单位均为设计像素。
- 一笔最多 2048 点，采样间距至少 1；一笔累计擦除轨迹最多 4096 点；500 元素、8MB 请求体、20 张照片上限不变。
- 触控按钮最小点击区域 44px；320px 屏幕无横向溢出。控件保留标签，不添加常驻小字操作说明。
- 两种剪刀可独立使用；裁剪可恢复，原照片文件始终不变；不重新引入随机贴纸功能。
- 不添加运行时依赖、不提交 Git；当前目录不是 Git 仓库，直接在现有工作区实现，不创建分支或工作树。
- 仓库没有测试框架，不引入测试框架或永久测试目录；先运行失败的一次性 Node 断言或浏览器场景，再实现并重跑。

## Review Focus

1. 旋转、缩放、平移后的胶带裁剪和笔迹擦除应使用正确局部坐标，不能跳位。
2. 双指缩放、系统取消指针及页面失焦不能误提交半笔、误裁剪或留下卡住的交互模式。
3. 复制和移动已擦除笔迹、复制同图案胶带时，遮罩、标识符和数组不能串联共享。
4. 超长笔迹、反复擦除、500 元素或非法请求达到限制时，应保持已有作品和撤销历史完整。
5. 同一页面的多个 SVG 图案和遮罩，在 PNG/JPG 导出及缩略图中必须与编辑画布一致。

---

## 文件职责

- `web/src/types.ts`：新元素和工具枚举。
- `web/src/data/journal.ts`：工具标签、胶带款式、笔型默认值、预设颜色、边缘选项。
- `web/src/lib/journalGeometry.ts`：纯几何与结构化裁剪/擦除计算，无 React 状态。
- `web/src/components/JournalItemView.tsx`：胶带与笔迹的自包含 SVG 渲染。
- `web/src/lib/useJournalGesture.ts`：单次指针手势、临时预览、取消及采样上限。
- `web/src/components/JournalToolsPanel.tsx`：独立低饱和工具面板与参数控件。
- `web/src/components/Stage.tsx`：新元素渲染、工具模式路由及现有触控衔接。
- `web/src/pages/EditorPage.tsx`：工具状态、文档事务、撤销/保存、手机悬浮工具条。
- `web/src/components/panels.tsx`：新增入口、图层图标/名称、新元素样式入口。
- `web/src/premium.css`：工具控件及移动端导航样式。
- `server/src/journalValidation.js`、`server/src/validation.js`：新元素专用校验与接入。
- `README.md`、`docs/development-plan.md`：用户功能说明及实际验收结果。

## Task 1：元素结构、几何与服务端校验

**Interfaces:**
- `JournalPoint = { x: number; y: number }`；`JournalRect = { x: number; y: number; w: number; h: number }`。
- `TapePattern = "solid" | "stripe" | "grid" | "dot" | "flower"`；`TapeEdge = "straight" | "wave" | "zigzag" | "stamp" | "torn"`。
- `BrushKind = "pen" | "marker" | "highlighter"`；`JournalTool = "select" | "tape" | "scissors" | "edge" | "brush" | "eraser"`。
- `TapeItem extends BaseItem`：`kind:"tape"`、`opacity`、`pattern`、`color`、`accentColor`、`sourceW/sourceH`、`crop?:JournalRect`、`edge`、`edgeSize`。
- `InkItem extends BaseItem`：`kind:"ink"`、`opacity`、`brush`、`color`、`size`、`sourceW/sourceH`、`points:JournalPoint[]`、`erasures:{points:JournalPoint[];size:number}[]`。
- `toItemPoint(point:JournalPoint,item:TapeItem|InkItem):JournalPoint`：逆旋转及缩放至稳定源坐标；恢复裁剪不改源尺寸。
- `createTape(start,end,width,style):Omit<TapeItem,"id"|"z">|null`、`createInk(points,style):Omit<InkItem,"id"|"z">`、`cropTape(item,start,end):JournalRect|null`、`eraseInk(items,points,diameter):{items:Item[];changed:boolean;limited:boolean}`。
- `validJournalItem(item):boolean`：仅对 tape/ink 验证白名单字段，原有类型沿用旧校验。

- [x] 先运行一次性断言，确认现有 `validItems` 拒绝合法 tape/ink；几何函数未实现的导入失败，记录红灯。
- [x] 新增枚举和元素类型；将 `Item` 扩展为五类。默认钢笔 6/1.0、马克笔 18/0.65、荧光笔 32/0.3，橡皮擦 32，胶带宽度 54、透明度 0.85。
- [x] 实现逆变换、胶带起终点几何、裁剪范围相交、笔迹包围盒及轨迹线段命中；擦除只对命中 ink 增加局部遮罩，遵守点数限制，未命中返回原文档。
- [x] 新增新类型的服务端白名单校验；颜色只接受六位十六进制，所有坐标有限且不超过现有 100000 边界，源尺寸正数；拒绝越界 crop、未知枚举、超量点列及任意额外 SVG/URL 字段。
- [x] 重跑 Node 断言：随机旋转/缩放的正逆变换误差 <0.0001；裁剪与源矩形相交正确；无效/退化手势不创建胶带；擦除不改变 photo/text/sticker/tape；2048/4096 边界、NaN、负数、500/501 元素和旧文档接受规则正确。

## Task 2：胶带、花边与局部擦除 SVG

**Interfaces:** `JournalItemView({item}:{item:TapeItem|InkItem})`；使用 `sourceW/sourceH` 的 viewBox，使缩放后局部遮罩与图案一起变换。

- [x] 先运行浏览器场景确认现有 Stage 无法呈现新类型，记录红灯；只创建自有 QA 作品。
- [x] 实现五种图案与五种边缘（含直边），图案坐标独立于 crop；裁剪矩形与花边取交集，撕纸形状由稳定参数生成，不每次渲染随机变化。
- [x] 实现三种笔型与点按圆点；擦除通过局部 SVG mask 露出真正底层。标识符由 React 唯一标识加元素标识组成，避免编辑画布、预览与复制图案互相引用。
- [x] Stage 接入两个渲染分支，复制/图层访问使用类型收窄；图层显示「胶带」和对应笔型，不访问不存在的 src/shape。
- [x] 浏览器检验五种图案和四种花边、尺寸变化、裁剪后图案稳定、两张同图案胶带与复制笔迹互不干扰。导出小样并查看图像，确认多个图案和局部擦除效果正确。

## Task 3：胶带铺贴、普通剪刀与独立花边工具

**Interfaces:** `JournalSettings` 保存当前工具、胶带图案/配色/宽度/透明度、边缘类型/尺寸、笔型/颜色/粗细、橡皮直径；设置不进入作品历史。`commitJournal(nextItems:Item[],selectedId:string|null):void` 在文档变更时创建一次快照并提交。

- [x] 先运行浏览器场景确认没有独立「手账工具」入口，记录红灯。
- [x] 新增面板、`TabId:"journal"` 和工具入口；原侧栏宽度保持，手机七个入口适配 320px 并保留 44px 点击区域。
- [x] 新增指针交互 hook，胶带拖拉和裁剪预览只存临时状态；松手调用 `commitJournal`，不逐点更新作品。胶带零长手势取消。
- [x] 普通剪刀仅命中胶带，可直接点选再拖选 crop；花边工具不依赖 crop，选中完整胶带就可设置四种边缘及大小。恢复同时清除 crop 和花边，保留其他属性。
- [x] 新元素可正常选中、移动、旋转、缩放、改透明度、复制、删除及调整图层；新增胶带和复制检查 500 元素容量。连续滑块/颜色手势只提交一次历史。
- [x] 桌面验证拖拉五种胶带、旋转后裁剪、先花边后普通剪刀及反向顺序、恢复和单步撤销/重做；在照片和文字上使用剪刀时数据不变。

## Task 4：画笔、局部橡皮与手势冲突

**Interfaces:** `useJournalGesture` 向 Stage 提供 pointer down/move/up/cancel、预览、`cancel()`；提交时读取最新文档，`pointercancel`、失焦、切换工具或作品时丢弃预览。预览节点均标记导出忽略。

- [x] 先运行缺少画笔/局部橡皮的浏览器场景，记录红灯。
- [x] 接入三种画笔的采样、点按及颜色/粗细设置；画布边界裁掉视觉越界内容，笔迹几何使用设计坐标，一笔最多 2048 点。
- [x] 橡皮预览只更新临时 ink 渲染结果，结束后仅提交命中的笔迹；累计擦除点最多 4096，达到上限终止并提示，不丢弃历史内容。
- [x] 两指取消未提交工具手势后交给视图缩放，不触发照片缩放或误绘制；选择模式保留原来的同照片双指缩放和画布平移。工具切换、失焦、丢捕获清理指针。
- [x] 手机选择绘制工具后收起抽屉；浮动工具条提供当前工具、颜色、设置及完成，退出后恢复选择模式。工具抽屉和模态框打开时阻止后台工具误触。
- [x] 桌面与原生触摸验证不同缩放/平移绘制、擦除真实透明、移动已擦笔迹、复制后独立擦除、新笔迹不受旧遮罩影响；未命中擦除不记历史。2048/4096 上限、双指、pointercancel、失焦与切换作品后无残留提交。

## Task 5：持久化、撤销、导出与部署验收

- [x] 在自有 QA 作品混合照片、文字、贴纸、五类胶带和三种笔迹；逐项执行剪裁、花边、局部擦除、复制、移动、缩放和旋转，验证每次操作一次撤销/重做。
- [x] 修改比例后新元素按原有非照片元素规则缩放；源坐标、花边和擦除同步变换，照片全图显示不变。深拷贝复制项的嵌套数组和遮罩。
- [x] 保存、等待成功、刷新并比较结构；加载旧作品不重写数据。API 负例验证未知字段、非法颜色/裁剪/点列被拒绝，失败不覆盖上次保存。
- [x] 320/390/768/1440px 检查入口、设置、抽屉及绘制模式无横向溢出；触屏验证正常选择模式手势、绘制转双指及工具恢复。
- [x] 导出 PNG/JPG 标准与高清，实际查看导出图，确认图案、花边、擦除正确且无工具光标、选中框、临时预览。再检查新作品首页封面正常显示。
- [x] 运行 `npm run check`、`npm run build`，期望退出码 0；运行 `docker build --tag foliette:dev-20261018 .`，期望镜像导出成功。不删除容器、卷或缓存；如遇已知父快照缺失，仅无缓存重试并记录实际结果。
- [x] 更新 README 和开发记录，逐条核对设计稿验收项；记录真实通过与未通过项，不声称已公开部署。

## 执行记录

用户已确认当前会话原生顺序执行。五项任务均已实现，经过独立最终审查与回归修复，几何/校验断言、桌面及原生手机触摸、撤销、保存、PNG/JPG 和 Docker 构建验证通过。具体证据与修复记录见 `2026-10-18-journal-tools-progress.md`。
