import { Router } from "express";
import crypto from "node:crypto";
import {
  COOKIE_NAME, COOKIE_MAX_AGE, IS_PROD, JWT_SECRET, JWT_EXPIRES_IN,
} from "../config.js";
import { Users } from "../db.js";
import { pickRandomAvatar, readManifest } from "../assets.js";
import {
  clearAuthCookie, createRateLimiter, hashPassword, isEmail, normalizeEmail,
  publicUser, setAuthCookie, signJwt, uid, USERNAME_RE, verifyPassword, now, parseCookies, verifyJwt,
} from "../util.js";

export const authRouter = Router();

const authLimiter = createRateLimiter({ windowMs: 60_000, max: 20, message: "尝试太频繁了，休息一分钟再来吧" });

const EXPIRES_SEC = (() => {
  const m = /^(\d+)([smhd])$/.exec(String(JWT_EXPIRES_IN).trim());
  if (!m) return 60 * 60 * 24 * 30;
  const n = Number(m[1]);
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
  return n * unit;
})();

function issueSession(res, user) {
  const token = signJwt({ sub: user.id }, JWT_SECRET, EXPIRES_SEC);
  setAuthCookie(res, token, {
    name: COOKIE_NAME,
    maxAge: COOKIE_MAX_AGE,
    secure: IS_PROD && process.env.COOKIE_SECURE === "1",
  });
}

function validateRegister(body) {
  const username = String(body?.username ?? "").trim();
  const email = normalizeEmail(body?.email);
  const password = String(body?.password ?? "");
  const confirm = String(body?.confirmPassword ?? "");

  if (!USERNAME_RE.test(username)) return { error: "用户名需 2-24 个字符，支持中英文、数字、_ 和 -" };
  if (!isEmail(email)) return { error: "邮箱格式看起来不太对" };
  if (password.length < 6) return { error: "密码至少需要 6 位" };
  if (password.length > 64) return { error: "密码太长了（最多 64 位）" };
  if (password !== confirm) return { error: "两次输入的密码不一致" };
  return { username, email, password };
}

authRouter.post("/register", authLimiter, (req, res) => {
  const v = validateRegister(req.body);
  if (v.error) return res.status(400).json({ error: v.error });

  if (Users.byEmail(v.email)) return res.status(409).json({ error: "这个邮箱已经注册过了" });
  if (Users.byUsername(v.username)) return res.status(409).json({ error: "这个用户名已经被抢走啦" });

  const user = {
    id: uid("u_"),
    username: v.username,
    email: v.email,
    pass_hash: hashPassword(v.password),
    avatar: pickRandomAvatar(),
    created_at: now(),
  };
  Users.create(user);
  req.user = user;
  issueSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post("/login", authLimiter, (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? "");
  if (!isEmail(email) || !password) return res.status(400).json({ error: "请输入邮箱和密码" });

  const user = Users.byEmail(email);
  if (!user || !verifyPassword(password, user.pass_hash)) {
    return res.status(401).json({ error: "邮箱或密码不正确" });
  }
  req.user = user;
  issueSession(res, user);
  res.json({ user: publicUser(user) });
});

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res, COOKIE_NAME, IS_PROD && process.env.COOKIE_SECURE === "1");
  res.json({ ok: true });
});

authRouter.get("/me", (req, res) => {
  const token = parseCookies(req)[COOKIE_NAME];
  const payload = token ? verifyJwt(token, JWT_SECRET) : null;
  const user = payload?.sub ? Users.byId(payload.sub) : null;
  res.json({ user: publicUser(user) });
});

authRouter.patch("/me", (req, res) => {
  const token = parseCookies(req)[COOKIE_NAME];
  const payload = token ? verifyJwt(token, JWT_SECRET) : null;
  const user = payload?.sub ? Users.byId(payload.sub) : null;
  if (!user) return res.status(401).json({ error: "请先登录" });

  const patch = req.body ?? {};
  let username = user.username;
  let avatar = user.avatar;

  if (patch.username !== undefined) {
    const next = String(patch.username).trim();
    if (!USERNAME_RE.test(next)) return res.status(400).json({ error: "用户名需 2-24 个字符，支持中英文、数字、_ 和 -" });
    const taken = Users.byUsername(next);
    if (taken && taken.id !== user.id) return res.status(409).json({ error: "这个用户名已经被抢走啦" });
    username = next;
  }

  if (patch.avatar !== undefined) {
    const next = String(patch.avatar || "");
    if (next) {
      const allowed = new Set(readManifest().avatars.map((a) => a.url));
      if (!allowed.has(next)) return res.status(400).json({ error: "头像不存在" });
    }
    avatar = next;
  }

  Users.updateProfile(user.id, username, avatar);
  res.json({ user: publicUser({ ...user, username, avatar }) });
});

// 预留：生成一次性随机昵称（给“随便逛逛”用）
authRouter.get("/suggest-username", (_req, res) => {
  const a = ["小熊", "云朵", "汽水", "月亮", "饼干", "橘子", "可可", "星星", "奶糖", "纸鹤"];
  const b = ["手账", "贴纸", "拼贴", "日记", "相册", "旅行", "午后", "慢生活"];
  const name = `${a[crypto.randomInt(a.length)]}${b[crypto.randomInt(b.length)]}${crypto.randomInt(10, 99)}`;
  res.json({ username: name });
});
