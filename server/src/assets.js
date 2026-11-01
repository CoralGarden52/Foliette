import fs from "node:fs";
import path from "node:path";
import { ASSETS_DIR } from "./config.js";

const GROUPS = [
  { key: "garden", dir: "stickers/garden", title: "花园植物" },
  { key: "tea", dir: "stickers/tea", title: "甜点茶歇" },
  { key: "travel", dir: "stickers/travel", title: "旅行拾光" },
  { key: "hearts", dir: "stickers/hearts", title: "心意装饰" },
  { key: "primary", dir: "stickers/primary", title: "贴纸" },
  { key: "elements", dir: "stickers/elements", title: "小元素" },
  { key: "frames", dir: "stickers/frames-labels", title: "标签框" },
];

const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif|svg)$/i;

let cache = { at: 0, data: null };

function scan(dir, prefix) {
  const abs = path.join(ASSETS_DIR, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => IMAGE_RE.test(f))
    .sort()
    .map((f) => ({ name: f, url: `${prefix}/${encodeURIComponent(f)}` }));
}

export function readManifest({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < 5000) return cache.data;

  const avatars = scan("avatars", "/assets/avatars");
  const stickerManifest = path.join(ASSETS_DIR, "sticker-manifest.json");
  const stickerMetadata = fs.existsSync(stickerManifest) ? JSON.parse(fs.readFileSync(stickerManifest, "utf8")) : {};
  const stickers = {};
  for (const g of GROUPS) stickers[g.key] = scan(g.dir, `/assets/${g.dir.replaceAll("\\", "/")}`).map((sticker) => ({
    ...sticker,
    title: stickerMetadata[`${g.key}/${sticker.name}`]?.title || sticker.name,
  }));
  const canvasManifest = path.join(ASSETS_DIR, "canvas-manifest.json");
  const canvasMetadata = fs.existsSync(canvasManifest) ? JSON.parse(fs.readFileSync(canvasManifest, "utf8")) : {};

  const data = {
    avatars,
    stickers,
    groups: GROUPS.map((g) => ({ key: g.key, title: g.title, count: stickers[g.key].length })),
    canvases: scan("canvas", "/assets/canvas").sort((first, second) =>
      (canvasMetadata[first.name]?.order ?? Number.MAX_SAFE_INTEGER) - (canvasMetadata[second.name]?.order ?? Number.MAX_SAFE_INTEGER)
    ).map((canvas) => {
      const metadata = canvasMetadata[canvas.name];
      const preview = path.basename(String(metadata?.preview || ""));
      return {
        ...canvas,
        title: metadata?.title || path.parse(canvas.name).name,
        preview: preview && fs.existsSync(path.join(ASSETS_DIR, "canvas-previews", preview)) ? `/assets/canvas-previews/${encodeURIComponent(preview)}` : canvas.url,
      };
    }),
  };
  cache = { at: now, data };
  return data;
}

export function avatarUrl(name) {
  const safe = path.basename(String(name || ""));
  if (!safe || !IMAGE_RE.test(safe)) return "";
  const file = path.join(ASSETS_DIR, "avatars", safe);
  return fs.existsSync(file) ? `/assets/avatars/${safe}` : "";
}

export function pickRandomAvatar() {
  const { avatars } = readManifest({ force: true });
  if (!avatars.length) return "";
  return avatars[Math.floor(Math.random() * avatars.length)].url;
}
