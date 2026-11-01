import { COOKIE_NAME, JWT_SECRET } from "./config.js";
import { parseCookies, verifyJwt } from "./util.js";
import { Users } from "./db.js";

/** 要求登录：把当前用户挂到 req.user */
export function requireAuth(req, res, next) {
  const token = parseCookies(req)[COOKIE_NAME];
  const payload = token ? verifyJwt(token, JWT_SECRET) : null;
  if (!payload || !payload.sub) {
    res.status(401).json({ error: "请先登录" });
    return;
  }
  const row = Users.byId(payload.sub);
  if (!row) {
    res.status(401).json({ error: "登录已失效，请重新登录" });
    return;
  }
  req.user = row;
  next();
}

/** 已登录用户访问登录/注册页时重定向 */
export function redirectIfAuthed(req, res, next) {
  const token = parseCookies(req)[COOKIE_NAME];
  const payload = token ? verifyJwt(token, JWT_SECRET) : null;
  if (payload?.sub && Users.byId(payload.sub)) {
    res.status(409).json({ error: "你已经登录啦" });
    return;
  }
  next();
}

export function notFound(req, res) {
  res.status(404).json({ error: "接口不存在" });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return res.destroy();
  if (err?.name === 'PhotoStorageError') return res.status(err.status).json({ error: err.message });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "请求内容格式不正确" });
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "请求内容太大了" });
  if (err?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "图片太大啦，请换一张小一点的" });
    return;
  }
  if (err?.code === "LIMIT_FILE_COUNT") {
    res.status(400).json({ error: "一次最多上传 20 张哦" });
    return;
  }
  if (err?.name === "MulterError") {
    res.status(400).json({ error: `上传失败：${err.message}` });
    return;
  }
  console.error("[error]", err);
  res.status(500).json({ error: "服务器开小差了，请稍后再试" });
}
