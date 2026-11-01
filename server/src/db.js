import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { DB_FILE, DATA_DIR, UPLOAD_DIR } from "./config.js";

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(DB_FILE);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  pass_hash   TEXT NOT NULL,
  avatar      TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS walls (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '未命名照片墙',
  ratio_w     INTEGER NOT NULL DEFAULT 1,
  ratio_h     INTEGER NOT NULL DEFAULT 1,
  layout_id   TEXT NOT NULL DEFAULT 'grid',
  theme       TEXT NOT NULL DEFAULT 'cream',
  doc         TEXT NOT NULL DEFAULT '{}',
  cover       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_walls_user ON walls(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS uploads (
  filename    TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  wall_id     TEXT NOT NULL REFERENCES walls(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_uploads_wall ON uploads(wall_id);
CREATE TABLE IF NOT EXISTS photo_deletions (
  filename TEXT PRIMARY KEY, user_id TEXT NOT NULL, storage TEXT NOT NULL,
  object_key TEXT NOT NULL DEFAULT '', mime_type TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
`);

const uploadColumns = new Set(db.prepare('PRAGMA table_info(uploads)').all().map(column => column.name));
for (const [name, definition] of [['storage', "TEXT NOT NULL DEFAULT 'local'"], ['object_key', "TEXT NOT NULL DEFAULT ''"], ['mime_type', "TEXT NOT NULL DEFAULT ''"]]) {
  if (!uploadColumns.has(name)) db.exec(`ALTER TABLE uploads ADD COLUMN ${name} ${definition}`);
}

/* ------------------------------- users -------------------------------- */
const stmtUserById = db.prepare("SELECT * FROM users WHERE id = ?");
const stmtUserByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
const stmtUserByName = db.prepare("SELECT * FROM users WHERE username = ?");
const stmtInsertUser = db.prepare(
  "INSERT INTO users (id, username, email, pass_hash, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)"
);
const stmtUpdateUser = db.prepare("UPDATE users SET username = ?, avatar = ? WHERE id = ?");

export const Users = {
  byId: (id) => stmtUserById.get(id),
  byEmail: (email) => stmtUserByEmail.get(email),
  byUsername: (name) => stmtUserByName.get(name),
  create: (user) => stmtInsertUser.run(user.id, user.username, user.email, user.pass_hash, user.avatar || "", user.created_at),
  updateProfile: (id, username, avatar) => stmtUpdateUser.run(username, avatar || "", id),
};

/* ------------------------------- walls -------------------------------- */
const stmtWallsOfUser = db.prepare(
  "SELECT * FROM walls WHERE user_id = ? ORDER BY updated_at DESC"
);
const stmtWall = db.prepare("SELECT * FROM walls WHERE id = ?");
const stmtInsertWall = db.prepare(
  `INSERT INTO walls (id, user_id, title, ratio_w, ratio_h, layout_id, theme, doc, cover, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const stmtUpdateWall = db.prepare(
  `UPDATE walls SET title = ?, ratio_w = ?, ratio_h = ?, layout_id = ?, theme = ?, doc = ?, cover = ?, updated_at = ?
   WHERE id = ? AND user_id = ?`
);
const stmtTouchWall = db.prepare("UPDATE walls SET updated_at = ? WHERE id = ? AND user_id = ?");
const stmtDeleteWall = db.prepare("DELETE FROM walls WHERE id = ? AND user_id = ?");
const stmtCountWalls = db.prepare("SELECT COUNT(*) AS n FROM walls WHERE user_id = ?");

export const Walls = {
  listByUser: (userId) => stmtWallsOfUser.all(userId),
  get: (id) => stmtWall.get(id),
  create: (w) =>
    stmtInsertWall.run(
      w.id, w.user_id, w.title, w.ratio_w, w.ratio_h, w.layout_id, w.theme, w.doc, w.cover, w.created_at, w.updated_at
    ),
  update: (w) =>
    stmtUpdateWall.run(
      w.title, w.ratio_w, w.ratio_h, w.layout_id, w.theme, w.doc, w.cover, w.updated_at, w.id, w.user_id
    ),
  touch: (id, userId, ts) => stmtTouchWall.run(ts, id, userId),
  remove: (id, userId) => stmtDeleteWall.run(id, userId),
  count: (userId) => stmtCountWalls.get(userId).n,
};

const insertUpload = db.prepare("INSERT INTO uploads (filename, user_id, wall_id, created_at, storage, object_key, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?)");
const uploadsForWall = db.prepare("SELECT * FROM uploads WHERE wall_id = ? AND user_id = ?");
const uploadByName = db.prepare("SELECT * FROM uploads WHERE filename = ?");
const removeUpload = db.prepare("DELETE FROM uploads WHERE filename = ? AND user_id = ?");

export const Uploads = {
  add: (filename, userId, wallId, location = {}) => insertUpload.run(filename, userId, wallId, Date.now(), location.storage || 'local', location.object_key || '', location.mime_type || ''),
  list: (wallId, userId) => uploadsForWall.all(wallId, userId),
  get: (filename) => uploadByName.get(filename),
  remove: (filename, userId) => removeUpload.run(filename, userId),
};

export function userUploadDir(userId) {
  const dir = path.join(UPLOAD_DIR, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function deleteUpload(userId, fileName) {
  const safe = path.basename(String(fileName || ""));
  if (!safe) return false;
  const file = path.join(UPLOAD_DIR, userId, safe);
  if (!file.startsWith(path.join(UPLOAD_DIR, userId))) return false;
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
