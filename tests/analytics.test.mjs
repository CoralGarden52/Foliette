import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';

const moduleUrl = new URL('../server/src/analytics.js', import.meta.url);
const at = Date.parse('2026-10-19T04:00:00Z');
function fixture(db = new DatabaseSync(':memory:')) {
  db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY, created_at INTEGER);
    CREATE TABLE walls(id TEXT PRIMARY KEY, user_id TEXT, created_at INTEGER);`);
  db.prepare('INSERT INTO users VALUES (?,?)').run('old', at - 40 * 86400000);
  db.prepare('INSERT INTO users VALUES (?,?)').run('new', at);
  db.prepare('INSERT INTO walls VALUES (?,?,?)').run('wall', 'new', at);
  return db;
}

test('Beijing days change at 16:00 UTC; 30-day history fills zeroes and recovers existing rows', async () => {
  const { dayKey, createAnalytics } = await import(moduleUrl);
  assert.equal(dayKey(Date.parse('2026-10-18T15:59:59Z')), '2026-10-18');
  assert.equal(dayKey(Date.parse('2026-10-18T16:00:00Z')), '2026-10-19');
  const db = fixture();
  try {
    const stats = createAnalytics(db, { secret: 'test', startedAt: at }).stats(at);
    assert.equal(stats.days.length, 30);
    assert.equal(stats.days[0].date, '2026-09-20');
    assert.equal(stats.days[29].date, '2026-10-19');
    assert.equal(stats.summary.totalUsers, 2);
    assert.equal(stats.summary.newUsers, 1);
    assert.equal(stats.summary.totalWorks, 1);
    assert.equal(stats.days[29].newWorks, 1);
    assert.equal(stats.summary.pageviews, 0);
    assert.equal(stats.startedAt, at);
  } finally { db.close(); }
});

test('events are idempotent, visitors and accounts deduplicate daily, aggregates survive cleanup and reopening', async () => {
  const { createAnalytics } = await import(moduleUrl);
  const db = fixture();
  try {
    let store = createAnalytics(db, { secret: 'test', startedAt: at });
    const record = (type, eventId, visitorId = 'visitor-a', offset = 0) => store.recordEvent({ type, eventId, visitorId, userId: 'new', at: at + offset });
    record('pageview', 'event-00000001');
    record('pageview', 'event-00000001');
    record('pageview', 'event-00000002');
    record('pageview', 'event-00000003', 'visitor-b');
    record('export', 'event-00000004');
    record('export', 'event-00000004');
    store.recordActive('new', at);
    let data = store.stats(at);
    assert.equal(data.summary.pageviews, 3);
    assert.equal(data.summary.visitors, 2);
    assert.equal(data.summary.activeUsers, 1);
    assert.equal(data.summary.totalExports, 1);
    record('pageview', 'event-00000005', 'visitor-a', 86400000);
    assert.equal(store.stats(at + 86400000).summary.visitors, 1);
    store = createAnalytics(db, { secret: 'test', startedAt: at + 86400000 });
    assert.equal(store.stats(at).startedAt, at);
    record('export', 'event-00000006', 'visitor-a', 40 * 86400000);
    data = store.stats(at + 40 * 86400000);
    assert.equal(data.summary.totalExports, 2);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM analytics_events').get().n, 1);
    assert.equal(db.prepare("SELECT pageviews FROM analytics_daily WHERE date='2026-10-19'").get().pageviews, 3);
  } finally { db.close(); }
});

test('a database reopened from disk preserves collection start, visitor deduplication and totals', async () => {
  const { createAnalytics } = await import(moduleUrl);
  const directory = mkdtempSync(path.join(os.tmpdir(), 'foliette-stats-disk-'));
  const file = path.join(directory, 'test.db');
  let db = fixture(new DatabaseSync(file));
  try {
    let store = createAnalytics(db, { secret: 'test', startedAt: at });
    store.recordEvent({ type: 'pageview', eventId: 'disk-page-000001', visitorId: 'same-browser', at });
    store.recordEvent({ type: 'export', eventId: 'disk-export-0001', visitorId: 'same-browser', at });
    db.close();
    db = new DatabaseSync(file);
    store = createAnalytics(db, { secret: 'test', startedAt: at + 1000 });
    store.recordEvent({ type: 'pageview', eventId: 'disk-page-000002', visitorId: 'same-browser', at });
    assert.equal(store.stats(at).startedAt, at);
    assert.equal(store.stats(at).summary.visitors, 1);
    assert.equal(store.stats(at).summary.pageviews, 2);
    assert.equal(store.stats(at).summary.totalExports, 1);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('admin-only reads purge expired visitor detail while preserving daily aggregates', async () => {
  const { createAnalytics } = await import(moduleUrl);
  const db = fixture();
  try {
    const store = createAnalytics(db, { secret: 'test', startedAt: at });
    store.recordEvent({ type: 'pageview', visitorId: 'expired', eventId: 'expired-event-01', userId: 'new', at });
    store.stats(at + 40 * 86400000);
    for (const table of ['analytics_events', 'analytics_visitors', 'analytics_active']) assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0);
    assert.equal(db.prepare("SELECT visitors FROM analytics_daily WHERE date='2026-10-19'").get().visitors, 1);
  } finally { db.close(); }
});

test('real HTTP protects page and data, validates events, excludes admins and CLI resolves registered accounts', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'foliette-stats-'));
  process.env.DATA_DIR = directory;
  process.env.ADMIN_USER_IDS = 'u_admin';
  process.env.JWT_SECRET = 'analytics-test-secret';
  const { app } = await import('../server/src/app.js');
  const { db, Users } = await import('../server/src/db.js');
  const { signJwt } = await import('../server/src/util.js');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = id => `foliette_token=${signJwt({ sub: id }, process.env.JWT_SECRET, 3600)}`;
  const get = (url, id) => fetch(base + url, { redirect: 'manual', headers: id ? { Cookie: cookie(id) } : {} });
  const post = (body, id, extra = {}) => fetch(base + '/api/analytics/events', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(id ? { Cookie: cookie(id) } : {}), ...extra }, body: JSON.stringify(body) });
  try {
    for (const id of ['u_admin', 'u_normal']) Users.create({ id, username: id, email: `${id}@example.test`, pass_hash: 'unused', created_at: at });
    db.prepare('INSERT INTO walls(id,user_id,created_at,updated_at) VALUES (?,?,?,?)').run('owned-wall', 'u_normal', at, at);
    assert.equal((await get('/api/admin/stats')).status, 401);
    assert.equal((await get('/api/admin/stats', 'u_normal')).status, 403);
    const page = await get('/admin/stats');
    assert.equal(page.status, 302);
    assert.equal(page.headers.get('location'), '/login?next=/admin/stats');
    assert.equal((await get('/admin/stats', 'u_normal')).status, 403);
    for (const adminPath of ['/%61dmin/stats', '/%61dmin%2Fstats', '/ADMIN/STATS']) {
      assert.equal((await get(adminPath)).status, 302, adminPath);
      assert.equal((await get(adminPath, 'u_normal')).status, 403, adminPath);
    }
    const adminPage = await get('/admin/stats', 'u_admin');
    assert.match(adminPage.headers.get('cache-control'), /no-store/);
    assert.equal((await get('/api/admin/stats', 'u_admin')).status, 200);
    assert.equal((await get('/admin/stats', 'u_admin')).status, 200);
    const before = await (await get('/api/admin/stats', 'u_admin')).json();
    const event = { type: 'pageview', page: 'walls', eventId: 'http-event-000001' };
    const first = await post(event, 'u_normal');
    assert.equal(first.status, 204);
    assert.match(first.headers.get('set-cookie'), /HttpOnly/);
    await post(event, 'u_normal');
    assert.equal((await post({ ...event, eventId: 'http-event-000002', role: 'admin' }, 'u_normal')).status, 400);
    assert.equal((await post({ ...event, page: 'admin' }, 'u_normal')).status, 400);
    assert.equal((await post({ ...event, eventId: 'http-event-cross1' }, 'u_normal', { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await post({ type: 'export', eventId: 'http-event-noauth', wallId: 'owned-wall' })).status, 401);
    assert.equal((await post({ type: 'export', wallId: 'missing', eventId: 'http-event-badown' }, 'u_normal')).status, 404);
    assert.equal((await post({ type: 'export', wallId: 'owned-wall', eventId: 'http-event-export' }, 'u_normal')).status, 204);
    await post({ type: 'export', wallId: 'owned-wall', eventId: 'http-event-export' }, 'u_normal');
    await post({ ...event, eventId: 'http-event-admin1' }, 'u_admin');
    await post({ type: 'active' }, 'u_normal');
    const response = await get('/api/admin/stats', 'u_admin');
    assert.match(response.headers.get('cache-control'), /no-store/);
    const after = await response.json();
    assert.equal(after.summary.pageviews - before.summary.pageviews, 1);
    assert.equal(after.summary.totalExports - before.summary.totalExports, 1);
    assert.equal(after.summary.activeUsers, 1);
    assert.equal(after.summary.visitors, 1);
    assert.equal(JSON.stringify(after).includes('example.test'), false);
    for (const script of ['scripts/admin-user.mjs', 'server/src/admin-user.js']) {
      const command = spawnSync(process.execPath, [script, 'u_admin@example.test'], { env: { ...process.env, DATA_DIR: directory }, encoding: 'utf8' });
      assert.equal(command.status, 0, command.stderr);
      assert.match(command.stdout, /ADMIN_USER_IDS=u_admin/);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
