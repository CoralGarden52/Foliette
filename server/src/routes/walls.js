import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import crypto from "node:crypto";
import { pipeline } from 'node:stream/promises';
import {
  ALLOWED_MIME, MAX_FILES_PER_REQUEST, MAX_PHOTOS_PER_WALL, MAX_UPLOAD_BYTES, UPLOAD_DIR,
} from "../config.js";
import { Uploads, Walls, deleteUpload, userUploadDir } from "../db.js";
import { IMAGE_EXTENSIONS, validImageFile, validItems } from "../validation.js";
import { requireAuth } from "../middleware.js";
import { now, safeJsonParse, uid } from "../util.js";
import { readManifest } from "../assets.js";
import { PhotoStorageError } from '../photoStorage.js';
import { dbTransaction, drainPhotoDeletions, localPhotoRecord, photoRecord, placePhotos, queuePhotoDeletion, storageFor } from '../photoFiles.js';

export const wallsRouter = Router();
wallsRouter.use(requireAuth);
export const filesRouter = Router();
filesRouter.use(requireAuth);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        cb(null, userUploadDir(req.user.id));
      } catch (e) {
        cb(e);
      }
    },
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${IMAGE_EXTENSIONS[file.mimetype] || ".jpg"}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_FILES_PER_REQUEST },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("只支持 JPG / PNG / WebP / GIF / AVIF 图片"));
      return;
    }
    cb(null, true);
  },
});

function parseDoc(wall) {
  const doc = safeJsonParse(wall.doc, {});
  return doc && typeof doc === "object" ? doc : {};
}

function countPhotos(doc) {
  return Array.isArray(doc.items) ? doc.items.filter((i) => i && i.kind === "photo").length : 0;
}

function serialize(wall) {
  const doc = parseDoc(wall);
  return {
    id: wall.id,
    title: wall.title,
    ratio: { w: wall.ratio_w, h: wall.ratio_h },
    layoutId: wall.layout_id,
    theme: wall.theme,
    cover: wall.cover || "",
    photoCount: countPhotos(doc),
    itemCount: Array.isArray(doc.items) ? doc.items.length : 0,
    createdAt: wall.created_at,
    updatedAt: wall.updated_at,
  };
}

function ownWall(req, res) {
  const wall = Walls.get(req.params.id);
  if (!wall || wall.user_id !== req.user.id) {
    res.status(404).json({ error: "照片墙不存在或已被删除" });
    return null;
  }
  return wall;
}

/* ------------------------------- list -------------------------------- */
wallsRouter.get("/", (req, res) => {
  const rows = Walls.listByUser(req.user.id);
  res.json({ walls: rows.map(serialize), maxPhotos: MAX_PHOTOS_PER_WALL });
});

/* ------------------------------ create ------------------------------- */
wallsRouter.post("/", (req, res) => {
  const title = String(req.body?.title ?? "").trim().slice(0, 60) || "未命名照片墙";
  const ratio = req.body?.ratio ?? {};
  const ratioW = Math.min(50, Math.max(1, Math.round(Number(ratio.w) || 1)));
  const ratioH = Math.min(50, Math.max(1, Math.round(Number(ratio.h) || 1)));
  const layoutId = String(req.body?.layoutId ?? "grid").slice(0, 40) || "grid";
  const theme = String(req.body?.theme ?? "cream").slice(0, 40) || "cream";
  const manifest = readManifest();

  const wall = {
    id: uid("w_"),
    user_id: req.user.id,
    title,
    ratio_w: ratioW,
    ratio_h: ratioH,
    layout_id: layoutId,
    theme,
    doc: JSON.stringify({ version: 1, items: [], background: { color: /^#[0-9a-f]{6}$/i.test(theme) ? theme : "#f7f3e9", texture: manifest.canvases.find((canvas) => canvas.title === "素白棉纸")?.url, pattern: "plain", patternColor: "#d4ccba", patternScale: 44, vignette: false } }),
    cover: "",
    created_at: now(),
    updated_at: now(),
  };
  Walls.create(wall);
  res.status(201).json({ wall: { ...serialize(wall), doc: parseDoc(wall) } });
});

/* ------------------------------- read -------------------------------- */
wallsRouter.get("/:id", (req, res) => {
  const wall = ownWall(req, res);
  if (!wall) return;
  res.json({ wall: { ...serialize(wall), doc: parseDoc(wall) } });
});

/* ------------------------------ update ------------------------------- */
wallsRouter.put("/:id", (req, res) => {
  const wall = ownWall(req, res);
  if (!wall) return;

  const body = req.body ?? {};
  const doc = body.doc;
  if (doc === undefined || doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return res.status(400).json({ error: "保存内容格式不正确" });
  }
  if (JSON.stringify(doc).length > 4_000_000) {
    return res.status(413).json({ error: "内容太大了，请减少一些元素" });
  }
  if (countPhotos(doc) > MAX_PHOTOS_PER_WALL) {
    return res.status(400).json({ error: `一个照片墙最多 ${MAX_PHOTOS_PER_WALL} 张照片` });
  }
  if (!validItems(doc.items)) return res.status(400).json({ error: "元素内容或尺寸不正确，请检查后重试" });
  if (doc.background?.texture && !readManifest().canvases.some((canvas) => canvas.url === doc.background.texture)) return res.status(400).json({ error: "画布素材不存在，请重新选择" });
  for (const item of doc.items.filter((entry) => entry.kind === "photo")) {
    const prefix = `/api/files/${req.user.id}/`;
    const filename = typeof item.src === "string" && item.src.startsWith(prefix) ? item.src.slice(prefix.length) : "";
    if (!filename || path.basename(filename) !== filename) return res.status(400).json({ error: "照片来源不正确" });
    const uploadRecord = photoRecord(req.user.id, filename);
    if (!uploadRecord || (uploadRecord.wall_id && uploadRecord.wall_id !== wall.id) || (uploadRecord.storage !== 'oss' && !fs.existsSync(path.join(UPLOAD_DIR, req.user.id, filename)))) {
      return res.status(400).json({ error: "照片不存在或不属于这面照片墙" });
    }
  }

  const title = String(body.title ?? wall.title).trim().slice(0, 60) || wall.title;
  const ratio = body.ratio ?? {};
  const ratioW = Math.min(50, Math.max(1, Math.round(Number(ratio.w) || wall.ratio_w)));
  const ratioH = Math.min(50, Math.max(1, Math.round(Number(ratio.h) || wall.ratio_h)));
  const layoutId = String(body.layoutId ?? wall.layout_id).slice(0, 40) || wall.layout_id;
  const theme = String(body.theme ?? wall.theme).slice(0, 40) || wall.theme;
  const cover = String(body.cover ?? wall.cover ?? "");
  if (cover.length > 2_000_000) return res.status(413).json({ error: "封面图太大了" });
  if (cover && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(cover)) return res.status(400).json({ error: "封面格式不正确" });

  const ts = now();
  Walls.update({
    id: wall.id,
    user_id: wall.user_id,
    title, ratio_w: ratioW, ratio_h: ratioH,
    layout_id: layoutId, theme,
    doc: JSON.stringify(doc),
    cover,
    updated_at: ts,
  });

  res.json({ wall: { ...serialize({ ...wall, doc: JSON.stringify(doc), title, ratio_w: ratioW, ratio_h: ratioH, layout_id: layoutId, theme, cover, updated_at: ts }), doc } });
});

/* ------------------------------ delete ------------------------------- */
wallsRouter.delete("/:id", (req, res) => {
  const wall = ownWall(req, res);
  if (!wall) return;
  const doc = parseDoc(wall);
  const files = (Array.isArray(doc.items) ? doc.items : [])
    .filter((i) => i && i.kind === "photo" && typeof i.src === "string")
    .map((i) => i.src.split("/").pop())
    .filter(Boolean);
  const records = new Map(Uploads.list(wall.id, wall.user_id).map(record => [record.filename, record]));
  for (const filename of files) {
    const record = photoRecord(wall.user_id, filename);
    if (record && (!record.wall_id || record.wall_id === wall.id)) records.set(filename, record);
  }
  dbTransaction(() => {
    for (const record of records.values()) queuePhotoDeletion(record);
    Walls.remove(wall.id, wall.user_id);
  });
  void drainPhotoDeletions(storageFor(req)).catch(() => console.error('[photos] 文件清理暂未完成，将自动重试'));
  res.json({ ok: true });
});

/* ---------------------------- upload photos -------------------------- */
wallsRouter.post("/:id/photos", (req, res, next) => {
  const wall = ownWall(req, res);
  if (!wall) return;
  upload.array("files", MAX_FILES_PER_REQUEST)(req, res, async (err) => {
    const cleanupTemp = () => { for (const file of req.files || []) deleteUpload(wall.user_id, file.filename); };
    if (err) {
      cleanupTemp();
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "有图片超过大小上限了"
        : err.code === "LIMIT_FILE_COUNT"
          ? `一次最多上传 ${MAX_FILES_PER_REQUEST} 张哦`
          : err.message || "上传失败";
      res.status(400).json({ error: msg });
      return;
    }
    let placed;
    try {
      const currentWall = Walls.get(wall.id);
      if (!currentWall) {
        for (const file of req.files || []) deleteUpload(wall.user_id, file.filename);
        return res.status(404).json({ error: "照片墙已被删除" });
      }
      const doc = parseDoc(currentWall);
      const existing = countPhotos(doc);
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ error: "请选择至少一张图片" });
      if (files.some((file) => !validImageFile(file))) {
        for (const file of files) deleteUpload(wall.user_id, file.filename);
        return res.status(400).json({ error: "有文件不是有效的图片，请选择 JPG / PNG / WebP / GIF / AVIF" });
      }
      if (existing + files.length > MAX_PHOTOS_PER_WALL) {
        for (const f of files) deleteUpload(wall.user_id, f.filename);
        res.status(400).json({
          error: `一个照片墙最多 ${MAX_PHOTOS_PER_WALL} 张照片，还可以再上传 ${Math.max(0, MAX_PHOTOS_PER_WALL - existing)} 张`,
        });
        return;
      }
      const storage = storageFor(req);
      placed = await placePhotos(storage, wall.user_id, files);
      // Cloud requests yield to other edits and deletions; recheck before publishing any metadata.
      dbTransaction(() => {
        const latest = Walls.get(wall.id);
        if (!latest) throw new PhotoStorageError(404, '照片墙已被删除');
        if (countPhotos(parseDoc(latest)) + files.length > MAX_PHOTOS_PER_WALL) throw new PhotoStorageError(400, '照片数量已改变，请刷新后重试');
        for (const record of placed) Uploads.add(record.filename, wall.user_id, wall.id, record);
      });
      if (storage.backend === 'oss') cleanupTemp();
      const photos = files.map((f) => ({
        id: path.parse(f.filename).name,
        name: f.originalname,
        url: `/api/files/${wall.user_id}/${f.filename}`,
        size: f.size,
      }));
      res.status(201).json({ photos, total: existing + photos.length, max: MAX_PHOTOS_PER_WALL });
    } catch (error) {
      if (placed) {
        dbTransaction(() => { for (const record of placed) queuePhotoDeletion(record); });
        await drainPhotoDeletions(storageFor(req));
      }
      cleanupTemp();
      next(error);
    }
  });
});

/* ---------------------------- delete photo --------------------------- */
wallsRouter.delete("/:id/photos/:fileId", (req, res) => {
  const wall = ownWall(req, res);
  if (!wall) return;
  const fileId = path.basename(String(req.params.fileId || ""));
  const doc = parseDoc(wall);
  const items = Array.isArray(doc.items) ? doc.items : [];
  const nextItems = items.filter(
    (i) => !(i && i.kind === "photo" && String(i.src || "").endsWith(`/${fileId}`))
  );
  if (nextItems.length === items.length) {
    res.status(404).json({ error: "照片不存在" });
    return;
  }
  const record = photoRecord(wall.user_id, fileId) || localPhotoRecord(wall.user_id, fileId);
  if (record.wall_id && record.wall_id !== wall.id) return res.status(404).json({ error: '照片不存在' });
  dbTransaction(() => {
    queuePhotoDeletion(record);
    Walls.update({
      ...wall,
      doc: JSON.stringify({ ...doc, items: nextItems }),
      updated_at: now(),
    });
    Uploads.remove(fileId, wall.user_id);
  });
  void drainPhotoDeletions(storageFor(req)).catch(() => console.error('[photos] 文件清理暂未完成，将自动重试'));
  res.json({ ok: true, photoCount: countPhotos({ items: nextItems }) });
});

/* ------------------------------- files ------------------------------- */
filesRouter.get("/:userId/:name", async (req, res, next) => {
  const { userId, name } = req.params;
  if (userId !== req.user.id) {
    res.status(403).json({ error: "无权访问这张照片" });
    return;
  }
  try {
    const record = photoRecord(userId, name);
    if (!record) {
      res.status(404).json({ error: "照片不存在" });
      return;
    }
    const result = await storageFor(req).open(record);
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('Content-Type', result.contentType);
    if (/^\d+$/.test(String(result.contentLength))) res.setHeader('Content-Length', String(result.contentLength));
    await pipeline(result.stream, res);
  } catch (error) {
    if (!res.destroyed) next(error);
  }
});

