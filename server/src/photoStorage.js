import fs from 'node:fs';
import path from 'node:path';
import OSS from 'ali-oss';
import { UPLOAD_DIR } from './config.js';

export class PhotoStorageError extends Error {
  constructor(status, message) { super(message); this.name = 'PhotoStorageError'; this.status = status; }
}

export function getPhotoStorageConfig(env = process.env) {
  const backend = env.PHOTO_STORAGE || 'local';
  if (!['local', 'oss'].includes(backend)) throw new Error('PHOTO_STORAGE 只能是 local 或 oss');
  const config = {
    backend, bucket: env.OSS_BUCKET || '', region: env.OSS_REGION || '',
    accessKeyId: env.OSS_ACCESS_KEY_ID || '', accessKeySecret: env.OSS_ACCESS_KEY_SECRET || '',
    stsToken: env.OSS_SECURITY_TOKEN || undefined, authorizationV4: true, secure: true,
    timeout: 30_000, cname: env.OSS_CNAME === '1',
  };
  if (config.region && !config.region.startsWith('oss-')) config.region = `oss-${config.region}`;
  if (env.OSS_ENDPOINT) {
    const endpoint = new URL(env.OSS_ENDPOINT.includes('://') ? env.OSS_ENDPOINT : `https://${env.OSS_ENDPOINT}`);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw new Error('OSS_ENDPOINT 必须是 HTTPS 域名，不含路径或查询参数');
    config.endpoint = endpoint.origin;
  }
  if (backend === 'oss') {
    for (const [key, value] of [['OSS_BUCKET', config.bucket], ['OSS_REGION', config.region], ['OSS_ACCESS_KEY_ID', config.accessKeyId], ['OSS_ACCESS_KEY_SECRET', config.accessKeySecret]]) {
      if (!value || /^(YOUR_|填写|replace-with)/i.test(value)) throw new Error(`OSS 配置缺少 ${key}`);
    }
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket)) throw new Error('OSS_BUCKET 格式不正确');
    if (!/^oss-[a-z0-9-]+$/.test(config.region)) throw new Error('OSS_REGION 格式不正确');
  }
  return config;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' };
export function photoKey(userId, filename) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(userId || '') || !/^[a-zA-Z0-9_-]+\.(png|jpe?g|webp|gif|avif)$/i.test(filename || '')) throw new PhotoStorageError(400, '照片路径不正确');
  return `photos/${userId}/${filename}`;
}
function remoteError(error) {
  return new PhotoStorageError(error?.code === 'NoSuchKey' ? 404 : 503, error?.code === 'NoSuchKey' ? '照片不存在' : '照片存储服务暂时不可用，请稍后重试');
}

export function createPhotoStorage({ config, uploadDir = UPLOAD_DIR, clientFactory = options => new OSS(options) }) {
  let client;
  function oss() {
    if (!config.bucket || !config.region || !config.accessKeyId || !config.accessKeySecret) throw new PhotoStorageError(503, 'OSS 访问凭证尚未配置');
    return client ||= clientFactory(config);
  }
  function identity(record) {
    const key = photoKey(record.user_id, record.filename);
    if (record.storage === 'oss' && record.object_key !== key) throw new PhotoStorageError(400, '照片存储路径不正确');
    if (!['local', 'oss'].includes(record.storage || 'local')) throw new PhotoStorageError(503, '照片存储类型不正确');
    return key;
  }
  return {
    backend: config.backend,
    async putFile({ userId, filename, filePath, mimeType }) {
      const key = photoKey(userId, filename);
      if (config.backend === 'local') return { storage: 'local', object_key: '', mime_type: mimeType };
      try { await oss().put(key, filePath, { mime: mimeType }); }
      catch (error) { throw remoteError(error); }
      return { storage: 'oss', object_key: key, mime_type: mimeType };
    },
    async open(record) {
      const key = identity(record);
      const mime = MIME[path.extname(record.filename).toLowerCase()];
      if (record.storage === 'oss') {
        try {
          const result = await oss().getStream(key);
          return { stream: result.stream, contentType: mime, contentLength: result.res?.headers?.['content-length'] };
        } catch (error) { throw remoteError(error); }
      }
      try {
        const handle = await fs.promises.open(path.join(uploadDir, record.user_id, record.filename), 'r');
        try {
          const stat = await handle.stat();
          if (!stat.isFile()) throw new Error('Not a file');
          return { stream: handle.createReadStream(), contentType: mime, contentLength: stat.size };
        } catch (error) { await handle.close(); throw error; }
      } catch (error) {
        throw new PhotoStorageError(error.code === 'ENOENT' ? 404 : 503, error.code === 'ENOENT' ? '照片不存在' : '照片读取失败，请稍后重试');
      }
    },
    async remove(record) {
      const key = identity(record);
      if (record.storage === 'oss') {
        try { await oss().delete(key); }
        catch (error) { if (error?.code !== 'NoSuchKey') throw remoteError(error); }
      } else {
        try { await fs.promises.unlink(path.join(uploadDir, record.user_id, record.filename)); }
        catch (error) { if (error.code !== 'ENOENT') throw new PhotoStorageError(503, '照片删除暂未完成'); }
      }
    },
  };
}

