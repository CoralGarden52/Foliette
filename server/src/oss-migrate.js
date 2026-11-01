import OSS from 'ali-oss';
import { db } from './db.js';
import { UPLOAD_DIR } from './config.js';
import { getPhotoStorageConfig } from './photoStorage.js';
import { migrateLocalPhotos } from './ossMigration.js';

try {
  const flags = process.argv.slice(2);
  if (flags.some(flag => !['--apply', '--dry-run'].includes(flag))) throw new Error('UnknownArgument');
  const apply = flags.includes('--apply') && !flags.includes('--dry-run');
  const client = apply ? new OSS(getPhotoStorageConfig({ ...process.env, PHOTO_STORAGE: 'oss' })) : null;
  const result = await migrateLocalPhotos({ db, uploadDir: UPLOAD_DIR, client, apply });
  console.log(`${apply ? '迁移完成' : '仅预览，未上传'}：本地记录 ${result.planned}，已迁移 ${result.migrated}，本地文件缺失 ${result.missing}。`);
  if (!apply) console.log('确认数据库和上传目录已备份，并暂停网站写入后，使用 --apply 执行；本地原件将保留。');
} catch (error) {
  if (String(error.message).startsWith('已有迁移任务')) console.error(error.message);
  else console.error('迁移未完成，已处理的照片记录会保留进度。请检查参数、凭证、权限及网络；本地原件不会被删除，可再次执行。');
  process.exitCode = 1;
} finally { db.close(); }
