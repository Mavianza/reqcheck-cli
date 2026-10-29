import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateConfig, loadConfig, ConfigError } from '../src/config.js';
import { example, temporary } from './helpers.js';

test('URL relatif dan default dinormalisasi sebelum eksekusi', () => {
  const result = validateConfig({ baseUrl: 'http://localhost:8787/api/', tests: [example({ url: 'health', method: 'get' })] });
  assert.equal(result.tests[0].url, 'http://localhost:8787/api/health');
  assert.equal(result.tests[0].method, 'GET');
  assert.equal(result.tests[0].timeoutMs, 5000);
  assert.equal(result.maxResponseBytes, 1048576);
});

test('variabel lingkungan pada URL dan header diekspansi tanpa mengubah body JSON', () => {
  const result = validateConfig({ baseUrl: '${API_BASE}', tests: [example({ url: '/a', method: 'POST', headers: { Authorization: 'Bearer ${API_TOKEN}' }, json: { literal: '${API_TOKEN}' } })] }, { API_BASE: 'https://example.com', API_TOKEN: 'rahasia' });
  assert.equal(result.tests[0].headers.authorization, 'Bearer rahasia');
  assert.equal(result.tests[0].headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(result.tests[0].body), { literal: '${API_TOKEN}' });
});

test('variabel yang hilang ditolak tanpa mencetak nilai rahasia', () => {
  assert.throws(() => validateConfig({ tests: [example({ headers: { Authorization: '${HILANG}' } })] }, {}), /HILANG belum diatur/);
});

test('nilai env dipakai literal dan karakter kontrol pada URL ditolak', () => {
  const config = validateConfig({ tests: [example({ headers: { Authorization: '${TOKEN}' } })] }, { TOKEN: 'literal${bagian-token}' });
  assert.equal(config.tests[0].headers.authorization, 'literal${bagian-token}');
  assert.throws(() => validateConfig({ tests: [example({ url: '${API}' })] }, { API: 'http://localhost/\r\n' }), ConfigError);
});

test('kesalahan skema, typo, dan kelompok pemeriksaan kosong ditolak', () => {
  const cases = [
    {}, { tests: [] }, { tests: [example()], timoutMs: 5 },
    { tests: [example({ expect: {} })] }, { tests: [example({ expect: { headers: {} } })] },
    { tests: [example({ expect: { status: 200, json: {} } })] },
    { tests: [example({ expect: { json: { 'tanpa-slash': 1 } } })] },
    { tests: [example({ expect: { json: { '/rusak~2': 1 } } })] },
    { tests: [example({ expect: { status: [] } })] },
    { tests: [example({ expect: { status: 999 } })] },
    { timeoutMs: 0, tests: [example()] },
    { maxResponseBytes: -1, tests: [example()] },
    { tests: [example({ expect: { status: 200, statuz: 200 } })] },
    { tests: [example({ method: 'CONNECT' })] },
    { tests: [example({ json: { a: 1 } })] },
    { tests: [example(), example()] }
  ];
  for (const raw of cases) assert.throws(() => validateConfig(raw), ConfigError);
});

test('URL non-HTTP, kredensial URL, dan fragmen ditolak', () => {
  for (const url of ['file:///etc/passwd', 'https://user:pass@example.com', 'https://example.com/#x', '/relative-without-base']) {
    assert.throws(() => validateConfig({ tests: [example({ url })] }), ConfigError);
  }
  assert.throws(() => validateConfig({ baseUrl: 'https://example.com/?a=b', tests: [example()] }), /query/);
});

test('header duplikat, CRLF dari env, dan header transport ditolak', () => {
  for (const headers of [{ A: 'a', a: 'b' }, { 'Content-Length': '3' }, { 'bad name': 'x' }, { X: 3 }]) {
    assert.throws(() => validateConfig({ tests: [example({ headers })] }), ConfigError);
  }
  assert.throws(() => validateConfig({ tests: [example({ headers: { X: '${TOKEN}' } })] }, { TOKEN: 'x\r\nX-Injected: yes' }), ConfigError);
});

test('pembaca konfigurasi menangani BOM, JSON rusak, ukuran, dan berkas hilang', async t => {
  const dir = await temporary(t);
  const path = join(dir, 'config.json');
  await writeFile(path, '\uFEFF' + JSON.stringify({ tests: [example()] }));
  assert.equal((await loadConfig(path)).tests.length, 1);
  await writeFile(path, '{broken');
  await assert.rejects(loadConfig(path), /JSON yang valid/);
  await writeFile(path, 'x'.repeat(1048577));
  await assert.rejects(loadConfig(path), /maksimum 1 MiB/);
  await assert.rejects(loadConfig(join(dir, 'missing')), /ENOENT/);
});
