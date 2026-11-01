import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

const moduleFile = new URL('../server/src/photoStorage.js', import.meta.url);
async function module() {
  assert.ok(existsSync(moduleFile), 'The local/OSS storage adapter is not implemented');
  return import(moduleFile);
}
const env = { PHOTO_STORAGE: 'oss', OSS_BUCKET: 'foliette-photos-prod', OSS_REGION: 'oss-cn-shenzhen', OSS_ENDPOINT: 'oss-cn-shenzhen.aliyuncs.com', OSS_ACCESS_KEY_ID: 'test-id', OSS_ACCESS_KEY_SECRET: 'test-secret' };

test('OSS configuration is explicit, uses HTTPS/V4, and missing credentials never silently select local', async () => {
  const { getPhotoStorageConfig } = await module();
  assert.equal(getPhotoStorageConfig({}).backend, 'local');
  const config = getPhotoStorageConfig(env);
  assert.equal(config.bucket, 'foliette-photos-prod');
  assert.equal(config.endpoint, 'https://oss-cn-shenzhen.aliyuncs.com');
  assert.equal(config.authorizationV4, true);
  assert.throws(() => getPhotoStorageConfig({ ...env, OSS_ACCESS_KEY_SECRET: '' }), /OSS_ACCESS_KEY_SECRET/);
  for (const invalid of [{ ...env, PHOTO_STORAGE: 'other' }, { ...env, OSS_ENDPOINT: 'http://oss-cn-shenzhen.aliyuncs.com' }, { ...env, OSS_BUCKET: '../bucket' }]) assert.throws(() => getPhotoStorageConfig(invalid));
});

test('OSS objects use user-scoped keys; downloads remain streams; local records stay local after switching', async () => {
  const { getPhotoStorageConfig, createPhotoStorage } = await module();
  const directory = mkdtempSync(path.join(os.tmpdir(), 'foliette-storage-unit-'));
  const calls = [];
  mkdirSync(path.join(directory, 'u_test'));
  const file = path.join(directory, 'u_test', 'photo.png');
  writeFileSync(file, 'image-bytes');
  const client = {
    put: async (key, filePath) => calls.push(['put', key, readFileSync(filePath, 'utf8')]),
    getStream: async key => { calls.push(['get', key]); return { stream: Readable.from(['remote-image']), res: { headers: { 'content-length': '12' } } }; },
    delete: async key => calls.push(['delete', key]),
  };
  const storage = createPhotoStorage({ config: getPhotoStorageConfig(env), uploadDir: directory, clientFactory: options => { assert.equal(options.authorizationV4, true); return client; } });
  try {
    const location = await storage.putFile({ userId: 'u_test', filename: 'photo.png', filePath: file, mimeType: 'image/png' });
    assert.equal(location.storage, 'oss');
    assert.equal(location.object_key, 'photos/u_test/photo.png');
    const record = { user_id: 'u_test', filename: 'photo.png', mime_type: 'image/png', ...location };
    const remote = await storage.open(record);
    assert.equal(await consume(remote.stream), 'remote-image');
    const local = await storage.open({ ...record, storage: 'local', object_key: '' });
    assert.equal(await consume(local.stream), 'image-bytes');
    await storage.remove(record);
    assert.deepEqual(calls.map(call => call[0]), ['put', 'get', 'delete']);
    assert.equal(existsSync(file), true);
    for (const filename of ['../outside.png', 'a/b.png', 'a\\b.png']) await assert.rejects(storage.open({ ...record, filename }));
    await assert.rejects(storage.open({ ...record, object_key: 'photos/another-user/photo.png' }));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('missing objects return404; remote failures are503 without secrets or local fallback', async () => {
  const { getPhotoStorageConfig, createPhotoStorage } = await module();
  let failure = { status: 404, code: 'NoSuchKey' };
  const storage = createPhotoStorage({ config: getPhotoStorageConfig(env), uploadDir: os.tmpdir(), clientFactory: () => ({ getStream: async () => { throw failure; }, delete: async () => { throw failure; } }) });
  const record = { user_id: 'u_test', filename: 'p.png', storage: 'oss', object_key: 'photos/u_test/p.png', mime_type: 'image/png' };
  await assert.rejects(storage.open(record), error => error.status === 404);
  failure = new Error('test-secret signed-url credential-data');
  await assert.rejects(storage.open(record), error => error.status === 503 && !error.message.includes('test-secret'));
  await assert.rejects(storage.remove(record), error => error.status === 503 && !error.message.includes('test-secret'));
});
async function consume(stream) { let text = ''; for await (const chunk of stream) text += chunk; return text; }
