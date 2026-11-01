import fs from 'node:fs';
import path from 'node:path';
import { photoKey } from './photoStorage.js';

/** Copy first, verify, then update metadata. Never deletes local originals. */
export async function migrateLocalPhotos({ db, uploadDir, client, apply = false }) {
  let lock;
  const lockFile = path.join(uploadDir, '.oss-migration.lock');
  if (apply) {
    fs.mkdirSync(uploadDir, { recursive: true });
    try { lock = fs.openSync(lockFile, 'wx'); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('已有迁移任务正在执行；若上次硬中断，请先确认任务已结束再移除 .oss-migration.lock'); throw error; }
  }
  try {
    const records = db.prepare("SELECT * FROM uploads WHERE storage='local' AND filename NOT IN (SELECT filename FROM photo_deletions)").all();
    let migrated = 0, missing = 0;
    for (const record of records) {
      const key = photoKey(record.user_id, record.filename);
      const file = path.join(uploadDir, record.user_id, record.filename);
      if (!fs.existsSync(file)) { missing++; continue; }
      if (!apply) continue;
      try {
        await client.put(key, file, { mime: record.mime_type || undefined });
        const head = await client.head(key);
        if (Number(head.res.headers['content-length']) !== fs.statSync(file).size) throw new Error('迁移后的文件大小校验失败');
        // A running website may have deleted the photo while the upload was in flight.
        const result = db.prepare("UPDATE uploads SET storage='oss', object_key=? WHERE filename=? AND user_id=? AND storage='local' AND filename NOT IN (SELECT filename FROM photo_deletions)").run(key, record.filename, record.user_id);
        if (result.changes) migrated++;
        else await client.delete(key);
      } catch (error) {
        try { await client.delete(key); } catch { /* Keep local authoritative; operator can retry the same key. */ }
        throw error;
      }
    }
    return { planned: records.length, migrated, missing };
  } finally {
    if (lock !== undefined) { fs.closeSync(lock); fs.unlinkSync(lockFile); }
  }
}
