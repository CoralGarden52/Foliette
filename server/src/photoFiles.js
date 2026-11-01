import fs from 'node:fs';
import path from 'node:path';
import { db, Uploads, deleteUpload } from './db.js';
import { UPLOAD_DIR } from './config.js';
import { createPhotoStorage, getPhotoStorageConfig, photoKey } from './photoStorage.js';

export const photoStorage = createPhotoStorage({ config: getPhotoStorageConfig() });

export const storageFor = req => req.app.locals.photoStorage || photoStorage;
const queueInsert = db.prepare('INSERT OR IGNORE INTO photo_deletions(filename,user_id,storage,object_key,mime_type,created_at) VALUES (?,?,?,?,?,?)');
export function queuePhotoDeletion(record) {
  photoKey(record.user_id, record.filename);
  queueInsert.run(record.filename, record.user_id, record.storage || 'local', record.object_key || '', record.mime_type || '', Date.now());
}
export function pendingPhotoDeletion(userId, filename) {
  return Boolean(db.prepare('SELECT 1 FROM photo_deletions WHERE filename=? AND user_id=?').get(filename, userId));
}
export function localPhotoRecord(userId, filename) {
  photoKey(userId, filename);
  return { user_id: userId, filename, storage: 'local', object_key: '', mime_type: '' };
}
export function photoRecord(userId, filename) {
  const record = Uploads.get(filename);
  if (pendingPhotoDeletion(userId, filename) || (record && record.user_id !== userId)) return null;
  if (record) return record;
  const legacy = localPhotoRecord(userId, filename);
  return fs.existsSync(path.join(UPLOAD_DIR, userId, filename)) ? legacy : null;
}
export function dbTransaction(callback) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = callback(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

const workers = new WeakMap();
export function drainPhotoDeletions(storage = photoStorage) {
  if (workers.has(storage)) return workers.get(storage);
  const work = (async () => {
    for (const record of db.prepare('SELECT * FROM photo_deletions ORDER BY attempts, created_at LIMIT 100').all()) {
      try {
        await storage.remove(record);
        // Remove any local original kept by a previous migration or a failed upload.
        deleteUpload(record.user_id, record.filename);
        if (fs.existsSync(path.join(UPLOAD_DIR, record.user_id, record.filename))) throw new Error('Local cleanup incomplete');
        db.prepare('DELETE FROM photo_deletions WHERE filename=?').run(record.filename);
      } catch {
        db.prepare('UPDATE photo_deletions SET attempts=attempts+1 WHERE filename=?').run(record.filename);
      }
    }
  })().finally(() => workers.delete(storage));
  workers.set(storage, work);
  return work;
}

/** An unsuccessful batch never publishes partial metadata; attempted remote keys are queued for cleanup. */
export async function placePhotos(storage, userId, files) {
  const records = [];
  try {
    for (const file of files) {
      const attempted = { user_id: userId, filename: file.filename, storage: storage.backend, object_key: storage.backend === 'oss' ? photoKey(userId, file.filename) : '', mime_type: file.mimetype };
      records.push(attempted);
      Object.assign(attempted, await storage.putFile({ userId, filename: file.filename, filePath: file.path, mimeType: file.mimetype }));
    }
    return records;
  } catch (error) {
    dbTransaction(() => { for (const record of records) queuePhotoDeletion(record); });
    for (const file of files) deleteUpload(userId, file.filename);
    await drainPhotoDeletions(storage);
    throw error;
  }
}
