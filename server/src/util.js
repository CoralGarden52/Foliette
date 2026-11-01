import crypto from "node:crypto";

const b64u = (input) => Buffer.from(input).toString("base64url");

/* ----------------------------- id / time ----------------------------- */
export function uid(prefix = "") {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
export const now = () => Date.now();

/* ------------------------------- JWT -------------------------------- */
export function signJwt(payload, secret, expiresInSec) {
  const header = { alg: "HS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat, exp: iat + expiresInSec };
  const data = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(body))}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyJwt(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const expected = crypto.createHmac("sha256", secret).update(`${h}.${b}`).digest("base64url");
  const a = Buffer.from(s);
  const c = Buffer.from(expected);
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== "number") return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/* ----------------------------- password ------------------------------ */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  let test;
  try {
    test = crypto.scryptSync(password, salt, 64);
  } catch {
    return false;
  }
  const expected = Buffer.from(hash, "hex");
  if (test.length !== expected.length) return false;
  return crypto.timingSafeEqual(test, expected);
}

/* ------------------------------ cookies ------------------------------ */
export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      try { out[key] = decodeURIComponent(value); } catch { out[key] = ""; }
    }
  }
  return out;
}

export function setAuthCookie(res, token, { name, maxAge, secure }) {
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearAuthCookie(res, name, secure) {
  const parts = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

/* ---------------------------- validation ----------------------------- */
export const isEmail = (v) =>
  typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) && v.length <= 190;

export function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

export const USERNAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,24}$/;

/* ----------------------------- misc helpers -------------------------- */
export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    avatar: row.avatar || "",
    createdAt: row.created_at,
  };
}

/** 极简内存限流：同一 key 在 windowMs 内最多 max 次 */
export function createRateLimiter({ windowMs = 60_000, max = 30, message = "操作太频繁了，请稍后再试" } = {}) {
  const hits = new Map();
  return function rateLimit(req, res, next) {
    const key = `${req.ip}|${req.path}`;
    const nowTs = Date.now();
    const list = (hits.get(key) || []).filter((t) => nowTs - t < windowMs);
    list.push(nowTs);
    hits.set(key, list);
    if (list.length > max) {
      res.status(429).json({ error: message });
      return;
    }
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (nowTs - v[v.length - 1] > windowMs) hits.delete(k);
    }
    next();
  };
}

export function safeJsonParse(text, fallback) {
  try {
    const v = JSON.parse(text);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
