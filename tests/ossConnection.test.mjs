import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test('connection check proves upload/read/delete and cleans only its own random probe', async () => {
  const file = new URL('../server/src/ossConnection.js', import.meta.url);
  assert.ok(existsSync(file), 'OSS connection check is not implemented');
  const { checkOssConnection } = await import(file);
  const objects = new Map([['photos/real-user/photo.png', Buffer.from('keep')]]);
  const keys = [];
  const client = {
    put: async (key, data) => { keys.push(key); objects.set(key, data); },
    get: async key => ({ content: objects.get(key) }),
    delete: async key => objects.delete(key),
  };
  await checkOssConnection(client);
  assert.match(keys[0], /^photos\/_connection-check\/[a-f0-9-]+\.txt$/);
  assert.equal(objects.size, 1);
  assert.equal(objects.has('photos/real-user/photo.png'), true);
  client.get = async () => ({ content: Buffer.from('corrupt') });
  await assert.rejects(checkOssConnection(client), /校验失败/);
  assert.equal(objects.size, 1);
});

test('CLI reports missing local credentials without a stack trace or attempting cloud requests', () => {
  const result = spawnSync(process.execPath, ['server/src/oss-check.js'], { encoding: 'utf8', env: { ...process.env, PHOTO_STORAGE: 'oss', OSS_BUCKET: 'foliette-photos-prod', OSS_REGION: 'oss-cn-shenzhen', OSS_ACCESS_KEY_ID: '', OSS_ACCESS_KEY_SECRET: '' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /尚未配置 OSS_ACCESS_KEY_ID/);
  assert.equal(result.stderr.includes('at getPhotoStorageConfig'), false);
});
