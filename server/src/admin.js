import { COOKIE_NAME, JWT_SECRET } from './config.js';
import { Users } from './db.js';
import { parseCookies, verifyJwt } from './util.js';

const adminIds = new Set((process.env.ADMIN_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean));
export const isAdmin = user => Boolean(user && adminIds.has(user.id));
export function currentUser(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  const payload = token ? verifyJwt(token, JWT_SECRET) : null;
  return payload?.sub ? Users.byId(payload.sub) : null;
}
export function requireAdmin(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: '请先登录管理员账号' });
  if (!isAdmin(user)) return res.status(403).json({ error: '此账号无权访问统计后台' });
  req.user = user;
  next();
}
export function requireAdminPage(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const user = currentUser(req);
  if (!user) return res.redirect('/login?next=/admin/stats');
  if (!isAdmin(user)) return res.status(403).type('text/plain').send('此账号无权访问统计后台');
  req.user = user;
  next();
}
