import fs from 'node:fs';
import { app } from './app.js';
import { ASSETS_DIR, DATA_DIR, PORT, PUBLIC_DIR, UPLOAD_DIR } from './config.js';
import { readManifest } from './assets.js';
import { drainPhotoDeletions } from './photoFiles.js';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
readManifest({ force: true });
const cleanupPhotos = () => drainPhotoDeletions().catch(() => console.error('[photos] 清理任务暂未完成，将自动重试'));
void cleanupPhotos();
setInterval(cleanupPhotos, 60_000).unref();
const server = app.listen(PORT, '0.0.0.0', () => {
  const { avatars, groups } = readManifest();
  console.log('\n  🌿 Foliette 已启动');
  console.log(`  · 地址     http://localhost:${PORT}`);
  console.log(`  · 数据目录  ${DATA_DIR}`);
  console.log(`  · 素材目录  ${ASSETS_DIR}（头像 ${avatars.length} 个，${groups.map(g => `${g.title} ${g.count}`).join('，')}）`);
  console.log(`  · 前端目录  ${PUBLIC_DIR}\n`);
});
server.on('error', error => {
  console.error(`[foliette] 启动失败：${error.message}`);
  process.exit(1);
});
