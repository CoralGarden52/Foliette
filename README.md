# 📔 Foliette

![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22.12%2B-5FA04E?logo=nodedotjs&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Aliyun OSS](https://img.shields.io/badge/Aliyun_OSS-FF6A00?logo=alibabacloud&logoColor=white)

**把日子，贴成喜欢的样子。**

Foliette 是一款手账风照片拼贴与生活记录工具。把照片放在喜欢的纸张上，贴上便签和胶带，写下当时的心情，再将这一页日常收藏或导出。

## ✨ 功能介绍

### 📸 自由拼贴照片

支持整齐排列、随机排布和满版拼贴，搭配拍立得、胶片、邮票等相框。照片可自由拖动、缩放、旋转和调整图层，每面照片墙最多容纳 20 张照片。

### 🎨 搭配纸张与贴纸

从素纸、方格、点阵到牛皮纸，为照片选择合适的背景。花草、甜点、旅行等贴纸可点击添加或拖入画布，也能随时替换、复制和调整位置。

### 📝 写下生活片段

添加标题、短句、便签与清单，搭配中文手写字体、颜色和排版。文字可直接在画布中编辑，文字贴纸会根据留白区域适配内容。

### 🖌️ 体验手账绘画

使用钢笔、马克笔、荧光笔和彩虹笔记录灵感，橡皮擦可局部擦除笔迹。胶带支持拖拉铺贴，花边剪刀提供波浪、锯齿、邮票与撕纸边效果。

### ✂️ 裁出喜欢的轮廓

沿照片勾画自由裁剪区域，圈外部分透明保留。原图不会被覆盖，可重新裁剪、恢复原图，并通过撤销与重做调整创作过程。

### 💾 保存作品与导出图片

作品自动保存，支持重新打开继续编辑。完成后可预览并导出 PNG / JPG，选择不同清晰度，导出图片包含作品所用的字体与装饰。

### 📱 在电脑和手机上创作

电脑使用拖拽与快捷键操作，手机和平板支持触控拖动、双指缩放及底部工具面板。可从相册选择照片，也可调用设备拍照。

### 🔐 收藏属于自己的作品

邮箱注册登录后，每个账号拥有独立的照片墙和作品列表。作品与原图均校验用户身份，支持本地存储或私有阿里云 OSS。

### 📊 查看网站运营情况

管理员可通过 `/admin/stats` 查看访问量、访客、注册、活跃、作品与图片导出数据，以及最近 30 天趋势。普通界面不显示入口，页面和接口均验证管理员权限。

## 🚀 快速运行

需要 Node.js ≥ 22.12。

```bash
npm run setup
npm run dev
```

访问 [http://localhost:5173](http://localhost:5173)，注册账号后即可开始创作。

技术栈：React + TypeScript + Vite，Express + SQLite。支持 Docker 部署和阿里云 OSS 存储。

## 🙏 素材致谢

示例照片来自 [Unsplash](https://unsplash.com/license)，仅用于登录页与排版预览，不会自动加入用户作品。内置中文字体包括马善政楷书、龙藏手书、志莽行书、流江毛草和站酷快乐体，各自的 OFL 许可证保留于 `assets/fonts/`。
