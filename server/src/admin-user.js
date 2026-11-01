import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { DB_FILE } from './config.js';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('用法：npm run admin:user -- 已注册的邮箱');
  process.exit(1);
}
if (!existsSync(DB_FILE)) {
  console.error('未找到数据库。请先启动网站并注册账号，或将 DATA_DIR 指向实际数据目录。');
  process.exit(1);
}
const db = new DatabaseSync(DB_FILE, { readOnly: true });
try {
  const user = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (!user) {
    console.error('未找到该邮箱对应的账号。请先通过网站注册。');
    process.exitCode = 1;
  } else {
    console.log(`ADMIN_USER_IDS=${user.id}`);
    console.log('将上面一行加入服务器环境变量（Docker 部署写入 .env），然后重启服务。多个 ID 用英文逗号分隔。');
  }
} finally { db.close(); }
