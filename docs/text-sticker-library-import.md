# 批量文字贴纸导入

来源：`D:/github/PhotoWalls/assets/text stickers`。15 张合图全部参与整理；`ChatGPT Image Oct 19, 2026, 09_51_43 AM.png` 与既有参考图 RGB 相同，沿用原 35 个模板标识，避免重复。其余 14 张增加 577 款。后续下架旧款 `note-21` 的新增入口，当前展示 611 款，旧作品仍兼容全部 612 个标识。

## 来源数量

| 来源文件 | 新增 |
| --- | ---: |
| ChatGPT Image Oct 19, 2026, 09_49_48 AM-1.png | 35 |
| ChatGPT Image Oct 19, 2026, 09_49_56 AM-2.png | 43 |
| ChatGPT Image Oct 19, 2026, 09_49_58 AM-3.png | 35 |
| ChatGPT Image Oct 19, 2026, 09_50_00 AM-4.png | 40 |
| ChatGPT Image Oct 19, 2026, 10_14_18 AM-1.png | 41 |
| ChatGPT Image Oct 19, 2026, 10_14_20 AM-2.png | 27 |
| ChatGPT Image Oct 19, 2026, 10_14_22 AM-3.png | 34 |
| ChatGPT Image Oct 19, 2026, 10_14_24 AM-4.png | 24 |
| Pastel Planner Sticker Sheet-1.png | 40 |
| Pastel Journaling Sticker Collage-2.png | 62 |
| Pastel Scrapbook Stationery Sticker Sheet-3.png | 41 |
| Pastel Stationery Sticker Sheet-4.png | 43 |
| Pastel Scrapbook Sticker Sheet-5.png | 55 |
| Pastel Stationery Sticker Collage-6.png | 57 |

## 素材规则

- 白底组 153 款、横版组 126 款、Pastel 组 298 款。原像素裁切透明 PNG，不放大、不 AI 重绘；记录来源 SHA-256、原生尺寸、裁剪框、正文安全区与清单标记区，源文件不修改。
- 成品位于 `assets/text-stickers/`。所有文字贴纸保持原始比例，文字自动适配留白；包括原有两款在内共 24 款清单支持增加行数，不拉长任何纸面或图案。
- 17 个没有纸面留白的微型点缀，添加下方透明配文区，装饰本身不变。极小点缀清晰度受原图像素限制。
- 印刷标题、日期、日历、票号属于原图，不是可编辑正文。非清单保留原纹理与格线；清单只清理审核安全区内的引导线和标记列，动态行标替代旧标记。
- 源图中已合并、遮挡的设计保留可见整体，不推测补画：Pastel 第 6 张银色本、绿胶带本被花束遮挡；第 5 张夹板纸、第 6 张相机标签保留为组合。

## 重建

需要 Python、Pillow、NumPy。运行全部提取工具后完整执行集成命令；不要以局部 `--collections` 参数替换最终合并表。生产环境与 Docker 无需 Python。

```powershell
python scripts/import_white_text_stickers.py
python scripts/import_wide_text_stickers.py
python scripts/import_pastel_text_stickers.py
python scripts/prepare_imported_text_stickers.py
npm run check
npm run build
```

审核配置：`scripts/text-sticker-{white,wide,pastel}-review.json`。集成工具生成正文底图、前端 `textStickers-imported.json` 与后端同名白名单。诊断图位于忽略的 `.playwright-mcp/`，来源哈希与裁剪坐标保留在三组注册表中。
