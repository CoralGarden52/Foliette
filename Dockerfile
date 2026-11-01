# ============================================================
#  Foliette · 手帐风照片墙 —— 多阶段构建
#  阶段一：构建前端静态资源
#  阶段二：仅安装生产依赖并运行 Node 服务（内置 node:sqlite，无原生模块）
# ============================================================

# ---------- 1. 前端构建 ----------
FROM node:22-bookworm-slim AS web-build
WORKDIR /build

COPY web/package*.json ./
RUN npm ci --no-audit --no-fund

COPY web/ ./
RUN npm run build

# ---------- 2. 运行镜像 ----------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/app/data \
    ASSETS_DIR=/app/assets \
    PUBLIC_DIR=/app/public \
    TZ=Asia/Shanghai

WORKDIR /app

# 只安装生产依赖（服务端零原生依赖，构建秒完成）
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server/ ./

# 前端产物
COPY --from=web-build /build/dist ./public
# 内置素材（头像 / 贴纸）
COPY assets ./assets

# 上传目录 & 数据目录
RUN mkdir -p /app/data/uploads && chown -R node:node /app

USER node

EXPOSE 8080
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
