import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根目录（server/src -> server -> 仓库根） */
export const ROOT_DIR = path.resolve(__dirname, "..", "..");
export const SERVER_DIR = path.resolve(__dirname, "..");

const pick = (envValue, fallback) => (envValue ? path.resolve(envValue) : fallback);

export const DATA_DIR = pick(process.env.DATA_DIR, path.join(SERVER_DIR, "data"));
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const DB_FILE = path.join(DATA_DIR, "foliette.db");
export const ASSETS_DIR = pick(process.env.ASSETS_DIR, path.join(ROOT_DIR, "assets"));
export const PUBLIC_DIR = pick(process.env.PUBLIC_DIR, path.join(ROOT_DIR, "web", "dist"));

export const PORT = Number(process.env.PORT || 8787);
export const IS_PROD = process.env.NODE_ENV === "production";
export const JWT_SECRET = process.env.JWT_SECRET || "foliette-dev-secret-change-me";
if (IS_PROD && (JWT_SECRET.length < 32 || /foliette.*(secret|change)|replace-with/i.test(JWT_SECRET))) {
  throw new Error("生产环境必须设置至少 32 位的随机 JWT_SECRET");
}
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";
export const COOKIE_NAME = "foliette_token";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

export const MAX_PHOTOS_PER_WALL = Math.min(20, Math.max(1, Number(process.env.MAX_PHOTOS_PER_WALL) || 20));
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 12 * 1024 * 1024);
export const MAX_FILES_PER_REQUEST = 20;

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export const RATIO_PRESETS = [
  { id: "1:1", w: 1, h: 1, label: "正方形" },
  { id: "4:5", w: 4, h: 5, label: "竖版 4:5" },
  { id: "3:4", w: 3, h: 4, label: "竖版 3:4" },
  { id: "2:3", w: 2, h: 3, label: "竖版 2:3" },
  { id: "9:16", w: 9, h: 16, label: "手机全屏" },
  { id: "5:4", w: 5, h: 4, label: "横版 5:4" },
  { id: "4:3", w: 4, h: 3, label: "横版 4:3" },
  { id: "3:2", w: 3, h: 2, label: "横版 3:2" },
  { id: "16:9", w: 16, h: 9, label: "宽屏 16:9" },
  { id: "21:9", w: 21, h: 9, label: "电影宽屏" },
];
