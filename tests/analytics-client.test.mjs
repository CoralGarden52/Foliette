import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import ts from '../web/node_modules/typescript/lib/typescript.js';
async function client() {
  const file = new URL('../web/src/lib/analytics.ts', import.meta.url);
  assert.ok(existsSync(file), 'Browser analytics transport is not implemented');
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
test('page names omit identifiers and exclude admin, redirect and unknown routes', async () => {
  const { trackedPage } = await client();
  assert.equal(trackedPage('/editor/private-wall-id'), 'editor');
  assert.equal(trackedPage('/walls'), 'walls');
  assert.equal(trackedPage('/login'), 'login');
  for (const route of ['/admin/stats', '/admin', '/', '/unknown']) assert.equal(trackedPage(route), null);
});
test('delivery is serialized for the initial visitor cookie; retries reuse event ID; failures resolve quietly', async () => {
  const { createAnalyticsTransport } = await client();
  const calls = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const send = createAnalyticsTransport(async (_url, options) => {
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) { await gate; return { ok: false, status: 503 }; }
    return { ok: true, status: 204 };
  });
  const one = send({ type: 'pageview', page: 'login', eventId: 'test-first-event' });
  const two = send({ type: 'pageview', page: 'walls', eventId: 'test-second-event' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  release();
  await Promise.all([one, two]);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].eventId, calls[1].eventId);
  assert.equal(calls[2].eventId, 'test-second-event');
  const failing = createAnalyticsTransport(async () => { throw new Error('offline'); });
  await assert.doesNotReject(failing({ type: 'active' }));
});

test('HTTP LAN browsers without randomUUID still create valid event IDs and exports never throw', async () => {
  const { analyticsEventId, trackExport } = await client();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
  try {
    assert.match(analyticsEventId(), /^[a-zA-Z0-9_-]{12,80}$/);
    assert.doesNotThrow(() => trackExport('owned-wall'));
  } finally { Object.defineProperty(globalThis, 'crypto', descriptor); }
});
