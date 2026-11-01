import express from "express";
import fs from "node:fs";
import path from "node:path";
import {
  ASSETS_DIR, IS_PROD, PUBLIC_DIR,
} from "./config.js";
import { authRouter } from "./routes/auth.js";
import { filesRouter, wallsRouter } from "./routes/walls.js";
import { readManifest } from "./assets.js";
import { errorHandler, notFound } from "./middleware.js";
import { requireAdminPage } from './admin.js';
import { adminRouter, analyticsRouter, recordSuccessfulActivity } from './routes/analytics.js';

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", Number(process.env.TRUST_PROXY || 0));

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// 基础安全响应头
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "Foliette", time: Date.now() });
});

app.get("/api/assets/manifest", (_req, res) => {
  res.json(readManifest());
});

// 上传的照片（需登录且只能看自己的）
app.use(recordSuccessfulActivity);
app.use('/api/admin', adminRouter);
app.use('/api/analytics', analyticsRouter);
app.use("/api/auth", authRouter);
app.use("/api/walls", wallsRouter);
app.use("/api/files", filesRouter);

// 内置素材：头像 / 贴纸
if (fs.existsSync(ASSETS_DIR)) {
  app.use(
    "/assets",
    express.static(ASSETS_DIR, {
      maxAge: IS_PROD ? "7d" : 0,
      setHeaders: (res) => res.setHeader("Cache-Control", IS_PROD ? "public, max-age=604800" : "no-cache"),
    })
  );
} else {
  console.warn(`[foliette] 素材目录不存在：${ASSETS_DIR}`);
}

// 前端 SPA
app.use((req, res, next) => {
  let pathname;
  try { pathname = decodeURIComponent(req.path); }
  catch { return res.status(400).type('text/plain').send('访问地址格式不正确'); }
  // React Router decodes route segments; protect equivalent encoded/case variants too.
  if (/^\/admin(?:\/|$)/i.test(pathname)) return requireAdminPage(req, res, next);
  next();
});
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR, { index: false, maxAge: IS_PROD ? "1h" : 0 }));
  app.get(/^\/(?!api|assets).*/, (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.type("text/plain").send("Foliette API is running. Run npm run build, or open http://localhost:5173 during development.");
  });
}

app.use("/api", notFound);
app.use(errorHandler);

