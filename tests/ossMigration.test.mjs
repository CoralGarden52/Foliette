import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('migration defaults to preview, verifies copied size, keeps originals and is repeatable', async () => {
  const file = new URL('../server/src/ossMigration.js', import.meta.url);
  assert.ok(existsSync(file), 'OSS migration is not implemented');
  const { migrateLocalPhotos } = await import(file);
  const directory = mkdtempSync(path.join(os.tmpdir(), 'foliette-migrate-'));
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE uploads(filename TEXT PRIMARY KEY,user_id TEXT,wall_id TEXT,storage TEXT,object_key TEXT,mime_type TEXT);
    CREATE TABLE photo_deletions(filename TEXT PRIMARY KEY);
    INSERT INTO uploads VALUES('p.png','u_test','w_test','local','','image/png');`);
  mkdirSync(path.join(directory, 'u_test'));
  writeFileSync(path.join(directory, 'u_test', 'p.png'), 'image');
  const remote = new Map();
  let size = 5;
  const client = { put: async key => remote.set(key, true), head: async () => ({ res: { headers: { 'content-length': String(size) } } }), delete: async key => remote.delete(key) };
  try {
    let result = await migrateLocalPhotos({ db, uploadDir: directory, client });
    assert.equal(result.planned, 1);
    assert.equal(remote.size, 0);
    size = 4;
    await assert.rejects(migrateLocalPhotos({ db, uploadDir: directory, client, apply: true }), /校验失败/);
    assert.equal(remote.size, 0);
    assert.equal(db.prepare('SELECT storage FROM uploads').get().storage, 'local');
    size = 5;
    result = await migrateLocalPhotos({ db, uploadDir: directory, client, apply: true });
    assert.equal(result.migrated, 1);
    assert.equal(db.prepare('SELECT storage FROM uploads').get().storage, 'oss');
    assert.equal(existsSync(path.join(directory, 'u_test', 'p.png')), true);
    assert.equal((await migrateLocalPhotos({ db, uploadDir: directory, client, apply: true })).migrated, 0);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('two simultaneous apply runs cannot delete the object published by the successful migration', async () => {
  const { migrateLocalPhotos } = await import('../server/src/ossMigration.js');
  const directory = mkdtempSync(path.join(os.tmpdir(), 'foliette-migrate-lock-'));
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE uploads(filename TEXT PRIMARY KEY,user_id TEXT,wall_id TEXT,storage TEXT,object_key TEXT,mime_type TEXT);
    CREATE TABLE photo_deletions(filename TEXT PRIMARY KEY);
    INSERT INTO uploads VALUES('p.png','u_test','w_test','local','','image/png');`);
  mkdirSync(path.join(directory, 'u_test'));
  writeFileSync(path.join(directory, 'u_test', 'p.png'), 'image');
  const objects = new Set();
  const client = { put: async key => objects.add(key), head: async () => ({ res: { headers: { 'content-length': '5' } } }), delete: async key => objects.delete(key) };
  try {
    const results = await Promise.allSettled([migrateLocalPhotos({ db, uploadDir: directory, client, apply: true }), migrateLocalPhotos({ db, uploadDir: directory, client, apply: true })]);
    assert.equal(objects.has('photos/u_test/p.png'), true);
    assert.equal(db.prepare('SELECT storage FROM uploads').get().storage, 'oss');
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
