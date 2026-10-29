import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config.js';
import { runSuite } from '../src/runner.js';
import { localServer, example } from './helpers.js';

function run(tests, options = {}) { return runSuite(validateConfig({ tests, ...options })); }

test('HTTP nyata: status, header, teks, JSON Pointer, dan durasi dapat lulus', async t => {
  const { url } = await localServer(t, (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'x-demo': 'ok' });
    res.end(JSON.stringify({ users: [{ id: 42 }], 'a/b': { '~x': true } }));
  });
  const report = await run([example({ url, expect: { status: [200, 201], headers: { 'X-Demo': 'ok' }, bodyIncludes: 'users', json: { '/users/0/id': 42, '/a~1b/~0x': true }, maxDurationMs: 5000 } })]);
  assert.equal(report.summary.passed, 1);
  assert.equal(report.results[0].checks.length, 6);
});

test('POST JSON dan header benar-benar diterima server', async t => {
  const { url } = await localServer(t, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    res.writeHead(201, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ method: req.method, token: req.headers.authorization, contentType: req.headers['content-type'], body: JSON.parse(Buffer.concat(chunks)) }));
  });
  const report = await run([example({ url, method: 'POST', headers: { Authorization: 'Bearer test-token' }, json: { aktif: true }, expect: { status: 201, json: { '/method': 'POST', '/token': 'Bearer test-token', '/contentType': 'application/json', '/body': { aktif: true } } } })]);
  assert.equal(report.summary.failed, 0);
  assert.ok(!JSON.stringify(report).includes('test-token'));
});

test('pemeriksaan gagal tidak menghentikan tes berikutnya dan tidak membocorkan body', async t => {
  const { url } = await localServer(t, (req, res) => { res.end('{"secret":"SECRET_BODY","id":"42"}'); });
  const report = await run([
    example({ name: 'Gagal', url: url + '?token=SECRET_QUERY', expect: { status: 201, headers: { 'x-missing': 'secret' }, bodyIncludes: 'absent', json: { '/id': 42, '/missing': null } } }),
    example({ name: 'Berikutnya', url, expect: { status: 200 } })
  ]);
  assert.deepEqual([report.summary.total, report.summary.passed, report.summary.failed], [2, 1, 1]);
  assert.equal(report.results[0].checks.filter(check => !check.passed).length, 5);
  assert.ok(!JSON.stringify(report).includes('SECRET_BODY'));
  assert.ok(!JSON.stringify(report).includes('SECRET_QUERY'));
});

test('JSON Pointer akar mendukung null dan tidak membaca properti prototype', async t => {
  const { url } = await localServer(t, (req, res) => { res.end(req.url === '/null' ? 'null' : '{}'); });
  const report = await run([
    example({ name: 'Akar', url: url + '/null', expect: { json: { '': null } } }),
    example({ name: 'Prototype', url, expect: { json: { '/toString': null } } })
  ]);
  assert.equal(report.results[0].passed, true);
  assert.equal(report.results[1].passed, false);
});

test('respons bukan JSON menjadi kegagalan terlapor', async t => {
  const { url } = await localServer(t, (req, res) => { res.end('bukan JSON'); });
  const report = await run([example({ url, expect: { json: { '/id': 1 } } })]);
  assert.equal(report.summary.failed, 1);
  assert.match(report.results[0].checks[0].message, /JSON yang valid/);
});

test('timeout berlaku sampai seluruh body selesai', async t => {
  const { url } = await localServer(t, (req, res) => { res.writeHead(200); res.write('awal'); });
  const report = await run([example({ url, timeoutMs: 80 })]);
  assert.equal(report.results[0].error.code, 'TIMEOUT');
  assert.equal(report.summary.failed, 1);
});

test('batas ukuran respons berlaku untuk stream tanpa content-length', async t => {
  const { url } = await localServer(t, (req, res) => { res.writeHead(200); res.write('123456'); res.end('7890'); });
  const report = await run([example({ url })], { maxResponseBytes: 5 });
  assert.equal(report.results[0].error.code, 'RESPONSE_TOO_LARGE');
});

test('koneksi putus tercatat sebagai NETWORK_ERROR', async t => {
  const { url } = await localServer(t, req => req.socket.destroy());
  const report = await run([example({ url })]);
  assert.equal(report.results[0].error.code, 'NETWORK_ERROR');
});

test('redirect tidak diikuti dan HEAD tidak membutuhkan body', async t => {
  let hitTarget = false;
  const { url } = await localServer(t, (req, res) => {
    if (req.url === '/target') hitTarget = true;
    if (req.url === '/redirect') { res.writeHead(302, { location: '/target' }); res.end(); }
    else { res.setHeader('content-length', '2'); res.end('ok'); }
  });
  const report = await run([
    example({ name: 'Redirect', url: url + '/redirect', expect: { status: 302 } }),
    example({ name: 'HEAD', url, method: 'HEAD', expect: { status: 200, headers: { 'content-length': '2' } } })
  ]);
  assert.equal(report.summary.passed, 2);
  assert.equal(hitTarget, false);
});

test('batas durasi menggunakan waktu menerima body, bukan hanya header', async t => {
  const { url } = await localServer(t, (req, res) => {
    res.write('awal');
    const timer = setTimeout(() => res.end('akhir'), 80);
    res.on('close', () => clearTimeout(timer));
  });
  const report = await run([example({ url, expect: { status: 200, maxDurationMs: 1 } })]);
  assert.equal(report.results[0].checks.find(check => check.type === 'duration').passed, false);
});
