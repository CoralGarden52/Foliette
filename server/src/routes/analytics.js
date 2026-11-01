import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db } from '../db.js';
import { IS_PROD, JWT_SECRET } from '../config.js';
import { currentUser, isAdmin, requireAdmin } from '../admin.js';
import { createRateLimiter, parseCookies } from '../util.js';
import { createAnalytics } from '../analytics.js';

export const analytics = createAnalytics(db, { secret: JWT_SECRET });
export const adminRouter = Router();
adminRouter.use(requireAdmin);
adminRouter.get('/stats', (_req, res) => res.json(analytics.stats()));

export const analyticsRouter = Router();
analyticsRouter.post('/events', createRateLimiter({ max: 180 }), (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.get('origin');
  if (req.get('sec-fetch-site') === 'cross-site') return res.sendStatus(403);
  if (origin) {
    try { if (new URL(origin).host !== req.get('host')) return res.sendStatus(403); }
    catch { return res.sendStatus(403); }
  }
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.sendStatus(400);
  const { type, eventId, page, wallId } = body;
  const fields = type === 'active' ? ['type'] : type === 'pageview' ? ['type', 'eventId', 'page'] : ['type', 'eventId', 'wallId'];
  if (Object.keys(body).some(key => !fields.includes(key))) return res.sendStatus(400);
  if (!['pageview', 'export', 'active'].includes(type)) return res.sendStatus(400);
  if (type !== 'active' && (typeof eventId !== 'string' || !/^[a-zA-Z0-9_-]{12,80}$/.test(eventId))) return res.sendStatus(400);
  if (type === 'pageview' && !['login', 'register', 'walls', 'editor'].includes(page)) return res.sendStatus(400);
  if (type === 'export' && (typeof wallId !== 'string' || wallId.length > 100)) return res.sendStatus(400);
  const user = currentUser(req);
  if ((type === 'export' || type === 'active') && !user) return res.sendStatus(401);
  if (isAdmin(user)) return res.sendStatus(204);
  if (type === 'export' && !db.prepare('SELECT id FROM walls WHERE id=? AND user_id=?').get(wallId, user.id)) return res.sendStatus(404);
  try {
    if (type === 'active') analytics.recordActive(user.id);
    else {
      let visitorId = parseCookies(req).foliette_visitor;
      if (!visitorId || !/^[a-f0-9]{32}$/.test(visitorId)) {
        visitorId = randomBytes(16).toString('hex');
        res.cookie('foliette_visitor', visitorId, { httpOnly: true, sameSite: 'lax', secure: IS_PROD && process.env.COOKIE_SECURE === '1', maxAge: 365 * 86400000 });
      }
      analytics.recordEvent({ type, eventId, visitorId, userId: user?.id });
    }
  } catch (error) {
    console.error('[analytics] Recording failed:', error.message);
    return res.sendStatus(503);
  }
  res.sendStatus(204);
});

export function recordSuccessfulActivity(req, res, next) {
  const track = /^\/api\/walls(?:\/|$)/.test(req.path) || /^\/api\/auth\/(login|register)$/.test(req.path);
  if (track) res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && req.user && !isAdmin(req.user)) {
      try { analytics.recordActive(req.user.id); }
      catch (error) { console.error('[analytics] Activity recording failed:', error.message); }
    }
  });
  next();
}
