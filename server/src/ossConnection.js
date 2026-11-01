import { randomUUID } from 'node:crypto';

/** Verifies object operations without requiring bucket-listing or modifying any existing object. */
export async function checkOssConnection(client) {
  const key = `photos/_connection-check/${randomUUID()}.txt`;
  const content = Buffer.from('Foliette private OSS connection check');
  try {
    await client.put(key, content);
    const result = await client.get(key);
    if (!Buffer.from(result.content).equals(content)) throw new Error('OSS 读回内容校验失败');
  } finally {
    await client.delete(key);
  }
}
