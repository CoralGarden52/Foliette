import OSS from 'ali-oss';
import { getPhotoStorageConfig } from './photoStorage.js';
import { checkOssConnection } from './ossConnection.js';

try {
  const config = getPhotoStorageConfig({ ...process.env, PHOTO_STORAGE: 'oss' });
  await checkOssConnection(new OSS(config));
  console.log(`OSS 连接成功：${config.bucket}，${config.region}；上传、读取、删除验证通过。`);
} catch (error) {
  // Never print SDK error objects: they may include authorization or signed requests.
  const missing = /OSS 配置缺少 (OSS_[A-Z_]+)/.exec(error.message || '');
  if (missing) console.error(`尚未配置 ${missing[1]}，请在本机 .env.oss 或服务器环境变量中填写。`);
  else console.error('OSS 连接检查失败。请检查地域、Endpoint、RAM 对 photos/* 的读写删除权限以及网络连接。错误代码：' + String(error.code || 'ConnectionCheckFailed').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80));
  process.exitCode = 1;
}
