import { createHmac } from 'node:crypto';
const DAY = 86_400_000;
export function dayKey(at = Date.now()) {
  return new Date(at + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function createAnalytics(db, { secret, startedAt = Date.now() }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS analytics_daily (
      date TEXT PRIMARY KEY, pageviews INTEGER NOT NULL DEFAULT 0,
      visitors INTEGER NOT NULL DEFAULT 0, activeUsers INTEGER NOT NULL DEFAULT 0, exports INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS analytics_events (event_id TEXT PRIMARY KEY, date TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_date ON analytics_events(date);
    CREATE TABLE IF NOT EXISTS analytics_visitors (date TEXT, hash TEXT, PRIMARY KEY(date, hash));
    CREATE TABLE IF NOT EXISTS analytics_active (date TEXT, hash TEXT, PRIMARY KEY(date, hash));
  `);
  db.prepare("INSERT OR IGNORE INTO analytics_meta VALUES ('startedAt',?)").run(String(startedAt));
  const since = Number(db.prepare("SELECT value FROM analytics_meta WHERE key='startedAt'").get().value);
  const ensure = db.prepare('INSERT OR IGNORE INTO analytics_daily(date) VALUES (?)');
  const addEvent = db.prepare('INSERT OR IGNORE INTO analytics_events VALUES (?,?)');
  const addVisitor = db.prepare('INSERT OR IGNORE INTO analytics_visitors VALUES (?,?)');
  const addActive = db.prepare('INSERT OR IGNORE INTO analytics_active VALUES (?,?)');
  const incrementView = db.prepare('UPDATE analytics_daily SET pageviews=pageviews+1 WHERE date=?');
  const incrementVisitor = db.prepare('UPDATE analytics_daily SET visitors=visitors+1 WHERE date=?');
  const incrementActive = db.prepare('UPDATE analytics_daily SET activeUsers=activeUsers+1 WHERE date=?');
  const incrementExport = db.prepare('UPDATE analytics_daily SET exports=exports+1 WHERE date=?');
  const hash = (kind, date, id) => createHmac('sha256', secret).update(`${kind}:${date}:${id}`).digest('hex');
  let cleanedDay;
  function cleanup(at) {
    const date = dayKey(at);
    if (cleanedDay === date) return;
    const cutoff = dayKey(at - 35 * DAY);
    for (const table of ['analytics_events', 'analytics_visitors', 'analytics_active']) db.prepare(`DELETE FROM ${table} WHERE date < ?`).run(cutoff);
    cleanedDay = date;
  }
  function active(userId, date) {
    if (userId && addActive.run(date, hash('account', date, userId)).changes) incrementActive.run(date);
  }
  cleanup(startedAt);
  return {
    recordActive(userId, at = Date.now()) {
      cleanup(at);
      const date = dayKey(at);
      db.exec('BEGIN');
      try { ensure.run(date); active(userId, date); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    recordEvent({ type, eventId, visitorId, userId, at = Date.now() }) {
      if (type !== 'pageview' && type !== 'export') throw new Error('Unknown analytics event');
      cleanup(at);
      const date = dayKey(at);
      db.exec('BEGIN');
      try {
        if (addEvent.run(eventId, date).changes) {
          ensure.run(date);
          if (type === 'pageview') {
            incrementView.run(date);
            if (addVisitor.run(date, hash('visitor', date, visitorId)).changes) incrementVisitor.run(date);
          } else incrementExport.run(date);
          active(userId, date);
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    stats(at = Date.now()) {
      cleanup(at);
      const first = dayKey(at - 29 * DAY);
      const today = dayKey(at);
      const daily = new Map(db.prepare('SELECT * FROM analytics_daily WHERE date BETWEEN ? AND ?').all(first, today).map(row => [row.date, row]));
      function createdCounts(table) {
        return new Map(db.prepare(`SELECT strftime('%Y-%m-%d', created_at/1000, 'unixepoch', '+8 hours') AS date, COUNT(*) AS n
          FROM ${table} WHERE created_at >= ? AND created_at <= ? GROUP BY date`).all(Date.parse(`${first}T00:00:00+08:00`), at).map(row => [row.date, row.n]));
      }
      const registrations = createdCounts('users');
      const works = createdCounts('walls');
      const days = Array.from({ length: 30 }, (_, i) => {
        const date = dayKey(at - (29 - i) * DAY);
        return { date, pageviews: 0, visitors: 0, activeUsers: 0, exports: 0, ...daily.get(date), newUsers: registrations.get(date) || 0, newWorks: works.get(date) || 0 };
      });
      const current = days[29];
      return {
        timezone: 'Asia/Shanghai', startedAt: since, generatedAt: at,
        summary: {
          pageviews: current.pageviews, visitors: current.visitors,
          totalUsers: db.prepare('SELECT COUNT(*) n FROM users').get().n,
          newUsers: current.newUsers, activeUsers: current.activeUsers,
          totalWorks: db.prepare('SELECT COUNT(*) n FROM walls').get().n,
          totalExports: db.prepare('SELECT COALESCE(SUM(exports),0) n FROM analytics_daily').get().n,
        }, days,
      };
    },
  };
}
