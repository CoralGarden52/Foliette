import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+LsAAAAASUVORK5CYII=', 'base64');
test('existing photo API supports private OSS, legacy files, upload rollback and durable delete retries', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'foliette-oss-routes-'));
  process.env.DATA_DIR = directory;
  process.env.PHOTO_STORAGE = 'local';
  process.env.JWT_SECRET = 'oss-route-test-secret';
  const legacy = new DatabaseSync(path.join(directory, 'foliette.db'));
  legacy.exec(`PRAGMA foreign_keys=OFF; CREATE TABLE uploads(filename TEXT PRIMARY KEY,user_id TEXT NOT NULL,wall_id TEXT NOT NULL REFERENCES walls(id) ON DELETE CASCADE,created_at INTEGER NOT NULL);
    INSERT INTO uploads VALUES('legacy.png','u_owner','w_legacy',1);`);
  legacy.close();
  const { app } = await import('../server/src/app.js');
  const { Users, Walls, Uploads, db } = await import('../server/src/db.js');
  const { signJwt } = await import('../server/src/util.js');
  const { createPhotoStorage, getPhotoStorageConfig } = await import('../server/src/photoStorage.js');
  const { drainPhotoDeletions } = await import('../server/src/photoFiles.js');
  const remote = new Map();
  let putCount = 0, failAtPut = 0, failDelete = false, failRead = false, getCount = 0;
  const storage = createPhotoStorage({ uploadDir: path.join(directory, 'uploads'), config: getPhotoStorageConfig({ PHOTO_STORAGE: 'oss', OSS_BUCKET: 'foliette-photos-prod', OSS_REGION: 'oss-cn-shenzhen', OSS_ACCESS_KEY_ID: 'test', OSS_ACCESS_KEY_SECRET: 'test-secret' }), clientFactory: () => ({
    put: async (key, file) => {
      const { readFileSync } = await import('node:fs');
      remote.set(key, readFileSync(file));
      if (++putCount === failAtPut) throw new Error('test-secret signed-cloud-request');
    },
    getStream: async key => {
      getCount++;
      if (failRead) throw new Error('test-secret signed-cloud-request');
      if (!remote.has(key)) throw { code: 'NoSuchKey', status: 404 };
      return { stream: Readable.from([remote.get(key)]), res: { headers: { 'content-length': String(remote.get(key).length) } } };
    },
    delete: async key => { if (failDelete) throw new Error('offline'); remote.delete(key); },
  }) });
  app.locals.photoStorage = storage;
  for (const id of ['u_owner', 'u_other']) Users.create({ id, username: id, email: `${id}@example.test`, pass_hash: 'unused', created_at: Date.now() });
  Walls.create({ id: 'w_legacy', user_id: 'u_owner', title: 'legacy', ratio_w: 1, ratio_h: 1, layout_id: 'grid', theme: 'cream', doc: '{"version":1,"items":[]}', cover: '', created_at: 1, updated_at: 1 });
  mkdirSync(path.join(directory, 'uploads', 'u_owner'), { recursive: true });
  writeFileSync(path.join(directory, 'uploads', 'u_owner', 'legacy.png'), png);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = id => `foliette_token=${signJwt({ sub: id }, process.env.JWT_SECRET, 3600)}`;
  const request = (url, options = {}, id = 'u_owner') => fetch(base + url, { ...options, headers: { ...(id ? { Cookie: cookie(id) } : {}), ...options.headers } });
  const create = async () => (await (await request('/api/walls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).wall;
  const upload = (wallId, bodies = [png]) => {
    const form = new FormData();
    bodies.forEach((body, i) => form.append('files', new Blob([body], { type: 'image/png' }), `${i}.png`));
    return request(`/api/walls/${wallId}/photos`, { method: 'POST', body: form });
  };
  const save = (wall, src) => request(`/api/walls/${wall.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc: { version: 1, items: [{ id: 'photo', kind: 'photo', src, x: 0, y: 0, w: 100, h: 100, rot: 0, z: 1, frame: 'plain' }] } }) });
  try {
    await t.test('old upload rows migrate to local and remain readable in OSS mode', async () => {
      assert.equal(Uploads.get('legacy.png').storage, 'local');
      const response = await request('/api/files/u_owner/legacy.png');
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    });
    await t.test('uploads become OSS records with stable same-origin URLs and no permanent local copy', async () => {
      const wall = await create();
      const response = await upload(wall.id);
      assert.equal(response.status, 201);
      const photo = (await response.json()).photos[0];
      const filename = photo.url.split('/').pop();
      assert.equal(Uploads.get(filename).storage, 'oss');
      assert.equal(remote.has(`photos/u_owner/${filename}`), true);
      assert.equal(existsSync(path.join(directory, 'uploads', 'u_owner', filename)), false);
      assert.equal((await save(wall, photo.url)).status, 200);
      const read = await request(photo.url);
      assert.equal(read.status, 200);
      assert.equal(read.headers.get('content-type'), 'image/png');
      assert.deepEqual(Buffer.from(await read.arrayBuffer()), png);
      const before = getCount;
      assert.equal((await request(photo.url, {}, null)).status, 401);
      assert.equal((await request(photo.url, {}, 'u_other')).status, 403);
      assert.equal(getCount, before);
      const otherWall = await create();
      assert.equal((await save(otherWall, photo.url)).status, 400);
      failRead = true;
      const failed = await request(photo.url);
      assert.equal(failed.status, 503);
      assert.equal((await failed.text()).includes('test-secret'), false);
      failRead = false;
    });
    await t.test('invalid image files never reach OSS; partial remote batches roll back and clean temp files', async () => {
      const wall = await create();
      const before = remote.size;
      const diskBefore = readdirSync(path.join(directory, 'uploads', 'u_owner')).sort();
      assert.equal((await upload(wall.id, [Buffer.alloc(20)])).status, 400);
      assert.equal(remote.size, before);
      failAtPut = putCount + 2;
      const failed = await upload(wall.id, [png, png]);
      assert.equal(failed.status, 503);
      assert.equal((await failed.text()).includes('test-secret'), false);
      assert.equal(Uploads.list(wall.id, 'u_owner').length, 0);
      assert.equal(remote.size, before);
      assert.deepEqual(readdirSync(path.join(directory, 'uploads', 'u_owner')).sort(), diskBefore);
      failAtPut = 0;
    });
    await t.test('cloud deletion failures retain durable cleanup jobs while denying access immediately', async () => {
      const wall = await create();
      const photo = (await (await upload(wall.id)).json()).photos[0];
      await save(wall, photo.url);
      const filename = photo.url.split('/').pop();
      failDelete = true;
      assert.equal((await request(`/api/walls/${wall.id}/photos/${filename}`, { method: 'DELETE' })).status, 200);
      await drainPhotoDeletions(storage);
      assert.equal(Uploads.get(filename), undefined);
      assert.ok(db.prepare('SELECT * FROM photo_deletions WHERE filename=?').get(filename));
      assert.equal((await request(photo.url)).status, 404);
      failDelete = false;
      await drainPhotoDeletions(storage);
      assert.equal(remote.has(`photos/u_owner/${filename}`), false);
      assert.equal(db.prepare('SELECT * FROM photo_deletions WHERE filename=?').get(filename), undefined);
    });
    await t.test('deleting an entire wall also cleans uploads that were never placed on its canvas', async () => {
      const wall = await create();
      const photo = (await (await upload(wall.id)).json()).photos[0];
      assert.equal((await request(`/api/walls/${wall.id}`, { method: 'DELETE' })).status, 200);
      await drainPhotoDeletions(storage);
      assert.equal(remote.has(`photos/u_owner/${photo.url.split('/').pop()}`), false);
      assert.equal((await request(photo.url)).status, 404);
    });
    await t.test('local mode still supports upload, save, stream and deletion without OSS credentials', async () => {
      const localStorage = createPhotoStorage({ uploadDir: path.join(directory, 'uploads'), config: getPhotoStorageConfig({ PHOTO_STORAGE: 'local' }), clientFactory: () => { throw new Error('Local mode must not initialize OSS'); } });
      app.locals.photoStorage = localStorage;
      try {
        const wall = await create();
        const response = await upload(wall.id);
        assert.equal(response.status, 201);
        const photo = (await response.json()).photos[0];
        const filename = photo.url.split('/').pop();
        assert.equal(Uploads.get(filename).storage, 'local');
        assert.equal(existsSync(path.join(directory, 'uploads', 'u_owner', filename)), true);
        assert.equal((await save(wall, photo.url)).status, 200);
        const downloaded = await request(photo.url);
        assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), png);
        assert.equal((await request(`/api/walls/${wall.id}`, { method: 'DELETE' })).status, 200);
        await drainPhotoDeletions(localStorage);
        assert.equal(existsSync(path.join(directory, 'uploads', 'u_owner', filename)), false);
        assert.equal((await request(photo.url)).status, 404);
      } finally { app.locals.photoStorage = storage; }
    });
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory, { recursive: true, force: true }); }
});
