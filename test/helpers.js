import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function temporary(t) {
  const path = await mkdtemp(join(tmpdir(), 'reqcheck-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

export async function localServer(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

export function example(overrides = {}) {
  return { name: 'Contoh', url: 'http://127.0.0.1/health', expect: { status: 200 }, ...overrides };
}
