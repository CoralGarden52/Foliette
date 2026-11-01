# 贴纸合图整理

## 来源与结果

来源为用户提供的 `D:/github/PhotoWalls/assets/stickers1/`，共 10 张 1254×1254 RGB PNG 合图。原文件保持不变，没有使用 AI 重绘或超分辨率放大。

完成筛选的 595 张独立透明 PNG 保存在以下目录，网站「贴纸」面板按同名分类展示，旧有分类及素材继续保留。

| 分类 | 目录 | 数量 |
| --- | --- | ---: |
| 花园植物 | `assets/stickers/garden/` | 184 |
| 甜点茶歇 | `assets/stickers/tea/` | 51 |
| 旅行拾光 | `assets/stickers/travel/` | 60 |
| 心意装饰 | `assets/stickers/hearts/` | 300 |

文件名包含分类、合图编号和区域编号，例如 `garden-s01-001.png`。`assets/sticker-manifest.json` 记录分类、展示名称、原始裁剪坐标、像素尺寸和来源文件 SHA-256，便于追溯。

## 清晰度与筛选

- 直接裁取原始像素，主体 RGB 数据逐像素保留；仅生成透明度遮罩，不缩小、不插值放大、不重新绘制。
- 保留原贴纸的纸白轮廓和部分自然阴影，外围背景透明；透明边界做轻量平滑，主体不模糊。
- 连通区域识别后使用人工审核的分区处理相邻素材；分区边界穿过明显画面时不强行保留。
- 按用户确认，舍弃无法完整分离、原图已经裁断、过小或主体细节不足的候选；不把灰色阴影碎片当作贴纸。
- 预览缩略图的缩小只用于审核；实际入库 PNG 使用原始裁剪分辨率。小图原本包含的细节有限，不将放大后的像素数量宣称为新增清晰度。

## 重新整理

工具为 `scripts/extract_sticker_sheets.py`，依赖 Python、Pillow 和 NumPy。审核分区与分类配置位于 `scripts/sticker-sheet-review.json`，对应这一批原始合图和固定识别参数，不适用于任意新合图。

```powershell
python scripts/extract_sticker_sheets.py `
  D:/github/PhotoWalls/assets/stickers1 `
  .playwright-mcp/sticker-review-new `
  --core --threshold 205 `
  --review scripts/sticker-sheet-review.json `
  --export .playwright-mcp/sticker-export-new
```

输出目录必须没有同名成品，工具拒绝覆盖已有贴纸。审核目录包含编号合图、拆分后的联系表、来源元数据和未采用候选原因。确认后将四个成品目录加入 `assets/stickers/`，将生成的 `sticker-manifest.json` 放入 `assets/`；不要将原始合图覆盖进成品目录。

这套处理脚本仅用于开发阶段；线上运行和 Docker 镜像不需要 Python，直接使用已整理的 PNG。

## 验证记录

- 595 张成品均可解码为 RGBA PNG，具有透明和完全不透明区域，尺寸与来源裁剪框一致；RGB 数据与对应原始区域完全相同，10 张原图 SHA-256 不变。
- 全部成品四边没有非透明的截断边缘；新素材总大小约 29.9 MiB。
- 桌面验证四分类数量、添加、保存、刷新及 PNG 下载；手机原生触摸验证拖入与选中替换，替换保持位置和尺寸，320/390/768px 分类区域无横向溢出。
- 原「小元素」187 款保持原顺序，16 款内置装饰仍位于最底部。
- 595 个新素材地址均返回 200 和 PNG 类型，后端保存校验全部接受。TypeScript、前端生产构建和 `foliette:dev-20261018` Docker 镜像构建通过；未公开部署服务。
